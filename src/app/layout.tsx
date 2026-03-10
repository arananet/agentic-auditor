import type { Metadata } from "next";
import { Space_Mono } from "next/font/google";
import "./globals.css";

const mono = Space_Mono({ weight: ["400", "700"], subsets: ["latin"], variable: "--font-mono" });

export const metadata: Metadata = {
  title: "AGENTIC_AUDITOR",
  description: "High-fidelity AI readiness check",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${mono.variable}`}>
      <body className="antialiased bg-[#0A0A0A]">{children}</body>
    </html>
  );
}
