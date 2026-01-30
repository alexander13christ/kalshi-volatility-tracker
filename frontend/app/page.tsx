"use client";

import { useEffect, useState } from "react";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

type Alert = {
  ticker: string;
  title: string;
  currentPrice: number;
  oldPrice: number;
  priceChange: number;
  direction: "up" | "down";
  timestamp: string;
  tier: number;
};

type AlertsByTier = {
  tier20: Alert[];
  tier10: Alert[];
  tier5: Alert[];
};

export default function Dashboard() {
  const [alerts, setAlerts] = useState<AlertsByTier | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("Loading...");

  useEffect(() => {
    setStatus(`Fetching from ${BACKEND_URL}...`);

    fetch(`${BACKEND_URL}/api/alerts`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        setAlerts(data);
        setStatus("Connected");
      })
      .catch(err => {
        setError(err.message);
        setStatus("Failed");
      });
  }, []);

  const total = alerts ? alerts.tier20.length + alerts.tier10.length + alerts.tier5.length : 0;

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h1>Kalshi Volatility Tracker</h1>
      <p>Backend: {BACKEND_URL}</p>
      <p>Status: {status}</p>
      {error && <p style={{ color: "red" }}>Error: {error}</p>}

      {alerts && (
        <div>
          <h2>Alerts ({total} total)</h2>

          <h3 style={{ color: "red" }}>20%+ Moves ({alerts.tier20.length})</h3>
          {alerts.tier20.map((a, i) => (
            <div key={i} style={{ border: "1px solid red", padding: "10px", margin: "5px" }}>
              <strong>{a.priceChange.toFixed(1)}%</strong> - {a.title}
            </div>
          ))}

          <h3 style={{ color: "orange" }}>10-20% Moves ({alerts.tier10.length})</h3>
          {alerts.tier10.map((a, i) => (
            <div key={i} style={{ border: "1px solid orange", padding: "10px", margin: "5px" }}>
              <strong>{a.priceChange.toFixed(1)}%</strong> - {a.title}
            </div>
          ))}

          <h3 style={{ color: "goldenrod" }}>5-10% Moves ({alerts.tier5.length})</h3>
          {alerts.tier5.map((a, i) => (
            <div key={i} style={{ border: "1px solid goldenrod", padding: "10px", margin: "5px" }}>
              <strong>{a.priceChange.toFixed(1)}%</strong> - {a.title}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
