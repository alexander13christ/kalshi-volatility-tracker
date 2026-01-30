const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const fetch = require('node-fetch');
const http = require('http');

const app = express();
app.use(cors({
  origin: ['http://localhost:3000', 'https://kalshi-volatility-tracker.vercel.app'],
  credentials: true
}));
app.use(express.json());

const PORT = process.env.PORT || 3001;
const KALSHI_API_BASE = 'https://api.elections.kalshi.com/trade-api/v2';

// In-memory storage for price history (12-hour rolling window)
const priceHistory = new Map(); // ticker -> [{price, timestamp}, ...]
const triggeredAlerts = {
  tier20: new Map(), // 20%+ moves
  tier10: new Map(), // 10-20% moves
  tier5: new Map(),  // 5-10% moves
};
const WINDOW_MS = 12 * 60 * 60 * 1000; // 12 hours in milliseconds

// WebSocket clients
const wsClients = new Set();

// Rate limiting: be conservative to avoid 429s
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 150; // 150ms between requests

async function rateLimitedFetch(url, options = {}) {
  const now = Date.now();
  const timeSinceLast = now - lastRequestTime;

  if (timeSinceLast < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLast));
  }

  lastRequestTime = Date.now();

  const response = await fetch(url, {
    ...options,
    headers: {
      'Accept': 'application/json',
      ...options.headers,
    },
  });

  // If rate limited, wait and retry once
  if (response.status === 429) {
    console.log('Rate limited, waiting 3 seconds...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    lastRequestTime = Date.now();
    return fetch(url, {
      ...options,
      headers: {
        'Accept': 'application/json',
        ...options.headers,
      },
    });
  }

  return response;
}

// Fetch active markets (with volume and last_price)
async function fetchActiveMarkets() {
  const markets = [];
  let cursor = null;
  let pages = 0;

  try {
    do {
      const url = new URL(`${KALSHI_API_BASE}/markets`);
      url.searchParams.set('status', 'open');
      url.searchParams.set('limit', '200');
      if (cursor) {
        url.searchParams.set('cursor', cursor);
      }

      const response = await rateLimitedFetch(url.toString());
      if (!response.ok) {
        console.error(`Failed to fetch markets: ${response.status}`);
        break;
      }

      const data = await response.json();

      // Only keep markets with actual trading activity
      const activeMarkets = (data.markets || []).filter(m =>
        m.volume > 0 && m.last_price > 0
      );

      markets.push(...activeMarkets);
      cursor = data.cursor;
      pages++;

      // Limit pages to avoid too many requests
      if (pages >= 10 || markets.length >= 1000) break;

    } while (cursor);

    return markets;
  } catch (error) {
    console.error('Error fetching markets:', error.message);
    return markets;
  }
}

// Fetch historical candlestick data for a market
async function fetchCandlesticks(ticker, hours = 12) {
  try {
    const endTs = Math.floor(Date.now() / 1000);
    const startTs = endTs - (hours * 60 * 60);

    const url = `${KALSHI_API_BASE}/markets/${ticker}/candlesticks?start_ts=${startTs}&end_ts=${endTs}&period_interval=60`;
    const res = await rateLimitedFetch(url);

    if (res.ok) {
      const data = await res.json();
      return data.candlesticks || [];
    }
  } catch (error) {
    // Silently fail
  }
  return [];
}

// Check for volatility in a market - returns tier (20, 10, 5) or null
function checkVolatility(ticker, currentPrice, title) {
  const history = priceHistory.get(ticker) || [];
  const now = Date.now();

  // Add current price to history
  history.push({ price: currentPrice, timestamp: now });

  // Remove prices older than 12 hours
  const cutoff = now - WINDOW_MS;
  const filtered = history.filter(h => h.timestamp >= cutoff);
  priceHistory.set(ticker, filtered);

  if (filtered.length < 2) return null;

  // Find oldest and current prices
  const oldestPrice = filtered[0].price;
  const minPrice = Math.min(...filtered.map(h => h.price));
  const maxPrice = Math.max(...filtered.map(h => h.price));

  if (oldestPrice === 0) return null;

  const priceChange = (currentPrice - oldestPrice) / oldestPrice;
  const absChange = Math.abs(priceChange);

  // Determine tier
  let tier = null;
  if (absChange >= 0.20) tier = 20;
  else if (absChange >= 0.10) tier = 10;
  else if (absChange >= 0.05) tier = 5;

  if (tier) {
    return {
      ticker,
      title,
      currentPrice,
      oldPrice: oldestPrice,
      priceChange: priceChange * 100,
      direction: priceChange > 0 ? 'up' : 'down',
      minPrice,
      maxPrice,
      timestamp: new Date().toISOString(),
      tier,
    };
  }

  return null;
}

// Broadcast alert to all WebSocket clients
function broadcastAlert(alert) {
  const message = JSON.stringify({ type: 'alert', data: alert });
  wsClients.forEach(client => {
    if (client.readyState === 1) {
      client.send(message);
    }
  });
}

// Bootstrap historical data using candlesticks OR previous_price fallback
async function bootstrapHistoricalData(markets) {
  console.log(`Bootstrapping ${markets.length} markets...`);

  let alertsTriggered = 0;
  let marketsWithHistory = 0;

  for (let i = 0; i < markets.length; i++) {
    const market = markets[i];
    const ticker = market.ticker;
    const title = market.title || market.subtitle || ticker;
    const currentPrice = (market.last_price || market.yes_ask || 0) / 100;
    const previousPrice = (market.previous_price || market.previous_yes_bid || 0) / 100;

    if (currentPrice === 0) continue;

    let oldestPrice = 0;
    let history = [];

    // Try candlesticks first
    const candlesticks = await fetchCandlesticks(ticker, 12);

    if (candlesticks.length > 0) {
      const oldestCandle = candlesticks[0];
      oldestPrice = (oldestCandle.open || oldestCandle.close) / 100;
      history = candlesticks.map(c => ({
        price: c.close / 100,
        timestamp: c.end_period_ts * 1000
      }));
      history.push({ price: currentPrice, timestamp: Date.now() });
    } else if (previousPrice > 0 && previousPrice !== currentPrice) {
      // Fallback to previous_price from market data
      oldestPrice = previousPrice;
      history = [
        { price: previousPrice, timestamp: Date.now() - WINDOW_MS },
        { price: currentPrice, timestamp: Date.now() }
      ];
    }

    if (oldestPrice > 0 && history.length > 0) {
      marketsWithHistory++;
      priceHistory.set(ticker, history);

      // Check volatility
      const priceChange = (currentPrice - oldestPrice) / oldestPrice;
      const absChange = Math.abs(priceChange);

      let tier = null;
      if (absChange >= 0.20) tier = 20;
      else if (absChange >= 0.10) tier = 10;
      else if (absChange >= 0.05) tier = 5;

      if (tier) {
        const alert = {
          ticker,
          title,
          currentPrice,
          oldPrice: oldestPrice,
          priceChange: priceChange * 100,
          direction: priceChange > 0 ? 'up' : 'down',
          minPrice: Math.min(oldestPrice, currentPrice),
          maxPrice: Math.max(oldestPrice, currentPrice),
          timestamp: new Date().toISOString(),
          tier,
        };

        const tierKey = `tier${tier}`;
        if (!triggeredAlerts[tierKey].has(ticker)) {
          triggeredAlerts[tierKey].set(ticker, alert);
          broadcastAlert(alert);
          alertsTriggered++;
          console.log(`ALERT [${tier}%]: ${ticker} - ${alert.priceChange.toFixed(1)}% ${alert.direction} (${title.substring(0, 50)})`);
        }
      }
    } else {
      priceHistory.set(ticker, [{ price: currentPrice, timestamp: Date.now() }]);
    }

    // Progress update every 100 markets
    if ((i + 1) % 100 === 0) {
      console.log(`Processed ${i + 1}/${markets.length} markets...`);
    }
  }

  console.log(`Bootstrapped ${marketsWithHistory} markets with history, triggered ${alertsTriggered} alerts`);
}

// Main polling loop
async function pollMarkets() {
  console.log(`[${new Date().toISOString()}] Polling markets...`);

  const markets = await fetchActiveMarkets();
  console.log(`Fetched ${markets.length} active markets`);

  let newAlerts = 0;

  for (const market of markets) {
    const ticker = market.ticker;
    const title = market.title || market.subtitle || ticker;
    // last_price is in cents, convert to decimal
    const currentPrice = (market.last_price || market.yes_ask || 0) / 100;

    if (currentPrice === 0) continue;

    const alert = checkVolatility(ticker, currentPrice, title);

    if (alert) {
      const tierKey = `tier${alert.tier}`;
      const tierMap = triggeredAlerts[tierKey];

      if (!tierMap.has(ticker)) {
        tierMap.set(ticker, alert);
        broadcastAlert(alert);
        newAlerts++;
        console.log(`ALERT [${alert.tier}%]: ${ticker} - ${alert.priceChange.toFixed(1)}% ${alert.direction}`);
      }
    }
  }

  if (newAlerts > 0) {
    console.log(`${newAlerts} new alerts triggered`);
  }

  console.log(`Tracking ${priceHistory.size} markets, Alerts: 20%=${triggeredAlerts.tier20.size}, 10%=${triggeredAlerts.tier10.size}, 5%=${triggeredAlerts.tier5.size}`);
}

// Clear old alerts
function cleanupAlerts() {
  const cutoff = Date.now() - WINDOW_MS;
  for (const tierMap of Object.values(triggeredAlerts)) {
    for (const [ticker, alert] of tierMap.entries()) {
      if (new Date(alert.timestamp).getTime() < cutoff) {
        tierMap.delete(ticker);
      }
    }
  }
}

// API Routes
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    marketsTracked: priceHistory.size,
    activeAlerts: {
      tier20: triggeredAlerts.tier20.size,
      tier10: triggeredAlerts.tier10.size,
      tier5: triggeredAlerts.tier5.size,
    },
    uptime: process.uptime(),
  });
});

app.get('/api/alerts', (req, res) => {
  const tier20 = Array.from(triggeredAlerts.tier20.values())
    .sort((a, b) => Math.abs(b.priceChange) - Math.abs(a.priceChange));
  const tier10 = Array.from(triggeredAlerts.tier10.values())
    .sort((a, b) => Math.abs(b.priceChange) - Math.abs(a.priceChange));
  const tier5 = Array.from(triggeredAlerts.tier5.values())
    .sort((a, b) => Math.abs(b.priceChange) - Math.abs(a.priceChange));
  res.json({ tier20, tier10, tier5 });
});

app.get('/api/market/:ticker', async (req, res) => {
  const { ticker } = req.params;

  try {
    const marketRes = await rateLimitedFetch(`${KALSHI_API_BASE}/markets/${ticker}`);
    if (!marketRes.ok) {
      return res.status(404).json({ error: 'Market not found' });
    }
    const marketData = await marketRes.json();

    const orderbookRes = await rateLimitedFetch(`${KALSHI_API_BASE}/markets/${ticker}/orderbook`);
    const orderbook = orderbookRes.ok ? await orderbookRes.json() : { orderbook: { yes: [], no: [] } };

    res.json({
      market: marketData.market,
      orderbook: orderbook.orderbook,
    });
  } catch (error) {
    console.error(`Error fetching market ${ticker}:`, error.message);
    res.status(500).json({ error: 'Failed to fetch market data' });
  }
});

app.get('/api/market/:ticker/history', async (req, res) => {
  const { ticker } = req.params;

  try {
    const endTs = Math.floor(Date.now() / 1000);
    const startTs = endTs - (7 * 24 * 60 * 60);

    const url = `${KALSHI_API_BASE}/markets/${ticker}/candlesticks?start_ts=${startTs}&end_ts=${endTs}&period_interval=60`;
    const candleRes = await rateLimitedFetch(url);

    if (candleRes.ok) {
      const data = await candleRes.json();
      return res.json({ candlesticks: data.candlesticks || [] });
    }

    res.json({ candlesticks: [] });
  } catch (error) {
    console.error(`Error fetching history for ${ticker}:`, error.message);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  console.log('New WebSocket client connected');
  wsClients.add(ws);

  const initialData = {
    tier20: Array.from(triggeredAlerts.tier20.values()),
    tier10: Array.from(triggeredAlerts.tier10.values()),
    tier5: Array.from(triggeredAlerts.tier5.values()),
  };
  ws.send(JSON.stringify({ type: 'initial', data: initialData }));

  ws.on('close', () => {
    wsClients.delete(ws);
    console.log('WebSocket client disconnected');
  });
});

// Start server - bind to 0.0.0.0 for Railway
server.listen(PORT, '0.0.0.0', async () => {
  console.log(`Backend server running on port ${PORT}`);
  console.log(`WebSocket available at ws://localhost:${PORT}/ws`);

  // Initial fetch
  const markets = await fetchActiveMarkets();
  console.log(`Initial fetch: ${markets.length} active markets`);

  // Bootstrap with REAL historical candlestick data
  await bootstrapHistoricalData(markets);

  // Start regular polling (every 30 seconds)
  setInterval(pollMarkets, 30000);

  // Cleanup old alerts every hour
  setInterval(cleanupAlerts, 60 * 60 * 1000);
});
