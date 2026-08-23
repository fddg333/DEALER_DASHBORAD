export const metadata = {
  title: 'BM Tiles - Dealer Dashboard',
  description: 'Dealer purchases and pending payments tracker',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#f5f4f0', fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif', color: '#1f1e1b' }}>
        {children}
      </body>
    </html>
  );
}
