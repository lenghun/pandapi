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
import { RegisterSchema, LoginSchema, UpdateUserSchema, UpdatePasswordSchema } from '../schemas/user';
import { getDatabase } from '../lib/db';
import bcrypt from 'bcryptjs';

export class LoginEndpoint extends OpenAPIRoute {
	public schema = {
		tags: ["授权"],
		summary: "登陆", // This is optional
		request: {
          body: {
			content: {
				'application/json': {
					schema: LoginSchema,
          },
        },
      },
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
		 const db = getDatabase(c.env);
			
			// 查找用户
			const user = await db.queryFirst(
			  'SELECT * FROM users WHERE username = ?',
			  [data.body.username]
			);
			
			if (!user) {
			  return c.json({
				success: false,
				error: {
				  code: 'INVALID_CREDENTIALS',
				  message: '邮箱或密码错误',
				},
			  }, 401);
			}
			
			// 验证密码
			const isValid = await bcrypt.compare(data.body.password, user.password_hash);
			if (!isValid) {
			  return c.json({
				success: false,
				error: {
				  code: 'INVALID_CREDENTIALS',
				  message: '邮箱或密码错误',
				},
			  }, 401);
			}
		var exp=Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7; // 7 day expiration
		const refreshToken = await sign({
			sub: user.Id,
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
          body: {
			content: {
				'application/json': {
					schema: RegisterSchema,
					},
				},
			},
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
		const db = getDatabase(c.env);
    // 检查用户是否已存在
    const existingUser = await db.queryFirst(
      'SELECT id FROM users WHERE email = ? OR username = ?',
      [data.body.email, data.body.username]
    );
    
    if (existingUser) {
      return c.json({
        success: false,
        error: {
          code: 'USER_EXISTS',
          message: '用户名或邮箱已存在',
        },
      }, 409);
    }
	
		const salt = await bcrypt.genSalt(10);
		const passwordHash = await bcrypt.hash(data.body.password, salt);
		
		// 创建用户
		const userId = await db.insert('users', {
		  username: data.body.username,
		  email: data.body.email,
		  password_hash: passwordHash,
		  role: 'user',
		  is_verified: false,
		  follower_count: 0,
		  following_count: 0,
		  created_at: new Date().toISOString(),
		  updated_at: new Date().toISOString(),
		});
		return {
			success: true,
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