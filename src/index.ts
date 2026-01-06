import { OpenAPIHono } from '@hono/zod-openapi';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { prettyJSON } from 'hono/pretty-json';
import { csrf } from 'hono/csrf';
import { secureHeaders } from 'hono/secure-headers';

// 导入路由
import pandasRoutes from './routes/pandas';
import usersRoutes from './routes/users';
import postsRoutes from './routes/posts';
import searchRoutes from './routes/search';

// 创建应用
const app = new OpenAPIHono<{
  Bindings: {
    DB: D1Database;
    JWT_SECRET: string;
    ENVIRONMENT: string;
    API_BASE_URL: string;
  };
}>();

// 全局中间件
app.use('*', logger());
app.use('*', cors({
  origin: ['http://localhost:3000', 'https://*.pages.dev'],
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600,
  credentials: true,
}));
app.use('*', csrf());
app.use('*', secureHeaders());
app.use('*', prettyJSON());

// 健康检查
app.get('/', (c) => {
  return c.json({
    name: '熊猫信息 API',
    version: '1.0.0',
    environment: c.env.ENVIRONMENT,
    endpoints: {
      api: '/api/v1',
      docs: '/docs',
      openapi: '/openapi.json',
      health: '/health',
    },
  });
});

app.get('/health', async (c) => {
  try {
    const result = await c.env.DB.prepare('SELECT 1 as status').first();
    return c.json({
      status: 'healthy',
      database: result ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return c.json({
      status: 'unhealthy',
      database: 'error',
      error: error.message,
      timestamp: new Date().toISOString(),
    }, 500);
  }
});

// 注册 API 路由
const api = app.basePath('/api/v1');

api.route('/pandas', pandasRoutes);
api.route('/users', usersRoutes);
api.route('/posts', postsRoutes);
api.route('/search', searchRoutes);

// 404 处理
app.notFound((c) => {
  return c.json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `路由 ${c.req.path} 不存在`,
    },
  }, 404);
});

// 错误处理
app.onError((err, c) => {
  console.error('Error:', err);

  // 数据库错误
  if (err.message.includes('SQLITE_ERROR')) {
    return c.json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: '数据库错误',
        details: c.env.ENVIRONMENT === 'development' ? err.message : undefined,
      },
    }, 500);
  }

  // JWT 错误
  if (err.message.includes('JWT')) {
    return c.json({
      success: false,
      error: {
        code: 'AUTHENTICATION_ERROR',
        message: '认证失败',
      },
    }, 401);
  }

  // 默认错误响应
  return c.json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: '服务器内部错误',
      details: c.env.ENVIRONMENT === 'development' ? err.message : undefined,
    },
  }, 500);
});

// OpenAPI 文档配置
app.doc('/openapi.json', {
  openapi: '3.0.0',
  info: {
    title: '熊猫信息 API',
    version: '1.0.0',
    description: '熊猫信息查询、亲属关系计算和内容分享 API',
    contact: {
      name: 'API 支持',
      email: 'support@example.com',
    },
  },
  servers: [
    {
      url: 'http://localhost:8787',
      description: '本地开发服务器',
    },
    {
      url: 'https://panda-app.{username}.workers.dev',
      description: '生产服务器',
      variables: {
        username: {
          default: 'your-username',
        },
      },
    },
  ],
  tags: [
    { name: 'Pandas', description: '熊猫相关操作' },
    { name: 'Users', description: '用户相关操作' },
    { name: 'Posts', description: '内容分享相关操作' },
    { name: 'Search', description: '搜索相关操作' },
  ],
  components: {
    securitySchemes: {
      Bearer: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: '输入你的 JWT 令牌',
      },
    },
  },
});

// Redoc UI
app.get('/docs', (c) => {
  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>熊猫信息 API 文档</title>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link href="https://fonts.googleapis.com/css?family=Montserrat:300,400,700|Roboto:300,400,700" rel="stylesheet" />
        <style>
          body { margin: 0; padding: 0; }
        </style>
      </head>
      <body>
        <div id="redoc-container"></div>
        <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
        <script>
          Redoc.init('${c.req.url.replace('/docs', '/openapi.json')}', {
            theme: {
              colors: {
                primary: { main: '#ff6b35' }
              },
              typography: {
                fontSize: '16px',
                fontFamily: 'Roboto, sans-serif',
                headings: {
                  fontFamily: 'Montserrat, sans-serif'
                }
              }
            },
            hideDownloadButton: true,
            hideHostname: true,
            expandResponses: "200,201",
            requiredPropsFirst: true,
            sortOperationsAlphabetically: false,
            sortTagsAlphabetically: true
          }, document.getElementById('redoc-container'))
        </script>
      </body>
    </html>
  `;
  return c.html(html);
});

export default app;