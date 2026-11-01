import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AegisPay — Autonomous Dual-Sided Commerce Cockpit',
  description: 'Cryptographic Spend Mandates, Knapsack Cart Optimizer & Synthetic Intent Clearinghouse',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#060b14] text-slate-100 antialiased min-h-screen">
        {children}
      </body>
    </html>
  );
}
