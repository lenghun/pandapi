import { Hono } from "hono";
import { fromHono, contentJson, OpenAPIRoute } from "chanfana";
import { AppContext, User } from "../types";
import { any } from "zod/v4";
import { UpdatePasswordSchema, UpdateUserSchema } from "../schemas/user";
import { getDatabase } from "../dbh";
import bcrypt  from 'bcryptjs';
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
            .bind(user.id).first();
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

export class updateuser extends OpenAPIRoute {
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
        const dbh=getDatabase(c.env);
        const Payload = c.get('jwtPayload');

    // 如果更新用户名，检查是否重复
    if (data.body.username) {
      const existing = await dbh.queryFirst<User>('SELECT id FROM users WHERE username = ? AND id != ?',[data.body.username, Payload.id]);
  

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
    await dbh.update('users', Payload.id, {
      ...data.body,
      updated_at: new Date().toISOString(),
    });
    
    const updated = await dbh.queryFirst<User>('SELECT id, username, email, avatar_url, bio, role, is_verified, follower_count, following_count, created_at FROM users WHERE id = ?',[Payload.id]);
    
    return c.json({
      success: true,
      data: updated,
      message: '用户信息更新成功',
    });
    }
}

export class updatepassword extends OpenAPIRoute {
    public schema = {
        tags: ["用户"],
        summary: "更新当前登录用户的密码",
        request: {
            body: {
                content: {
                    'application/json': {
                        schema: UpdatePasswordSchema,
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
        const db=getDatabase(c.env);
        const Payload = c.get('jwtPayload');

    
    // 获取当前用户密码
    const currentUser = await db.queryFirst(
      'SELECT password_hash FROM users WHERE id = ?',
      [Payload.id]
    );
    
    // 验证当前密码
    const isValid = await bcrypt.compare(data.body.current_password, currentUser.password_hash);
    if (!isValid) {
      return c.json({
        success: false,
        error: {
          code: 'INVALID_PASSWORD',
          message: '当前密码错误',
        },
      }, 401);
    }
    
    // 加密新密码
    const salt = await bcrypt.genSalt(10);
    const newPasswordHash = await bcrypt.hash(data.body.new_password, salt);
    
    // 更新密码
    await db.update('users', Payload.id, {
      password_hash: newPasswordHash,
      updated_at: new Date().toISOString(),
    });
    
    return c.json({
      success: true,
      message: '密码更新成功',
    });
    }
}
export const usersRouter = fromHono(new Hono());
usersRouter.get("/me", getuser)
usersRouter.patch("/me", updateuser)
usersRouter.patch("/me/password", updatepassword)