import { Hono } from "hono";
import { fromHono, contentJson, OpenAPIRoute } from "chanfana";
import { AppContext, Panda } from "../types";
import { z } from "zod";
import { PandaSchema, UpdatePandaSchema, PaginationSchema, FamilyTreeParams } from "../schemas/panda";
import { getDatabase } from "../dbh";


export class list extends OpenAPIRoute {
  public schema = {
    tags: ["熊猫"],
    summary: "获取熊猫列表",
    request: {
      query: PaginationSchema.extend({
        order_by: z.enum([
          'name', 'birthday', 'popularity_score', 'created_at'
        ]).optional().default('popularity_score'),
        order_dir: z.enum(['ASC', 'DESC']).optional().default('DESC'),
      }),
    },
    responses: {
      "200": {
        description: "成功返回熊猫列表",
        ...contentJson({
          success: Boolean,
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
  };
  public async handle(c: AppContext) {
    const data = await this.getValidatedData<typeof this.schema>();
    const db = getDatabase(c.env);
    const user = c.get('jwtPayload');

    const filters: Record<string, any> = {};
    const query = data.query;
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
}

export class one extends OpenAPIRoute {
  public schema = {
    tags: ["熊猫"],
    summary: "获取熊猫详情",
    request: {
      params: z.object({
        id: z.string().regex(/^\d+$/).transform(Number).describe('熊猫ID'),
      }),
    },
    responses: {
      "200": {
        description: "成功返回熊猫详情",
        ...contentJson({
          success: Boolean,
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
  };


  public async handle(c: AppContext) {
    const data = (await this.getValidatedData<typeof this.schema>());
    const db = getDatabase(c.env);
    const id = data.params.id;
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
}

export class create extends OpenAPIRoute {
  public schema = {
    tags: ["熊猫"],
    summary: "创建熊猫",
    request: {
      body: contentJson(PandaSchema),
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
  };


  public async handle(c: AppContext) {
    const data = (await this.getValidatedData<typeof this.schema>());
    const db = getDatabase(c.env);
    const Payload = c.get('jwtPayload');
    if(!Payload || Payload.role !== 'admin'){
      return c.json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: '权限不足',
        },
      }, 403);
    }
    // 插入数据
    const id = await db.insert('pandas', {
      ...data,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    
    const newPanda = await db.queryFirst<Panda>('SELECT * FROM pandas WHERE id = ?', [id]);
    
    return c.json({
      success: true,
      data: newPanda,
      message: '熊猫创建成功',
    }, 201);
  }
}
export class update extends OpenAPIRoute {
  public schema = {
    tags: ["熊猫"],
    summary: "更新熊猫信息",
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
  };


  public async handle(c: AppContext) {
    const data = (await this.getValidatedData<typeof this.schema>());
    const db = getDatabase(c.env);
   const id=data.params.id;
       const Payload = c.get('jwtPayload');
    if(!Payload || Payload.role !== 'admin'){
      return c.json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: '权限不足',
        },
      }, 403);
    }
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
}

export class familytree extends OpenAPIRoute {
  public schema = {
    tags: ["熊猫"],
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

// 族谱递归函数
export async function getFamilyTree(db: any, pandaId: number, depth: number): Promise<any> {
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

export const pandasRouter = fromHono(new Hono());
pandasRouter.get("/", list)
pandasRouter.get("/{id}}", one)
pandasRouter.post("/", create)
pandasRouter.patch("/{id}", update)
pandasRouter.get("/{id}/familytree}", familytree)