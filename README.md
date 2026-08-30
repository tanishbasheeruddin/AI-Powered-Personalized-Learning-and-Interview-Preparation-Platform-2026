# AI-Powered Personalized Learning and Interview Preparation Platform

A full-stack final-year project that combines programming courses, an AI tutor, adaptive mock tests, coding practice, browser screen sharing, AI video interviews, notes, progress analytics, and personalized recommendations.

## Stack
- Frontend: React + Vite
- Backend: Node.js + Express
- Database: PostgreSQL
- AI: OpenAI-compatible API through server-side environment variables
- Video/audio: Browser MediaDevices + Web Speech APIs
- Deployment: Vercel (frontend) + Render (backend/database)

## Features
- Secure register/login with JWT and bcrypt password hashing
- C, C++, Java, Python, JavaScript and SQL learning paths
- Course enrollment and progress-ready database model
- AI programming tutor
- AI-generated mock tests with automatic scoring
- Browser screen sharing during tests
- Webcam/microphone interview room
- Voice answers using browser speech recognition
- AI answer evaluation and interview scoring
- Coding interview workspace with AI review
- Personal notes
- Dashboard readiness analytics

## Local setup
### Backend
```bash
cd backend
npm install
cp .env.example .env
npm run db:init
npm run dev
```
Required production variables: `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`. Add `OPENAI_API_KEY` and optionally `AI_MODEL` to enable live AI.

### Frontend
```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```
Set `VITE_API_URL` to the backend API URL.

## Render
Create a PostgreSQL database and a Node Web Service with root directory `backend`, build command `npm install`, and start command `npm start`. Run `npm run db:init` once against the production database. Set the backend environment variables in Render; never commit secrets.

## Vercel
Import this GitHub repository, set the project root to `frontend`, framework to Vite, and set `VITE_API_URL` to the Render API URL. The SPA rewrite configuration is included.

## Production note
Video calls between multiple participants require a signaling server and usually a TURN service. The current interview room provides the candidate's camera/microphone locally and is ready for that next realtime signaling layer; it does not pretend that a production multi-user WebRTC service is already configured.
