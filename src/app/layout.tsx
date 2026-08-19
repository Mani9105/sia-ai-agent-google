import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SIA AI Agent | AI Sales Automation Platform',
  description: 'Production-grade AI sales automation platform with Google Gemini & Gmail API',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
