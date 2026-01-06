import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { PandaSchema, UpdatePandaSchema, PaginationSchema, FamilyTreeParams } from '../../schemas/panda';
import { getDatabase } from '../../lib/db';
import { authMiddleware, requireKeeper, requireAdmin } from '../../middleware/auth';

const app = new OpenAPIHono();

// 获取熊猫列表
app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    summary: '获取熊猫列表',
    description: '获取熊猫分页列表，支持搜索和筛选',
    tags: ['Pandas'],
    request: {
      query: PaginationSchema.extend({
        order_by: z.enum([
          'name', 'birthday', 'popularity_score', 'created_at'
        ]).optional().default('popularity_score'),
        order_dir: z.enum(['ASC', 'DESC']).optional().default('DESC'),
      }),
    },
    responses: {
      200: {
        description: '成功返回熊猫列表',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              data: z.array(z.any()),
              pagination: z.object({
                total: z.number(),
                page: z.number(),
                limit: z.number(),
                pages: z.number(),
              }),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const query = c.req.valid('query');
    const db = getDatabase(c.env);
    
    const filters: Record<string, any> = {};
    
    if (query.search) {
      filters.name = `%${query.search}%`;
    }
    if (query.gender) {
      filters.gender = query.gender;
    }
    if (query.location) {
      filters.current_location = `%${query.location}%`;
    }
    if (query.is_alive !== undefined) {
      filters.is_alive = query.is_alive;
    }
    
    const result = await db.paginate('pandas', {
      page: query.page,
      limit: query.limit,
      orderBy: query.order_by,
      orderDir: query.order_dir,
    }, filters);
    
    return c.json({
      success: true,
      data: result.data,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        pages: result.pages,
      },
    });
  }
);

// 获取单个熊猫详情
app.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    summary: '获取熊猫详情',
    description: '根据ID获取熊猫详细信息，包括亲属信息',
    tags: ['Pandas'],
    request: {
      params: z.object({
        id: z.string().regex(/^\d+$/).transform(Number).describe('熊猫ID'),
      }),
    },
    responses: {
      200: {
        description: '成功返回熊猫详情',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              data: z.object({
                panda: z.any(),
                parents: z.array(z.any()),
                children: z.array(z.any()),
                siblings: z.array(z.any()),
                stats: z.object({
                  posts_count: z.number(),
                  media_count: z.number(),
                }),
              }),
            }),
          },
        },
      },
      404: {
        description: '熊猫不存在',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              error: z.object({
                code: z.string(),
                message: z.string(),
              }),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const db = getDatabase(c.env);
    
    // 获取熊猫基本信息
    const panda = await db.queryFirst(`
      SELECT 
        p.*,
        father.name as father_name,
        mother.name as mother_name
      FROM pandas p
      LEFT JOIN pandas father ON p.father_id = father.id
      LEFT JOIN pandas mother ON p.mother_id = mother.id
      WHERE p.id = ?
    `, [id]);
    
    if (!panda) {
      return c.json({
        success: false,
        error: {
          code: 'PANDA_NOT_FOUND',
          message: '熊猫不存在',
        },
      }, 404);
    }
    
    // 并行获取亲属信息
    const [parents, children, siblings, stats] = await Promise.all([
      // 父母
      db.query(`
        SELECT id, name, gender, birthday
        FROM pandas 
        WHERE id IN (?, ?) AND id IS NOT NULL
      `, [panda.father_id, panda.mother_id]),
      
      // 子女
      db.query(`
        SELECT id, name, gender, birthday, current_location
        FROM pandas 
        WHERE father_id = ? OR mother_id = ?
        ORDER BY birthday DESC
      `, [id, id]),
      
      // 兄弟姐妹
      db.query(`
        SELECT DISTINCT p.*
        FROM pandas p
        WHERE p.id != ?
          AND (
            (p.father_id = ? AND p.mother_id = ?) OR
            (p.father_id = ? AND p.mother_id IS NULL) OR
            (p.father_id IS NULL AND p.mother_id = ?)
          )
        ORDER BY p.birthday
      `, [id, panda.father_id, panda.mother_id, 
          panda.father_id, panda.mother_id]),
      
      // 统计信息
      Promise.all([
        db.queryFirst<{ count: number }>('SELECT COUNT(*) as count FROM posts WHERE panda_id = ?', [id]),
        db.queryFirst<{ count: number }>('SELECT COUNT(*) as count FROM panda_media WHERE panda_id = ?', [id]),
      ]),
    ]);
    
    return c.json({
      success: true,
      data: {
        panda,
        parents,
        children,
        siblings,
        stats: {
          posts_count: stats[0]?.count || 0,
          media_count: stats[1]?.count || 0,
        },
      },
    });
  }
);

// 创建熊猫（需要管理员权限）
app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    summary: '创建熊猫',
    description: '创建新的熊猫记录，需要管理员权限',
    tags: ['Pandas'],
    security: [{ Bearer: [] }],
    request: {
      body: {
        content: {
          'application/json': {
            schema: PandaSchema,
          },
        },
      },
    },
    responses: {
      201: {
        description: '成功创建熊猫',
        content: {
          'application/json': {
            schema: z.object({
              success: z.boolean(),
              data: z.any(),
              message: z.string(),
            }),
          },
        },
      },
      400: {
        description: '数据验证失败',
      },
      401: {
        description: '未授权',
      },
      403: {
        description: '权限不足',
      },
      409: {
        description: '熊猫已存在',
      },
    },
  }),
  async (c) => {
    const data = c.req.valid('json');
    const db = getDatabase(c.env);
    
    // 检查重名
    const existing = await db.queryFirst<{ id: number }>(
      'SELECT id FROM pandas WHERE name = ?',
      [data.name]
    );
    
    if (existing) {
      return c.json({
        success: false,
        error: {
          code: 'PANDA_EXISTS',
          message: '熊猫名字已存在',
        },
      }, 409);
    }
    
    // 插入数据
    const id = await db.insert('pandas', {
      ...data,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    
    const newPanda = await db.queryFirst('SELECT * FROM pandas WHERE id = ?', [id]);
    
    return c.json({
      success: true,
      data: newPanda,
      message: '熊猫创建成功',
    }, 201);
  }
);

// 更新熊猫信息（需要饲养员权限）
app.openapi(
  createRoute({
    method: 'patch',
    path: '/{id}',
    summary: '更新熊猫信息',
    description: '更新熊猫信息，需要饲养员或管理员权限',
    tags: ['Pandas'],
    security: [{ Bearer: [] }],
    request: {
      params: z.object({
        id: z.string().regex(/^\d+$/).transform(Number),
      }),
      body: {
        content: {
          'application/json': {
            schema: UpdatePandaSchema,
          },
        },
      },
    },
    responses: {
      200: {
        description: '成功更新熊猫信息',
      },
      404: {
        description: '熊猫不存在',
      },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const data = c.req.valid('json');
    const db = getDatabase(c.env);
    
    // 检查熊猫是否存在
    const existing = await db.queryFirst<{ id: number }>('SELECT id FROM pandas WHERE id = ?', [id]);
    if (!existing) {
      return c.json({
        success: false,
        error: {
          code: 'PANDA_NOT_FOUND',
          message: '熊猫不存在',
        },
      }, 404);
    }
    
    // 更新数据
    await db.update('pandas', id, {
      ...data,
      updated_at: new Date().toISOString(),
    });
    
    const updated = await db.queryFirst('SELECT * FROM pandas WHERE id = ?', [id]);
    
    return c.json({
      success: true,
      data: updated,
      message: '熊猫信息更新成功',
    });
  }
);

// 获取熊猫族谱
app.openapi(
  createRoute({
    method: 'get',
    path: '/{id}/family-tree',
    summary: '获取熊猫族谱',
    description: '获取熊猫的家族树状图',
    tags: ['Pandas'],
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
  }),
  async (c) => {
    const { id } = c.req.valid('param');
    const { depth } = c.req.valid('query');
    const db = getDatabase(c.env);
    
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
    const familyTree = await getFamilyTree(db, id, depth);
    
    return c.json({
      success: true,
      data: familyTree,
    });
  }
);

// 族谱递归函数
async function getFamilyTree(db: any, pandaId: number, depth: number): Promise<any> {
  if (depth <= 0) return null;
  
  const panda = await db.queryFirst(`
    SELECT p.*, 
      father.name as father_name,
      mother.name as mother_name
    FROM pandas p
    LEFT JOIN pandas father ON p.father_id = father.id
    LEFT JOIN pandas mother ON p.mother_id = mother.id
    WHERE p.id = ?
  `, [pandaId]);
  
  if (!panda) return null;
  
  const tree: any = {
    ...panda,
    father: null,
    mother: null,
    children: [],
  };
  
  // 获取父母
  if (panda.father_id && depth > 1) {
    tree.father = await getFamilyTree(db, panda.father_id, depth - 1);
  }
  
  if (panda.mother_id && depth > 1) {
    tree.mother = await getFamilyTree(db, panda.mother_id, depth - 1);
  }
  
  // 获取子女
  if (depth > 1) {
    const children = await db.query(`
      SELECT id, name, gender, birthday
      FROM pandas 
      WHERE father_id = ? OR mother_id = ?
    `, [pandaId, pandaId]);
    
    tree.children = await Promise.all(
      children.map(async (child: any) => 
        await getFamilyTree(db, child.id, depth - 1)
      )
    );
  }
  
  return tree;
}

// 导出路由
export default app;