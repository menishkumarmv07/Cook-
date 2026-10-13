import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./composer-layout-fix.css";
export const metadata: Metadata = { title: "Cooking Creator", description: "AI Cooking Content App — research recipes, plan tutorials, and prepare creator-ready content.", applicationName: "Cooking Creator", manifest: "/manifest.webmanifest", icons: { icon: "/icon.svg", shortcut: "/icon.svg", apple: "/icon.svg" } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#B95738" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
