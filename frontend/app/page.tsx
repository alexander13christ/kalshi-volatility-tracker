"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

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

type OrderBookLevel = {
  price: number;
  quantity: number;
};

type MarketDetail = {
  market: {
    ticker: string;
    title: string;
    subtitle: string;
    yes_bid: number;
    yes_ask: number;
    no_bid: number;
    no_ask: number;
    volume: number;
    open_interest: number;
  };
  orderbook: {
    yes: OrderBookLevel[];
    no: OrderBookLevel[];
  };
};

type Candlestick = {
  end_period_ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export default function Dashboard() {
  const [alerts, setAlerts] = useState<AlertsByTier>({
    tier20: [],
    tier10: [],
    tier5: [],
  });
  const [connected, setConnected] = useState(false);
  const [selectedAlert, setSelectedAlert] = useState<Alert | null>(null);
  const [marketDetail, setMarketDetail] = useState<MarketDetail | null>(null);
  const [candlesticks, setCandlesticks] = useState<Candlestick[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  // Connect to WebSocket
  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket(`${BACKEND_URL.replace("http", "ws")}/ws`);

      ws.onopen = () => {
        console.log("WebSocket connected");
        setConnected(true);
      };

      ws.onmessage = (event) => {
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
      };

      ws.onclose = () => {
        console.log("WebSocket disconnected, reconnecting...");
        setConnected(false);
        setTimeout(connect, 3000);
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
      };

      wsRef.current = ws;
    };

    connect();

    return () => {
      wsRef.current?.close();
    };
  }, []);

  // Fetch market details when alert is clicked
  const fetchMarketDetail = useCallback(async (ticker: string) => {
    setLoadingDetail(true);
    try {
      const [marketRes, historyRes] = await Promise.all([
        fetch(`${BACKEND_URL}/api/market/${ticker}`),
        fetch(`${BACKEND_URL}/api/market/${ticker}/history`),
      ]);

      if (marketRes.ok) {
        const data = await marketRes.json();
        setMarketDetail(data);
      }

      if (historyRes.ok) {
        const data = await historyRes.json();
        setCandlesticks(data.candlesticks || []);
      }
    } catch (error) {
      console.error("Error fetching market detail:", error);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  const handleAlertClick = (alert: Alert) => {
    setSelectedAlert(alert);
    fetchMarketDetail(alert.ticker);
  };

  const closeDetail = () => {
    setSelectedAlert(null);
    setMarketDetail(null);
    setCandlesticks([]);
  };

  // Format candlestick data for chart
  const chartData = candlesticks.map((c) => ({
    time: new Date(c.end_period_ts * 1000).toLocaleDateString(),
    price: c.close / 100,
    volume: c.volume,
    high: c.high / 100,
    low: c.low / 100,
  }));

  // Format order book data for chart
  const orderbookData = marketDetail
    ? [
        ...marketDetail.orderbook.yes.map((level) => ({
          price: level.price / 100,
          yes: level.quantity,
          no: 0,
        })),
        ...marketDetail.orderbook.no.map((level) => ({
          price: level.price / 100,
          yes: 0,
          no: level.quantity,
        })),
      ].sort((a, b) => a.price - b.price)
    : [];

  const totalAlerts = alerts.tier20.length + alerts.tier10.length + alerts.tier5.length;

  // Alert card component
  const AlertCard = ({ alert, borderColor }: { alert: Alert; borderColor: string }) => (
    <button
      onClick={() => handleAlertClick(alert)}
      className={`bg-white border-2 rounded-lg p-4 text-left transition hover:shadow-md ${borderColor}`}
    >
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs font-mono text-gray-500">{alert.ticker}</span>
        <span
          className={`text-lg font-bold ${
            alert.direction === "up" ? "text-green-600" : "text-red-600"
          }`}
        >
          {alert.direction === "up" ? "+" : ""}
          {alert.priceChange.toFixed(1)}%
        </span>
      </div>
      <p className="text-sm text-gray-900 font-medium line-clamp-2 mb-2">
        {alert.title}
      </p>
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>
          {(alert.oldPrice * 100).toFixed(0)}c → {(alert.currentPrice * 100).toFixed(0)}c
        </span>
        <span>{new Date(alert.timestamp).toLocaleTimeString()}</span>
      </div>
    </button>
  );

  // Alert section component
  const AlertSection = ({
    title,
    alerts,
    bgColor,
    borderColor,
    textColor,
    emptyMessage,
  }: {
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
          {alerts.map((alert) => (
            <AlertCard key={`${alert.ticker}-${alert.timestamp}`} alert={alert} borderColor={borderColor} />
          ))}
        </div>
      )}
    </section>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Kalshi Volatility Tracker
            </h1>
            <p className="text-gray-500 text-sm">
              Monitoring price movements in 12-hour window
            </p>
          </div>
          <div className="flex items-center gap-4">
            <span
              className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
                connected
                  ? "bg-green-100 text-green-700"
                  : "bg-red-100 text-red-700"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  connected ? "bg-green-500" : "bg-red-500"
                }`}
              />
              {connected ? "Live" : "Disconnected"}
            </span>
            <span className="text-gray-500 text-sm">
              {totalAlerts} total alert{totalAlerts !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        {/* 20%+ Moves - Red/Critical */}
        <AlertSection
          title="20%+ Moves"
          alerts={alerts.tier20}
          bgColor="bg-red-50"
          borderColor="border-red-200"
          textColor="text-red-800"
          emptyMessage="No 20%+ moves detected yet"
        />

        {/* 10-20% Moves - Orange/Warning */}
        <AlertSection
          title="10-20% Moves"
          alerts={alerts.tier10}
          bgColor="bg-orange-50"
          borderColor="border-orange-200"
          textColor="text-orange-800"
          emptyMessage="No 10-20% moves detected yet"
        />

        {/* 5-10% Moves - Yellow/Info */}
        <AlertSection
          title="5-10% Moves"
          alerts={alerts.tier5}
          bgColor="bg-yellow-50"
          borderColor="border-yellow-200"
          textColor="text-yellow-800"
          emptyMessage="No 5-10% moves detected yet"
        />

        {/* Market Detail Modal */}
        {selectedAlert && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              {/* Modal Header */}
              <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-start justify-between">
                <div>
                  <span className="text-xs font-mono text-gray-500">
                    {selectedAlert.ticker}
                  </span>
                  <h3 className="text-xl font-bold text-gray-900">
                    {selectedAlert.title}
                  </h3>
                  <span
                    className={`inline-block mt-1 px-2 py-0.5 rounded text-sm font-medium ${
                      selectedAlert.direction === "up"
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {selectedAlert.direction === "up" ? "+" : ""}
                    {selectedAlert.priceChange.toFixed(1)}% in 12h
                  </span>
                </div>
                <button
                  onClick={closeDetail}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  &times;
                </button>
              </div>

              {loadingDetail ? (
                <div className="p-8 text-center text-gray-500">
                  Loading market data...
                </div>
              ) : (
                <div className="p-6 space-y-6">
                  {/* Liquidity Stats */}
                  {marketDetail && (
                    <div>
                      <h4 className="text-lg font-semibold text-gray-900 mb-3">
                        Liquidity Stats
                      </h4>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs text-gray-500">Best Yes Bid</p>
                          <p className="text-lg font-bold text-green-600">
                            {marketDetail.market.yes_bid
                              ? `${marketDetail.market.yes_bid}c`
                              : "-"}
                          </p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs text-gray-500">Best Yes Ask</p>
                          <p className="text-lg font-bold text-red-600">
                            {marketDetail.market.yes_ask
                              ? `${marketDetail.market.yes_ask}c`
                              : "-"}
                          </p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs text-gray-500">Spread</p>
                          <p className="text-lg font-bold">
                            {marketDetail.market.yes_ask &&
                            marketDetail.market.yes_bid
                              ? `${marketDetail.market.yes_ask - marketDetail.market.yes_bid}c`
                              : "-"}
                          </p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3">
                          <p className="text-xs text-gray-500">Volume</p>
                          <p className="text-lg font-bold">
                            {marketDetail.market.volume?.toLocaleString() || "-"}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Order Book Depth */}
                  {orderbookData.length > 0 && (
                    <div>
                      <h4 className="text-lg font-semibold text-gray-900 mb-3">
                        Order Book Depth
                      </h4>
                      <div className="bg-gray-50 rounded-lg p-4">
                        <ResponsiveContainer width="100%" height={200}>
                          <BarChart data={orderbookData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis
                              dataKey="price"
                              tickFormatter={(v) => `${(v * 100).toFixed(0)}c`}
                            />
                            <YAxis />
                            <Tooltip
                              formatter={(value: number, name: string) => [
                                value,
                                name === "yes" ? "Yes Orders" : "No Orders",
                              ]}
                            />
                            <Bar dataKey="yes" fill="#22c55e" name="yes" />
                            <Bar dataKey="no" fill="#ef4444" name="no" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* Historical Price Chart */}
                  {chartData.length > 0 && (
                    <div>
                      <h4 className="text-lg font-semibold text-gray-900 mb-3">
                        7-Day Price History
                      </h4>
                      <div className="bg-gray-50 rounded-lg p-4">
                        <ResponsiveContainer width="100%" height={250}>
                          <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="time" />
                            <YAxis
                              domain={[0, 1]}
                              tickFormatter={(v) => `${(v * 100).toFixed(0)}c`}
                            />
                            <Tooltip
                              formatter={(value: number) => [
                                `${(value * 100).toFixed(1)}c`,
                                "Price",
                              ]}
                            />
                            <Line
                              type="monotone"
                              dataKey="price"
                              stroke="#3b82f6"
                              strokeWidth={2}
                              dot={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* Volume History */}
                  {chartData.length > 0 && (
                    <div>
                      <h4 className="text-lg font-semibold text-gray-900 mb-3">
                        7-Day Volume History
                      </h4>
                      <div className="bg-gray-50 rounded-lg p-4">
                        <ResponsiveContainer width="100%" height={150}>
                          <BarChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="time" />
                            <YAxis />
                            <Tooltip
                              formatter={(value: number) => [
                                value.toLocaleString(),
                                "Volume",
                              ]}
                            />
                            <Bar dataKey="volume" fill="#8b5cf6" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {chartData.length === 0 && !loadingDetail && (
                    <p className="text-gray-500 text-center py-4">
                      No historical data available for this market
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
