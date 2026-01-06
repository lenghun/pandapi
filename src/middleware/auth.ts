import { Context, Next } from 'hono';
import { verify } from 'hono/jwt';
import { getCookie } from 'hono/cookie';

export interface AuthUser {
  id: number;
  username: string;
  email: string;
  role: 'user' | 'keeper' | 'admin';
  is_verified: boolean;
}

declare module 'hono' {
  interface ContextVariableMap {
    user: AuthUser;
  }
}

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.startsWith('Bearer ') 
    ? authHeader.slice(7) 
    : getCookie(c, 'token');

  if (!token) {
    return c.json({
      success: false,
      error: {
        code: 'UNAUTHENTICATED',
        message: '未提供认证令牌'
      }
    }, 401);
  }

  try {
    const payload = await verify(token, c.env.JWT_SECRET);
    c.set('user', payload as AuthUser);
    await next();
  } catch (error) {
    return c.json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: '无效的认证令牌'
      }
    }, 401);
  }
}

export function requireRole(allowedRoles: ('user' | 'keeper' | 'admin')[]) {
  return async (c: Context, next: Next) => {
    const user = c.get('user');
    
    if (!user || !allowedRoles.includes(user.role)) {
      return c.json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: '权限不足'
        }
      }, 403);
    }
    
    await next();
  };
}

export function requireKeeper() {
  return requireRole(['keeper', 'admin']);
}

export function requireAdmin() {
  return requireRole(['admin']);
}