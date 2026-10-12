import type { MetadataRoute } from "next";
import { CHAT_APP_NAME } from "@/lib/chat-config";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: CHAT_APP_NAME,
    short_name: CHAT_APP_NAME,
    description: "A private chat-first workspace for recipe research and cooking content creation.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#fafafa",
    theme_color: "#fafafa",
    categories: ["food", "lifestyle", "productivity"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" }
    ]
  };
}
