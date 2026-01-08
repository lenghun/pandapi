import { Hono } from "hono";
import { fromHono, contentJson, OpenAPIRoute } from "chanfana";
import { AppContext } from "../types";
import { z } from "zod";
import { any, string } from "zod/v4";
import { GameProfile } from "../Models/GameProfile";



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
export class saveGameProfileEndpoint extends OpenAPIRoute {
    public schema = {
        tags: ["用户"],
        summary: "保存玩家游戏数据", // This is optional
        request: {
            body: contentJson(
                GameProfile,
            ),
        },
        responses: {
            "200": {
                description: " ",
                ...contentJson({
                    success: Boolean,
                }),
            },
        },
    };


    public async handle(c: AppContext) {
        const data = await this.getValidatedData<typeof this.schema>();
        const db = c.env.DB;
        if(data.body.Id>0){
        const res = await db.prepare('update gameprofile set Data=?, where id = ?')
            .bind(data.body.Data,data.body.Id).run();
        }else{
        const res = await db.prepare('insert into gameprofile (Game,Bindkey,Data,UserId) values (?,?,?,?)')
            .bind(data.body.Game,data.body.Bindkey,data.body.Data,data.body.UserId).run();
        }

            return {
                success: true,
            };
        
    }
}
export const usersRouter = fromHono(new Hono());
usersRouter.post("/checkbind", checkbindEndpoint)
usersRouter.post("/SaveGameProfile", saveGameProfileEndpoint)