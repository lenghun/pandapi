import { z } from 'zod';

export const CreatePostSchema = z.object({
  panda_id: z.number().int().positive().optional().describe('关联熊猫ID'),
  title: z.string().max(200).optional().describe('标题'),
  content: z.string().min(1).max(5000).describe('内容'),
  media_type: z.enum(['text', 'image', 'video', 'mixed'])
    .default('text')
    .describe('媒体类型'),
  media_urls: z.array(z.string().url())
    .max(10)
    .optional()
    .describe('媒体URL数组'),
  location: z.string().max(100).optional().describe('发布地点'),
  tags: z.array(z.string().max(20)).max(10).optional().describe('标签'),
});

export const UpdatePostSchema = CreatePostSchema.partial().extend({
  status: z.enum(['draft', 'published', 'hidden']).optional().describe('状态'),
  is_pinned: z.boolean().optional().describe('是否置顶'),
});

export const CommentSchema = z.object({
  content: z.string().min(1).max(1000).describe('评论内容'),
  parent_id: z.number().int().positive().optional().describe('父评论ID'),
});