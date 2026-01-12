import type { Context } from "hono";

export type AppContext = Context<{ Bindings: Env }>;
export type HandleArgs = [AppContext];

export interface Env {
  DB: D1Database;
  JWT_SECRET: string;
  ENVIRONMENT: 'development' | 'production';
  API_BASE_URL: string;
}

export interface Panda {
  id: number;
  pandapuid:number
  name: string;
  picture?: string;
  gender: 'male' | 'female';
  birthday?: string;
  birth_place?: string;
  current_location?: string;
  father_id?: number;
  mother_id?: number;
  weight?: number;
  health_status?: string;
  personality?: string;
  appearance?: string;
  is_alive: boolean;
  popularity_score: number;
  created_at: string;
  updated_at: string;
}

export interface PandaWithRelations extends Panda {
  father_name?: string;
  mother_name?: string;
  children_count?: number;
  posts_count?: number;
}

export interface User {
  id: number;
  username: string;
  email: string;
  password_hash: string;
  avatar_url?: string;
  bio?: string;
  role: 'user' | 'keeper' | 'admin';
  is_verified: boolean;
  follower_count: number;
  following_count: number;
  created_at: string;
  updated_at: string;
}

export interface Post {
  id: number;
  user_id: number;
  panda_id?: number;
  title?: string;
  content: string;
  media_type: 'text' | 'image' | 'video' | 'mixed';
  media_urls?: string[];
  view_count: number;
  like_count: number;
  comment_count: number;
  share_count: number;
  location?: string;
  is_pinned: boolean;
  status: 'draft' | 'published' | 'hidden';
  created_at: string;
  updated_at: string;
}

export interface Relationship {
  id: number;
  panda_id: number;
  related_panda_id: number;
  relation_type: 'parent' | 'child' | 'sibling' | 'spouse' | 'grandparent' | 'grandchild' | 'cousin' | 'other';
  notes?: string;
  created_at: string;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  pagination?: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
  meta?: {
    timestamp: string;
    version: string;
  };
}

export interface PaginatedResponse<T = any> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}