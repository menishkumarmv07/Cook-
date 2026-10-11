import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Cooking Creator Studio", description: "Research recipes, plan complete cooking tutorials, and prepare creator-ready videos.", applicationName: "Cooking Creator Studio" };
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#173b2d" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
