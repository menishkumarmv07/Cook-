import type { LucideIcon } from "lucide-react";
import { Headphones, Image as ImageIcon, Pencil, Plug, BookOpen, Settings2, Search, MessageSquarePlus } from "lucide-react";

export const CHAT_APP_NAME = "cooking";

export const CHAT_TITLES = {
  newChat: "New chat",
  recipeResearch: "Recipe research",
  socialConnections: "Connected apps",
  recipeWorkspace: "Recipe workspace",
  settings: "Settings",
} as const;

export type ChatMenuItem = {
  id: string;
  label: string;
  icon: LucideIcon;
  description?: string;
};

export const CHAT_MENU_ITEMS: ChatMenuItem[] = [
  { id: "new-chat", label: "New chat", icon: MessageSquarePlus },
  { id: "connections", label: "Connect apps", icon: Plug, description: "Official account connections" },
  { id: "workspace", label: "Recipe workspace", icon: BookOpen, description: "Your saved recipe drafts" },
  { id: "research", label: "Research links", icon: Search, description: "Review recipe sources" },
  { id: "settings", label: "Settings", icon: Settings2 },
];

export const CHAT_SUGGESTIONS: Array<{ id: string; label: string; icon: LucideIcon; prompt: string }> = [
  { id: "voice", label: "Start a voice chat", icon: Headphones, prompt: "__voice__" },
  { id: "image", label: "Create an image or sticker", icon: ImageIcon, prompt: "Help me plan a cooking image or sticker." },
  { id: "write", label: "Write or edit", icon: Pencil, prompt: "Help me write or edit a cooking post." },
];
