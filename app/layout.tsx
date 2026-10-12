import type { Metadata, Viewport } from "next";
import "./globals.css";
import { CHAT_APP_NAME } from "@/lib/chat-config";
export const metadata: Metadata = { title: `${CHAT_APP_NAME} — Creator Chat`, description: "A private chat-first workspace for recipe research and cooking content creation.", applicationName: CHAT_APP_NAME, manifest: "/manifest.webmanifest", icons: { icon: "/icon.svg", shortcut: "/icon.svg", apple: "/icon.svg" } };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#fafafa" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
