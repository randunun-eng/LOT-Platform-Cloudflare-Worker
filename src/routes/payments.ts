import { IRequest } from 'itty-router';
import { Env, json, error } from '../index';
import { PLANS } from './subscriptions';

// Stripe webhook event types we handle
type WebhookEventType = 'checkout.session.completed' | 'invoice.paid' | 'customer.subscription.deleted';

interface StripeEvent {
    type: WebhookEventType;
    data: {
        object: {
            id: string;
            customer_email?: string;
            metadata?: { user_id?: string; plan?: string };
            subscription?: string;
        };
    };
}

// Handle Stripe webhook
export const handleStripeWebhook = async (request: IRequest, env: Env) => {
    try {
        // In production: verify webhook signature using STRIPE_WEBHOOK_SECRET
        const body = await request.json() as StripeEvent;
        const eventType = body.type;
        const eventData = body.data.object;

        console.log(`Stripe webhook: ${eventType}`, { id: eventData.id });

        switch (eventType) {
            case 'checkout.session.completed': {
                // New subscription created via checkout
                const userId = eventData.metadata?.user_id;
                const plan = eventData.metadata?.plan as keyof typeof PLANS;

                if (!userId || !plan) {
                    return error('Missing user_id or plan in metadata', 400);
                }

                const planDetails = PLANS[plan];
                if (!planDetails) {
                    return error('Invalid plan', 400);
                }

                const now = Math.floor(Date.now() / 1000);
                const expiresAt = plan === 'BASIC' ? null : now + 30 * 24 * 60 * 60;

                // Upsert subscription
                const existing = await env.DB.prepare('SELECT id FROM subscriptions WHERE user_id = ?').bind(userId).first();

                if (existing) {
                    await env.DB.prepare(
                        'UPDATE subscriptions SET plan = ?, max_items = ?, max_risk_level = ?, monthly_fee = ?, expires_at = ?, payment_id = ? WHERE user_id = ?'
                    ).bind(plan, planDetails.max_items, planDetails.max_risk_level, planDetails.monthly_fee, expiresAt, eventData.id, userId).run();
                } else {
                    await env.DB.prepare(
                        'INSERT INTO subscriptions (user_id, plan, max_items, max_risk_level, monthly_fee, expires_at, payment_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
                    ).bind(userId, plan, planDetails.max_items, planDetails.max_risk_level, planDetails.monthly_fee, expiresAt, eventData.id).run();
                }

                // Update user's membership tier
                await env.DB.prepare('UPDATE users SET membership_tier = ? WHERE id = ?').bind(plan, userId).run();

                return json({ received: true, action: 'subscription_activated', plan });
            }

            case 'invoice.paid': {
                // Recurring payment successful - extend subscription
                const subscriptionId = eventData.subscription;

                if (subscriptionId) {
                    const now = Math.floor(Date.now() / 1000);
                    const newExpiry = now + 30 * 24 * 60 * 60;

                    await env.DB.prepare(
                        'UPDATE subscriptions SET expires_at = ? WHERE payment_id LIKE ?'
                    ).bind(newExpiry, `%${subscriptionId}%`).run();
                }

                return json({ received: true, action: 'subscription_renewed' });
            }

            case 'customer.subscription.deleted': {
                // Subscription cancelled - revert to BASIC
                const subscriptionId = eventData.id;
                const basicPlan = PLANS.BASIC;

                // Find subscription by payment_id
                const subscription = await env.DB.prepare(
                    'SELECT user_id FROM subscriptions WHERE payment_id LIKE ?'
                ).bind(`%${subscriptionId}%`).first<{ user_id: number }>();

                if (subscription) {
                    await env.DB.prepare(
                        'UPDATE subscriptions SET plan = ?, max_items = ?, max_risk_level = ?, monthly_fee = ?, expires_at = NULL WHERE user_id = ?'
                    ).bind('BASIC', basicPlan.max_items, basicPlan.max_risk_level, basicPlan.monthly_fee, subscription.user_id).run();

                    await env.DB.prepare('UPDATE users SET membership_tier = ? WHERE id = ?').bind('BASIC', subscription.user_id).run();
                }

                return json({ received: true, action: 'subscription_cancelled' });
            }

            default:
                return json({ received: true, ignored: true });
        }
    } catch (e) {
        console.error('Webhook error:', e);
        if (e instanceof SyntaxError) {
            return error('Invalid JSON body', 400);
        }
        return error('Webhook processing failed', 500);
    }
};

// PayHere webhook (Sri Lankan payment gateway)
export const handlePayHereWebhook = async (request: IRequest, env: Env) => {
    try {
        const body = await request.json() as {
            merchant_id: string;
            order_id: string;
            payment_id: string;
            payhere_amount: string;
            status_code: string;
            custom_1?: string; // user_id
            custom_2?: string; // plan
        };

        console.log('PayHere webhook:', body);

        // Status codes: 2 = success, 0 = pending, -1 = canceled, -2 = failed
        if (body.status_code !== '2') {
            return json({ received: true, status: 'payment_not_successful' });
        }

        const userId = body.custom_1;
        const plan = body.custom_2 as keyof typeof PLANS;

        if (!userId || !plan || !PLANS[plan]) {
            return error('Invalid payment data', 400);
        }

        const planDetails = PLANS[plan];
        const now = Math.floor(Date.now() / 1000);
        const expiresAt = plan === 'BASIC' ? null : now + 30 * 24 * 60 * 60;

        // Upsert subscription
        const existing = await env.DB.prepare('SELECT id FROM subscriptions WHERE user_id = ?').bind(userId).first();

        if (existing) {
            await env.DB.prepare(
                'UPDATE subscriptions SET plan = ?, max_items = ?, max_risk_level = ?, monthly_fee = ?, expires_at = ?, payment_id = ? WHERE user_id = ?'
            ).bind(plan, planDetails.max_items, planDetails.max_risk_level, planDetails.monthly_fee, expiresAt, body.payment_id, userId).run();
        } else {
            await env.DB.prepare(
                'INSERT INTO subscriptions (user_id, plan, max_items, max_risk_level, monthly_fee, expires_at, payment_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
            ).bind(userId, plan, planDetails.max_items, planDetails.max_risk_level, planDetails.monthly_fee, expiresAt, body.payment_id).run();
        }

        await env.DB.prepare('UPDATE users SET membership_tier = ? WHERE id = ?').bind(plan, userId).run();

        return json({ received: true, action: 'subscription_activated', plan });
    } catch (e) {
        console.error('PayHere webhook error:', e);
        return error('Webhook processing failed', 500);
    }
};
