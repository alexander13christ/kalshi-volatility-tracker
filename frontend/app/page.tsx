"use client";

import { useEffect, useState, useCallback, useRef, Component, ReactNode } from "react";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

// Error Boundary to catch rendering errors
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: string }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: "" };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-red-50 flex items-center justify-center p-8">
          <div className="bg-white rounded-lg p-6 max-w-lg shadow-lg">
            <h1 className="text-xl font-bold text-red-600 mb-4">Something went wrong</h1>
            <p className="text-gray-700 mb-4">{this.state.error}</p>
            <p className="text-sm text-gray-500">Backend URL: {BACKEND_URL}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

type Alert = {
  ticker: string;
  title: string;
  currentPrice: number;
  oldPrice: number;
  priceChange: number;
  direction: "up" | "down";
  minPrice: number;
  maxPrice: number;
  timestamp: string;
  tier: number;
};

type AlertsByTier = {
  tier20: Alert[];
  tier10: Alert[];
  tier5: Alert[];
};

function DashboardContent() {
  const [alerts, setAlerts] = useState<AlertsByTier>({
    tier20: [],
    tier10: [],
    tier5: [],
  });
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Fetch alerts via HTTP
  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/alerts`);
      if (res.ok) {
        const data = await res.json();
        setAlerts(data);
        setFetchError(null);
      } else {
        setFetchError(`HTTP ${res.status}`);
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to fetch");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    fetchAlerts();

    // Try WebSocket connection
    const connect = () => {
      try {
        const wsUrl = BACKEND_URL.replace("http://", "ws://").replace("https://", "wss://");
        const ws = new WebSocket(`${wsUrl}/ws`);

        ws.onopen = () => {
          setConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            if (message.type === "initial") {
              setAlerts(message.data);
            } else if (message.type === "alert") {
              const alert = message.data;
              const tierKey = `tier${alert.tier}` as keyof AlertsByTier;
              setAlerts((prev) => ({
                ...prev,
                [tierKey]: [alert, ...prev[tierKey]],
              }));
            }
          } catch (e) {
            // Ignore parse errors
          }
        };

        ws.onclose = () => {
          setConnected(false);
          setTimeout(connect, 5000);
        };

        ws.onerror = () => {
          setConnected(false);
        };

        wsRef.current = ws;
      } catch (e) {
        // WebSocket failed, will use polling
      }
    };

    connect();

    // Poll every 30 seconds as backup
    const pollInterval = setInterval(fetchAlerts, 30000);

    return () => {
      wsRef.current?.close();
      clearInterval(pollInterval);
    };
  }, [fetchAlerts]);

  const totalAlerts = alerts.tier20.length + alerts.tier10.length + alerts.tier5.length;

  // Alert card
  const AlertCard = ({ alert, borderColor }: { alert: Alert; borderColor: string }) => (
    <div className={`bg-white border-2 rounded-lg p-4 ${borderColor}`}>
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs font-mono text-gray-500">{alert.ticker.substring(0, 20)}...</span>
        <span className={`text-lg font-bold ${alert.direction === "up" ? "text-green-600" : "text-red-600"}`}>
          {alert.direction === "up" ? "+" : ""}{alert.priceChange.toFixed(1)}%
        </span>
      </div>
      <p className="text-sm text-gray-900 font-medium line-clamp-2 mb-2">{alert.title}</p>
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{(alert.oldPrice * 100).toFixed(0)}c → {(alert.currentPrice * 100).toFixed(0)}c</span>
        <span>{new Date(alert.timestamp).toLocaleTimeString()}</span>
      </div>
    </div>
  );

  // Alert section
  const AlertSection = ({ title, alerts, bgColor, borderColor, textColor, emptyMessage }: {
    title: string;
    alerts: Alert[];
    bgColor: string;
    borderColor: string;
    textColor: string;
    emptyMessage: string;
  }) => (
    <section className={`rounded-xl p-6 ${bgColor} border ${borderColor}`}>
      <div className="flex items-center justify-between mb-4">
        <h2 className={`text-xl font-bold ${textColor}`}>{title}</h2>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${bgColor} ${textColor} border ${borderColor}`}>
          {alerts.length}
        </span>
      </div>
      {alerts.length === 0 ? (
        <p className="text-gray-500 text-center py-4">{emptyMessage}</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {alerts.map((alert, i) => (
            <AlertCard key={`${alert.ticker}-${i}`} alert={alert} borderColor={borderColor} />
          ))}
        </div>
      )}
    </section>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-xl text-gray-600">Loading alerts...</p>
          <p className="text-sm text-gray-400 mt-2">Connecting to {BACKEND_URL}</p>
        </div>
      </div>
    );
  }

  if (fetchError && totalAlerts === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
        <div className="bg-white rounded-lg p-6 max-w-lg shadow-lg text-center">
          <h1 className="text-xl font-bold text-red-600 mb-4">Connection Error</h1>
          <p className="text-gray-700 mb-2">{fetchError}</p>
          <p className="text-sm text-gray-500 mb-4">Backend: {BACKEND_URL}</p>
          <button onClick={fetchAlerts} className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Kalshi Volatility Tracker</h1>
            <p className="text-gray-500 text-sm">Monitoring price movements in 12-hour window</p>
          </div>
          <div className="flex items-center gap-4">
            <span className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${connected ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
              <span className={`w-2 h-2 rounded-full ${connected ? "bg-green-500" : "bg-yellow-500"}`} />
              {connected ? "Live" : "Polling"}
            </span>
            <span className="text-gray-500 text-sm">{totalAlerts} alerts</span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <AlertSection
          title="20%+ Moves"
          alerts={alerts.tier20}
          bgColor="bg-red-50"
          borderColor="border-red-200"
          textColor="text-red-800"
          emptyMessage="No 20%+ moves detected yet"
        />
        <AlertSection
          title="10-20% Moves"
          alerts={alerts.tier10}
          bgColor="bg-orange-50"
          borderColor="border-orange-200"
          textColor="text-orange-800"
          emptyMessage="No 10-20% moves detected yet"
        />
        <AlertSection
          title="5-10% Moves"
          alerts={alerts.tier5}
          bgColor="bg-yellow-50"
          borderColor="border-yellow-200"
          textColor="text-yellow-800"
          emptyMessage="No 5-10% moves detected yet"
        />
      </main>
    </div>
  );
}

export default function Dashboard() {
  return (
    <ErrorBoundary>
      <DashboardContent />
    </ErrorBoundary>
  );
}
