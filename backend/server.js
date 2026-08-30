require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { Pool } = require('pg');

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '2mb' }));

const isProduction = process.env.NODE_ENV === 'production';
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: isProduction ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30000,
    })
  : null;

const jwtSecret = process.env.JWT_SECRET || (isProduction ? null : 'dev-only-secret');

function requireDb(req, res, next) {
  if (!pool) return res.status(503).json({ error: 'Database is not configured on the server.' });
  next();
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, expected] = String(stored || '').split(':');
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'));
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function signToken(payload) {
  if (!jwtSecret) throw new Error('JWT_SECRET is not configured');
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  const signature = crypto.createHmac('sha256', jwtSecret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

function readToken(req) {
  const value = req.headers.authorization || '';
  if (!value.startsWith('Bearer ')) return null;
  const token = value.slice(7);
  const parts = token.split('.');
  if (parts.length !== 3 || !jwtSecret) return null;
  const expected = crypto.createHmac('sha256', jwtSecret).update(`${parts[0]}.${parts[1]}`).digest('base64url');
  if (expected !== parts[2]) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function auth(req, res, next) {
  const user = readToken(req);
  if (!user) return res.status(401).json({ error: 'Authentication required.' });
  req.user = user;
  next();
}

async function initDatabase() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS courses (
      id SERIAL PRIMARY KEY,
      title VARCHAR(160) NOT NULL,
      description TEXT,
      language VARCHAR(80),
      level VARCHAR(40),
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS enrollments (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
      progress INTEGER DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(user_id, course_id)
    );
    CREATE TABLE IF NOT EXISTS tests (
      id SERIAL PRIMARY KEY,
      title VARCHAR(200) NOT NULL,
      language VARCHAR(80),
      duration_minutes INTEGER DEFAULT 30
    );
    CREATE TABLE IF NOT EXISTS questions (
      id SERIAL PRIMARY KEY,
      test_id INTEGER REFERENCES tests(id) ON DELETE CASCADE,
      prompt TEXT NOT NULL,
      options JSONB,
      answer TEXT
    );
    CREATE TABLE IF NOT EXISTS test_attempts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      test_id INTEGER REFERENCES tests(id) ON DELETE CASCADE,
      score INTEGER,
      answers JSONB,
      completed_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS interview_sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      language VARCHAR(80),
      role VARCHAR(120),
      score INTEGER,
      feedback TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS notes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(200),
      content TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS ai_conversations (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS recommendations (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      title VARCHAR(200) NOT NULL,
      reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  const courses = [
    ['C Programming', 'Core syntax, arrays, pointers and problem solving', 'C', 'Beginner'],
    ['C++', 'OOP, STL and competitive programming foundations', 'C++', 'Intermediate'],
    ['Java', 'OOP, collections, exceptions and DSA', 'Java', 'Intermediate'],
    ['Python', 'Python programming, automation and AI basics', 'Python', 'Beginner'],
    ['SQL', 'Queries, joins, aggregation and database design', 'SQL', 'Beginner'],
  ];
  for (const [title, description, language, level] of courses) {
    await pool.query(
      `INSERT INTO courses(title, description, language, level)
       VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [title, description, language, level]
    );
  }
}

app.get('/health', async (req, res) => {
  let database = 'not-configured';
  if (pool) {
    try {
      await pool.query('SELECT 1');
      database = 'connected';
    } catch {
      database = 'unavailable';
    }
  }
  res.json({ status: 'ok', service: 'skillforge-ai-api', database });
});

app.post('/api/auth/register', requireDb, async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!name || !email || password.length < 6) return res.status(400).json({ error: 'Name, valid email and a password of at least 6 characters are required.' });
    const passwordHash = hashPassword(password);
    const result = await pool.query(
      'INSERT INTO users(name,email,password_hash) VALUES($1,$2,$3) RETURNING id,name,email,created_at',
      [name, email, passwordHash]
    );
    const user = result.rows[0];
    const token = signToken({ sub: user.id, email: user.email, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 });
    res.status(201).json({ user, token });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'An account with this email already exists.' });
    next(err);
  }
});

app.post('/api/auth/login', requireDb, async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const result = await pool.query('SELECT id,name,email,password_hash,created_at FROM users WHERE email=$1', [email]);
    const user = result.rows[0];
    if (!user || !verifyPassword(password, user.password_hash)) return res.status(401).json({ error: 'Invalid email or password.' });
    delete user.password_hash;
    const token = signToken({ sub: user.id, email: user.email, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 });
    res.json({ user, token });
  } catch (err) { next(err); }
});

app.get('/api/auth/me', auth, requireDb, async (req, res, next) => {
  try {
    const result = await pool.query('SELECT id,name,email,created_at FROM users WHERE id=$1', [req.user.sub]);
    if (!result.rows[0]) return res.status(404).json({ error: 'User not found.' });
    res.json({ user: result.rows[0] });
  } catch (err) { next(err); }
});

app.get('/api/courses', requireDb, async (req, res, next) => {
  try {
    const r = await pool.query('SELECT * FROM courses ORDER BY id');
    res.json(r.rows);
  } catch (err) { next(err); }
});

app.get('/api/courses/:id', requireDb, async (req, res, next) => {
  try {
    const r = await pool.query('SELECT * FROM courses WHERE id=$1', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Course not found.' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

app.post('/api/courses/:id/enroll', auth, requireDb, async (req, res, next) => {
  try {
    await pool.query('INSERT INTO enrollments(user_id,course_id) VALUES($1,$2) ON CONFLICT(user_id,course_id) DO NOTHING', [req.user.sub, req.params.id]);
    res.status(201).json({ enrolled: true });
  } catch (err) { next(err); }
});

app.get('/api/my/courses', auth, requireDb, async (req, res, next) => {
  try {
    const r = await pool.query(`SELECT c.*, e.progress FROM enrollments e JOIN courses c ON c.id=e.course_id WHERE e.user_id=$1 ORDER BY e.created_at DESC`, [req.user.sub]);
    res.json(r.rows);
  } catch (err) { next(err); }
});

app.get('/api/tests', requireDb, async (req, res, next) => {
  try { res.json((await pool.query('SELECT * FROM tests ORDER BY id')).rows); } catch (err) { next(err); }
});

app.get('/api/tests/:id', requireDb, async (req, res, next) => {
  try {
    const test = (await pool.query('SELECT * FROM tests WHERE id=$1', [req.params.id])).rows[0];
    if (!test) return res.status(404).json({ error: 'Test not found.' });
    const questions = (await pool.query('SELECT id,prompt,options FROM questions WHERE test_id=$1 ORDER BY id', [req.params.id])).rows;
    res.json({ ...test, questions });
  } catch (err) { next(err); }
});

app.post('/api/tests/:id/submit', auth, requireDb, async (req, res, next) => {
  try {
    const answers = req.body.answers && typeof req.body.answers === 'object' ? req.body.answers : {};
    const questions = (await pool.query('SELECT id,answer FROM questions WHERE test_id=$1', [req.params.id])).rows;
    if (!questions.length) return res.status(400).json({ error: 'This test has no questions yet.' });
    const correct = questions.filter(q => String(answers[q.id] ?? '').trim().toLowerCase() === String(q.answer ?? '').trim().toLowerCase()).length;
    const score = Math.round((correct / questions.length) * 100);
    const attempt = await pool.query('INSERT INTO test_attempts(user_id,test_id,score,answers) VALUES($1,$2,$3,$4) RETURNING *', [req.user.sub, req.params.id, score, JSON.stringify(answers)]);
    res.status(201).json({ score, correct, total: questions.length, attempt: attempt.rows[0] });
  } catch (err) { next(err); }
});

app.get('/api/my/attempts', auth, requireDb, async (req, res, next) => {
  try {
    const r = await pool.query(`SELECT a.*, t.title, t.language FROM test_attempts a LEFT JOIN tests t ON t.id=a.test_id WHERE a.user_id=$1 ORDER BY a.completed_at DESC`, [req.user.sub]);
    res.json(r.rows);
  } catch (err) { next(err); }
});

app.get('/api/notes', auth, requireDb, async (req, res, next) => {
  try { res.json((await pool.query('SELECT * FROM notes WHERE user_id=$1 ORDER BY updated_at DESC', [req.user.sub])).rows); } catch (err) { next(err); }
});

app.post('/api/notes', auth, requireDb, async (req, res, next) => {
  try {
    const title = String(req.body.title || '').trim();
    const content = String(req.body.content || '');
    if (!title) return res.status(400).json({ error: 'Title is required.' });
    const r = await pool.query('INSERT INTO notes(user_id,title,content) VALUES($1,$2,$3) RETURNING *', [req.user.sub, title, content]);
    res.status(201).json(r.rows[0]);
  } catch (err) { next(err); }
});

app.put('/api/notes/:id', auth, requireDb, async (req, res, next) => {
  try {
    const r = await pool.query('UPDATE notes SET title=$1,content=$2,updated_at=NOW() WHERE id=$3 AND user_id=$4 RETURNING *', [String(req.body.title || '').trim(), String(req.body.content || ''), req.params.id, req.user.sub]);
    if (!r.rows[0]) return res.status(404).json({ error: 'Note not found.' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

app.delete('/api/notes/:id', auth, requireDb, async (req, res, next) => {
  try { await pool.query('DELETE FROM notes WHERE id=$1 AND user_id=$2', [req.params.id, req.user.sub]); res.status(204).end(); } catch (err) { next(err); }
});

app.post('/api/ai/ask', async (req, res, next) => {
  try {
    const q = String(req.body.question || '').trim();
    if (!q) return res.status(400).json({ error: 'Question required' });
    if (!process.env.AI_API_KEY) return res.json({ answer: 'AI assistant is configured and ready. Add AI_API_KEY on Render to enable live model responses.' });
    const r = await fetch(process.env.AI_API_URL || 'https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.AI_API_KEY}` },
      body: JSON.stringify({ model: process.env.AI_MODEL || 'gpt-4o-mini', messages: [
        { role: 'system', content: 'You are SkillForge AI, a concise programming tutor and interview coach. Explain clearly, use examples, and encourage learning.' },
        { role: 'user', content: q }
      ] })
    });
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ error: 'AI provider returned an error.' });
    const answer = data.choices?.[0]?.message?.content || 'AI response unavailable.';
    const user = readToken(req);
    if (pool && user) await pool.query('INSERT INTO ai_conversations(user_id,question,answer) VALUES($1,$2,$3)', [user.sub, q, answer]);
    res.json({ answer });
  } catch (err) { next(err); }
});

app.post('/api/interviews/evaluate', async (req, res, next) => {
  try {
    const { question, answer, language, role } = req.body || {};
    if (!answer) return res.status(400).json({ error: 'Answer required' });
    const words = String(answer).trim().split(/\s+/).filter(Boolean).length;
    const score = Math.min(100, Math.max(35, 45 + Math.min(45, Math.round(words * 1.5))));
    const feedback = 'Good attempt. Improve structure by stating the concept, giving a short example, and explaining the trade-off.';
    const user = readToken(req);
    if (pool && user) await pool.query('INSERT INTO interview_sessions(user_id,language,role,score,feedback) VALUES($1,$2,$3,$4,$5)', [user.sub, language || null, role || null, score, feedback]);
    res.json({ score, question, feedback });
  } catch (err) { next(err); }
});

app.get('/api/my/interviews', auth, requireDb, async (req, res, next) => {
  try { res.json((await pool.query('SELECT * FROM interview_sessions WHERE user_id=$1 ORDER BY created_at DESC', [req.user.sub])).rows); } catch (err) { next(err); }
});

app.get('/api/my/dashboard', auth, requireDb, async (req, res, next) => {
  try {
    const [courses, attempts, interviews, notes] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS count, COALESCE(ROUND(AVG(progress)),0)::int AS avg_progress FROM enrollments WHERE user_id=$1', [req.user.sub]),
      pool.query('SELECT COUNT(*)::int AS count, COALESCE(ROUND(AVG(score)),0)::int AS avg_score FROM test_attempts WHERE user_id=$1', [req.user.sub]),
      pool.query('SELECT COUNT(*)::int AS count, COALESCE(ROUND(AVG(score)),0)::int AS avg_score FROM interview_sessions WHERE user_id=$1', [req.user.sub]),
      pool.query('SELECT COUNT(*)::int AS count FROM notes WHERE user_id=$1', [req.user.sub]),
    ]);
    res.json({ courses: courses.rows[0], tests: attempts.rows[0], interviews: interviews.rows[0], notes: notes.rows[0] });
  } catch (err) { next(err); }
});

app.use((req, res) => res.status(404).json({ error: 'API route not found.' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error.' });
});

const port = process.env.PORT || 10000;

(async () => {
  try {
    await initDatabase();
    app.listen(port, () => console.log(`API running on ${port}`));
  } catch (err) {
    console.error('Database initialization failed:', err.message);
    app.listen(port, () => console.log(`API running on ${port} without database initialization`));
  }
})();
