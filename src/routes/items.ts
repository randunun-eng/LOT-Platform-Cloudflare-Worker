import { IRequest } from 'itty-router';
import { Env, json, error } from '../index';
import { isItemAvailable } from '../services/availability';

// Item type
export interface Item {
    id: number;
    name: string;
    description: string | null;
    category: string;
    replacement_value: number;
    risk_level: string;
    min_level_required: number;
    available: number;
    image_url: string | null;
    created_at: number;
}

// Check item availability endpoint
export const checkAvailability = async (request: IRequest, env: Env) => {
    const { id } = request.params;

    if (!id || isNaN(Number(id))) {
        return error('Invalid item ID', 400);
    }

    const available = await isItemAvailable(env, Number(id));
    return json({ itemId: Number(id), available });
};

// List all items (with optional filters)
export const getItems = async (request: IRequest, env: Env) => {
    const { query } = request;

    let sql = 'SELECT * FROM items WHERE 1=1';
    const params: (string | number)[] = [];

    // Filter by availability
    if (query.available === 'true') {
        sql += ' AND available = 1';
    } else if (query.available === 'false') {
        sql += ' AND available = 0';
    }

    // Filter by category
    if (query.category && typeof query.category === 'string') {
        sql += ' AND category = ?';
        params.push(query.category.toLowerCase());
    }

    // Filter by risk level
    if (query.risk_level && typeof query.risk_level === 'string') {
        sql += ' AND risk_level = ?';
        params.push(query.risk_level.toLowerCase());
    }

    // Filter by minimum level required
    if (query.max_level && !isNaN(Number(query.max_level))) {
        sql += ' AND min_level_required <= ?';
        params.push(Number(query.max_level));
    }

    sql += ' ORDER BY name ASC LIMIT 100';

    const stmt = params.length > 0
        ? env.DB.prepare(sql).bind(...params)
        : env.DB.prepare(sql);

    const { results } = await stmt.all();
    return json(results);
};

// Get single item by ID
export const getItem = async (request: IRequest, env: Env) => {
    const { id } = request.params;

    if (!id || isNaN(Number(id))) {
        return error('Invalid item ID', 400);
    }

    const item = await env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(id).first();

    if (!item) {
        return error('Item not found', 404);
    }

    return json(item);
};

// Search items by name
export const searchItems = async (request: IRequest, env: Env) => {
    const { query } = request;
    const searchTerm = query.q;

    if (!searchTerm || typeof searchTerm !== 'string' || searchTerm.length < 2) {
        return error('Search query must be at least 2 characters', 400);
    }

    const { results } = await env.DB.prepare(
        'SELECT * FROM items WHERE name LIKE ? OR description LIKE ? ORDER BY name ASC LIMIT 50'
    ).bind(`%${searchTerm}%`, `%${searchTerm}%`).all();

    return json(results);
};

// Create item (admin only)
export const createItem = async (request: IRequest, env: Env) => {
    try {
        const body = await request.json() as Partial<Item>;
        const { name, description, category, replacement_value, risk_level, min_level_required, image_url } = body;

        if (!name || typeof name !== 'string') {
            return error('Name is required', 400);
        }

        if (!category || typeof category !== 'string') {
            return error('Category is required', 400);
        }

        if (!replacement_value || typeof replacement_value !== 'number' || replacement_value < 0) {
            return error('Valid replacement_value is required', 400);
        }

        const validRiskLevels = ['low', 'medium', 'high'];
        const riskLevelValue = (risk_level || 'low').toLowerCase();
        if (!validRiskLevels.includes(riskLevelValue)) {
            return error('risk_level must be low, medium, or high', 400);
        }

        const minLevel = min_level_required || 1;
        if (minLevel < 1 || minLevel > 5) {
            return error('min_level_required must be between 1 and 5', 400);
        }

        const result = await env.DB.prepare(
            'INSERT INTO items (name, description, category, replacement_value, risk_level, min_level_required, image_url) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(name.trim(), description || null, category.toLowerCase(), replacement_value, riskLevelValue, minLevel, image_url || null).run();

        return json({ message: 'Item created', id: result.meta.last_row_id }, 201);
    } catch (e) {
        if (e instanceof SyntaxError) {
            return error('Invalid JSON body', 400);
        }
        throw e;
    }
};

// Update item (admin only)
export const updateItem = async (request: IRequest, env: Env) => {
    const { id } = request.params;

    if (!id || isNaN(Number(id))) {
        return error('Invalid item ID', 400);
    }

    try {
        const body = await request.json() as Partial<Item>;

        const existing = await env.DB.prepare('SELECT id FROM items WHERE id = ?').bind(id).first();
        if (!existing) {
            return error('Item not found', 404);
        }

        const updates: string[] = [];
        const params: (string | number | null)[] = [];

        if (body.name !== undefined) { updates.push('name = ?'); params.push(body.name); }
        if (body.description !== undefined) { updates.push('description = ?'); params.push(body.description); }
        if (body.category !== undefined) { updates.push('category = ?'); params.push(body.category.toLowerCase()); }
        if (body.replacement_value !== undefined) { updates.push('replacement_value = ?'); params.push(body.replacement_value); }
        if (body.risk_level !== undefined) { updates.push('risk_level = ?'); params.push(body.risk_level.toLowerCase()); }
        if (body.min_level_required !== undefined) { updates.push('min_level_required = ?'); params.push(body.min_level_required); }
        if (body.available !== undefined) { updates.push('available = ?'); params.push(body.available); }
        if (body.image_url !== undefined) { updates.push('image_url = ?'); params.push(body.image_url); }

        if (updates.length === 0) {
            return error('No fields to update', 400);
        }

        params.push(Number(id));
        await env.DB.prepare(`UPDATE items SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();

        return json({ message: 'Item updated' });
    } catch (e) {
        if (e instanceof SyntaxError) {
            return error('Invalid JSON body', 400);
        }
        throw e;
    }
};

// Delete item (admin only)
export const deleteItem = async (request: IRequest, env: Env) => {
    const { id } = request.params;

    if (!id || isNaN(Number(id))) {
        return error('Invalid item ID', 400);
    }

    const activeBorrow = await env.DB.prepare(
        'SELECT id FROM borrow_records WHERE item_id = ? AND status = ?'
    ).bind(id, 'active').first();

    if (activeBorrow) {
        return error('Cannot delete item with active borrows', 409);
    }

    await env.DB.prepare('DELETE FROM items WHERE id = ?').bind(id).run();

    return json({ message: 'Item deleted' });
};

// Get item categories
export const getCategories = async (request: IRequest, env: Env) => {
    const { results } = await env.DB.prepare('SELECT DISTINCT category FROM items ORDER BY category').all();
    return json(results.map((r: Record<string, unknown>) => r.category));
};

// Seed sample items
export const seedItems = async (request: IRequest, env: Env) => {
    try {
        await env.DB.batch([
            env.DB.prepare('INSERT INTO items (name, description, category, replacement_value, risk_level, min_level_required) VALUES (?, ?, ?, ?, ?, ?)')
                .bind('LEGO Mindstorms EV3', 'Complete robotics kit', 'lego', 35000, 'low', 1),
            env.DB.prepare('INSERT INTO items (name, description, category, replacement_value, risk_level, min_level_required) VALUES (?, ?, ?, ?, ?, ?)')
                .bind('ESP32 DevKit V1', 'WiFi+BT microcontroller', 'iot', 1500, 'low', 1),
            env.DB.prepare('INSERT INTO items (name, description, category, replacement_value, risk_level, min_level_required) VALUES (?, ?, ?, ?, ?, ?)')
                .bind('Arduino Uno R3', 'Classic microcontroller', 'iot', 2500, 'low', 1),
            env.DB.prepare('INSERT INTO items (name, description, category, replacement_value, risk_level, min_level_required) VALUES (?, ?, ?, ?, ?, ?)')
                .bind('Raspberry Pi 4 8GB', 'Single board computer', 'iot', 8500, 'medium', 2),
            env.DB.prepare('INSERT INTO items (name, description, category, replacement_value, risk_level, min_level_required) VALUES (?, ?, ?, ?, ?, ?)')
                .bind('DJI Mini 3', 'Compact drone', 'electronics', 75000, 'high', 4),
            env.DB.prepare('INSERT INTO items (name, description, category, replacement_value, risk_level, min_level_required) VALUES (?, ?, ?, ?, ?, ?)')
                .bind('Ender 3 V2', 'FDM 3D Printer', '3d_printer', 30000, 'medium', 3),
        ]);
        return json({ message: 'Items seeded successfully' });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        return error(`Seed failed: ${message}`, 500);
    }
};
