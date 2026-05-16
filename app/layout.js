import './globals.css';

export const metadata = {
  title: 'PACT.Health — Coach Console',
  description: 'The always-on accountability layer. Your roster, your week, surfaced before Monday.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
