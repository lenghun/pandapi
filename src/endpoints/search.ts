import { Hono } from "hono";
import { fromHono, contentJson, OpenAPIRoute } from "chanfana";
import { AppContext, Panda } from "../types";
import { z } from "zod";
import { PandaSchema, UpdatePandaSchema, PaginationSchema, FamilyTreeParams } from "../schemas/panda";
import { getDatabase } from "../dbh";


export class all extends OpenAPIRoute {
  public schema = {
    tags: ["搜索"],
    summary: "全局搜索",
    request: {
      query: z.object({
        q: z.string().min(1).max(100).describe('搜索关键词'),
        type: z.enum(['all', 'panda', 'user', 'post']).default('all').describe('搜索类型'),
        limit: z.coerce.number().int().min(1).max(50).default(10).describe('每类结果的最大数量'),
      }),
    },
    responses: {
      200: {
        description: '成功返回搜索结果',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              data: z.object({
                pandas: z.array(z.object({}).openapi({ type: 'object' })),
                users: z.array(z.object({}).openapi({ type: 'object' })),
                posts: z.array(z.object({}).openapi({ type: 'object' })),
              }),
              meta: z.object({
                query: z.string(),
                type: z.string(),
                total_results: z.number(),
              }),
            }),
          },
        },
      },
      400: {
        description: '搜索关键词不能为空',
      },
    },
  };
  public async handle(c: AppContext) {
    const data = await this.getValidatedData<typeof this.schema>();
    const db = getDatabase(c.env);
    const q = data.query.q, type = data.query.type, limit = data.query.limit;

    const searchTerm = `%${q}%`;
    const results: any = {
      pandas: [],
      users: [],
      posts: [],
    };

    let totalResults = 0;

    // 搜索熊猫
    if (type === 'all' || type === 'panda') {
      const pandas = await db.query(
        `SELECT id, name, gender, birthday, current_location, health_status, popularity_score
         FROM pandas 
         WHERE name LIKE ? OR birth_place LIKE ? OR current_location LIKE ? OR personality LIKE ?
         ORDER BY popularity_score DESC
         LIMIT ?`,
        [searchTerm, searchTerm, searchTerm, searchTerm, limit]
      );
      results.pandas = pandas;
      totalResults += pandas.length;
    }

    // 搜索用户
    if (type === 'all' || type === 'user') {
      const users = await db.query(
        `SELECT id, username, avatar_url, bio, follower_count, created_at
         FROM users 
         WHERE username LIKE ? OR bio LIKE ?
         ORDER BY follower_count DESC
         LIMIT ?`,
        [searchTerm, searchTerm, limit]
      );
      results.users = users;
      totalResults += users.length;
    }

    // 搜索内容
    if (type === 'all' || type === 'post') {
      const posts = await db.query(
        `SELECT p.id, p.title, p.content, p.media_type, p.view_count, p.like_count,
                p.created_at, u.username, u.avatar_url, pd.name as panda_name
         FROM posts p
         LEFT JOIN users u ON p.user_id = u.id
         LEFT JOIN pandas pd ON p.panda_id = pd.id
         WHERE (p.title LIKE ? OR p.content LIKE ?) AND p.status = 'published'
         ORDER BY p.created_at DESC
         LIMIT ?`,
        [searchTerm, searchTerm, limit]
      );
      results.posts = posts;
      totalResults += posts.length;
    }

    return c.json({
      success: true,
      data: results,
      meta: {
        query: q,
        type,
        total_results: totalResults,
      },
    });
  }
}

export class pandas extends OpenAPIRoute {
  public schema = {
    tags: ["搜索"],
    summary: "搜索熊猫",
    request: {
      query: z.object({
        q: z.string().optional().describe('关键词搜索（名字、地点、性格等）'),
        gender: z.enum(['male', 'female']).optional().describe('性别筛选'),
        min_age: z.coerce.number().int().min(0).max(50).optional().describe('最小年龄'),
        max_age: z.coerce.number().int().min(0).max(50).optional().describe('最大年龄'),
        location: z.string().optional().describe('地点筛选'),
        health_status: z.string().optional().describe('健康状况筛选'),
        is_alive: z.coerce.boolean().optional().describe('是否在世'),
        min_popularity: z.coerce.number().int().min(0).optional().describe('最小热度'),
        page: z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      }),
    },
    responses: {
      200: {
        description: '成功返回熊猫搜索结果',
      },
    },
  };


  public async handle(c: AppContext) {
    const data = (await this.getValidatedData<typeof this.schema>());
    const db = getDatabase(c.env);
    const query = data.query;

    let sql = 'SELECT * FROM pandas WHERE 1=1';
    const params: any[] = [];

    if (query.q) {
      sql += ' AND (name LIKE ? OR birth_place LIKE ? OR current_location LIKE ? OR personality LIKE ? OR appearance LIKE ?)';
      const searchTerm = `%${query.q}%`;
      params.push(searchTerm, searchTerm, searchTerm, searchTerm, searchTerm);
    }

    if (query.gender) {
      sql += ' AND gender = ?';
      params.push(query.gender);
    }

    if (query.location) {
      sql += ' AND current_location LIKE ?';
      params.push(`%${query.location}%`);
    }

    if (query.health_status) {
      sql += ' AND health_status = ?';
      params.push(query.health_status);
    }

    if (query.is_alive !== undefined) {
      sql += ' AND is_alive = ?';
      params.push(query.is_alive);
    }

    if (query.min_popularity) {
      sql += ' AND popularity_score >= ?';
      params.push(query.min_popularity);
    }

    // 年龄筛选（基于生日）
    if (query.min_age !== undefined || query.max_age !== undefined) {
      const currentYear = new Date().getFullYear();

      if (query.min_age !== undefined) {
        const minBirthYear = currentYear - query.min_age;
        sql += ` AND (CAST(strftime('%Y', birthday) AS INTEGER) <= ? OR birthday IS NULL)`;
        params.push(minBirthYear);
      }

      if (query.max_age !== undefined) {
        const maxBirthYear = currentYear - query.max_age;
        sql += ` AND (CAST(strftime('%Y', birthday) AS INTEGER) >= ? OR birthday IS NULL)`;
        params.push(maxBirthYear);
      }
    }

    sql += ' ORDER BY popularity_score DESC';

    // 获取总数
    const countResult = await db.queryFirst<{ total: number }>(
      `SELECT COUNT(*) as total FROM (${sql})`,
      params
    );

    // 添加分页
    const offset = (query.page - 1) * query.limit;
    sql += ` LIMIT ? OFFSET ?`;
    params.push(query.limit, offset);

    const pandas = await db.query(sql, params);

    return c.json({
      success: true,
      data: pandas,
      pagination: {
        total: countResult?.total || 0,
        page: query.page,
        limit: query.limit,
        pages: Math.ceil((countResult?.total || 0) / query.limit),
      },
    });
  }
}

export class users extends OpenAPIRoute {
  public schema = {
    tags: ["搜索"],
    summary: "搜索用户",
    request: {
      query: z.object({
        q: z.string().optional().describe('关键词搜索（用户名、简介）'),
        role: z.enum(['user', 'keeper', 'admin']).optional().describe('角色筛选'),
        is_verified: z.coerce.boolean().optional().describe('是否认证'),
        min_followers: z.coerce.number().int().min(0).optional().describe('最小粉丝数'),
        page: z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      }),
    },
    responses: {
      200: {
        description: '成功返回用户搜索结果',
      },
    },
  };


  public async handle(c: AppContext) {
    const data = (await this.getValidatedData<typeof this.schema>());
    const db = getDatabase(c.env);
    const query = data.query;
    let sql = 'SELECT id, username, avatar_url, bio, role, is_verified, follower_count, created_at FROM users WHERE 1=1';
    const params: any[] = [];

    if (query.q) {
      sql += ' AND (username LIKE ? OR bio LIKE ?)';
      const searchTerm = `%${query.q}%`;
      params.push(searchTerm, searchTerm);
    }

    if (query.role) {
      sql += ' AND role = ?';
      params.push(query.role);
    }

    if (query.is_verified !== undefined) {
      sql += ' AND is_verified = ?';
      params.push(query.is_verified);
    }

    if (query.min_followers) {
      sql += ' AND follower_count >= ?';
      params.push(query.min_followers);
    }

    sql += ' ORDER BY follower_count DESC';

    // 获取总数
    const countResult = await db.queryFirst<{ total: number }>(
      `SELECT COUNT(*) as total FROM (${sql})`,
      params
    );

    // 添加分页
    const offset = (query.page - 1) * query.limit;
    sql += ` LIMIT ? OFFSET ?`;
    params.push(query.limit, offset);

    const users = await db.query(sql, params);

    return c.json({
      success: true,
      data: users,
      pagination: {
        total: countResult?.total || 0,
        page: query.page,
        limit: query.limit,
        pages: Math.ceil((countResult?.total || 0) / query.limit),
      },
    });
  }
}
export class posts extends OpenAPIRoute {
  public schema = {
    tags: ["搜索"],
    summary: "搜索内容",
    request: {
      query: z.object({
        q: z.string().optional().describe('关键词搜索（标题、内容）'),
        panda_id: z.coerce.number().int().positive().optional().describe('熊猫ID筛选'),
        user_id: z.coerce.number().int().positive().optional().describe('用户ID筛选'),
        media_type: z.enum(['text', 'image', 'video', 'mixed']).optional().describe('媒体类型筛选'),
        min_likes: z.coerce.number().int().min(0).optional().describe('最小点赞数'),
        min_views: z.coerce.number().int().min(0).optional().describe('最小浏览量'),
        from_date: z.string().optional().describe('开始日期'),
        to_date: z.string().optional().describe('结束日期'),
        page: z.coerce.number().int().positive().default(1),
        limit: z.coerce.number().int().min(1).max(100).default(20),
      }),
    },
    responses: {
      200: {
        description: '成功返回内容搜索结果',
      },
    },
  };


  public async handle(c: AppContext) {
    const data = (await this.getValidatedData<typeof this.schema>());
    const db = getDatabase(c.env);
    const query = data.query;

   
    let sql = `
      SELECT p.*, u.username, u.avatar_url, pd.name as panda_name
      FROM posts p
      LEFT JOIN users u ON p.user_id = u.id
      LEFT JOIN pandas pd ON p.panda_id = pd.id
      WHERE p.status = 'published'
    `;
    
    const params: any[] = [];
    
    if (query.q) {
      sql += ' AND (p.title LIKE ? OR p.content LIKE ?)';
      const searchTerm = `%${query.q}%`;
      params.push(searchTerm, searchTerm);
    }
    
    if (query.panda_id) {
      sql += ' AND p.panda_id = ?';
      params.push(query.panda_id);
    }
    
    if (query.user_id) {
      sql += ' AND p.user_id = ?';
      params.push(query.user_id);
    }
    
    if (query.media_type) {
      sql += ' AND p.media_type = ?';
      params.push(query.media_type);
    }
    
    if (query.min_likes) {
      sql += ' AND p.like_count >= ?';
      params.push(query.min_likes);
    }
    
    if (query.min_views) {
      sql += ' AND p.view_count >= ?';
      params.push(query.min_views);
    }
    
    if (query.from_date) {
      sql += ' AND p.created_at >= ?';
      params.push(query.from_date);
    }
    
    if (query.to_date) {
      sql += ' AND p.created_at <= ?';
      params.push(query.to_date);
    }
    
    sql += ' ORDER BY p.created_at DESC';
    
    // 获取总数
    const countSql = `SELECT COUNT(*) as total FROM (${sql})`;
    const countResult = await db.queryFirst<{ total: number }>(countSql, params);
    
    // 添加分页
    const offset = (query.page - 1) * query.limit;
    sql += ` LIMIT ? OFFSET ?`;
    params.push(query.limit, offset);
    
    const posts = await db.query(sql, params);
    
    // 解析 media_urls
    const parsedPosts = posts.map((post: any) => ({
      ...post,
      media_urls: post.media_urls ? JSON.parse(post.media_urls) : [],
    }));
    
    return c.json({
      success: true,
      data: parsedPosts,
      pagination: {
        total: countResult?.total || 0,
        page: query.page,
        limit: query.limit,
        pages: Math.ceil((countResult?.total || 0) / query.limit),
      },
    });
  }
}

export class familytree extends OpenAPIRoute {
  public schema = {
    tags: ["搜索"],
    summary: "获取熊猫族谱",
    request: {
      params: z.object({
        id: z.string().regex(/^\d+$/).transform(Number),
      }),
      query: FamilyTreeParams,
    },
    responses: {
      200: {
        description: '成功返回族谱信息',
      },
      404: {
        description: '熊猫不存在',
      },
    },
  };


  public async handle(c: AppContext) {
    const data = (await this.getValidatedData<typeof this.schema>());
    const db = getDatabase(c.env);
    const id = data.params.id;

    const panda = await db.queryFirst('SELECT * FROM pandas WHERE id = ?', [id]);
    if (!panda) {
      return c.json({
        success: false,
        error: {
          code: 'PANDA_NOT_FOUND',
          message: '熊猫不存在',
        },
      }, 404);
    }

    // 递归获取族谱
    const familyTree = await getFamilyTree(db, id, data.query.depth);

    return c.json({
      success: true,
      data: familyTree,
    });
  }
}

export class trending extends OpenAPIRoute {
  public schema = {
    tags: ["搜索"],
    summary: "热门搜索",
    request: {
      params: z.object({
        id: z.string().regex(/^\d+$/).transform(Number),
      }),
      query: FamilyTreeParams,
    },
    responses: {
      200: {
        description: '成功返回热门搜索关键词',
      },
      404: {
        description: '熊猫不存在',
      },
    },
  };


  public async handle(c: AppContext) {
    const data = (await this.getValidatedData<typeof this.schema>());
    const db = getDatabase(c.env);
    const id = data.params.id;

   // 在实际应用中，这里应该从搜索历史表中统计
    // 这里返回固定数据作为示例
    const trending = [
      { keyword: '花花', count: 150, type: 'panda' },
      { keyword: '萌兰', count: 120, type: 'panda' },
      { keyword: '福宝', count: 100, type: 'panda' },
      { keyword: '和叶', count: 80, type: 'panda' },
      { keyword: '大熊猫', count: 70, type: 'generic' },
      { keyword: '熊猫吃播', count: 60, type: 'content' },
      { keyword: '成都基地', count: 50, type: 'location' },
      { keyword: '丫丫', count: 40, type: 'panda' },
    ];
    
    return c.json({
      success: true,
      data: trending,
    });
  }
}
export class historyPost extends OpenAPIRoute {
  public schema = {
    tags: ["搜索"],
    summary: "记录搜索历史",
    request: {
      body:{
               content: {
          'application/json': {
            schema: z.object({
              keyword: z.string().min(1).max(100).describe('搜索关键词'),
              result_count: z.number().int().min(0).optional().describe('搜索结果数量'),
            }),
          },
        },
      } 
    },
    responses: {
      200: { description: "搜索历史记录成功" },
      401: { description: "未授权" },
    },
  };

  public async handle(c: AppContext) {
    const data = await this.getValidatedData<typeof this.schema>();

    const user = c.get("jwtPayload");

    // 示例：实际应写入数据库
    return c.json({
      success: true,
      message: "搜索历史已记录",
      data: {
        keyword: data.body.keyword,
        result_count: data.body.result_count ?? null,
        user_id: user?.id ?? null,
        timestamp: new Date().toISOString(),
      },
    });
  }
}

export class historyGet extends OpenAPIRoute {
  public schema = {
    tags: ["搜索"],
    summary: "获取搜索历史",
    responses: {
      200: { description: "成功返回搜索历史" },
      401: { description: "未授权" },
    },
  };

  public async handle(c: AppContext) {
    const user = c.get("jwtPayload");

    // 示例数据，实际应从数据库中查询
    const history = [
      { keyword: "花花", timestamp: "2024-01-10T10:30:00Z", result_count: 5 },
      { keyword: "熊猫吃播", timestamp: "2024-01-09T15:20:00Z", result_count: 12 },
      { keyword: "成都", timestamp: "2024-01-08T09:15:00Z", result_count: 8 },
      { keyword: "萌兰", timestamp: "2024-01-07T14:45:00Z", result_count: 3 },
      { keyword: "大熊猫保护", timestamp: "2024-01-06T11:20:00Z", result_count: 7 },
    ];

    return c.json({
      success: true,
      data: history,
      user_id: user?.id ?? null,
    });
  }
}

export class historyDelete extends OpenAPIRoute {
  public schema = {
    tags: ["Search"],
    summary: "清空搜索历史",
    responses: {
      200: { description: "搜索历史已清空" },
      401: { description: "未授权" },
    },
  };

  public async handle(c: AppContext) {
    const user = c.get("jwtPayload");

    // 示例：实际应从数据库中删除用户的搜索历史
    return c.json({
      success: true,
      message: "搜索历史已清空",
      user_id: user?.id ?? null,
    });
  }
}


export const usersRouter = fromHono(new Hono());
usersRouter.get("/", all)
usersRouter.get("/pandas", pandas)
usersRouter.get("/users", users)
usersRouter.get("/posts", posts)
usersRouter.get("/trending", trending)
usersRouter.post("/history", historyPost)
usersRouter.get("/history", historyGet)
usersRouter.delete("/history", historyDelete)