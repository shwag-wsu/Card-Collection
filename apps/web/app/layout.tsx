import type { Metadata } from "next";
import { ReactNode } from "react";
import "./globals.css";
import { AppHeader } from "../components/layout/AppHeader";
import { AppFooter } from "../components/layout/AppFooter";

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_APP_NAME || "Card Collection",
  description: "Self-hosted trading card collection MVP"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col p-6">
          <AppHeader />
          <main className="flex-1">{children}</main>
          <AppFooter />
        </div>
      </body>
    </html>
  );
}
