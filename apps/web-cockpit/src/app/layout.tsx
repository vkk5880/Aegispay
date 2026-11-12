import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/components/ThemeProvider';
import { UiModeProvider } from '@/context/UiModeContext';
import { AuthProvider } from '@/context/AuthContext';
import { CartProvider } from '@/context/CartContext';
import { Navbar } from '@/components/Navbar';
import { UserProfileSidebar } from '@/components/buyer/UserProfileSidebar';
import { GlobalCartDrawer } from '@/components/buyer/GlobalCartDrawer';

export const metadata: Metadata = {
  title: 'AegisPay — Smart Shopping Assistant & Savings',
  description: 'Smart Multi-Store Shopping, Instant Cashback & Verified Purchases Protected by PayPal',
  icons: {
    icon: 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🛡️</text></svg>',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const saved = localStorage.getItem('aegispay-theme') || 'system';
                const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                if (saved === 'dark' || (saved === 'system' && prefersDark)) {
                  document.documentElement.classList.add('dark');
                  document.documentElement.style.colorScheme = 'dark';
                } else {
                  document.documentElement.classList.remove('dark');
                  document.documentElement.style.colorScheme = 'light';
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body className="bg-slate-50 dark:bg-[#060b14] text-slate-900 dark:text-slate-100 antialiased min-h-screen flex flex-col transition-colors duration-200">
        <ThemeProvider>
          <UiModeProvider>
            <AuthProvider>
              <CartProvider>
                <Navbar />
                <div className="flex-1 flex flex-col">
                  {children}
                </div>
                <UserProfileSidebar />
                <GlobalCartDrawer />
              </CartProvider>
            </AuthProvider>
          </UiModeProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
