import { IRequest } from 'itty-router';
import { Env, json, error } from '../index';
import { canUserBorrowItem } from './subscriptions';
import { isItemAvailable, invalidateAvailabilityCache } from '../services/availability';
import { AuthenticatedRequest } from '../middleware/auth';

// Borrow record type
export interface BorrowRecord {
    id: number;
    user_id: number;
    item_id: number;
    borrowed_at: number;
    due_at: number;
    returned_at: number | null;
    condition_notes: string | null;
    qr_code: string;
    status: 'active' | 'returned' | 'overdue';
}

// Get user's borrow history
export const getUserBorrows = async (request: AuthenticatedRequest, env: Env) => {
    const userId = request.userId;

    if (!userId) {
        return error('Unauthorized', 401);
    }

    const { results } = await env.DB.prepare(`
    SELECT br.*, i.name as item_name, i.category as item_category
    FROM borrow_records br
    JOIN items i ON br.item_id = i.id
    WHERE br.user_id = ?
    ORDER BY br.borrowed_at DESC
    LIMIT 50
  `).bind(userId).all();

    return json(results);
};

// Get single borrow record
export const getBorrow = async (request: IRequest, env: Env) => {
    const { id } = request.params;

    if (!id || isNaN(Number(id))) {
        return error('Invalid borrow ID', 400);
    }

    const borrow = await env.DB.prepare(`
    SELECT br.*, i.name as item_name, i.category as item_category, u.name as user_name
    FROM borrow_records br
    JOIN items i ON br.item_id = i.id
    JOIN users u ON br.user_id = u.id
    WHERE br.id = ?
  `).bind(id).first();

    if (!borrow) {
        return error('Borrow record not found', 404);
    }

    return json(borrow);
};

// Get active borrows for an item (admin)
export const getItemBorrows = async (request: IRequest, env: Env) => {
    const { itemId } = request.params;

    if (!itemId || isNaN(Number(itemId))) {
        return error('Invalid item ID', 400);
    }

    const { results } = await env.DB.prepare(`
    SELECT br.*, u.name as user_name, u.email as user_email
    FROM borrow_records br
    JOIN users u ON br.user_id = u.id
    WHERE br.item_id = ? AND br.status = 'active'
    ORDER BY br.borrowed_at DESC
  `).bind(itemId).all();

    return json(results);
};

// Create borrow request (Issue #14 - validation) 
export const createBorrow = async (request: AuthenticatedRequest, env: Env) => {
    const userId = request.userId;

    if (!userId) {
        return error('Unauthorized', 401);
    }

    try {
        const body = await request.json() as { item_id?: number; duration_days?: number };
        const { item_id, duration_days = 7 } = body;

        if (!item_id || typeof item_id !== 'number') {
            return error('item_id is required', 400);
        }

        if (duration_days < 1 || duration_days > 30) {
            return error('duration_days must be between 1 and 30', 400);
        }

        // Check item exists
        const item = await env.DB.prepare('SELECT id, name, risk_level, min_level_required, available FROM items WHERE id = ?')
            .bind(item_id).first<{ id: number; name: string; risk_level: string; min_level_required: number; available: number }>();

        if (!item) {
            return error('Item not found', 404);
        }

        // Check item availability
        const available = await isItemAvailable(env, item_id);
        if (!available) {
            return error('Item is not available for borrowing', 409);
        }

        // Check user level
        const user = await env.DB.prepare('SELECT level FROM users WHERE id = ?').bind(userId).first<{ level: number }>();
        if (!user || user.level < item.min_level_required) {
            return error(`Item requires level ${item.min_level_required}, you have level ${user?.level || 0}`, 403);
        }

        // Check subscription limits (Issue #11 integration)
        const { allowed, reason } = await canUserBorrowItem(env, userId, item.risk_level);
        if (!allowed) {
            return error(reason || 'Subscription does not allow this borrow', 403);
        }

        // Generate QR code for handover (Issue #15)
        const qrCode = `LOT-${crypto.randomUUID().substring(0, 8).toUpperCase()}`;

        const now = Math.floor(Date.now() / 1000);
        const dueAt = now + duration_days * 24 * 60 * 60;

        // Create borrow record (atomic lock)
        const result = await env.DB.prepare(`
      INSERT INTO borrow_records (user_id, item_id, due_at, qr_code, status)
      VALUES (?, ?, ?, ?, 'active')
    `).bind(userId, item_id, dueAt, qrCode).run();

        // Mark item as unavailable
        await env.DB.prepare('UPDATE items SET available = 0 WHERE id = ?').bind(item_id).run();

        // Invalidate availability cache
        await invalidateAvailabilityCache(env, item_id);

        return json({
            message: 'Borrow created successfully',
            borrow_id: result.meta.last_row_id,
            qr_code: qrCode,
            due_at: dueAt,
            item_name: item.name,
        }, 201);
    } catch (e) {
        if (e instanceof SyntaxError) {
            return error('Invalid JSON body', 400);
        }
        throw e;
    }
};

// Confirm borrow handover via QR code
export const confirmHandover = async (request: IRequest, env: Env) => {
    try {
        const body = await request.json() as { qr_code?: string };
        const { qr_code } = body;

        if (!qr_code || typeof qr_code !== 'string') {
            return error('qr_code is required', 400);
        }

        const borrow = await env.DB.prepare(
            'SELECT id, status FROM borrow_records WHERE qr_code = ?'
        ).bind(qr_code).first<{ id: number; status: string }>();

        if (!borrow) {
            return error('Invalid QR code', 404);
        }

        if (borrow.status !== 'active') {
            return error('Borrow is not active', 400);
        }

        // QR code is valid - handover confirmed
        return json({ message: 'Handover confirmed', borrow_id: borrow.id });
    } catch (e) {
        if (e instanceof SyntaxError) {
            return error('Invalid JSON body', 400);
        }
        throw e;
    }
};

// Return item (Issue #16)
export const returnItem = async (request: IRequest, env: Env) => {
    const { id } = request.params;

    if (!id || isNaN(Number(id))) {
        return error('Invalid borrow ID', 400);
    }

    try {
        const body = await request.json() as { condition_notes?: string; condition?: 'good' | 'damaged' };
        const { condition_notes, condition = 'good' } = body;

        // Get borrow record
        const borrow = await env.DB.prepare(
            'SELECT id, item_id, user_id, status FROM borrow_records WHERE id = ?'
        ).bind(id).first<{ id: number; item_id: number; user_id: number; status: string }>();

        if (!borrow) {
            return error('Borrow record not found', 404);
        }

        if (borrow.status === 'returned') {
            return error('Item already returned', 400);
        }

        const now = Math.floor(Date.now() / 1000);

        // Update borrow record
        await env.DB.prepare(`
      UPDATE borrow_records 
      SET returned_at = ?, status = 'returned', condition_notes = ?
      WHERE id = ?
    `).bind(now, condition_notes || null, id).run();

        // Mark item as available again
        await env.DB.prepare('UPDATE items SET available = 1 WHERE id = ?').bind(borrow.item_id).run();

        // Invalidate availability cache
        await invalidateAvailabilityCache(env, borrow.item_id);

        // Handle condition-based trust score update
        if (condition === 'damaged') {
            // Decrease trust score (will be implemented in Issue #18)
            await env.DB.prepare('UPDATE users SET trust_score = trust_score - 10 WHERE id = ?').bind(borrow.user_id).run();
        } else {
            // Increase trust score for good return
            await env.DB.prepare('UPDATE users SET trust_score = trust_score + 2 WHERE id = ? AND trust_score < 200')
                .bind(borrow.user_id).run();
        }

        return json({ message: 'Item returned successfully', condition });
    } catch (e) {
        if (e instanceof SyntaxError) {
            return error('Invalid JSON body', 400);
        }
        throw e;
    }
};

// Get overdue borrows (admin)
export const getOverdueBorrows = async (request: IRequest, env: Env) => {
    const now = Math.floor(Date.now() / 1000);

    // First, update overdue status
    await env.DB.prepare(`
    UPDATE borrow_records SET status = 'overdue' 
    WHERE status = 'active' AND due_at < ?
  `).bind(now).run();

    // Then fetch overdue records
    const { results } = await env.DB.prepare(`
    SELECT br.*, i.name as item_name, u.name as user_name, u.email as user_email
    FROM borrow_records br
    JOIN items i ON br.item_id = i.id
    JOIN users u ON br.user_id = u.id
    WHERE br.status = 'overdue'
    ORDER BY br.due_at ASC
  `).all();

    return json(results);
};
