import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ChartBarIcon } from "lucide-react";

const inter = Inter({ subsets: ["latin"] });

const title = "Developer Metrics";

export const metadata: Metadata = {
  title: `${title} Dashboard`,
  description: "GitHub developer productivity metrics",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="flex min-h-screen flex-col bg-background">
          <header className="border-b">
            <div className="container mx-auto flex items-center justify-between px-4 py-4">
              <h1 className="flex items-center text-xl font-semibold">
                <ChartBarIcon className="mr-2 h-6 w-6 text-green-600" />
                {title}
              </h1>
              <nav className="flex gap-4">
                <a href="/" className="text-sm hover:text-primary">
                  Dashboard
                </a>
                <a href="/config" className="text-sm hover:text-primary">
                  Config
                </a>
                <a href="/changelog" className="text-sm hover:text-primary">
                  Changelog
                </a>
              </nav>
            </div>
          </header>
          <main className="container mx-auto flex-1 px-4 py-6">{children}</main>
          <footer className="mt-auto border-t">
            <div className="container mx-auto flex items-center justify-between px-4 py-4 text-sm text-muted-foreground">
              <div className="flex items-center">
                <ChartBarIcon className="mr-1 h-4 w-4 text-green-600" />
                <span className="mr-1 font-medium">devmetrics</span> v0.2.0
              </div>
              <div className="flex gap-4">
                <a href="/changelog" className="hover:text-primary">
                  Changelog
                </a>
                <a
                  href="https://github.com/yourusername/devmetrics"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary"
                >
                  GitHub
                </a>
              </div>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
