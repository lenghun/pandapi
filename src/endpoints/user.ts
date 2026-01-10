import { Hono } from "hono";
import { fromHono, contentJson, OpenAPIRoute } from "chanfana";
import { AppContext, User } from "../types";
import { any } from "zod/v4";
import { UpdateUserSchema } from "../schemas/user";
import { getDatabase } from "../dbh";
export class getuser extends OpenAPIRoute {
    public schema = {
        tags: ["用户"],
        summary: "获取当前用户信息",
        responses: {
            "200": {
                description: "返回是否已绑定",
                ...contentJson({
                    success: Boolean,
                    data: any
                }),
            },
        },
    };


    public async handle(c: AppContext) {
        const data = await this.getValidatedData<typeof this.schema>();
        const db = c.env.DB;
        const user = c.get('jwtPayload');

        const res = await db.prepare('select id, username, email, avatar_url, bio, role, is_verified, follower_count, following_count, created_at FROM users where id = ?')
            .bind(user.sub).first();
        if (res == null) {
            return {
                success: false,
            }
        } else {
            return {
                success: true,
                data: res
            };
        }
    }
}

export class updateuset extends OpenAPIRoute {
    public schema = {
        tags: ["用户"],
        summary: "更新当前登录用户信息",
        request: {
            body: {
                content: {
                    'application/json': {
                        schema: UpdateUserSchema,
                    },
                },
            },
        },
        responses: {
            "200": {
                description: "返回用户信息",
                ...contentJson({
                    success: Boolean,
                    data: any
                }),
            },
        },
    };


    public async handle(c: AppContext) {
        const data = (await this.getValidatedData<typeof this.schema>());
        const db = c.env.DB;
        const dbh=getDatabase(c.env);
        const user = c.get('jwtPayload');

    console.debug(data);
       
    // 如果更新用户名，检查是否重复
    if (data.body.username) {
    //   const existing = await db.prepare('SELECT id FROM users WHERE username = ? AND id != ?')
    //   .bind(data.username, user.id).first<User>();
  

       const existing = await db.prepare('SELECT id FROM users WHERE username = ? AND id != ?')
       .bind(data.body.username, user.sub).first<User>();
      if (existing) {
        return c.json({
          success: false,
          error: {
            code: 'USERNAME_EXISTS',
            message: '用户名已存在',
          },
        }, 409);
      }
    }
    await dbh.update('users', user.id, {
      ...data.body,
      updated_at: new Date().toISOString(),
    });
    
    const updated = await db.prepare('SELECT id, username, email, avatar_url, bio, role, is_verified, follower_count, following_count, created_at FROM users WHERE id = ?')
      .bind(user.id).first<User>();
    
    return c.json({
      success: true,
      data: updated,
      message: '用户信息更新成功',
    });
    }
}
export const usersRouter = fromHono(new Hono());
usersRouter.get("/me", getuser)
usersRouter.patch("/me", updateuset)