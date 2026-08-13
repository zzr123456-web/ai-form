/**
 * 数据库 Schema 初始化脚本
 * 读取 db/schema.sql 并一次性执行全部 DDL
 * 运行：npm run db:init
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, pool } from '../db/pool.js';

// 基于 ES Modules 计算 __dirname（Node 不再原生提供）
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCHEMA_PATH = path.resolve(__dirname, '..', 'db', 'schema.sql');

async function initSchema() {
  try {
    // 读取 schema.sql 完整内容
    const sql = fs.readFileSync(SCHEMA_PATH, 'utf-8');

    // 一次性执行整个 schema（pg 支持多语句查询）
    await query(sql);

    console.log('✅ Schema 初始化完成');
  } catch (err) {
    console.error('❌ Schema 初始化失败:', err.message);
    process.exit(1);
  } finally {
    // 无论成功或失败都关闭连接池，避免进程挂起
    await pool.end();
  }
}

initSchema();
