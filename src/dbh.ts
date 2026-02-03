import { Env } from './types';

export interface PaginationOptions {
  page?: number;
  limit?: number;
  orderBy?: string;
  orderDir?: 'ASC' | 'DESC';
}

export class DatabaseClient {
  // 建议直接绑定 D1Database 实例
  constructor(private db: D1Database) {}

  /**
   * 核心修复：bind() 必须接收返回值
   */
  async query<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    let stmt = this.db.prepare(sql);
    if (params.length > 0) {
      // 关键：D1 的 bind 会返回一个新的 PreparedStatement 实例
      stmt = stmt.bind(...params);
    }
    const result = await stmt.all();
    return (result.results as T[]) || [];
  }

  async queryFirst<T = any>(sql: string, params: any[] = []): Promise<T | null> {
    const results = await this.query<T>(sql, params);
    return results[0] || null;
  }

  async execute(sql: string, params: any[] = []): Promise<{ success: boolean; meta: any }> {
    let stmt = this.db.prepare(sql);
    if (params.length > 0) {
      stmt = stmt.bind(...params);
    }
    const result = await stmt.run();
    return { success: result.success, meta: result.meta };
  }

  /**
   * 插入数据：自动处理字段引号
   */
  async insert(table: string, data: Record<string, any>): Promise<number> {
    const keys = Object.keys(data);
    const columns = keys.map(key => `"${key}"`).join(', ');
    const placeholders = keys.map(() => '?').join(', ');
    const values = keys.map(key => data[key]);
         console.log("keys:", JSON.stringify(keys, null, 2));
         console.log("values:", JSON.stringify(values, null, 2));

    const sql = `INSERT INTO "${table}" (${columns}) VALUES (${placeholders})`;
    
         console.log("sql:", sql);
    const result = await this.execute(sql, values);
    return result.meta.last_row_id;
  }

  /**
   * 更新数据：修复了原先通过 split 匹配参数的脆弱逻辑
   */
  async update(table: string, id: number | string, data: Record<string, any>): Promise<boolean> {
    const keys = Object.keys(data).filter(key => data[key] !== undefined);
    if (keys.length === 0) return false;

    const setClause = keys.map(key => `"${key}" = ?`).join(', ');
    const values = keys.map(key => data[key]);
    values.push(id); // 对应 WHERE id = ?
    const sql = `UPDATE "${table}" SET ${setClause} WHERE id = ?`;
    console.log("Update SQL:", sql);
    console.log("Update values:", JSON.stringify(values, null, 2));
    const result = await this.execute(sql, values);
    return result.success;
  }

  async delete(table: string, id: number | string): Promise<boolean> {
    const sql = `DELETE FROM "${table}" WHERE id = ?`;
    const result = await this.execute(sql, [id]);
    return result.success;
  }

  /**
   * 分页查询：保持高性能的同时支持基础过滤
   */
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
      orderBy = 'id',
      orderDir = 'DESC'
    } = options;

    const whereConditions: string[] = [];
    const params: any[] = [];

    // 构建过滤条件
    Object.entries(filters).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;

      if (Array.isArray(value)) {
        whereConditions.push(`"${key}" IN (${value.map(() => '?').join(',')})`);
        params.push(...value);
      } else if (typeof value === 'string' && value.includes('%')) {
        whereConditions.push(`"${key}" LIKE ?`);
        params.push(value);
      } else {
        whereConditions.push(`"${key}" = ?`);
        params.push(value);
      }
    });

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}` 
      : '';

    // 1. 并发执行总数查询和分页查询（利用 Worker 异步优势）
    const countSql = `SELECT COUNT(*) as total FROM "${table}" ${whereClause}`;
    const offset = (page - 1) * limit;
    const dataSql = `
      SELECT * FROM "${table}"
      ${whereClause}
      ORDER BY ${orderBy} ${orderDir}
      LIMIT ? OFFSET ?
    `;

    // 使用 Promise.all 提升性能
    const [countResult, data] = await Promise.all([
      this.queryFirst<{ total: number }>(countSql, params),
      this.query<T>(dataSql, [...params, limit, offset])
    ]);

    const total = countResult?.total || 0;

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
    // 确保你的 wrangler.toml 中绑定的名称是 DB
    dbInstance = new DatabaseClient(env.DB);
  }
  return dbInstance;
}