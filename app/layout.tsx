import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "cooking — Creator Chat", description: "A private chat-first workspace for recipe research and cooking content creation.", applicationName: "cooking", manifest: "/manifest.webmanifest", icons: { icon: "/icon.svg", shortcut: "/icon.svg", apple: "/icon.svg" } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#fafafa" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
