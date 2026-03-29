import type { Metadata } from "next";
import { ReactNode } from "react";

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_APP_NAME || "Card Collection",
  description: "Self-hosted trading card collection MVP"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "Arial, sans-serif", margin: 0, padding: "2rem" }}>{children}</body>
    </html>
  );
}
