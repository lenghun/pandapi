import { Env } from '../types';

export interface QueryParams {
  sql: string;
  params?: any[];
}

export interface PaginationOptions {
  page?: number;
  limit?: number;
  orderBy?: string;
  orderDir?: 'ASC' | 'DESC';
}

export class DatabaseClient {
  constructor(private env: Env) {}

  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    const stmt = this.env.DB.prepare(sql);
    if (params.length > 0) {
      stmt.bind(...params);
    }
    const result = await stmt.all();
    return result.results as T[];
  }

  async queryFirst<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const results = await this.query<T>(sql, params);
    return results[0] || null;
  }

  async execute(sql: string, params: any[] = []): Promise<{ success: boolean; meta: any }> {
    const stmt = this.env.DB.prepare(sql);
    if (params.length > 0) {
      stmt.bind(...params);
    }
    const result = await stmt.run();
    return { success: true, meta: result.meta };
  }

  async insert(table: string, data: Record<string, any>): Promise<number> {
    const columns = Object.keys(data);
    const values = columns.map(col => data[col]);
    const placeholders = columns.map(() => '?').join(',');
    
    const sql = `INSERT INTO ${table} (${columns.join(',')}) VALUES (${placeholders})`;
    const result = await this.execute(sql, values);
    return result.meta.last_row_id;
  }

  async update(table: string, id: number, data: Record<string, any>): Promise<boolean> {
    const updates = Object.keys(data)
      .filter(key => data[key] !== undefined)
      .map(key => `${key} = ?`);
    
    if (updates.length === 0) return false;
    
    const values = updates.map(update => data[update.split(' = ')[0]]);
    values.push(id);
    
    const sql = `UPDATE ${table} SET ${updates.join(', ')} WHERE id = ?`;
    await this.execute(sql, values);
    return true;
  }

  async delete(table: string, id: number): Promise<boolean> {
    const sql = `DELETE FROM ${table} WHERE id = ?`;
    await this.execute(sql, [id]);
    return true;
  }

  async paginate<T = any>(
    table: string,
    options: PaginationOptions = {},
    filters: Record<string, any> = {}
  ): Promise<{
    data: T[];
    total: number;
    page: number;
    limit: number;
    pages: number;
  }> {
    const {
      page = 1,
      limit = 20,
      orderBy = 'created_at',
      orderDir = 'DESC'
    } = options;

    // 构建 WHERE 条件
    const whereConditions: string[] = [];
    const params: any[] = [];

    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        if (Array.isArray(value)) {
          whereConditions.push(`${key} IN (${value.map(() => '?').join(',')})`);
          params.push(...value);
        } else if (typeof value === 'string' && value.includes('%')) {
          whereConditions.push(`${key} LIKE ?`);
          params.push(value);
        } else {
          whereConditions.push(`${key} = ?`);
          params.push(value);
        }
      }
    });

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    // 查询总数
    const countSql = `SELECT COUNT(*) as total FROM ${table} ${whereClause}`;
    const countResult = await this.queryFirst<{ total: number }>(countSql, params);
    const total = countResult?.total || 0;

    // 查询数据
    const offset = (page - 1) * limit;
    const dataSql = `
      SELECT * FROM ${table}
      ${whereClause}
      ORDER BY ${orderBy} ${orderDir}
      LIMIT ? OFFSET ?
    `;
    
    const data = await this.query<T>(dataSql, [...params, limit, offset]);

    return {
      data,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit)
    };
  }
}

// 单例模式导出
let dbInstance: DatabaseClient;

export function getDatabase(env: Env): DatabaseClient {
  if (!dbInstance) {
    dbInstance = new DatabaseClient(env);
  }
  return dbInstance;
}