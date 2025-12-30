import { IRequest } from 'itty-router';
import { Env, error } from '../index';

// Session data structure
export interface Session {
    userId: number;
    email: string;
    isAdmin: boolean;
    createdAt: number;
}

// Extended request with session
export interface AuthenticatedRequest extends IRequest {
    session?: Session;
    userId?: number;
}

// Middleware to require authentication
export const requireAuth = async (request: AuthenticatedRequest, env: Env) => {
    const authHeader = request.headers.get('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return error('Unauthorized - Token required', 401);
    }

    const token = authHeader.substring(7);
    const sessionKey = `session:${token}`;
    const sessionData = await env.KV.get(sessionKey);

    if (!sessionData) {
        return error('Session expired or invalid', 401);
    }

    try {
        const session = JSON.parse(sessionData) as Session;

        // Check session age (optional: refresh if close to expiry)
        const sessionAge = Date.now() - session.createdAt;
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours

        if (sessionAge > maxAge) {
            await env.KV.delete(sessionKey);
            return error('Session expired', 401);
        }

        // Attach session to request
        request.session = session;
        request.userId = session.userId;

        // Continue to next handler (return undefined)
        return;
    } catch {
        return error('Invalid session data', 401);
    }
};

// Middleware to require admin role
export const requireAdmin = async (request: AuthenticatedRequest, env: Env) => {
    // First run auth check
    const authResult = await requireAuth(request, env);
    if (authResult) return authResult; // If auth returns Response, it's an error

    // Check admin flag
    if (!request.session?.isAdmin) {
        return error('Forbidden - Admin access required', 403);
    }

    // Continue to next handler
    return;
};

// Optional auth - attaches session if present but doesn't require it
export const optionalAuth = async (request: AuthenticatedRequest, env: Env) => {
    const authHeader = request.headers.get('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return; // No token, continue without session
    }

    const token = authHeader.substring(7);
    const sessionKey = `session:${token}`;
    const sessionData = await env.KV.get(sessionKey);

    if (sessionData) {
        try {
            request.session = JSON.parse(sessionData) as Session;
            request.userId = request.session.userId;
        } catch {
            // Invalid session data, ignore
        }
    }

    return; // Continue to next handler
};
