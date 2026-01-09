import { Hono } from "hono";
import { fromHono, contentJson, OpenAPIRoute } from "chanfana";
import { AppContext } from "../types";
import { any } from "zod/v4";

export class me extends OpenAPIRoute {
    public schema = {
        tags: ["用户"],
        summary: "获取当前用户信息",      
        responses: {
            "200": {
                description: "返回是否已绑定",
                ...contentJson({
                    success: Boolean,
                    data:any
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
                data:res
            };
        }
    }
}
export const usersRouter = fromHono(new Hono());
usersRouter.get("/me", me)