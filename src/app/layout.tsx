import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Providers } from "@/components/shell/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Tessera", template: "%s · Tessera" },
  description: "Plan, track and ship work together — projects, issues and sprints in one calm workspace.",
  icons: { icon: "/logo.svg" },
};
export const viewport: Viewport = { themeColor: [{ media: "(prefers-color-scheme: light)", color: "#faf9f7" }, { media: "(prefers-color-scheme: dark)", color: "#0f1115" }] };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-screen font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
