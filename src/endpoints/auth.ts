import { Hono } from 'hono'
import { sign, verify } from 'hono/jwt'
import { contentJson, OpenAPIRoute } from "chanfana";
import { AppContext, HandleArgs } from "../types";
import { z } from "zod";
import { json } from 'stream/consumers';
import { email } from 'zod/v4';
import { fromHono } from "chanfana";
import { request } from 'http';
import type { JwtVariables } from 'hono/jwt'
import { ms } from 'zod/v4/locales';


export class LoginEndpoint extends OpenAPIRoute {
	public schema = {
		tags: ["授权"],
		summary: "登陆", // This is optional
		request: {
			body: contentJson(
				z.object({
					username: z.string(),
					password: z.string(),
				}),
			),
		},
		responses: {
			"200": {
				description: "refreshToken",
				...contentJson({
					success: Boolean,
					result: z.object({
						msg: z.string(),
						refreshToken: z.string(),
						exp: z.number(),
					}),
				}),
			},
		},
	};


	public async handle(c: AppContext) {
		const data = await this.getValidatedData<typeof this.schema>();
		const db = c.env.DB;
		const res = await db.prepare('select * from users where username = ? and password = ?')
			.bind(data.body.username, await simpleHash(data.body.password)).first();
		if (res == null) {
			return {
				success: false,
				result: {
					msg: "用户名或密码错误"
				}
			}
		}
		var exp=Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7; // 7 day expiration
		const refreshToken = await sign({
			sub: res.Id,
			exp: exp, 	
			type: 'refresh',
		}, c.env.JWT_SECRET+'refresh');
		return {
			success: true,
			result: {
				refreshToken: refreshToken,
				exp: exp,
				msg: "登陆成功"
			}
		};

	}
}

export class CheckEndpoint extends OpenAPIRoute {
	public schema = {
		tags: ["授权"],
		summary: "登陆检查", // This is optional
		request: {
			headers: z.object({
				Authorization: z.string()
			})
		},
		responses: {
			"200": {
				description: "Returns token",
				...contentJson({
					success: Boolean,
					result: z.object({
						msg: z.string(),
						accessToken: z.string(),
						accessExp: z.number(),
						refreshToken: z.string(),
						refreshExp: z.number(),
					}),
				}),
			},
		},
	};


	public async handle(c: AppContext) {
		const data = await this.getValidatedData<typeof this.schema>();
		const rtoken = data.headers.Authorization.replace("Bearer ", "");
		const payload = await verify(rtoken, c.env.JWT_SECRET+'refresh');

		if (payload.type !== 'refresh') {return {success: false, result: {msg: "无效的刷新令牌"}};}
		if (payload.exp!=null && payload.exp < Math.floor(Date.now() / 1000)) {return {success: false, result: {msg: "登陆已过期"}};}

		const db = c.env.DB;
		const res = await db.prepare('select * from users where id = ?')
			.bind(payload.sub).first();

		if (res == null) {
			return {
				success: false,
				result: {
					msg: "用户不存在"
				}
			}
		}

		var exp7=Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7; // 7 day expiration
		var exp1=Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 1; // 1 day expiration
		const accessToken = await sign({
			name: res.username,
			exp: exp1,
			sub: res.Id,
			role: res.IsAdmin ? 'admin' : 'user',
			type: 'access',
		}, c.env.JWT_SECRET);
		const refreshToken = await sign({
			sub: res.Id,
			exp: exp7, // 7 day expiration	
			type: 'refresh',
		}, c.env.JWT_SECRET+'refresh');
		return {
			success: true,
			result: {
				msg: "登录成功"+c.env.JWT_SECRET,
				accessToken: accessToken,
				accessExp: exp1,
				refreshExp: exp7,
				refreshToken: refreshToken
			}
		};

	}
}

export class RegisterEndpoint extends OpenAPIRoute {
	public schema = {
		tags: ["授权"],
		summary: "注册", // This is optional
		request: {
			body: contentJson(
				z.object({
					username: z.string(),
					password: z.string(),
					email: z.string(),
				}),
			),
		},
		responses: {
			"200": {
				description: "Returns token",
				...contentJson({
					success: Boolean,
					result: z.object({
						msg: z.string(),
						token: z.string(),
					}),
				}),
			},
		},
	};

	public async handle(c: AppContext) {
		const data = await this.getValidatedData<typeof this.schema>();
		const db = c.env.DB;
		const res = await db.prepare('insert into users (username,NickName, password, email,avatar,InviteUser,IsAdmin) values (?, ?, ?, ?, ?, ?, ?)')
			.bind(data.body.username, data.body.username, await simpleHash(data.body.password), data.body.email, "default_avatar.png", "", false)
			.run();

		return {
			success: res.success,
			result: {
				msg: "注册成功",
			}
		};

	}

}

async function simpleHash(password: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(password + 'simple-salt');
	const hash = await crypto.subtle.digest('SHA-256', data);
	return Array.from(new Uint8Array(hash))
		.map(b => b.toString(16).padStart(2, '0'))
		.join('');
}
export const authRouter = fromHono(new Hono());

authRouter.post("/login", LoginEndpoint);
authRouter.get("/login", CheckEndpoint);
authRouter.post("/register", RegisterEndpoint);