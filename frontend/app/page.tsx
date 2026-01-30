export const dynamic = 'force-dynamic';
export const revalidate = 0;

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

export default async function Dashboard() {
  let alerts = null;
  let error = null;

  try {
    const res = await fetch(`${BACKEND_URL}/api/alerts`, {
      cache: 'no-store',
      next: { revalidate: 0 }
    });
    if (res.ok) {
      alerts = await res.json();
    } else {
      error = `HTTP ${res.status}`;
    }
  } catch (e) {
    error = e instanceof Error ? e.message : 'Fetch failed';
  }

  const total = alerts ? alerts.tier20.length + alerts.tier10.length + alerts.tier5.length : 0;

  return (
    <div style={{ padding: 20, fontFamily: 'system-ui', maxWidth: 1200, margin: '0 auto' }}>
      <h1 style={{ fontSize: 28, marginBottom: 10 }}>Kalshi Volatility Tracker</h1>
      <p style={{ color: '#666', marginBottom: 5 }}>Backend: {BACKEND_URL}</p>
      <p style={{ color: error ? 'red' : 'green', marginBottom: 20 }}>
        {error ? `Error: ${error}` : `Connected - ${total} alerts`}
      </p>

      {alerts && (
        <>
          <section style={{ background: '#fee2e2', padding: 20, borderRadius: 12, marginBottom: 20 }}>
            <h2 style={{ color: '#991b1b', marginBottom: 15 }}>20%+ Moves ({alerts.tier20.length})</h2>
            {alerts.tier20.length === 0 ? (
              <p style={{ color: '#666' }}>No 20%+ moves detected yet</p>
            ) : (
              alerts.tier20.map((a: any, i: number) => (
                <div key={i} style={{ background: 'white', border: '2px solid #dc2626', padding: 15, marginBottom: 10, borderRadius: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: '#666' }}>{a.ticker?.substring(0, 25)}...</span>
                    <span style={{ fontSize: 18, fontWeight: 'bold', color: a.direction === 'up' ? '#16a34a' : '#dc2626' }}>
                      {a.direction === 'up' ? '+' : ''}{a.priceChange?.toFixed(1)}%
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: 14 }}>{a.title}</p>
                </div>
              ))
            )}
          </section>

          <section style={{ background: '#ffedd5', padding: 20, borderRadius: 12, marginBottom: 20 }}>
            <h2 style={{ color: '#9a3412', marginBottom: 15 }}>10-20% Moves ({alerts.tier10.length})</h2>
            {alerts.tier10.length === 0 ? (
              <p style={{ color: '#666' }}>No 10-20% moves detected yet</p>
            ) : (
              alerts.tier10.map((a: any, i: number) => (
                <div key={i} style={{ background: 'white', border: '2px solid #ea580c', padding: 15, marginBottom: 10, borderRadius: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: '#666' }}>{a.ticker?.substring(0, 25)}...</span>
                    <span style={{ fontSize: 18, fontWeight: 'bold', color: a.direction === 'up' ? '#16a34a' : '#dc2626' }}>
                      {a.direction === 'up' ? '+' : ''}{a.priceChange?.toFixed(1)}%
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: 14 }}>{a.title}</p>
                </div>
              ))
            )}
          </section>

          <section style={{ background: '#fef9c3', padding: 20, borderRadius: 12 }}>
            <h2 style={{ color: '#854d0e', marginBottom: 15 }}>5-10% Moves ({alerts.tier5.length})</h2>
            {alerts.tier5.length === 0 ? (
              <p style={{ color: '#666' }}>No 5-10% moves detected yet</p>
            ) : (
              alerts.tier5.map((a: any, i: number) => (
                <div key={i} style={{ background: 'white', border: '2px solid #ca8a04', padding: 15, marginBottom: 10, borderRadius: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 12, color: '#666' }}>{a.ticker?.substring(0, 25)}...</span>
                    <span style={{ fontSize: 18, fontWeight: 'bold', color: a.direction === 'up' ? '#16a34a' : '#dc2626' }}>
                      {a.direction === 'up' ? '+' : ''}{a.priceChange?.toFixed(1)}%
                    </span>
                  </div>
                  <p style={{ margin: 0, fontSize: 14 }}>{a.title}</p>
                </div>
              ))
            )}
          </section>
        </>
      )}
    </div>
  );
}
