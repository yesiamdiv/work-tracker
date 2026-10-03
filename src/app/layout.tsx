import type { Metadata, Viewport } from "next";

import { Nav } from "@/components/nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Work Tracker",
  description: "A record of work done — tasks, events, and every reference kept.",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg">
        <Nav />
        <main className="mx-auto w-full max-w-5xl px-6 pb-32 pt-9 sm:px-8">
          {children}
        </main>
      </body>
    </html>
  );
}
