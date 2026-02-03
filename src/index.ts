import { ApiException, fromHono } from "chanfana";
import { Hono } from "hono";
import { jwt } from 'hono/jwt'
import { authRouter } from "./endpoints/auth";

import { ContentfulStatusCode } from "hono/utils/http-status";
import { usersRouter } from "./endpoints/user";
import type { JwtVariables } from 'hono/jwt'
import { pandasRouter } from "./endpoints/panda";
import { searchRouter } from "./endpoints/search";
import { postsRouter } from "./endpoints/posts";
import { zoosRouter } from "./endpoints/zoos";
import { cors } from 'hono/cors'
type Variables = JwtVariables

// Start a Hono app
const app = new Hono<{ Bindings: Env, Variables: Variables }>();
app.use(
	'*',
	cors({
		origin: [
			'https://pandapu.pages.dev',
			'https://pandapu.coldsoul.net'
		],
		allowHeaders: ['Content-Type', 'Authorization'],
		allowMethods: ['GET', 'POST', 'PUT','PATCH', 'DELETE', 'OPTIONS'],
		credentials: true
	})
);
app.onError((err, c) => {
	if (err instanceof ApiException) {
		// If it's a Chanfana ApiException, let Chanfana handle the response
		return c.json(
			{ success: false, errors: err.buildResponse() },
			err.status as ContentfulStatusCode,
		);
	}

	console.error("Global error handler caught:", err); // Log the error if it's not known

	// For other errors, return a generic 500 response
	return c.json(
		{
			success: false,
			errors: [{ code: 7000, message: "Internal Server Error", error: err }],
		},
		500,
	);
});

// Setup OpenAPI registry
const openapi = fromHono(app, {
	docs_url: "/",
	schema: {
		info: {
			title: "熊猫信息 API",
			version: "2.0.0",
			description: "熊猫信息查询、亲属关系计算和内容分享 API.",
		}
	},
});
app.use(
	'*', (c, next) => {
		if (c.req.path.startsWith('/auth')) {
			return next()
		}
		if(c.req.method === 'GET'){
			return next()
		}
		const jwtMiddleware = jwt({
			secret: c.env.JWT_SECRET,
		})
		return jwtMiddleware(c, next)
	}
)
// Register Tasks Sub router
openapi.route("/auth", authRouter);
openapi.route("/users", usersRouter);
openapi.route("/zoos", zoosRouter);
openapi.route("/pandas", pandasRouter);
openapi.route("/searchs", searchRouter);
openapi.route("/posts", postsRouter);


// Export the Hono app
export default app;
