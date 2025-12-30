import { Env } from '../index';

// Level requirements (XP points needed for each level)
export const LEVEL_REQUIREMENTS = {
    1: 0,
    2: 100,
    3: 300,
    4: 700,
    5: 1500,
};

// Trust score ranges
export const TRUST_LEVELS = {
    UNTRUSTED: { min: 0, max: 49, label: 'Untrusted' },
    LOW: { min: 50, max: 79, label: 'Low Trust' },
    NORMAL: { min: 80, max: 119, label: 'Normal' },
    HIGH: { min: 120, max: 159, label: 'High Trust' },
    EXCELLENT: { min: 160, max: 200, label: 'Excellent' },
};

// Reward multipliers by subscription tier
export const REWARD_MULTIPLIERS = {
    BASIC: 1.0,
    MAKER: 1.5,
    INNOVATOR: 2.0,
};

// Calculate XP from activities
export const XP_REWARDS = {
    BORROW_COMPLETE: 10,
    RETURN_ON_TIME: 15,
    RETURN_EARLY: 20,
    RETURN_LATE: -5,
    COMMUNITY_POST: 25,
    POST_APPROVED: 50,
    FIRST_BORROW: 50,
};

// Issue #17: Level Progression
export const calculateLevel = (xp: number): number => {
    if (xp >= LEVEL_REQUIREMENTS[5]) return 5;
    if (xp >= LEVEL_REQUIREMENTS[4]) return 4;
    if (xp >= LEVEL_REQUIREMENTS[3]) return 3;
    if (xp >= LEVEL_REQUIREMENTS[2]) return 2;
    return 1;
};

export const getXPForNextLevel = (currentLevel: number): number => {
    if (currentLevel >= 5) return 0; // Max level
    return LEVEL_REQUIREMENTS[(currentLevel + 1) as keyof typeof LEVEL_REQUIREMENTS];
};

export const checkLevelUp = async (
    env: Env,
    userId: number
): Promise<{ leveled: boolean; newLevel: number }> => {
    const user = await env.DB.prepare(
        'SELECT level, reward_points FROM users WHERE id = ?'
    ).bind(userId).first<{ level: number; reward_points: number }>();

    if (!user) {
        return { leveled: false, newLevel: 0 };
    }

    // Reward points are used as XP for level calculation
    const newLevel = calculateLevel(user.reward_points);

    if (newLevel > user.level) {
        await env.DB.prepare('UPDATE users SET level = ? WHERE id = ?')
            .bind(newLevel, userId).run();
        return { leveled: true, newLevel };
    }

    return { leveled: false, newLevel: user.level };
};

// Issue #18: Trust Score Engine
export const getTrustLevel = (score: number): string => {
    if (score >= TRUST_LEVELS.EXCELLENT.min) return 'EXCELLENT';
    if (score >= TRUST_LEVELS.HIGH.min) return 'HIGH';
    if (score >= TRUST_LEVELS.NORMAL.min) return 'NORMAL';
    if (score >= TRUST_LEVELS.LOW.min) return 'LOW';
    return 'UNTRUSTED';
};

export const updateTrustScore = async (
    env: Env,
    userId: number,
    delta: number
): Promise<number> => {
    // Clamp trust score between 0 and 200
    await env.DB.prepare(`
    UPDATE users 
    SET trust_score = MAX(0, MIN(200, trust_score + ?))
    WHERE id = ?
  `).bind(delta, userId).run();

    const user = await env.DB.prepare(
        'SELECT trust_score FROM users WHERE id = ?'
    ).bind(userId).first<{ trust_score: number }>();

    return user?.trust_score ?? 100;
};

// Trust score changes for different events
export const TRUST_CHANGES = {
    RETURN_ON_TIME: +2,
    RETURN_EARLY: +3,
    RETURN_LATE: -5,
    RETURN_VERY_LATE: -15, // > 3 days
    ITEM_DAMAGED: -10,
    ITEM_LOST: -50,
    COMMUNITY_CONTRIBUTION: +5,
    ADMIN_OVERRIDE_POSITIVE: +20,
    ADMIN_OVERRIDE_NEGATIVE: -20,
};

// Issue #19: Reward Points System
export const awardPoints = async (
    env: Env,
    userId: number,
    action: keyof typeof XP_REWARDS,
    multiplier: number = 1.0
): Promise<{ points: number; totalPoints: number; leveledUp: boolean; newLevel: number }> => {
    const basePoints = XP_REWARDS[action];
    const points = Math.floor(basePoints * multiplier);

    // Update user points
    await env.DB.prepare(
        'UPDATE users SET reward_points = reward_points + ? WHERE id = ?'
    ).bind(points, userId).run();

    // Get new total
    const user = await env.DB.prepare(
        'SELECT reward_points, level FROM users WHERE id = ?'
    ).bind(userId).first<{ reward_points: number; level: number }>();

    const totalPoints = user?.reward_points ?? 0;

    // Check for level up
    const { leveled, newLevel } = await checkLevelUp(env, userId);

    return { points, totalPoints, leveledUp: leveled, newLevel };
};

// Get reward multiplier for user based on subscription
export const getRewardMultiplier = async (env: Env, userId: number): Promise<number> => {
    const subscription = await env.DB.prepare(
        'SELECT plan FROM subscriptions WHERE user_id = ?'
    ).bind(userId).first<{ plan: string }>();

    const plan = subscription?.plan ?? 'BASIC';
    return REWARD_MULTIPLIERS[plan as keyof typeof REWARD_MULTIPLIERS] ?? 1.0;
};

// Helper to award points with automatic multiplier
export const awardPointsWithMultiplier = async (
    env: Env,
    userId: number,
    action: keyof typeof XP_REWARDS
): Promise<{ points: number; totalPoints: number; leveledUp: boolean; newLevel: number }> => {
    const multiplier = await getRewardMultiplier(env, userId);
    return awardPoints(env, userId, action, multiplier);
};

// Get user progression summary
export const getUserProgression = async (env: Env, userId: number) => {
    const user = await env.DB.prepare(`
    SELECT id, name, level, trust_score, reward_points, membership_tier
    FROM users WHERE id = ?
  `).bind(userId).first<{
        id: number;
        name: string;
        level: number;
        trust_score: number;
        reward_points: number;
        membership_tier: string;
    }>();

    if (!user) return null;

    const currentLevel = user.level;
    const nextLevelXP = getXPForNextLevel(currentLevel);
    const trustLevel = getTrustLevel(user.trust_score);

    return {
        ...user,
        xp: user.reward_points,
        nextLevelXP,
        progressToNextLevel: nextLevelXP > 0
            ? Math.min(100, Math.floor((user.reward_points / nextLevelXP) * 100))
            : 100,
        trustLevel,
        rewardMultiplier: REWARD_MULTIPLIERS[user.membership_tier as keyof typeof REWARD_MULTIPLIERS] ?? 1.0,
    };
};
