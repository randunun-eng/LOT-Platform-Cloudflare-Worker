import { Env } from '../index';

// Check if an item is available for borrowing
export const isItemAvailable = async (
    env: Env,
    itemId: number
): Promise<boolean> => {
    // Check if item exists and is marked as available
    const item = await env.DB.prepare(
        'SELECT available FROM items WHERE id = ?'
    ).bind(itemId).first<{ available: number }>();

    if (!item || item.available === 0) {
        return false;
    }

    // Check if there's an active borrow for this item
    const activeBorrow = await env.DB.prepare(
        'SELECT id FROM borrow_records WHERE item_id = ? AND status = ?'
    ).bind(itemId, 'active').first();

    return !activeBorrow;
};

// Get availability status for multiple items (batch check)
export const getItemsAvailability = async (
    env: Env,
    itemIds: number[]
): Promise<Map<number, boolean>> => {
    const availability = new Map<number, boolean>();

    if (itemIds.length === 0) {
        return availability;
    }

    // Get all items availability status
    const placeholders = itemIds.map(() => '?').join(',');
    const { results: items } = await env.DB.prepare(
        `SELECT id, available FROM items WHERE id IN (${placeholders})`
    ).bind(...itemIds).all<{ id: number; available: number }>();

    // Get active borrows for these items
    const { results: activeBorrows } = await env.DB.prepare(
        `SELECT item_id FROM borrow_records WHERE item_id IN (${placeholders}) AND status = 'active'`
    ).bind(...itemIds).all<{ item_id: number }>();

    const borrowedItemIds = new Set(activeBorrows.map(b => b.item_id));

    for (const item of items) {
        // Available if item.available = 1 AND not currently borrowed
        availability.set(item.id, item.available === 1 && !borrowedItemIds.has(item.id));
    }

    // Mark missing items as unavailable
    for (const id of itemIds) {
        if (!availability.has(id)) {
            availability.set(id, false);
        }
    }

    return availability;
};

// Update item availability (mark as borrowed/returned)
export const updateItemAvailability = async (
    env: Env,
    itemId: number,
    available: boolean
): Promise<void> => {
    await env.DB.prepare(
        'UPDATE items SET available = ? WHERE id = ?'
    ).bind(available ? 1 : 0, itemId).run();

    // Invalidate cache if using KV cache
    const cacheKey = `item_availability:${itemId}`;
    await env.KV.delete(cacheKey);
};

// Get cached availability (with KV caching)
export const getCachedAvailability = async (
    env: Env,
    itemId: number
): Promise<boolean | null> => {
    const cacheKey = `item_availability:${itemId}`;
    const cached = await env.KV.get(cacheKey);

    if (cached !== null) {
        return cached === 'true';
    }

    // Cache miss - compute and cache
    const available = await isItemAvailable(env, itemId);

    // Cache for 5 minutes
    await env.KV.put(cacheKey, String(available), { expirationTtl: 300 });

    return available;
};

// Invalidate availability cache for an item
export const invalidateAvailabilityCache = async (
    env: Env,
    itemId: number
): Promise<void> => {
    const cacheKey = `item_availability:${itemId}`;
    await env.KV.delete(cacheKey);
};

// Get items that user can borrow based on their level
export const getAvailableItemsForUser = async (
    env: Env,
    userLevel: number,
    category?: string
): Promise<unknown[]> => {
    let sql = `
    SELECT i.* 
    FROM items i 
    WHERE i.available = 1 
    AND i.min_level_required <= ?
    AND i.id NOT IN (
      SELECT item_id FROM borrow_records WHERE status = 'active'
    )
  `;
    const params: (string | number)[] = [userLevel];

    if (category) {
        sql += ' AND i.category = ?';
        params.push(category);
    }

    sql += ' ORDER BY i.name ASC';

    const { results } = await env.DB.prepare(sql).bind(...params).all();
    return results;
};
