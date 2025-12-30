import { Env, json, error } from '../index';
import { IRequest } from 'itty-router';

// Issue #26: Borrow & Return Notifications
// Issue #27: Level Unlock & Reward Alerts

// Notification types
type NotificationType =
    | 'BORROW_CONFIRMED'
    | 'RETURN_REMINDER'
    | 'OVERDUE_NOTICE'
    | 'LEVEL_UP'
    | 'REWARD_EARNED'
    | 'POST_APPROVED';

interface Notification {
    type: NotificationType;
    userId: number;
    title: string;
    body: string;
    data?: Record<string, unknown>;
}

// Queue a notification for processing
export const queueNotification = async (
    env: Env,
    notification: Notification
): Promise<void> => {
    await env.REWARDS_QUEUE.send({
        type: 'notification',
        payload: notification,
        timestamp: Date.now(),
    });
};

// Send borrow confirmation notification
export const notifyBorrowConfirmed = async (
    env: Env,
    userId: number,
    itemName: string,
    dueDate: Date
): Promise<void> => {
    await queueNotification(env, {
        type: 'BORROW_CONFIRMED',
        userId,
        title: 'Item Borrowed Successfully',
        body: `You borrowed "${itemName}". Due back ${dueDate.toLocaleDateString()}.`,
        data: { itemName, dueDate: dueDate.toISOString() },
    });
};

// Send return reminder notification
export const notifyReturnReminder = async (
    env: Env,
    userId: number,
    itemName: string,
    dueDate: Date
): Promise<void> => {
    await queueNotification(env, {
        type: 'RETURN_REMINDER',
        userId,
        title: 'Return Reminder',
        body: `"${itemName}" is due tomorrow. Please return it on time.`,
        data: { itemName, dueDate: dueDate.toISOString() },
    });
};

// Send overdue notice
export const notifyOverdue = async (
    env: Env,
    userId: number,
    itemName: string,
    daysOverdue: number
): Promise<void> => {
    await queueNotification(env, {
        type: 'OVERDUE_NOTICE',
        userId,
        title: 'Item Overdue',
        body: `"${itemName}" is ${daysOverdue} day(s) overdue. Please return it immediately.`,
        data: { itemName, daysOverdue },
    });
};

// Send level up notification
export const notifyLevelUp = async (
    env: Env,
    userId: number,
    newLevel: number
): Promise<void> => {
    const levelNames = ['', 'Starter', 'Explorer', 'Builder', 'Maker', 'Innovator'];
    await queueNotification(env, {
        type: 'LEVEL_UP',
        userId,
        title: '🎉 Level Up!',
        body: `Congratulations! You're now Level ${newLevel} (${levelNames[newLevel]})!`,
        data: { newLevel },
    });
};

// Send reward notification
export const notifyRewardEarned = async (
    env: Env,
    userId: number,
    points: number,
    reason: string
): Promise<void> => {
    await queueNotification(env, {
        type: 'REWARD_EARNED',
        userId,
        title: '+' + points + ' Points',
        body: reason,
        data: { points },
    });
};

// Send post approved notification
export const notifyPostApproved = async (
    env: Env,
    userId: number,
    itemName: string,
    bonusPoints: number
): Promise<void> => {
    await queueNotification(env, {
        type: 'POST_APPROVED',
        userId,
        title: 'Build Post Approved!',
        body: `Your post about "${itemName}" was approved! +${bonusPoints} bonus points.`,
        data: { itemName, bonusPoints },
    });
};

// Process notification queue (called by queue consumer)
export const processNotification = async (
    env: Env,
    notification: Notification
): Promise<void> => {
    // Get user email
    const user = await env.DB.prepare('SELECT email, name FROM users WHERE id = ?')
        .bind(notification.userId)
        .first<{ email: string; name: string }>();

    if (!user) {
        console.error('User not found for notification:', notification.userId);
        return;
    }

    // In production: Send email via Resend, SendGrid, etc.
    console.log(`[NOTIFICATION] To: ${user.email}`);
    console.log(`  Subject: ${notification.title}`);
    console.log(`  Body: ${notification.body}`);

    // Store notification in KV for user to retrieve
    const notificationKey = `notifications:${notification.userId}`;
    const existing = await env.KV.get(notificationKey);
    const notifications = existing ? JSON.parse(existing) : [];

    notifications.unshift({
        ...notification,
        id: crypto.randomUUID(),
        read: false,
        createdAt: Date.now(),
    });

    // Keep only last 50 notifications
    await env.KV.put(
        notificationKey,
        JSON.stringify(notifications.slice(0, 50)),
        { expirationTtl: 30 * 24 * 60 * 60 } // 30 days
    );
};

// Get user's notifications
export const getUserNotifications = async (request: IRequest, env: Env) => {
    const userId = (request as any).userId;

    if (!userId) {
        return error('Unauthorized', 401);
    }

    const notificationKey = `notifications:${userId}`;
    const data = await env.KV.get(notificationKey);

    return json(data ? JSON.parse(data) : []);
};

// Mark notification as read
export const markNotificationRead = async (request: IRequest, env: Env) => {
    const userId = (request as any).userId;
    const { id } = request.params;

    if (!userId) {
        return error('Unauthorized', 401);
    }

    const notificationKey = `notifications:${userId}`;
    const data = await env.KV.get(notificationKey);

    if (!data) {
        return json({ message: 'No notifications' });
    }

    const notifications = JSON.parse(data);
    const updated = notifications.map((n: any) =>
        n.id === id ? { ...n, read: true } : n
    );

    await env.KV.put(notificationKey, JSON.stringify(updated));

    return json({ message: 'Marked as read' });
};
