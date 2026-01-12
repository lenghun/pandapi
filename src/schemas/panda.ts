import { z } from 'zod';

export const PandaSchema = z.object({
  pandapuid: z.number().positive().optional().describe('普系号'),
  name: z.string().min(1).max(50).describe('熊猫名字'),
  picture: z.string().url().optional().describe('图片URL'),
  gender: z.enum(['male', 'female']).describe('性别'),
  birthday: z.string().optional().describe('出生日期'),
  birth_place: z.string().optional().describe('出生地'),
  current_location: z.string().optional().describe('现居地'),
  father_id: z.number().positive().optional().describe('父亲ID'),
  mother_id: z.number().positive().optional().describe('母亲ID'),
  weight: z.number().positive().optional().describe('体重(kg)'),
  health_status: z.string().optional().describe('健康状况'),
  personality: z.string().optional().describe('性格描述'),
  appearance: z.string().optional().describe('外貌特征'),
  is_alive: z.boolean().default(true).describe('是否在世'),
})

export const UpdatePandaSchema = PandaSchema.partial()

export const PaginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1).describe('页码'),
  limit: z.coerce.number().int().min(1).max(100).default(20).describe('每页数量'),
  search: z.string().optional().describe('搜索关键词'),
  gender: z.enum(['male', 'female']).optional().describe('性别筛选'),
  location: z.string().optional().describe('地点筛选'),
  is_alive: z.coerce.boolean().optional().describe('是否在世筛选'),
})

export const RelationshipSchema = z.object({
  related_panda_id: z.number().int().positive().describe('关联熊猫ID'),
  relation_type: z.enum([
    'parent', 'child', 'sibling', 'spouse', 
    'grandparent', 'grandchild', 'cousin', 'other'
  ]).describe('关系类型'),
  notes: z.string().optional().describe('关系说明'),
})

export const FamilyTreeParams = z.object({
  depth: z.coerce.number().int().min(1).max(5).default(2).describe('查询深度'),
})