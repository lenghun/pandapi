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
    if (query.zootype) filters.zootype = query.zootype;
    if (query.location) filters.location = query.location;

    const result = await db.paginate('zoos', {
      page: 1,
      limit: 999,
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