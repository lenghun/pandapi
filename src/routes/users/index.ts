import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { RegisterSchema, LoginSchema, UpdateUserSchema, UpdatePasswordSchema } from '../../schemas/user';
import { getDatabase } from '../../lib/db';
import { authMiddleware } from '../../middleware/auth';
import bcrypt from 'bcryptjs';
import { sign, verify } from 'hono/jwt';

const app = new OpenAPIHono();

// 用户注册
app.openapi(
  createRoute({
    method: 'post',
    path: '/register',
    summary: '用户注册',
    description: '创建新用户账户',
    tags: ['Users'],
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
      201: {
        description: '用户注册成功',
      },
      409: {
        description: '用户已存在',
      },
    },
  }),
  async (c) => {
    const data = c.req.valid('json');
    const db = getDatabase(c.env);
    
    // 检查用户是否已存在
    const existingUser = await db.queryFirst(
      'SELECT id FROM users WHERE email = ? OR username = ?',
      [data.email, data.username]
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
    
    // 密码加密
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(data.password, salt);
    
    // 创建用户
    const userId = await db.insert('users', {
      username: data.username,
      email: data.email,
      password_hash: passwordHash,
      role: 'user',
      is_verified: false,
      follower_count: 0,
      following_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    
    // 生成JWT
    const token = await sign(
      {
        id: userId,
        username: data.username,
        email: data.email,
        role: 'user',
        is_verified: false,
      },
      c.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    const user = await db.queryFirst(
      'SELECT id, username, email, avatar_url, bio, role, is_verified, created_at FROM users WHERE id = ?',
      [userId]
    );
    
    return c.json({
      success: true,
      data: {
        user,
        token,
      },
      message: '注册成功',
    }, 201);
  }
);

// 用户登录
app.openapi(
  createRoute({
    method: 'post',
    path: '/login',
    summary: '用户登录',
    description: '用户登录获取访问令牌',
    tags: ['Users'],
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
      200: {
        description: '登录成功',
      },
      401: {
        description: '认证失败',
      },
    },
  }),
  async (c) => {
    const { email, password } = c.req.valid('json');
    const db = getDatabase(c.env);
    
    // 查找用户
    const user = await db.queryFirst(
      'SELECT * FROM users WHERE email = ?',
      [email]
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
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return c.json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: '邮箱或密码错误',
        },
      }, 401);
    }
    
    // 生成JWT
    const token = await sign(
      {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        is_verified: user.is_verified,
      },
      c.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    // 移除密码字段
    delete user.password_hash;
    
    return c.json({
      success: true,
      data: {
        user,
        token,
      },
      message: '登录成功',
    });
  }
);

// 获取当前用户信息
app.openapi(
  createRoute({
    method: 'get',
    path: '/me',
    summary: '获取当前用户信息',
    description: '获取当前登录用户的详细信息',
    tags: ['Users'],
    security: [{ Bearer: [] }],
    responses: {
      200: {
        description: '成功返回用户信息',
      },
      401: {
        description: '未授权',
      },
    },
  }),
  authMiddleware,
  async (c) => {
    const user = c.get('user');
    const db = getDatabase(c.env);
    
    const userData = await db.queryFirst(
      'SELECT id, username, email, avatar_url, bio, role, is_verified, follower_count, following_count, created_at FROM users WHERE id = ?',
      [user.id]
    );
    
    return c.json({
      success: true,
      data: userData,
    });
  }
);

// 更新用户信息
app.openapi(
  createRoute({
    method: 'patch',
    path: '/me',
    summary: '更新用户信息',
    description: '更新当前登录用户的信息',
    tags: ['Users'],
    security: [{ Bearer: [] }],
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
      200: {
        description: '更新成功',
      },
      401: {
        description: '未授权',
      },
    },
  }),
  authMiddleware,
  async (c) => {
    const user = c.get('user');
    const data = c.req.valid('json');
    const db = getDatabase(c.env);
    
    // 如果更新用户名，检查是否重复
    if (data.username) {
      const existing = await db.queryFirst(
        'SELECT id FROM users WHERE username = ? AND id != ?',
        [data.username, user.id]
      );
      
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
    
    await db.update('users', user.id, {
      ...data,
      updated_at: new Date().toISOString(),
    });
    
    const updated = await db.queryFirst(
      'SELECT id, username, email, avatar_url, bio, role, is_verified, follower_count, following_count, created_at FROM users WHERE id = ?',
      [user.id]
    );
    
    return c.json({
      success: true,
      data: updated,
      message: '用户信息更新成功',
    });
  }
);

// 更新密码
app.openapi(
  createRoute({
    method: 'patch',
    path: '/me/password',
    summary: '更新密码',
    description: '更新当前登录用户的密码',
    tags: ['Users'],
    security: [{ Bearer: [] }],
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
      200: {
        description: '密码更新成功',
      },
      401: {
        description: '当前密码错误',
      },
    },
  }),
  authMiddleware,
  async (c) => {
    const user = c.get('user');
    const data = c.req.valid('json');
    const db = getDatabase(c.env);
    
    // 获取当前用户密码
    const currentUser = await db.queryFirst(
      'SELECT password_hash FROM users WHERE id = ?',
      [user.id]
    );
    
    // 验证当前密码
    const isValid = await bcrypt.compare(data.current_password, currentUser.password_hash);
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
    const newPasswordHash = await bcrypt.hash(data.new_password, salt);
    
    // 更新密码
    await db.update('users', user.id, {
      password_hash: newPasswordHash,
      updated_at: new Date().toISOString(),
    });
    
    return c.json({
      success: true,
      message: '密码更新成功',
    });
  }
);

export default app;