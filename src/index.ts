import { Router, IRequest } from 'itty-router';

// Environment bindings interface
export interface Env {
    DB: D1Database;
    KV: KVNamespace;
    MEDIA: R2Bucket;
    REWARDS_QUEUE: Queue;
    ENVIRONMENT: string;
}

// Extend Request with env for handlers
export interface RequestWithEnv extends IRequest {
    env: Env;
}

const router = Router();

// CORS headers
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// JSON response helper
export const json = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

// Error response helper
export const error = (message: string, status = 400) =>
    json({ error: message }, status);

// Health check
router.get('/health', () => json({ status: 'ok', version: '0.1.0' }));

// API Routes (to be implemented in future issues)
router.get('/api/items', async (request: IRequest, env: Env) => {
    const { results } = await env.DB.prepare('SELECT * FROM items WHERE available = 1').all();
    return json(results);
});

router.get('/api/users/:id', async (request: IRequest, env: Env) => {
    const { id } = request.params;
    const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first();
    if (!user) return error('User not found', 404);
    return json(user);
});

// Admin: Seed initial data
router.post('/api/admin/seed', async (request: IRequest, env: Env) => {
    try {
        // Seed some sample items
        await env.DB.batch([
            env.DB.prepare(`INSERT INTO items (name, description, category, replacement_value, risk_level, min_level_required) VALUES (?, ?, ?, ?, ?, ?)`)
                .bind('LEGO Mindstorms EV3', 'Complete robotics kit', 'lego', 35000, 'low', 1),
            env.DB.prepare(`INSERT INTO items (name, description, category, replacement_value, risk_level, min_level_required) VALUES (?, ?, ?, ?, ?, ?)`)
                .bind('ESP32 DevKit', 'WiFi+BT microcontroller', 'iot', 1500, 'low', 1),
            env.DB.prepare(`INSERT INTO items (name, description, category, replacement_value, risk_level, min_level_required) VALUES (?, ?, ?, ?, ?, ?)`)
                .bind('DJI Mini 3', 'Compact drone', 'electronics', 75000, 'high', 4),
            env.DB.prepare(`INSERT INTO items (name, description, category, replacement_value, risk_level, min_level_required) VALUES (?, ?, ?, ?, ?, ?)`)
                .bind('Ender 3 V2', '3D Printer', '3d_printer', 30000, 'medium', 3),
        ]);
        return json({ message: 'Seeded successfully' });
    } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Unknown error';
        return error(`Seed failed: ${message}`, 500);
    }
});

// 404 handler
router.all('*', () => error('Not Found', 404));

// Main export
export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { headers: corsHeaders });
        }

        try {
            const response = await router.handle(request, env, ctx);
            // Add CORS headers to all responses
            const newResponse = new Response(response.body, response);
            Object.entries(corsHeaders).forEach(([key, value]) => {
                newResponse.headers.set(key, value);
            });
            return newResponse;
        } catch (err) {
            console.error('Worker Error:', err);
            const message = err instanceof Error ? err.message : 'Internal Server Error';
            return error(message, 500);
        }
    },

    // Queue consumer (for rewards processing)
    async queue(batch: MessageBatch<unknown>, env: Env): Promise<void> {
        for (const message of batch.messages) {
            console.log('Processing queue message:', message.body);
            // TODO: Implement reward processing (Issue #22)
            message.ack();
        }
    },
};
