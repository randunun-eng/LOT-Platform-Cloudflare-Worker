import { IRequest } from 'itty-router';
import { Env, json, error } from '../index';
import { AuthenticatedRequest } from '../middleware/auth';
import {
    getUserProgression,
    awardPointsWithMultiplier,
    updateTrustScore,
    LEVEL_REQUIREMENTS,
    TRUST_CHANGES,
    XP_REWARDS
} from '../services/progression';

// Get user's progression stats
export const getProgression = async (request: AuthenticatedRequest, env: Env) => {
    const userId = request.userId;

    if (!userId) {
        return error('Unauthorized', 401);
    }

    const progression = await getUserProgression(env, userId);

    if (!progression) {
        return error('User not found', 404);
    }

    return json(progression);
};

// Get any user's progression (admin or public profile)
export const getUserProgressionById = async (request: IRequest, env: Env) => {
    const { userId } = request.params;

    if (!userId || isNaN(Number(userId))) {
        return error('Invalid user ID', 400);
    }

    const progression = await getUserProgression(env, Number(userId));

    if (!progression) {
        return error('User not found', 404);
    }

    // Return public view (hide some fields)
    return json({
        id: progression.id,
        name: progression.name,
        level: progression.level,
        trustLevel: progression.trustLevel,
        membership_tier: progression.membership_tier,
    });
};

// Get level requirements
export const getLevelRequirements = async (request: IRequest, env: Env) => {
    return json(LEVEL_REQUIREMENTS);
};

// Admin: Award points manually
export const adminAwardPoints = async (request: IRequest, env: Env) => {
    try {
        const body = await request.json() as {
            user_id?: number;
            action?: keyof typeof XP_REWARDS;
            custom_points?: number;
        };
        const { user_id, action, custom_points } = body;

        if (!user_id || typeof user_id !== 'number') {
            return error('user_id is required', 400);
        }

        if (custom_points !== undefined) {
            // Direct points award
            await env.DB.prepare(
                'UPDATE users SET reward_points = reward_points + ? WHERE id = ?'
            ).bind(custom_points, user_id).run();

            return json({ message: 'Points awarded', points: custom_points });
        }

        if (!action || !(action in XP_REWARDS)) {
            return error('Valid action or custom_points required', 400);
        }

        const result = await awardPointsWithMultiplier(env, user_id, action);

        return json({
            message: 'Points awarded',
            ...result,
        });
    } catch (e) {
        if (e instanceof SyntaxError) {
            return error('Invalid JSON body', 400);
        }
        throw e;
    }
};

// Admin: Adjust trust score
export const adminAdjustTrust = async (request: IRequest, env: Env) => {
    try {
        const body = await request.json() as {
            user_id?: number;
            change?: keyof typeof TRUST_CHANGES;
            custom_delta?: number;
        };
        const { user_id, change, custom_delta } = body;

        if (!user_id || typeof user_id !== 'number') {
            return error('user_id is required', 400);
        }

        let delta: number;

        if (custom_delta !== undefined) {
            delta = custom_delta;
        } else if (change && change in TRUST_CHANGES) {
            delta = TRUST_CHANGES[change];
        } else {
            return error('Valid change or custom_delta required', 400);
        }

        const newScore = await updateTrustScore(env, user_id, delta);

        return json({
            message: 'Trust score updated',
            delta,
            newScore,
        });
    } catch (e) {
        if (e instanceof SyntaxError) {
            return error('Invalid JSON body', 400);
        }
        throw e;
    }
};

// Get leaderboard
export const getLeaderboard = async (request: IRequest, env: Env) => {
    const { query } = request;
    const type = query.type || 'xp'; // 'xp', 'level', 'trust'

    let orderBy: string;
    switch (type) {
        case 'level':
            orderBy = 'level DESC, reward_points DESC';
            break;
        case 'trust':
            orderBy = 'trust_score DESC';
            break;
        default:
            orderBy = 'reward_points DESC';
    }

    const { results } = await env.DB.prepare(`
    SELECT id, name, level, trust_score, reward_points
    FROM users
    ORDER BY ${orderBy}
    LIMIT 20
  `).all();

    return json(results.map((r: Record<string, unknown>, i: number) => ({
        rank: i + 1,
        ...r,
    })));
};
