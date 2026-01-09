import { ApiException, fromHono } from "chanfana";
import { Hono } from "hono";
import { jwt } from 'hono/jwt'
import { authRouter } from "./endpoints/auth";

import { ContentfulStatusCode } from "hono/utils/http-status";
import { usersRouter } from "./endpoints/user";
import type { JwtVariables } from 'hono/jwt'
type Variables = JwtVariables

// Start a Hono app
const app = new Hono<{ Bindings: Env, Variables: Variables }>();

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
			errors: [{ code: 7000, message: "Internal Server Error",error:err }],
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
	'/api/*', (c, next) => {
		const jwtMiddleware = jwt({
			secret: c.env.JWT_SECRET,
		})
		return jwtMiddleware(c, next)
	}
)
// Register Tasks Sub router
openapi.route("/auth", authRouter);
openapi.route("/api/users", usersRouter);


// Export the Hono app
export default app;
