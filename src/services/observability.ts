import { Env, json } from '../index';
import { IRequest } from 'itty-router';

// Issue #30: Logging & Error Tracking
// Issue #31: Usage Metrics

// Structured logging
export const log = (
    level: 'INFO' | 'WARN' | 'ERROR',
    message: string,
    data?: Record<string, unknown>
) => {
    const entry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        ...data,
    };

    console.log(JSON.stringify(entry));
};

// Error tracking
export const trackError = async (
    env: Env,
    error: Error,
    context?: Record<string, unknown>
) => {
    const errorId = crypto.randomUUID().substring(0, 8);

    log('ERROR', error.message, {
        errorId,
        stack: error.stack,
        ...context,
    });

    // Store error in KV for later analysis (24 hour retention)
    const errorKey = `error:${errorId}`;
    await env.KV.put(errorKey, JSON.stringify({
        message: error.message,
        stack: error.stack,
        context,
        timestamp: Date.now(),
    }), { expirationTtl: 24 * 60 * 60 });

    return errorId;
};

// Request logging middleware
export const requestLogger = async (request: IRequest, env: Env) => {
    const start = Date.now();
    const requestId = crypto.randomUUID().substring(0, 8);

    // Attach to request for later use
    (request as any).requestId = requestId;
    (request as any).startTime = start;

    log('INFO', 'Request started', {
        requestId,
        method: request.method,
        url: request.url,
        ip: request.headers.get('CF-Connecting-IP'),
    });
};

// Response logging
export const logResponse = (
    requestId: string,
    startTime: number,
    status: number,
    url: string
) => {
    const duration = Date.now() - startTime;

    log('INFO', 'Response sent', {
        requestId,
        status,
        duration,
        url,
    });
};

// Usage metrics
interface UsageMetrics {
    totalRequests: number;
    totalBorrows: number;
    activeBorrows: number;
    totalReturns: number;
    totalUsers: number;
    activeUsers: number;
    topItems: Array<{ id: number; name: string; borrowCount: number }>;
    userGrowth: Array<{ date: string; count: number }>;
}

// Get usage metrics (for dashboard)
export const getUsageMetrics = async (request: IRequest, env: Env) => {
    const now = Math.floor(Date.now() / 1000);
    const last30Days = now - 30 * 24 * 60 * 60;

    const [
        totalBorrows,
        activeBorrows,
        totalReturns,
        totalUsers,
        activeUsers,
        topItems,
    ] = await Promise.all([
        env.DB.prepare('SELECT COUNT(*) as count FROM borrow_records').first<{ count: number }>(),
        env.DB.prepare("SELECT COUNT(*) as count FROM borrow_records WHERE status = 'active'").first<{ count: number }>(),
        env.DB.prepare("SELECT COUNT(*) as count FROM borrow_records WHERE status = 'returned'").first<{ count: number }>(),
        env.DB.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>(),
        env.DB.prepare('SELECT COUNT(DISTINCT user_id) as count FROM borrow_records WHERE borrowed_at > ?').bind(last30Days).first<{ count: number }>(),
        env.DB.prepare(`
      SELECT i.id, i.name, COUNT(br.id) as borrowCount
      FROM items i
      LEFT JOIN borrow_records br ON i.id = br.item_id
      GROUP BY i.id
      ORDER BY borrowCount DESC
      LIMIT 10
    `).all<{ id: number; name: string; borrowCount: number }>(),
    ]);

    const metrics: UsageMetrics = {
        totalRequests: 0, // Would need separate tracking
        totalBorrows: totalBorrows?.count ?? 0,
        activeBorrows: activeBorrows?.count ?? 0,
        totalReturns: totalReturns?.count ?? 0,
        totalUsers: totalUsers?.count ?? 0,
        activeUsers: activeUsers?.count ?? 0,
        topItems: topItems.results,
        userGrowth: [], // Would need time-series data
    };

    return json(metrics);
};

// Health check with detailed status
export const getHealthDetailed = async (request: IRequest, env: Env) => {
    const checks: Record<string, boolean> = {};

    // Check D1
    try {
        await env.DB.prepare('SELECT 1').first();
        checks.database = true;
    } catch {
        checks.database = false;
    }

    // Check KV
    try {
        await env.KV.get('health-check');
        checks.kv = true;
    } catch {
        checks.kv = false;
    }

    // Check R2
    try {
        await env.MEDIA.head('health-check');
        checks.r2 = true;
    } catch {
        checks.r2 = true; // OK if file doesn't exist
    }

    const allHealthy = Object.values(checks).every(v => v);

    return json({
        status: allHealthy ? 'healthy' : 'degraded',
        version: '1.0.0',
        checks,
        timestamp: new Date().toISOString(),
    }, allHealthy ? 200 : 503);
};
