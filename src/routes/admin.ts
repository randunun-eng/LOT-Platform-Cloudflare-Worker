import { IRequest } from 'itty-router';
import { Env, json, error } from '../index';
import { AuthenticatedRequest } from '../middleware/auth';

// Issue #24: Admin Role & Permissions (already implemented in middleware)

// Issue #25: Audit Logging System
export interface AuditLog {
    id: number;
    user_id: number | null;
    action: string;
    target_type: string | null;
    target_id: number | null;
    details: string | null;
    created_at: number;
}

// Log an admin action
export const logAuditAction = async (
    env: Env,
    userId: number | null,
    action: string,
    targetType?: string,
    targetId?: number,
    details?: Record<string, unknown>
): Promise<void> => {
    await env.DB.prepare(`
    INSERT INTO audit_logs (user_id, action, target_type, target_id, details)
    VALUES (?, ?, ?, ?, ?)
  `).bind(
        userId,
        action,
        targetType || null,
        targetId || null,
        details ? JSON.stringify(details) : null
    ).run();
};

// Get audit logs (admin only)
export const getAuditLogs = async (request: IRequest, env: Env) => {
    const { query } = request;

    let sql = `
    SELECT al.*, u.name as user_name
    FROM audit_logs al
    LEFT JOIN users u ON al.user_id = u.id
    WHERE 1=1
  `;
    const params: (string | number)[] = [];

    // Filter by action
    if (query.action && typeof query.action === 'string') {
        sql += ' AND al.action = ?';
        params.push(query.action);
    }

    // Filter by target type
    if (query.target_type && typeof query.target_type === 'string') {
        sql += ' AND al.target_type = ?';
        params.push(query.target_type);
    }

    // Filter by user
    if (query.user_id && !isNaN(Number(query.user_id))) {
        sql += ' AND al.user_id = ?';
        params.push(Number(query.user_id));
    }

    sql += ' ORDER BY al.created_at DESC LIMIT 100';

    const stmt = params.length > 0
        ? env.DB.prepare(sql).bind(...params)
        : env.DB.prepare(sql);

    const { results } = await stmt.all();

    return json(results);
};

// Get admin dashboard stats
export const getAdminStats = async (request: IRequest, env: Env) => {
    const [
        usersResult,
        itemsResult,
        activeBorrowsResult,
        overdueBorrowsResult,
        pendingPostsResult,
    ] = await Promise.all([
        env.DB.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>(),
        env.DB.prepare('SELECT COUNT(*) as count FROM items').first<{ count: number }>(),
        env.DB.prepare("SELECT COUNT(*) as count FROM borrow_records WHERE status = 'active'").first<{ count: number }>(),
        env.DB.prepare("SELECT COUNT(*) as count FROM borrow_records WHERE status = 'overdue'").first<{ count: number }>(),
        env.DB.prepare('SELECT COUNT(*) as count FROM community_posts WHERE approved = 0').first<{ count: number }>(),
    ]);

    return json({
        totalUsers: usersResult?.count ?? 0,
        totalItems: itemsResult?.count ?? 0,
        activeBorrows: activeBorrowsResult?.count ?? 0,
        overdueBorrows: overdueBorrowsResult?.count ?? 0,
        pendingPosts: pendingPostsResult?.count ?? 0,
    });
};

// Admin override: Force return an item
export const adminForceReturn = async (request: IRequest, env: Env) => {
    try {
        const body = await request.json() as { borrow_id?: number; reason?: string };
        const { borrow_id, reason } = body;

        if (!borrow_id || typeof borrow_id !== 'number') {
            return error('borrow_id is required', 400);
        }

        const borrow = await env.DB.prepare(
            'SELECT id, item_id, user_id, status FROM borrow_records WHERE id = ?'
        ).bind(borrow_id).first<{ id: number; item_id: number; user_id: number; status: string }>();

        if (!borrow) {
            return error('Borrow record not found', 404);
        }

        if (borrow.status === 'returned') {
            return error('Already returned', 400);
        }

        const now = Math.floor(Date.now() / 1000);

        // Force return
        await env.DB.prepare(`
      UPDATE borrow_records 
      SET returned_at = ?, status = 'returned', condition_notes = ?
      WHERE id = ?
    `).bind(now, `[ADMIN OVERRIDE] ${reason || 'No reason provided'}`, borrow_id).run();

        // Mark item available
        await env.DB.prepare('UPDATE items SET available = 1 WHERE id = ?').bind(borrow.item_id).run();

        // Log the action
        await logAuditAction(env, null, 'ADMIN_FORCE_RETURN', 'borrow', borrow_id, { reason });

        return json({ message: 'Borrow force-returned successfully' });
    } catch (e) {
        if (e instanceof SyntaxError) {
            return error('Invalid JSON body', 400);
        }
        throw e;
    }
};

// Admin override: Adjust user level
export const adminSetUserLevel = async (request: IRequest, env: Env) => {
    try {
        const body = await request.json() as { user_id?: number; level?: number };
        const { user_id, level } = body;

        if (!user_id || typeof user_id !== 'number') {
            return error('user_id is required', 400);
        }

        if (!level || level < 1 || level > 5) {
            return error('level must be between 1 and 5', 400);
        }

        await env.DB.prepare('UPDATE users SET level = ? WHERE id = ?').bind(level, user_id).run();

        await logAuditAction(env, null, 'ADMIN_SET_LEVEL', 'user', user_id, { level });

        return json({ message: 'User level updated', level });
    } catch (e) {
        if (e instanceof SyntaxError) {
            return error('Invalid JSON body', 400);
        }
        throw e;
    }
};
