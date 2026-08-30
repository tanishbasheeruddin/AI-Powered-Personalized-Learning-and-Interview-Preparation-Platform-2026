# AI-Powered Personalized Learning and Interview Preparation Platform

Full-stack starter for a final-year project with:
- React/Vite frontend
- Node.js/Express backend
- PostgreSQL-ready database schema
- AI mock tests
- Screen-sharing test room
- AI video interview room
- Coding interview editor
- Performance dashboard
- Notes and courses

## Run locally

### Backend
```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

The frontend expects the backend at `http://localhost:5000`.

## Render deployment
- Create one Render Web Service for `backend`.
- Create one Render Static Site for `frontend`.
- Add PostgreSQL on Render and set `DATABASE_URL`.
- Set AI provider credentials as environment variables on the backend.
- Set `VITE_API_URL` on the frontend.

This package is a production-oriented starter, not a claim that external AI/video providers are already configured.
