import { Hono } from "hono";
import { fromHono, OpenAPIRoute } from "chanfana";
import { z } from "zod";
import { getDatabase } from "../dbh";
import { AppContext } from "../types";
import { pandas, users, posts, historyPost, historyGet, historyDelete } from "./search";
import { de } from "zod/v4/locales";


// 列表、热门、详情、创建、更新、删除、点赞、取消点赞、添加评论、获取评论 — 使用 OpenAPIRoute 风格

export class listPosts extends OpenAPIRoute {
  public schema = {
    tags: ['Posts'],
    summary: '获取内容列表',
    request: {
      query: z.object({
        page: z.coerce.number().int().positive().default(1).describe('页码'),
        limit: z.coerce.number().int().min(1).max(100).default(20).describe('每页数量'),
        panda_id: z.coerce.number().int().positive().optional().describe('熊猫ID筛选'),
        user_id: z.coerce.number().int().positive().optional().describe('用户ID筛选'),
        media_type: z.enum(['text', 'image', 'video', 'mixed']).optional().describe('媒体类型筛选'),
        status: z.enum(['draft', 'published', 'hidden']).optional().describe('状态筛选'),
        order_by: z.enum(['created_at', 'like_count', 'view_count', 'comment_count']).default('created_at').describe('排序字段'),
        order_dir: z.enum(['ASC', 'DESC']).default('DESC').describe('排序方向'),
      }),
    },
    responses: {
      200: {
        description: '成功返回内容列表',
      },
    },
  };

  public async handle(c: AppContext) {
    const data = await this.getValidatedData<typeof this.schema>();
    const query = data.query;
    const db = getDatabase(c.env);

    const filters: Record<string, any> = {};
    if (query.panda_id) filters.panda_id = query.panda_id;
    if (query.user_id) filters.user_id = query.user_id;
    if (query.media_type) filters.media_type = query.media_type;
    if (query.status) filters.status = query.status;
    else filters.status = 'published';

    const result = await db.paginate('posts', {
      page: query.page,
      limit: query.limit,
      orderBy: query.order_by,
      orderDir: query.order_dir,
    }, filters);

    const postsWithDetails = await Promise.all(
      result.data.map(async (post: any) => {
        const [user, panda] = await Promise.all([
          db.queryFirst('SELECT id, username, avatar_url FROM users WHERE id = ?', [post.user_id]),
          post.panda_id ? db.queryFirst('SELECT id, name FROM pandas WHERE id = ?', [post.panda_id]) : null,
        ]);
        return {
          ...post,
          user,
          panda,
          media_urls: post.media_urls ? JSON.parse(post.media_urls) : [],
        };
      })
    );

    return c.json({
      success: true,
      data: postsWithDetails,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        pages: result.pages,
      },
    });
  }
}

export class trending extends OpenAPIRoute {
  public schema = {
    tags: ['Posts'],
    summary: '获取热门内容',
    request: {
      query: z.object({
        limit: z.coerce.number().int().min(1).max(50).default(10).describe('返回数量'),
        timeframe: z.enum(['day', 'week', 'month', 'all']).default('week').describe('时间范围'),
      }),
    },
    responses: { 200: { description: '成功返回热门内容' } },
  };

  public async handle(c: AppContext) {
    const data = await this.getValidatedData<typeof this.schema>();
    const { limit, timeframe } = data.query;
    const db = getDatabase(c.env);

    let dateFilter = '';
    const params: any[] = [];

    if (timeframe !== 'all') {
      const date = new Date();
      if (timeframe === 'day') date.setDate(date.getDate() - 1);
      else if (timeframe === 'week') date.setDate(date.getDate() - 7);
      else if (timeframe === 'month') date.setMonth(date.getMonth() - 1);
      dateFilter = 'WHERE created_at >= ? AND status = ?';
      params.push(date.toISOString(), 'published');
    } else {
      dateFilter = 'WHERE status = ?';
      params.push('published');
    }

    const result = await db.query(`
      SELECT p.*, u.username, u.avatar_url, pd.name as panda_name
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN pandas pd ON p.panda_id = pd.id
      ${dateFilter}
      ORDER BY (p.like_count * 0.7 + p.view_count * 0.3) DESC, p.created_at DESC
      LIMIT ?
    `, [...params, limit]);

    return c.json({ success: true, data: result });
  }
}

export class getPost extends OpenAPIRoute {
  public schema = {
    tags: ['Posts'],
    summary: '获取内容详情',
    request: {
      params: z.object({ id: z.string().regex(/^\d+$/).transform(Number).describe('内容ID') }),
    },
    responses: {
      200: { description: '成功返回内容详情' },
      404: { description: '内容不存在' },
    },
  };

  public async handle(c: AppContext) {
    const data = await this.getValidatedData<typeof this.schema>();
    const { id } = data.params;
    const db = getDatabase(c.env);

    const post = await db.queryFirst(`
      SELECT p.*, u.username, u.avatar_url, u.bio as user_bio, pd.name as panda_name, pd.gender as panda_gender
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN pandas pd ON p.panda_id = pd.id
      WHERE p.id = ?
    `, [id]);

    if (!post) {
      return c.json({ success: false, error: { code: 'POST_NOT_FOUND', message: '内容不存在' } }, 404);
    }

    await db.execute('UPDATE posts SET view_count = view_count + 1 WHERE id = ?', [id]);
    post.view_count = (post.view_count || 0) + 1;

    const comments = await db.query(`
      SELECT c.*, u.username, u.avatar_url
      FROM comments c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.post_id = ? AND c.is_hidden = FALSE
      ORDER BY c.created_at DESC
    `, [id]);

    const likes = await db.query(`
      SELECT u.id, u.username, u.avatar_url
      FROM likes l
      LEFT JOIN users u ON l.user_id = u.id
      WHERE l.target_type = ? AND l.target_id = ?
      ORDER BY l.created_at DESC
      LIMIT 10
    `, ['post', id]);

    post.media_urls = post.media_urls ? JSON.parse(post.media_urls) : [];

    return c.json({
      success: true,
      data: { post, comments, likes, comment_count: comments.length },
    });
  }
}

export class createPost extends OpenAPIRoute {
  public schema = {
    tags: ['Posts'],
    summary: '创建内容',
    security: [{ Bearer: [] }],
    request: {
      body: { content: { 'application/json': { schema: z.any() } } }, // 使用 z.any() 以避免未定义的 CreatePostSchema
    },
    responses: { 201: { description: '内容创建成功' }, 400: { description: '数据验证失败' }, 401: { description: '未授权' } },
  };

  public async handle(c: AppContext) {
    const user = c.get('jwtPayload');
    const data = await this.getValidatedData<typeof this.schema>();
    const body = data.body;
    const db = getDatabase(c.env);

    if (body.panda_id) {
      const panda = await db.queryFirst('SELECT id FROM pandas WHERE id = ?', [body.panda_id]);
      if (!panda) {
        return c.json({ success: false, error: { code: 'PANDA_NOT_FOUND', message: '关联的熊猫不存在' } }, 400);
      }
    }

    const postId = await db.insert('posts', {
      ...body,
      user_id: user.id,
      media_urls: body.media_urls ? JSON.stringify(body.media_urls) : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    const newPost = await db.queryFirst('SELECT * FROM posts WHERE id = ?', [postId]);

    return c.json({ success: true, data: newPost, message: '内容创建成功' }, 201);
  }
}

export class updatePost extends OpenAPIRoute {
  public schema = {
    tags: ['Posts'],
    summary: '更新内容',
    security: [{ Bearer: [] }],
    request: {
      params: z.object({ id: z.string().regex(/^\d+$/).transform(Number) }),
      body: { content: { 'application/json': { schema: z.any() } } }, // 使用 z.any() 代替 UpdatePostSchema
    },
    responses: { 200: { description: '更新成功' }, 403: { description: '无权更新此内容' }, 404: { description: '内容不存在' } },
  };

  public async handle(c: AppContext) {
    const user = c.get('jwtPayload');
    const data = await this.getValidatedData<typeof this.schema>();
    const { id } = data.params;
    const body = data.body;
    const db = getDatabase(c.env);

    const post = await db.queryFirst('SELECT * FROM posts WHERE id = ?', [id]);
    if (!post) return c.json({ success: false, error: { code: 'POST_NOT_FOUND', message: '内容不存在' } }, 404);

    if (post.user_id !== user.id && user.role !== 'admin') {
      return c.json({ success: false, error: { code: 'FORBIDDEN', message: '无权更新此内容' } }, 403);
    }

    const updateData: any = { ...body };
    if (body.media_urls) updateData.media_urls = JSON.stringify(body.media_urls);
    updateData.updated_at = new Date().toISOString();

    await db.update('posts', id, updateData);

    const updatedPost = await db.queryFirst('SELECT * FROM posts WHERE id = ?', [id]);

    return c.json({ success: true, data: updatedPost, message: '内容更新成功' });
  }
}

export class deletePost extends OpenAPIRoute {
  public schema = {
    tags: ['Posts'],
    summary: '删除内容',
    security: [{ Bearer: [] }],
    request: { params: z.object({ id: z.string().regex(/^\d+$/).transform(Number) }) },
    responses: { 200: { description: '删除成功' }, 403: { description: '无权删除此内容' }, 404: { description: '内容不存在' } },
  };

  public async handle(c: AppContext) {
    const user = c.get('jwtPayload');
    const data = await this.getValidatedData<typeof this.schema>();
    const { id } = data.params;
    const db = getDatabase(c.env);

    const post = await db.queryFirst('SELECT * FROM posts WHERE id = ?', [id]);
    if (!post) return c.json({ success: false, error: { code: 'POST_NOT_FOUND', message: '内容不存在' } }, 404);

    if (post.user_id !== user.id && user.role !== 'admin') {
      return c.json({ success: false, error: { code: 'FORBIDDEN', message: '无权删除此内容' } }, 403);
    }

    await db.delete('posts', id);

    return c.json({ success: true, message: '内容删除成功' });
  }
}

export class likePost extends OpenAPIRoute {
  public schema = {
    tags: ['Posts'],
    summary: '点赞内容',
    security: [{ Bearer: [] }],
    request: { params: z.object({ id: z.string().regex(/^\d+$/).transform(Number) }) },
    responses: { 200: { description: '点赞成功' }, 400: { description: '已经点过赞' }, 404: { description: '内容不存在' } },
  };

  public async handle(c: AppContext) {
    const user = c.get('jwtPayload');
    const data = await this.getValidatedData<typeof this.schema>();
    const { id } = data.params;
    const db = getDatabase(c.env);

    const post = await db.queryFirst('SELECT id FROM posts WHERE id = ? AND status = ?', [id, 'published']);
    if (!post) return c.json({ success: false, error: { code: 'POST_NOT_FOUND', message: '内容不存在' } }, 404);

    const existingLike = await db.queryFirst('SELECT id FROM likes WHERE user_id = ? AND target_type = ? AND target_id = ?', [user.id, 'post', id]);
    if (existingLike) return c.json({ success: false, error: { code: 'ALREADY_LIKED', message: '已经点过赞了' } }, 400);

    await db.insert('likes', { user_id: user.id, target_type: 'post', target_id: id, created_at: new Date().toISOString() });
    await db.execute('UPDATE posts SET like_count = like_count + 1 WHERE id = ?', [id]);

    return c.json({ success: true, message: '点赞成功' });
  }
}

export class unlikePost extends OpenAPIRoute {
  public schema = {
    tags: ['Posts'],
    summary: '取消点赞',
    security: [{ Bearer: [] }],
    request: { params: z.object({ id: z.string().regex(/^\d+$/).transform(Number) }) },
    responses: { 200: { description: '取消点赞成功' }, 404: { description: '未找到点赞记录' } },
  };

  public async handle(c: AppContext) {
    const user = c.get('jwtPayload');
    const data = await this.getValidatedData<typeof this.schema>();
    const { id } = data.params;
    const db = getDatabase(c.env);

    const result = await db.execute('DELETE FROM likes WHERE user_id = ? AND target_type = ? AND target_id = ?', [user.id, 'post', id]);
    if (result.meta?.changes === 0) {
      return c.json({ success: false, error: { code: 'LIKE_NOT_FOUND', message: '未找到点赞记录' } }, 404);
    }

    await db.execute('UPDATE posts SET like_count = like_count - 1 WHERE id = ?', [id]);

    return c.json({ success: true, message: '取消点赞成功' });
  }
}

export class addComment extends OpenAPIRoute {
  public schema = {
    tags: ['Posts'],
    summary: '添加评论',
    security: [{ Bearer: [] }],
    request: {
      params: z.object({ id: z.string().regex(/^\d+$/).transform(Number) }),
      body: { content: { 'application/json': { schema: z.any() } } }, // 使用 z.any() 代替 CommentSchema
    },
    responses: { 201: { description: '评论添加成功' }, 404: { description: '内容不存在' } },
  };

  public async handle(c: AppContext) {
    const user = c.get('jwtPayload');
    const data = await this.getValidatedData<typeof this.schema>();
    const { id } = data.params;
    const { content, parent_id } = data.body;
    const db = getDatabase(c.env);

    const post = await db.queryFirst('SELECT id FROM posts WHERE id = ? AND status = ?', [id, 'published']);
    if (!post) return c.json({ success: false, error: { code: 'POST_NOT_FOUND', message: '内容不存在' } }, 404);

    if (parent_id) {
      const parentComment = await db.queryFirst('SELECT id FROM comments WHERE id = ? AND post_id = ?', [parent_id, id]);
      if (!parentComment) return c.json({ success: false, error: { code: 'PARENT_COMMENT_NOT_FOUND', message: '父评论不存在' } }, 400);
    }

    const commentId = await db.insert('comments', {
      post_id: id,
      user_id: user.id,
      parent_id,
      content,
      created_at: new Date().toISOString(),
    });

    await db.execute('UPDATE posts SET comment_count = comment_count + 1 WHERE id = ?', [id]);

    const newComment = await db.queryFirst(`
      SELECT c.*, u.username, u.avatar_url
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.id = ?
    `, [commentId]);

    return c.json({ success: true, data: newComment, message: '评论添加成功' }, 201);
  }
}

export class getComments extends OpenAPIRoute {
  public schema = {
    tags: ['Posts'],
    summary: '获取内容评论',
    request: {
      params: z.object({ id: z.string().regex(/^\d+$/).transform(Number) }),
      query: z.object({
        page: z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
        order_by: z.enum(['created_at', 'like_count']).default('created_at'),
        order_dir: z.enum(['ASC', 'DESC']).default('DESC'),
      }),
    },
    responses: { 200: { description: '成功返回评论列表' }, 404: { description: '内容不存在' } },
  };

  public async handle(c: AppContext) {
    const data = await this.getValidatedData<typeof this.schema>();
    const { id } = data.params;
    const query = data.query;
    const db = getDatabase(c.env);

    const post = await db.queryFirst('SELECT id FROM posts WHERE id = ?', [id]);
    if (!post) return c.json({ success: false, error: { code: 'POST_NOT_FOUND', message: '内容不存在' } }, 404);

    const offset = (query.page - 1) * query.limit;

    const comments = await db.query(`
      SELECT c.*, u.username, u.avatar_url,
        (SELECT COUNT(*) FROM likes WHERE target_type = 'comment' AND target_id = c.id) as like_count
      FROM comments c
      LEFT JOIN users u ON c.user_id = u.id
      WHERE c.post_id = ? AND c.is_hidden = FALSE
      ORDER BY ${query.order_by} ${query.order_dir}
      LIMIT ? OFFSET ?
    `, [id, query.limit, offset]);

    const totalResult = await db.queryFirst<{ total: number }>('SELECT COUNT(*) as total FROM comments WHERE post_id = ? AND is_hidden = FALSE', [id]);

    return c.json({
      success: true,
      data: comments,
      pagination: {
        total: totalResult?.total || 0,
        page: query.page,
        limit: query.limit,
        pages: Math.ceil((totalResult?.total || 0) / query.limit),
      },
    });
  }
}
export const postsRouter =  fromHono(new Hono());
postsRouter.get("/", likePost);
postsRouter.get("/trending", trending);
postsRouter.get("/{id}", getPost);
postsRouter.post("/", createPost);
postsRouter.patch("/{id}", updatePost);
postsRouter.delete("/{id}", deletePost);
postsRouter.post("/{id}/like", likePost);
postsRouter.delete("/{id}/like", unlikePost);
postsRouter.post("/{id}/comments", addComment);
postsRouter.get("/{id}/comments", getComments);


