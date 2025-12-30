import { IRequest } from 'itty-router';
import { Env, json, error } from '../index';

// Subscription type
export interface Subscription {
    id: number;
    user_id: number;
    plan: string;
    max_items: number;
    max_risk_level: string;
    monthly_fee: number;
    started_at: number;
    expires_at: number | null;
    payment_id: string | null;
}

// Plan definitions
export const PLANS = {
    BASIC: {
        name: 'BASIC',
        max_items: 1,
        max_risk_level: 'low',
        monthly_fee: 0, // Free tier
        features: ['1 item at a time', 'Low-risk items only', 'No rewards'],
    },
    MAKER: {
        name: 'MAKER',
        max_items: 3,
        max_risk_level: 'medium',
        monthly_fee: 1500, // $15
        features: ['Up to 3 items', 'Medium-risk items', 'Rewards enabled', 'Priority support'],
    },
    INNOVATOR: {
        name: 'INNOVATOR',
        max_items: 10,
        max_risk_level: 'high',
        monthly_fee: 5000, // $50
        features: ['Up to 10 items', 'All items', '2x rewards', 'Priority booking', 'Community features'],
    },
};

// Get available plans
export const getPlans = async (request: IRequest, env: Env) => {
    return json(PLANS);
};

// Get user's subscription
export const getSubscription = async (request: IRequest, env: Env) => {
    const { userId } = request.params;

    if (!userId || isNaN(Number(userId))) {
        return error('Invalid user ID', 400);
    }

    const subscription = await env.DB.prepare(
        'SELECT * FROM subscriptions WHERE user_id = ?'
    ).bind(userId).first();

    if (!subscription) {
        // Return default BASIC subscription info
        return json({
            user_id: Number(userId),
            plan: 'BASIC',
            max_items: PLANS.BASIC.max_items,
            max_risk_level: PLANS.BASIC.max_risk_level,
            monthly_fee: PLANS.BASIC.monthly_fee,
            active: true,
        });
    }

    // Check if subscription is expired
    const isActive = !subscription.expires_at || subscription.expires_at > Date.now() / 1000;

    return json({ ...subscription, active: isActive });
};

// Create or update subscription
export const createSubscription = async (request: IRequest, env: Env) => {
    try {
        const body = await request.json() as { user_id?: number; plan?: string; payment_id?: string };
        const { user_id, plan, payment_id } = body;

        if (!user_id || typeof user_id !== 'number') {
            return error('user_id is required', 400);
        }

        if (!plan || !['BASIC', 'MAKER', 'INNOVATOR'].includes(plan)) {
            return error('plan must be BASIC, MAKER, or INNOVATOR', 400);
        }

        // Verify user exists
        const user = await env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(user_id).first();
        if (!user) {
            return error('User not found', 404);
        }

        const planDetails = PLANS[plan as keyof typeof PLANS];
        const now = Math.floor(Date.now() / 1000);
        const expiresAt = plan === 'BASIC' ? null : now + 30 * 24 * 60 * 60; // 30 days for paid plans

        // Check if subscription exists
        const existing = await env.DB.prepare('SELECT id FROM subscriptions WHERE user_id = ?').bind(user_id).first();

        if (existing) {
            // Update existing
            await env.DB.prepare(
                'UPDATE subscriptions SET plan = ?, max_items = ?, max_risk_level = ?, monthly_fee = ?, expires_at = ?, payment_id = ? WHERE user_id = ?'
            ).bind(plan, planDetails.max_items, planDetails.max_risk_level, planDetails.monthly_fee, expiresAt, payment_id || null, user_id).run();

            return json({ message: 'Subscription updated', plan });
        }

        // Create new subscription
        const result = await env.DB.prepare(
            'INSERT INTO subscriptions (user_id, plan, max_items, max_risk_level, monthly_fee, expires_at, payment_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
        ).bind(user_id, plan, planDetails.max_items, planDetails.max_risk_level, planDetails.monthly_fee, expiresAt, payment_id || null).run();

        // Update user's membership tier
        await env.DB.prepare('UPDATE users SET membership_tier = ? WHERE id = ?').bind(plan, user_id).run();

        return json({ message: 'Subscription created', id: result.meta.last_row_id, plan }, 201);
    } catch (e) {
        if (e instanceof SyntaxError) {
            return error('Invalid JSON body', 400);
        }
        throw e;
    }
};

// Cancel subscription (revert to BASIC)
export const cancelSubscription = async (request: IRequest, env: Env) => {
    const { userId } = request.params;

    if (!userId || isNaN(Number(userId))) {
        return error('Invalid user ID', 400);
    }

    const subscription = await env.DB.prepare('SELECT id FROM subscriptions WHERE user_id = ?').bind(userId).first();

    if (!subscription) {
        return error('No subscription found', 404);
    }

    // Instead of deleting, set to BASIC plan
    const planDetails = PLANS.BASIC;
    await env.DB.prepare(
        'UPDATE subscriptions SET plan = ?, max_items = ?, max_risk_level = ?, monthly_fee = ?, expires_at = NULL WHERE user_id = ?'
    ).bind('BASIC', planDetails.max_items, planDetails.max_risk_level, planDetails.monthly_fee, userId).run();

    await env.DB.prepare('UPDATE users SET membership_tier = ? WHERE id = ?').bind('BASIC', userId).run();

    return json({ message: 'Subscription cancelled, reverted to BASIC' });
};

// Check if user can borrow item based on subscription
export const canUserBorrowItem = async (
    env: Env,
    userId: number,
    itemRiskLevel: string
): Promise<{ allowed: boolean; reason?: string }> => {
    // Get user's subscription
    const subscription = await env.DB.prepare(
        'SELECT plan, max_items, max_risk_level, expires_at FROM subscriptions WHERE user_id = ?'
    ).bind(userId).first<Subscription>();

    // Default to BASIC if no subscription
    const maxItems = subscription?.max_items ?? 1;
    const maxRiskLevel = subscription?.max_risk_level ?? 'low';
    const isExpired = subscription?.expires_at && subscription.expires_at < Date.now() / 1000;

    if (isExpired) {
        return { allowed: false, reason: 'Subscription expired' };
    }

    // Check current active borrows
    const { results: activeBorrows } = await env.DB.prepare(
        "SELECT id FROM borrow_records WHERE user_id = ? AND status = 'active'"
    ).bind(userId).all();

    if (activeBorrows.length >= maxItems) {
        return { allowed: false, reason: `Maximum ${maxItems} items allowed for your plan` };
    }

    // Check risk level
    const riskLevels = ['low', 'medium', 'high'];
    const userMaxRiskIndex = riskLevels.indexOf(maxRiskLevel);
    const itemRiskIndex = riskLevels.indexOf(itemRiskLevel);

    if (itemRiskIndex > userMaxRiskIndex) {
        return { allowed: false, reason: `Your plan (${maxRiskLevel}) doesn't allow ${itemRiskLevel}-risk items` };
    }

    return { allowed: true };
};
