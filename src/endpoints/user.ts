import { Hono } from "hono";
import { fromHono, contentJson, OpenAPIRoute } from "chanfana";
import { AppContext } from "../types";
import { z } from "zod";


export class checkbindEndpoint extends OpenAPIRoute {
    public schema = {
        tags: ["用户"],
        summary: "检查绑定", // This is optional
        request: {
            body: contentJson(
                z.object({
                    key: z.string(),
                    game: z.string(),
                }),
            ),
        },
        responses: {
            "200": {
                description: "返回是否已绑定",
                ...contentJson({
                    success: Boolean,
                }),
            },
        },
    };


    public async handle(c: AppContext) {
        const data = await this.getValidatedData<typeof this.schema>();
        const db = c.env.DB;
        const res = await db.prepare('select * from gameprofile where bindkey = ? and game = ?')
            .bind(data.body.key, data.body.game).first();
        if (res == null) {
            return {
                success: false,
            }
        } else {
            return {
                success: true,
            };
        }
    }
}
export const usersRouter = fromHono(new Hono());
usersRouter.post("/checkbind", checkbindEndpoint)