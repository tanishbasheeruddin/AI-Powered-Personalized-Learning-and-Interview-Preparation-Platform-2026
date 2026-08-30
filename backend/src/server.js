import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Pool } from "pg";

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;
const pool = process.env.DATABASE_URL ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false }) : null;

app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:5173" }));
app.use(express.json());

app.get("/api/health", async (_req, res) => {
  let database = "not configured";
  if (pool) {
    try { await pool.query("SELECT 1"); database = "connected"; }
    catch { database = "error"; }
  }
  res.json({ ok: true, database });
});

app.get("/api/courses", (_req, res) => {
  res.json([
    { id: 1, title: "Java Programming", level: "Beginner → Advanced", progress: 72 },
    { id: 2, title: "Python Programming", level: "Beginner → Advanced", progress: 45 },
    { id: 3, title: "C++ & DSA", level: "Intermediate", progress: 28 },
    { id: 4, title: "JavaScript", level: "Beginner → Advanced", progress: 61 }
  ]);
});

app.post("/api/mock-tests/generate", (req, res) => {
  const { language = "Java", difficulty = "Medium", count = 10 } = req.body;
  const questions = Array.from({ length: Math.min(Number(count) || 10, 20) }, (_, i) => ({
    id: i + 1,
    question: `AI-generated ${difficulty} ${language} question ${i + 1}`,
    options: ["Option A", "Option B", "Option C", "Option D"],
    answer: 0
  }));
  res.json({ language, difficulty, questions });
});

app.post("/api/interviews/session", (req, res) => {
  const { type = "Technical", language = "Java" } = req.body;
  res.json({
    id: `interview_${Date.now()}`,
    type,
    language,
    status: "created",
    message: "Interview session created. Connect your AI provider for live question generation."
  });
});

app.post("/api/ai/evaluate", (req, res) => {
  const { answer = "" } = req.body;
  res.json({
    score: Math.min(100, 55 + Math.round(answer.length / 8)),
    strengths: ["Relevant response", "Clear basic explanation"],
    improvements: ["Add a concrete example", "Structure the answer with a definition, example, and conclusion"]
  });
});

app.listen(port, () => console.log(`API running on http://localhost:${port}`));
