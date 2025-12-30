import { Env, json, error } from '../index';
import { IRequest } from 'itty-router';

// Issue #28: Rate Limiting
// Issue #29: Turnstile Integration

// Rate limit configuration
export const RATE_LIMITS = {
    DEFAULT: { requests: 60, window: 60 }, // 60 req/min
    AUTH: { requests: 5, window: 60 }, // 5 req/min for auth endpoints
    UPLOAD: { requests: 10, window: 300 }, // 10 req/5min for uploads
};

// Check rate limit
export const checkRateLimit = async (
    env: Env,
    key: string,
    limit: { requests: number; window: number }
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> => {
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - limit.window;

    const rateLimitKey = `ratelimit:${key}`;
    const data = await env.KV.get(rateLimitKey);

    let requests: number[] = data ? JSON.parse(data) : [];

    // Filter to current window
    requests = requests.filter(t => t > windowStart);

    if (requests.length >= limit.requests) {
        const oldestRequest = Math.min(...requests);
        return {
            allowed: false,
            remaining: 0,
            resetAt: oldestRequest + limit.window,
        };
    }

    // Add current request
    requests.push(now);

    // Store updated requests
    await env.KV.put(rateLimitKey, JSON.stringify(requests), {
        expirationTtl: limit.window,
    });

    return {
        allowed: true,
        remaining: limit.requests - requests.length,
        resetAt: windowStart + limit.window,
    };
};

// Rate limit middleware
export const rateLimit = (limitType: keyof typeof RATE_LIMITS = 'DEFAULT') => {
    return async (request: IRequest, env: Env) => {
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        const limit = RATE_LIMITS[limitType];

        const result = await checkRateLimit(env, ip, limit);

        if (!result.allowed) {
            const response = json({
                error: 'Rate limit exceeded',
                retryAfter: result.resetAt - Math.floor(Date.now() / 1000),
            }, 429);

            // Add rate limit headers
            const headers = new Headers(response.headers);
            headers.set('X-RateLimit-Limit', String(limit.requests));
            headers.set('X-RateLimit-Remaining', '0');
            headers.set('X-RateLimit-Reset', String(result.resetAt));
            headers.set('Retry-After', String(result.resetAt - Math.floor(Date.now() / 1000)));

            return new Response(response.body, { status: 429, headers });
        }

        // Continue to next handler (don't return anything)
        return;
    };
};

// Turnstile verification
export const verifyTurnstile = async (
    env: Env,
    token: string,
    ip?: string
): Promise<{ success: boolean; error?: string }> => {
    const TURNSTILE_SECRET = await env.KV.get('TURNSTILE_SECRET_KEY');

    if (!TURNSTILE_SECRET) {
        // Skip verification if not configured
        console.warn('Turnstile not configured');
        return { success: true };
    }

    try {
        const response = await fetch(
            'https://challenges.cloudflare.com/turnstile/v0/siteverify',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    secret: TURNSTILE_SECRET,
                    response: token,
                    remoteip: ip,
                }),
            }
        );

        const result = await response.json() as { success: boolean; 'error-codes'?: string[] };

        if (!result.success) {
            return {
                success: false,
                error: result['error-codes']?.join(', ') || 'Verification failed',
            };
        }

        return { success: true };
    } catch (e) {
        console.error('Turnstile verification error:', e);
        return { success: false, error: 'Verification service unavailable' };
    }
};

// Turnstile middleware
export const requireTurnstile = async (request: IRequest, env: Env) => {
    const token = request.headers.get('X-Turnstile-Token');

    if (!token) {
        return error('Turnstile token required', 400);
    }

    const ip = request.headers.get('CF-Connecting-IP') || undefined;
    const result = await verifyTurnstile(env, token, ip);

    if (!result.success) {
        return error(`Turnstile verification failed: ${result.error}`, 403);
    }

    // Continue to next handler
    return;
};

// Security headers middleware
export const securityHeaders = (response: Response): Response => {
    const headers = new Headers(response.headers);

    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('X-Frame-Options', 'DENY');
    headers.set('X-XSS-Protection', '1; mode=block');
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    });
};
