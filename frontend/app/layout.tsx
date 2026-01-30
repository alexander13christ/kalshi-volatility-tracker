export const metadata = {
  title: "Kalshi Volatility Tracker",
  description: "Real-time prediction market volatility monitoring",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#f9fafb' }}>{children}</body>
    </html>
  );
}
