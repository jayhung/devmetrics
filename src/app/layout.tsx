import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

const title = "Developer Metrics";

export const metadata: Metadata = {
  title: `${title} Dashboard`,
  description: "GitHub developer productivity metrics",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="min-h-screen bg-background">
          <header className="border-b">
            <div className="container mx-auto px-4 py-4 flex items-center justify-between">
              <h1 className="text-xl font-semibold">{title}</h1>
              <nav className="flex gap-4">
                <a href="/" className="text-sm hover:text-primary">
                  Dashboard
                </a>
                <a href="/config" className="text-sm hover:text-primary">
                  Config
                </a>
              </nav>
            </div>
          </header>
          <main className="container mx-auto px-4 py-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
