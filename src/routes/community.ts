import { IRequest } from 'itty-router';
import { Env, json, error } from '../index';
import { AuthenticatedRequest } from '../middleware/auth';
import { awardPointsWithMultiplier } from '../services/progression';

// Issue #20: Media Upload to R2
export const uploadMedia = async (request: AuthenticatedRequest, env: Env) => {
    const userId = request.userId;

    if (!userId) {
        return error('Unauthorized', 401);
    }

    try {
        const contentType = request.headers.get('Content-Type') || 'application/octet-stream';

        // Validate content type
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'];
        if (!allowedTypes.some(t => contentType.startsWith(t.split('/')[0]))) {
            return error('Invalid file type. Allowed: images (jpeg, png, webp), videos (mp4, webm)', 400);
        }

        // Get file from request body
        const file = await request.arrayBuffer();

        // Validate file size (max 50MB)
        if (file.byteLength > 50 * 1024 * 1024) {
            return error('File too large. Maximum 50MB', 400);
        }

        // Generate unique filename
        const extension = contentType.includes('video') ? 'mp4' : 'jpg';
        const filename = `${userId}/${Date.now()}-${crypto.randomUUID().substring(0, 8)}.${extension}`;

        // Upload to R2
        await env.MEDIA.put(filename, file, {
            httpMetadata: { contentType },
            customMetadata: { userId: String(userId), uploadedAt: new Date().toISOString() },
        });

        // Generate public URL (assumes R2 custom domain or public access)
        const url = `https://media.lot.example.com/${filename}`;

        return json({
            message: 'File uploaded successfully',
            filename,
            url,
            size: file.byteLength,
        }, 201);
    } catch (e) {
        console.error('Upload error:', e);
        return error('Upload failed', 500);
    }
};

// Get uploaded media (for verification)
export const getMedia = async (request: IRequest, env: Env) => {
    const { filename } = request.params;

    if (!filename) {
        return error('Filename required', 400);
    }

    const decodedFilename = decodeURIComponent(filename);
    const object = await env.MEDIA.get(decodedFilename);

    if (!object) {
        return error('File not found', 404);
    }

    const headers = new Headers();
    headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
    headers.set('Cache-Control', 'public, max-age=31536000');

    return new Response(object.body, { headers });
};

// Issue #21: Community Posts CRUD
export const createPost = async (request: AuthenticatedRequest, env: Env) => {
    const userId = request.userId;

    if (!userId) {
        return error('Unauthorized', 401);
    }

    try {
        const body = await request.json() as {
            item_id?: number;
            video_url?: string;
            description?: string;
        };
        const { item_id, video_url, description } = body;

        if (!item_id || typeof item_id !== 'number') {
            return error('item_id is required', 400);
        }

        // Verify user has borrowed this item
        const borrow = await env.DB.prepare(
            'SELECT id FROM borrow_records WHERE user_id = ? AND item_id = ? AND status = ?'
        ).bind(userId, item_id, 'returned').first();

        if (!borrow) {
            return error('You must have borrowed and returned this item to post about it', 403);
        }

        // Check for duplicate post
        const existing = await env.DB.prepare(
            'SELECT id FROM community_posts WHERE user_id = ? AND item_id = ?'
        ).bind(userId, item_id).first();

        if (existing) {
            return error('You have already posted about this item', 409);
        }

        const result = await env.DB.prepare(`
      INSERT INTO community_posts (user_id, item_id, video_url, description, approved)
      VALUES (?, ?, ?, ?, 0)
    `).bind(userId, item_id, video_url || null, description || null).run();

        // Award points for community contribution
        await awardPointsWithMultiplier(env, userId, 'COMMUNITY_POST');

        return json({
            message: 'Post created and pending approval',
            post_id: result.meta.last_row_id,
        }, 201);
    } catch (e) {
        if (e instanceof SyntaxError) {
            return error('Invalid JSON body', 400);
        }
        throw e;
    }
};

// Get user's posts
export const getUserPosts = async (request: AuthenticatedRequest, env: Env) => {
    const userId = request.userId;

    if (!userId) {
        return error('Unauthorized', 401);
    }

    const { results } = await env.DB.prepare(`
    SELECT cp.*, i.name as item_name
    FROM community_posts cp
    JOIN items i ON cp.item_id = i.id
    WHERE cp.user_id = ?
    ORDER BY cp.created_at DESC
  `).bind(userId).all();

    return json(results);
};

// Issue #22: Approval Queue (Admin)
export const getPendingPosts = async (request: IRequest, env: Env) => {
    const { results } = await env.DB.prepare(`
    SELECT cp.*, i.name as item_name, u.name as user_name
    FROM community_posts cp
    JOIN items i ON cp.item_id = i.id
    JOIN users u ON cp.user_id = u.id
    WHERE cp.approved = 0
    ORDER BY cp.created_at ASC
  `).all();

    return json(results);
};

export const approvePost = async (request: IRequest, env: Env) => {
    const { id } = request.params;

    if (!id || isNaN(Number(id))) {
        return error('Invalid post ID', 400);
    }

    const post = await env.DB.prepare('SELECT user_id, approved FROM community_posts WHERE id = ?')
        .bind(id).first<{ user_id: number; approved: number }>();

    if (!post) {
        return error('Post not found', 404);
    }

    if (post.approved === 1) {
        return error('Post already approved', 400);
    }

    // Approve post
    await env.DB.prepare('UPDATE community_posts SET approved = 1, reward_granted = 1 WHERE id = ?')
        .bind(id).run();

    // Award bonus points for approved post
    await awardPointsWithMultiplier(env, post.user_id, 'POST_APPROVED');

    return json({ message: 'Post approved and rewards granted' });
};

export const rejectPost = async (request: IRequest, env: Env) => {
    const { id } = request.params;

    if (!id || isNaN(Number(id))) {
        return error('Invalid post ID', 400);
    }

    const post = await env.DB.prepare('SELECT id FROM community_posts WHERE id = ?').bind(id).first();

    if (!post) {
        return error('Post not found', 404);
    }

    // Set approved to -1 for rejected
    await env.DB.prepare('UPDATE community_posts SET approved = -1 WHERE id = ?').bind(id).run();

    return json({ message: 'Post rejected' });
};

// Issue #23: Public Feed API
export const getPublicFeed = async (request: IRequest, env: Env) => {
    const { query } = request;
    const itemId = query.item_id;
    const userId = query.user_id;

    let sql = `
    SELECT cp.id, cp.video_url, cp.description, cp.created_at,
           i.id as item_id, i.name as item_name, i.category as item_category,
           u.id as user_id, u.name as user_name, u.level as user_level
    FROM community_posts cp
    JOIN items i ON cp.item_id = i.id
    JOIN users u ON cp.user_id = u.id
    WHERE cp.approved = 1
  `;
    const params: (string | number)[] = [];

    if (itemId && !isNaN(Number(itemId))) {
        sql += ' AND cp.item_id = ?';
        params.push(Number(itemId));
    }

    if (userId && !isNaN(Number(userId))) {
        sql += ' AND cp.user_id = ?';
        params.push(Number(userId));
    }

    sql += ' ORDER BY cp.created_at DESC LIMIT 50';

    const stmt = params.length > 0
        ? env.DB.prepare(sql).bind(...params)
        : env.DB.prepare(sql);

    const { results } = await stmt.all();

    return json(results);
};

// Get single post
export const getPost = async (request: IRequest, env: Env) => {
    const { id } = request.params;

    if (!id || isNaN(Number(id))) {
        return error('Invalid post ID', 400);
    }

    const post = await env.DB.prepare(`
    SELECT cp.*, i.name as item_name, u.name as user_name
    FROM community_posts cp
    JOIN items i ON cp.item_id = i.id
    JOIN users u ON cp.user_id = u.id
    WHERE cp.id = ? AND cp.approved = 1
  `).bind(id).first();

    if (!post) {
        return error('Post not found', 404);
    }

    return json(post);
};
