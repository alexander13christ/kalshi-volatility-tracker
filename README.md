# Kalshi Volatility Tracker

Real-time prediction market volatility monitoring system that tracks 20%+ price movements on Kalshi.

## Features

- **Continuous Monitoring**: Polls all active Kalshi markets every 30 seconds
- **Volatility Detection**: Flags markets with 20%+ price movement in a 12-hour rolling window
- **Real-time Alerts**: WebSocket-based live updates to the dashboard
- **Market Detail View**: Order book depth, liquidity stats, and 7-day historical charts
- **Light Mode UI**: Clean, modern interface

## Architecture

```
┌─────────────────┐     WebSocket     ┌─────────────────┐
│  Backend (Node) │◄────────────────►│ Frontend (Next) │
│   Port 3001     │                   │    Port 3000    │
└────────┬────────┘                   └─────────────────┘
         │
         │ REST API
         ▼
┌─────────────────┐
│   Kalshi API    │
└─────────────────┘
```

## Local Development

### Prerequisites

- Node.js 18+
- npm

### Setup

1. **Start the backend**

```bash
cd backend
npm install
npm start
```

Backend runs on http://localhost:3001

2. **Start the frontend** (in a new terminal)

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on http://localhost:3000

3. **Open the dashboard**

Navigate to http://localhost:3000 in your browser.

## Environment Variables

### Frontend

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_BACKEND_URL` | Backend API URL | `http://localhost:3001` |

### Backend

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3001` |

## Deployment

### Backend → Railway

1. Create a new project on [Railway](https://railway.app)
2. Connect your GitHub repo or deploy from CLI:
   ```bash
   cd backend
   railway login
   railway init
   railway up
   ```
3. Railway will auto-detect Node.js and deploy
4. Copy your Railway URL (e.g., `https://your-app.railway.app`)

### Frontend → Vercel

1. Create a new project on [Vercel](https://vercel.com)
2. Connect your GitHub repo or deploy from CLI:
   ```bash
   cd frontend
   vercel
   ```
3. Set the environment variable:
   - `NEXT_PUBLIC_BACKEND_URL` = your Railway backend URL
4. Deploy

## API Endpoints

### Backend

| Endpoint | Description |
|----------|-------------|
| `GET /api/health` | Server health status |
| `GET /api/alerts` | All active volatility alerts |
| `GET /api/market/:ticker` | Market details + order book |
| `GET /api/market/:ticker/history` | 7-day candlestick data |
| `WS /ws` | Real-time alert stream |

## Rate Limits

Kalshi Basic tier: 20 requests/second. The backend uses intelligent polling with rate limiting to stay well under this limit.

## How Volatility is Detected

1. Backend polls all open markets every 30 seconds
2. Stores prices in-memory with timestamps
3. Compares current price to 12-hours-ago price
4. If change ≥ 20%, triggers alert
5. Alert pushed to all connected frontends via WebSocket

## Tech Stack

- **Backend**: Node.js, Express, WebSocket (ws)
- **Frontend**: Next.js 16, React, Tailwind CSS, Recharts
- **Deployment**: Railway (backend), Vercel (frontend)
