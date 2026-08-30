import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { Pool } from 'pg';
dotenv.config();
const pool = new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.NODE_ENV==='production'?{rejectUnauthorized:false}:false});
const dir=path.dirname(fileURLToPath(import.meta.url));
const sql=fs.readFileSync(path.join(dir,'../../database/schema-v2.sql'),'utf8');
try { await pool.query(sql); console.log('Database initialized successfully'); } catch(e){ console.error(e); process.exitCode=1; } finally { await pool.end(); }