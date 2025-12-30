import { IRequest } from 'itty-router';
import { Env, json, error } from '../index';

// Types
export interface User {
    id: number;
    email: string;
    name: string;
    level: number;
    trust_score: number;
    membership_tier: string;
    reward_points: number;
    is_admin: number;
    created_at: number;
}

// Get all users (admin only in future)
export const getUsers = async (request: IRequest, env: Env) => {
    const { results } = await env.DB.prepare('SELECT id, email, name, level, trust_score, membership_tier, reward_points, is_admin, created_at FROM users ORDER BY created_at DESC LIMIT 100').all();
    return json(results);
};

// Get user by ID
export const getUser = async (request: IRequest, env: Env) => {
    const { id } = request.params;

    if (!id || isNaN(Number(id))) {
        return error('Invalid user ID', 400);
    }

    const user = await env.DB.prepare('SELECT id, email, name, level, trust_score, membership_tier, reward_points, is_admin, created_at FROM users WHERE id = ?').bind(id).first();

    if (!user) {
        return error('User not found', 404);
    }

    return json(user);
};

// Get user by email
export const getUserByEmail = async (request: IRequest, env: Env) => {
    const email = request.query.email;

    if (!email || typeof email !== 'string') {
        return error('Email parameter required', 400);
    }

    const user = await env.DB.prepare('SELECT id, email, name, level, trust_score, membership_tier, reward_points, is_admin, created_at FROM users WHERE email = ?').bind(email.toLowerCase()).first();

    if (!user) {
        return error('User not found', 404);
    }

    return json(user);
};

// Create user
export const createUser = async (request: IRequest, env: Env) => {
    try {
        const body = await request.json() as { email?: string; name?: string };
        const { email, name } = body;

        // Validation
        if (!email || typeof email !== 'string') {
            return error('Email is required', 400);
        }

        if (!name || typeof name !== 'string') {
            return error('Name is required', 400);
        }

        // Email format validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return error('Invalid email format', 400);
        }

        // Check if user exists
        const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email.toLowerCase()).first();
        if (existing) {
            return error('User with this email already exists', 409);
        }

        // Insert user
        const result = await env.DB.prepare(
            'INSERT INTO users (email, name) VALUES (?, ?)'
        ).bind(email.toLowerCase(), name.trim()).run();

        if (!result.success) {
            throw new Error('Failed to create user');
        }

        return json({
            message: 'User created',
            id: result.meta.last_row_id
        }, 201);
    } catch (e) {
        if (e instanceof SyntaxError) {
            return error('Invalid JSON body', 400);
        }
        throw e;
    }
};

// Update user profile
export const updateUser = async (request: IRequest, env: Env) => {
    const { id } = request.params;

    if (!id || isNaN(Number(id))) {
        return error('Invalid user ID', 400);
    }

    try {
        const body = await request.json() as { name?: string };
        const { name } = body;

        if (!name || typeof name !== 'string') {
            return error('Name is required', 400);
        }

        // Check if user exists
        const existing = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(id).first();
        if (!existing) {
            return error('User not found', 404);
        }

        await env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(name.trim(), id).run();

        return json({ message: 'User updated' });
    } catch (e) {
        if (e instanceof SyntaxError) {
            return error('Invalid JSON body', 400);
        }
        throw e;
    }
};

// Seed test users (admin/dev only)
export const seedUsers = async (request: IRequest, env: Env) => {
    try {
        await env.DB.batch([
            env.DB.prepare('INSERT INTO users (email, name, level, trust_score, membership_tier) VALUES (?, ?, ?, ?, ?)')
                .bind('alice@example.com', 'Alice Maker', 2, 120, 'MAKER'),
            env.DB.prepare('INSERT INTO users (email, name, level, trust_score, membership_tier, is_admin) VALUES (?, ?, ?, ?, ?, ?)')
                .bind('admin@lot.dev', 'LOT Admin', 5, 200, 'INNOVATOR', 1),
            env.DB.prepare('INSERT INTO users (email, name, level, trust_score, membership_tier) VALUES (?, ?, ?, ?, ?)')
                .bind('bob@example.com', 'Bob Builder', 1, 100, 'BASIC'),
        ]);
        return json({ message: 'Users seeded' });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        return error(`Seed failed: ${message}`, 500);
    }
};
