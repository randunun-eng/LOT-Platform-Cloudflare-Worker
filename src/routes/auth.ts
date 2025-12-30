import { IRequest } from 'itty-router';
import { Env, json, error } from '../index';

// OTP Configuration
const OTP_LENGTH = 6;
const OTP_TTL_SECONDS = 300; // 5 minutes

// Generate random OTP
const generateOTP = (): string => {
    const digits = '0123456789';
    let otp = '';
    for (let i = 0; i < OTP_LENGTH; i++) {
        otp += digits[Math.floor(Math.random() * digits.length)];
    }
    return otp;
};

// Request OTP - sends OTP to email (in dev mode, returns OTP in response)
export const requestOTP = async (request: IRequest, env: Env) => {
    try {
        const body = await request.json() as { email?: string };
        const { email } = body;

        // Validation
        if (!email || typeof email !== 'string') {
            return error('Email is required', 400);
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return error('Invalid email format', 400);
        }

        const normalizedEmail = email.toLowerCase();

        // Check rate limiting (max 3 OTP requests per email per 10 minutes)
        const rateLimitKey = `otp_rate:${normalizedEmail}`;
        const rateCount = await env.KV.get(rateLimitKey);
        if (rateCount && parseInt(rateCount) >= 3) {
            return error('Too many OTP requests. Try again later.', 429);
        }

        // Generate OTP
        const otp = generateOTP();

        // Store OTP in KV with TTL
        const otpKey = `otp:${normalizedEmail}`;
        await env.KV.put(otpKey, otp, { expirationTtl: OTP_TTL_SECONDS });

        // Update rate limit
        const newCount = rateCount ? parseInt(rateCount) + 1 : 1;
        await env.KV.put(rateLimitKey, newCount.toString(), { expirationTtl: 600 }); // 10 min window

        // In production: send email via external service
        // For now: log and return success (in dev, include OTP for testing)
        console.log(`OTP for ${normalizedEmail}: ${otp}`);

        const response: { message: string; otp?: string } = {
            message: 'OTP sent to email',
        };

        // In development mode, include OTP for testing
        if (env.ENVIRONMENT === 'development') {
            response.otp = otp;
        }

        return json(response);
    } catch (e) {
        if (e instanceof SyntaxError) {
            return error('Invalid JSON body', 400);
        }
        throw e;
    }
};

// Verify OTP and create session
export const verifyOTP = async (request: IRequest, env: Env) => {
    try {
        const body = await request.json() as { email?: string; otp?: string };
        const { email, otp } = body;

        // Validation
        if (!email || typeof email !== 'string') {
            return error('Email is required', 400);
        }

        if (!otp || typeof otp !== 'string') {
            return error('OTP is required', 400);
        }

        const normalizedEmail = email.toLowerCase();

        // Get stored OTP
        const otpKey = `otp:${normalizedEmail}`;
        const storedOTP = await env.KV.get(otpKey);

        if (!storedOTP) {
            return error('OTP expired or not found', 400);
        }

        if (storedOTP !== otp) {
            return error('Invalid OTP', 401);
        }

        // OTP valid - delete it (one-time use)
        await env.KV.delete(otpKey);

        // Find or create user
        let user = await env.DB.prepare('SELECT id, email, name, level, trust_score, membership_tier, reward_points, is_admin FROM users WHERE email = ?')
            .bind(normalizedEmail)
            .first();

        if (!user) {
            // Create new user with email as temporary name
            const result = await env.DB.prepare('INSERT INTO users (email, name) VALUES (?, ?)')
                .bind(normalizedEmail, normalizedEmail.split('@')[0])
                .run();

            user = {
                id: result.meta.last_row_id,
                email: normalizedEmail,
                name: normalizedEmail.split('@')[0],
                level: 1,
                trust_score: 100,
                membership_tier: 'BASIC',
                reward_points: 0,
                is_admin: 0,
            };
        }

        // Generate session token
        const sessionToken = crypto.randomUUID();
        const sessionKey = `session:${sessionToken}`;
        const sessionData = JSON.stringify({
            userId: user.id,
            email: user.email,
            isAdmin: user.is_admin === 1,
            createdAt: Date.now(),
        });

        // Store session in KV (24 hours TTL)
        await env.KV.put(sessionKey, sessionData, { expirationTtl: 86400 });

        return json({
            message: 'Login successful',
            token: sessionToken,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                level: user.level,
                membership_tier: user.membership_tier,
                is_admin: user.is_admin === 1,
            },
        });
    } catch (e) {
        if (e instanceof SyntaxError) {
            return error('Invalid JSON body', 400);
        }
        throw e;
    }
};

// Logout - invalidate session
export const logout = async (request: IRequest, env: Env) => {
    const authHeader = request.headers.get('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return json({ message: 'Logged out' }); // Already logged out
    }

    const token = authHeader.substring(7);
    const sessionKey = `session:${token}`;

    await env.KV.delete(sessionKey);

    return json({ message: 'Logged out successfully' });
};

// Get current session user
export const getCurrentUser = async (request: IRequest, env: Env) => {
    const authHeader = request.headers.get('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return error('Unauthorized', 401);
    }

    const token = authHeader.substring(7);
    const sessionKey = `session:${token}`;
    const sessionData = await env.KV.get(sessionKey);

    if (!sessionData) {
        return error('Session expired', 401);
    }

    const session = JSON.parse(sessionData) as { userId: number; email: string; isAdmin: boolean };

    const user = await env.DB.prepare('SELECT id, email, name, level, trust_score, membership_tier, reward_points, is_admin FROM users WHERE id = ?')
        .bind(session.userId)
        .first();

    if (!user) {
        return error('User not found', 404);
    }

    return json(user);
};
