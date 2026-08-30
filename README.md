# AI-Powered Personalized Learning and Interview Preparation Platform

## Stack
- Frontend: Next.js + React, deploy to Vercel
- Backend: Node.js + Express, deploy to Render
- Database: PostgreSQL on Render
- AI: OpenAI-compatible Chat Completions API
- Interview: browser camera/microphone + screen sharing, with WebRTC-ready architecture

## Local development
1. `cd frontend && npm install && npm run dev`
2. `cd backend && npm install && npm start`
3. Set `NEXT_PUBLIC_API_URL` in Vercel to the Render API URL.
4. Set `DATABASE_URL` and `AI_API_KEY` in Render.
5. Run `backend/schema.sql` once against PostgreSQL.

## Features
Dashboard, courses, AI assistant, mock tests, AI interview, video/camera permissions, screen sharing, notes, analytics and PostgreSQL schema.
