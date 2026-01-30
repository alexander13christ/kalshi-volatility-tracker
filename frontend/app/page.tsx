const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";
const BUILD_TIME = new Date().toISOString();

export default async function Dashboard() {
  let alerts = null;
  let error = null;

  try {
    const res = await fetch(`${BACKEND_URL}/api/alerts`, { cache: 'no-store' });
    if (res.ok) {
      alerts = await res.json();
    } else {
      error = `HTTP ${res.status}`;
    }
  } catch (e) {
    error = e instanceof Error ? e.message : 'Unknown error';
  }

  const total = alerts ? alerts.tier20.length + alerts.tier10.length + alerts.tier5.length : 0;

  return (
    <div style={{ padding: 20, fontFamily: 'system-ui' }}>
      <h1>Kalshi Volatility Tracker</h1>
      <p><strong>Build:</strong> {BUILD_TIME}</p>
      <p><strong>Backend:</strong> {BACKEND_URL}</p>
      <p><strong>Status:</strong> {error ? `Error: ${error}` : `OK - ${total} alerts`}</p>

      {alerts && (
        <>
          <h2 style={{ color: 'red', marginTop: 20 }}>20%+ Moves ({alerts.tier20.length})</h2>
          {alerts.tier20.map((a: any, i: number) => (
            <div key={i} style={{ border: '2px solid red', padding: 10, margin: 5, borderRadius: 8 }}>
              <strong>{a.priceChange.toFixed(1)}%</strong> {a.direction === 'up' ? '↑' : '↓'} - {a.title}
            </div>
          ))}

          <h2 style={{ color: 'orange', marginTop: 20 }}>10-20% Moves ({alerts.tier10.length})</h2>
          {alerts.tier10.map((a: any, i: number) => (
            <div key={i} style={{ border: '2px solid orange', padding: 10, margin: 5, borderRadius: 8 }}>
              <strong>{a.priceChange.toFixed(1)}%</strong> {a.direction === 'up' ? '↑' : '↓'} - {a.title}
            </div>
          ))}

          <h2 style={{ color: 'goldenrod', marginTop: 20 }}>5-10% Moves ({alerts.tier5.length})</h2>
          {alerts.tier5.map((a: any, i: number) => (
            <div key={i} style={{ border: '2px solid goldenrod', padding: 10, margin: 5, borderRadius: 8 }}>
              <strong>{a.priceChange.toFixed(1)}%</strong> {a.direction === 'up' ? '↑' : '↓'} - {a.title}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
