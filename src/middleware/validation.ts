import { Context, Next } from 'hono';
import { z } from 'zod';

export function validate(schema: z.ZodSchema) {
  return async (c: Context, next: Next) => {
    let data: any;
    
    if (c.req.method === 'GET') {
      data = Object.fromEntries(c.req.queries());
    } else {
      try {
        data = await c.req.json();
      } catch {
        data = Object.fromEntries(c.req.queries());
      }
    }

    const validation = schema.safeParse(data);
    
    if (!validation.success) {
      return c.json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: '数据验证失败',
          details: validation.error.format()
        }
      }, 400);
    }

    c.set('validatedData', validation.data);
    await next();
  };
}