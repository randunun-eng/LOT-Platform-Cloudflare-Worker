import { Router, IRequest } from 'itty-router';
import { getUsers, getUser, getUserByEmail, createUser, updateUser, seedUsers } from './routes/users';
import { requestOTP, verifyOTP, logout, getCurrentUser } from './routes/auth';
import { getItems, getItem, searchItems, createItem, updateItem, deleteItem, getCategories, seedItems, checkAvailability } from './routes/items';
import { getPlans, getSubscription, createSubscription, cancelSubscription } from './routes/subscriptions';
import { handleStripeWebhook, handlePayHereWebhook } from './routes/payments';
import { getUserBorrows, getBorrow, getItemBorrows, createBorrow, confirmHandover, returnItem, getOverdueBorrows } from './routes/borrows';
import { getProgression, getUserProgressionById, getLevelRequirements, adminAwardPoints, adminAdjustTrust, getLeaderboard } from './routes/progression';
import { uploadMedia, getMedia, createPost, getUserPosts, getPendingPosts, approvePost, rejectPost, getPublicFeed, getPost } from './routes/community';
import { getAuditLogs, getAdminStats, adminForceReturn, adminSetUserLevel } from './routes/admin';
import { getUserNotifications, markNotificationRead } from './services/notifications';
import { getUsageMetrics, getHealthDetailed } from './services/observability';
import { requireAuth, requireAdmin } from './middleware/auth';








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
router.get('/health', () => json({ status: 'ok', version: '0.5.0' }));

// ============ Auth Routes (Issue #5) ============
router.post('/api/auth/request-otp', requestOTP);
router.post('/api/auth/verify-otp', verifyOTP);
router.post('/api/auth/logout', logout);
router.get('/api/auth/me', requireAuth, getCurrentUser);

// ============ User Routes (Issue #4) ============
router.get('/api/users', requireAdmin, getUsers);
router.get('/api/users/search', requireAuth, getUserByEmail);
router.get('/api/users/:id', requireAuth, getUser);
router.post('/api/users', createUser);
router.put('/api/users/:id', requireAuth, updateUser);
router.post('/api/admin/seed-users', requireAdmin, seedUsers);

// ============ Item Routes (Issues #7, #8, #9) ============
router.get('/api/items', getItems);
router.get('/api/items/search', searchItems);
router.get('/api/items/categories', getCategories);
router.get('/api/items/:id', getItem);
router.get('/api/items/:id/availability', checkAvailability);
router.post('/api/items', requireAdmin, createItem);
router.put('/api/items/:id', requireAdmin, updateItem);
router.delete('/api/items/:id', requireAdmin, deleteItem);
router.post('/api/admin/seed-items', requireAdmin, seedItems);

// ============ Subscription Routes (Issues #10, #11) ============
router.get('/api/subscriptions/plans', getPlans);
router.get('/api/subscriptions/:userId', requireAuth, getSubscription);
router.post('/api/subscriptions', requireAuth, createSubscription);
router.delete('/api/subscriptions/:userId', requireAuth, cancelSubscription);

// ============ Payment Webhooks (Issue #12) ============
router.post('/api/webhooks/stripe', handleStripeWebhook);
router.post('/api/webhooks/payhere', handlePayHereWebhook);

// ============ Borrow Routes (Issues #13-16) ============
router.get('/api/borrows', requireAuth, getUserBorrows);
router.get('/api/borrows/:id', requireAuth, getBorrow);
router.get('/api/items/:itemId/borrows', requireAdmin, getItemBorrows);
router.post('/api/borrows', requireAuth, createBorrow);
router.post('/api/borrows/handover', confirmHandover);
router.post('/api/borrows/:id/return', requireAuth, returnItem);
router.get('/api/admin/borrows/overdue', requireAdmin, getOverdueBorrows);

// ============ Progression Routes (Issues #17-19) ============
router.get('/api/progression', requireAuth, getProgression);
router.get('/api/progression/levels', getLevelRequirements);
router.get('/api/progression/leaderboard', getLeaderboard);
router.get('/api/progression/:userId', getUserProgressionById);
router.post('/api/admin/progression/points', requireAdmin, adminAwardPoints);
router.post('/api/admin/progression/trust', requireAdmin, adminAdjustTrust);

// ============ Community Routes (Issues #20-23) ============
router.post('/api/media/upload', requireAuth, uploadMedia);
router.get('/api/media/:filename', getMedia);
router.post('/api/community/posts', requireAuth, createPost);
router.get('/api/community/posts', requireAuth, getUserPosts);
router.get('/api/community/posts/:id', getPost);
router.get('/api/community/feed', getPublicFeed);
router.get('/api/admin/community/pending', requireAdmin, getPendingPosts);
router.post('/api/admin/community/posts/:id/approve', requireAdmin, approvePost);
router.post('/api/admin/community/posts/:id/reject', requireAdmin, rejectPost);

// ============ Admin Routes (Issues #24-25) ============
router.get('/api/admin/audit', requireAdmin, getAuditLogs);
router.get('/api/admin/stats', requireAdmin, getAdminStats);
router.post('/api/admin/force-return', requireAdmin, adminForceReturn);
router.post('/api/admin/set-level', requireAdmin, adminSetUserLevel);

// ============ Notification Routes (Issues #26-27) ============
router.get('/api/notifications', requireAuth, getUserNotifications);
router.post('/api/notifications/:id/read', requireAuth, markNotificationRead);

// ============ Observability Routes (Issues #30-31) ============
router.get('/api/metrics', requireAdmin, getUsageMetrics);
router.get('/health/detailed', getHealthDetailed);

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
