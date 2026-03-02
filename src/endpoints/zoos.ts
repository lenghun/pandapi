import { Hono } from "hono";
import { fromHono, OpenAPIRoute } from "chanfana";
import { AppContext } from "../types";
import { z } from "zod";

import { getDatabase } from "../dbh";

export class listZoos extends OpenAPIRoute {
  public schema = {
    tags: ['动物园'],
    summary: '获取动物园列表',
    request: {
      query: z.object({
        page: z.coerce.number().int().positive().default(1).optional().describe('页码'),
        limit: z.coerce.number().int().min(1).max(100).default(20).optional().describe('每页数量'),
        zooid: z.coerce.number().int().positive().optional().describe('动物园ID筛选'),
        zootype: z.enum(['zoo', 'research_center', 'breeding_base', 'sanctuary']).optional().describe('动物园类型筛选'),
        location: z.string().optional().describe('地点筛选'),
      }),
    },
    responses: {
      200: {
        description: '成功返回动物园列表',
      },
    },
  };

  public async handle(c: AppContext) {
    const data = await this.getValidatedData<typeof this.schema>();
    const query = data.query;
    const db = getDatabase(c.env);

    const filters: Record<string, any> = {};
    if (query.zooid) filters.zoo_id = query.zooid;
    if (query.zootype) filters.zootype = query.zootype;
    if (query.location) filters.location = query.location;

    const result = await db.paginate('zoos', {
      page: query.page,
      limit: query.limit || 500,
    }, filters);

    return c.json({
      success: true,
      data: result,
      pagination: {
        total: result.total,
        page: result.page,
        limit: result.limit,
        pages: result.pages,
      },
    });
  }
}

export const zoosRouter = fromHono(new Hono());
zoosRouter.get("/", listZoos)