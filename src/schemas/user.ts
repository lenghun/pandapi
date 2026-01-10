import { z } from 'zod';

export const RegisterSchema = z.object({
  username: z.string()
    .min(3)
    .max(30)
    .regex(/^[a-zA-Z0-9_]+$/, '用户名只能包含字母、数字和下划线')
    .describe('用户名'),
  email: z.string()
    .email()
    .describe('邮箱'),
  password: z.string()
    .min(8)
    .max(100)
    .describe('密码'),
  confirm_password: z.string()
    .min(8)
    .max(100)
    .describe('确认密码'),
}).refine(data => data.password === data.confirm_password, {
  message: '两次输入的密码不一致',
  path: ['confirm_password'],
});

export const LoginSchema = z.object({
  username: z.string().describe('用户名'),
  password: z.string().min(1).describe('密码'),
});

export const UpdateUserSchema = z.object({
  username: z.string().min(3).max(30).optional(),
  avatar_url: z.string().url().optional(),
  bio: z.string().max(500).optional(),
});

export const UpdatePasswordSchema = z.object({
  current_password: z.string().min(1).describe('当前密码'),
  new_password: z.string().min(8).max(100).describe('新密码'),
  confirm_password: z.string().min(8).max(100).describe('确认新密码'),
}).refine(data => data.new_password === data.confirm_password, {
  message: '两次输入的新密码不一致',
  path: ['confirm_password'],
});