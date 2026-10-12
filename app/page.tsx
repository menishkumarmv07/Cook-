"use client";

import { useEffect, useRef, useState, type FormEvent, type TouchEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowUp, AudioLines, ChevronRight, ExternalLink, Facebook, Instagram, Link2, Menu,
  MessageSquare, Mic, MoreHorizontal, Plus, Search, ShieldCheck, Sparkles, Youtube, X,
  Plug, BookOpen, Clapperboard, type LucideIcon,
} from "lucide-react";
import { CHAT_APP_NAME, CHAT_MENU_ITEMS, CHAT_SUGGESTIONS } from "@/lib/chat-config";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  link?: string;
  linkLabel?: string;
};

type ChatThread = {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
};

const CHAT_HISTORY_KEY = "cooking-chat-history-v1";
const MAX_SAVED_CHAT_THREADS = 12;
const MAX_MESSAGES_PER_THREAD = 40;
const MAX_SAVED_MESSAGE_LENGTH = 5000;

type SocialPlatform = {
  id: string;
  name: string;
  detail: string;
  icon: LucideIcon;
};

const SOCIAL_PLATFORMS: SocialPlatform[] = [
  { id: "youtube", name: "YouTube", detail: "Video links, channel-owned content and permitted public metadata.", icon: Youtube },
  { id: "instagram", name: "Instagram", detail: "Reels and cooking posts, subject to Meta API access and account permissions.", icon: Instagram },
  { id: "tiktok", name: "TikTok", detail: "Creator account connection and permitted video metadata.", icon: Clapperboard },
  { id: "facebook", name: "Facebook", detail: "Pages and video content available to the approved integration.", icon: Facebook },
];

const PENDING_SOURCE_KEY = "cooking-pending-source-url-v1";
const PENDING_RECIPE_PROMPT_KEY = "cooking-pending-recipe-prompt-v1";

function findHttpUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>"']+/i);
  if (!match) return null;
  const cleaned = match[0].replace(/[),.!?]+$/, "");
  try {
    const url = new URL(cleaned);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function sanitizeSavedMessage(value: unknown): ChatMessage | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.id !== "string" || candidate.id.length > 120 ||
    (candidate.role !== "user" && candidate.role !== "assistant") ||
    typeof candidate.text !== "string" || candidate.text.length === 0
  ) return null;

  const safeLink = typeof candidate.link === "string" ? findHttpUrl(candidate.link) : null;
  const link = safeLink && safeLink === candidate.link ? safeLink : undefined;
  return {
    id: candidate.id,
    role: candidate.role,
    text: candidate.text.slice(0, MAX_SAVED_MESSAGE_LENGTH),
    ...(link ? { link } : {}),
    ...(link && typeof candidate.linkLabel === "string" ? { linkLabel: candidate.linkLabel.slice(0, 100) } : {}),
  };
}

function parseSavedChatHistory(raw: string | null): ChatThread[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const threads: ChatThread[] = [];
  for (const item of parsed) {
    if (typeof item !== "object" || item === null) continue;
    const candidate = item as Record<string, unknown>;
    if (
      typeof candidate.id !== "string" || candidate.id.length > 120 ||
      typeof candidate.title !== "string" || !Array.isArray(candidate.messages) ||
      typeof candidate.updatedAt !== "number" || !Number.isFinite(candidate.updatedAt)
    ) continue;

    const messages = candidate.messages
      .map(sanitizeSavedMessage)
      .filter((message): message is ChatMessage => message !== null)
      .slice(-MAX_MESSAGES_PER_THREAD);
    if (!messages.some((message) => message.role === "user")) continue;

    const firstUserMessage = messages.find((message) => message.role === "user")?.text ?? "New chat";
    threads.push({
      id: candidate.id,
      title: firstUserMessage.trim().slice(0, 48) || "New chat",
      updatedAt: candidate.updatedAt,
      messages,
    });
  }
  return threads.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_SAVED_CHAT_THREADS);
}

function sourcePlatform(url: string): string {
  const host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  if (host === "youtube.com" || host === "youtu.be" || host.endsWith(".youtube.com")) return "YouTube";
  if (host === "instagram.com" || host.endsWith(".instagram.com")) return "Instagram";
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "TikTok";
  if (host === "facebook.com" || host.endsWith(".facebook.com") || host === "fb.watch") return "Facebook";
  return "web";
}

export default function ChatHome() {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatHistory, setChatHistory] = useState<ChatThread[]>([]);
  const [chatHistoryReady, setChatHistoryReady] = useState(false);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [clearHistoryPrompt, setClearHistoryPrompt] = useState(false);
  const [activeView, setActiveView] = useState<"chat" | "connections" | "settings">("chat");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [themeReady, setThemeReady] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [attachOpen, setAttachOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [connectInfo, setConnectInfo] = useState<string | null>(null);
  const [plusInfo, setPlusInfo] = useState(false);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const drawerButtonRef = useRef<HTMLButtonElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const hasText = draft.trim().length > 0;

  useEffect(() => {
    try {
      setChatHistory(parseSavedChatHistory(window.localStorage.getItem(CHAT_HISTORY_KEY)));
    } catch {
      setNotice("Saved chat history could not be read from this browser.");
    } finally {
      setChatHistoryReady(true);
    }
  }, []);

  useEffect(() => {
    if (!chatHistoryReady) return;
    try {
      window.localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(chatHistory));
    } catch {
      setNotice("Browser storage may be full; recent chat history could not be saved. Recipe drafts are stored separately.");
    }
  }, [chatHistory, chatHistoryReady]);

  useEffect(() => {
    try {
      const savedTheme = window.localStorage.getItem("cooking-creator-theme-v1");
      if (savedTheme === "light" || savedTheme === "dark") setTheme(savedTheme);
    } catch {
      // Light theme remains the default if browser storage is unavailable.
    } finally {
      setThemeReady(true);
    }
  }, []);

  useEffect(() => {
    if (!themeReady) return;
    try {
      window.localStorage.setItem("cooking-creator-theme-v1", theme);
    } catch {
      // Theme preference is optional; the UI remains usable without storage.
    }
  }, [theme, themeReady]);

  useEffect(() => {
    if (!drawerOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawerOpen(false);
        drawerButtonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [drawerOpen]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  function startNewChat() {
    setMessages([]);
    setActiveThreadId(null);
    setDraft("");
    setNotice("");
    setActiveView("chat");
    setDrawerOpen(false);
    setAttachOpen(false);
    setConnectInfo(null);
    inputRef.current?.focus();
  }

  function saveMessages(nextMessages: ChatMessage[]) {
    const threadId = activeThreadId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const safeMessages = nextMessages.slice(-MAX_MESSAGES_PER_THREAD);
    const firstUserMessage = safeMessages.find((message) => message.role === "user")?.text ?? "New chat";
    const existing = chatHistory.find((thread) => thread.id === threadId);
    const thread: ChatThread = {
      id: threadId,
      title: existing?.title ?? (firstUserMessage.trim().slice(0, 48) || "New chat"),
      updatedAt: Date.now(),
      messages: safeMessages,
    };
    setMessages(safeMessages);
    setActiveThreadId(threadId);
    setChatHistory((history) => [
      thread,
      ...history.filter((savedThread) => savedThread.id !== threadId),
    ].slice(0, MAX_SAVED_CHAT_THREADS));
  }

  function openChatThread(thread: ChatThread) {
    setMessages(thread.messages);
    setActiveThreadId(thread.id);
    setActiveView("chat");
    setDrawerOpen(false);
    setNotice("");
    setAttachOpen(false);
    setConnectInfo(null);
  }

  function clearSavedChatHistory() {
    setChatHistory([]);
    setMessages([]);
    setActiveThreadId(null);
    setClearHistoryPrompt(false);
    setNotice("Chat history has been cleared from this browser.");
  }

  function sendMessage(value = draft) {
    const text = value.trim();
    if (!text) return;
    const link = findHttpUrl(text);
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const next: ChatMessage[] = [{ id: `${id}-u`, role: "user", text }];
    let response = "I’ve got your instruction. Recipe research, script planning and creator tools are being built into this private workspace. This screen is currently a chat interface prototype, so it does not yet call an AI model or perform tasks automatically.";
    let responseLink: string | undefined;
    let responseLabel: string | undefined;

    if (link) {
      const platform = sourcePlatform(link);
      response = platform === "web"
        ? "I found a web link in your message. I can keep it as a source for you to open, but this version does not fetch the page or verify its contents yet. Automatic source inspection will be added through supported integrations."
        : `I recognized this as a ${platform} link. The link is ready to open, but this build does not yet use your signed-in ${platform} account to inspect the video, Reel, captions, or private/account-only content. The official account connection and permitted media-analysis flow still need to be implemented. Do not enter your social-media password into this app.`;
      responseLink = link;
      responseLabel = `Open ${platform === "web" ? "source link" : platform + " link"}`;
    } else if (/connect|instagram|youtube|social account|account/i.test(text)) {
      response = "Open the menu and choose Connect apps to review the planned official account connections. No account is connected in this build yet, and I will not ask you for a social-media password.";
    } else if (/new recipe|recipe draft|start recipe/i.test(text)) {
      response = "I’ll carry your instruction into the Recipe notes field so you can structure it there. This version does not automatically turn chat text into a complete recipe draft.";
      next.push({ id: `${id}-a`, role: "assistant", text: response });
      saveMessages([...messages, ...next]);
      setDraft("");
      if (text.length > 5000) {
        setNotice("This request is longer than the Recipe notes field can hold (5,000 characters). Shorten it and try again.");
        return;
      }
      try {
        window.sessionStorage.setItem(PENDING_RECIPE_PROMPT_KEY, text);
        router.push("/workspace");
      } catch {
        setNotice("Temporary note transfer is blocked by this browser. Copy your request before opening the recipe workspace.");
      }
      return;
    }

    next.push({ id: `${id}-a`, role: "assistant", text: response, link: responseLink, linkLabel: responseLabel });
    saveMessages([...messages, ...next]);
    setDraft("");
    setNotice("");
    setAttachOpen(false);
    setActiveView("chat");
  }

  async function lockWorkspace() {
    setDrawerOpen(false);
    try {
      window.sessionStorage.removeItem(PENDING_SOURCE_KEY);
      window.sessionStorage.removeItem(PENDING_RECIPE_PROMPT_KEY);
    } catch {
      // Continue with server-side logout even if browser storage is unavailable.
    }
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) {
        setNotice("The session could not be locked. Please retry while connected.");
        return;
      }
      window.location.replace("/login");
    } catch {
      setNotice("The app could not confirm that the session ended. Stay connected and retry Lock workspace.");
    }
  }

  function saveLinkToWorkspace(link: string) {
    const url = findHttpUrl(link);
    if (!url) {
      setNotice("That source link could not be validated. Copy it into the workspace URL field and review it before using it.");
      return;
    }
    try {
      // Session storage keeps the handoff out of browser URL history and server logs.
      // The workspace still stores the value locally and does not fetch the page.
      window.sessionStorage.setItem(PENDING_SOURCE_KEY, url);
      router.push("/workspace");
    } catch {
      setNotice("Your browser blocked temporary link handoff. Copy the URL into the workspace’s Video or recipe URL field instead.");
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendMessage();
  }

  function chooseSuggestion(prompt: string) {
    if (prompt === "__voice__") {
      setNotice("Voice chat is not connected in this V1 yet. You can type your instruction or paste a link below.");
      inputRef.current?.focus();
      return;
    }
    setDraft(prompt);
    inputRef.current?.focus();
  }

  function selectMenuItem(id: string) {
    if (id === "new-chat") {
      startNewChat();
      return;
    }
    if (id === "connections") {
      setActiveView("connections");
      setDrawerOpen(false);
      setConnectInfo(null);
      return;
    }
    if (id === "workspace") {
      setDrawerOpen(false);
      router.push("/workspace");
      return;
    }
    if (id === "research") {
      setDrawerOpen(false);
      setDraft("Help me research this recipe and compare sources: ");
      inputRef.current?.focus();
      return;
    }
    if (id === "settings") {
      setDrawerOpen(false);
      setActiveView("settings");
      setConnectInfo(null);
      setNotice("");
      return;
    }
  }

  function handleTouchEnd(event: TouchEvent<HTMLElement>) {
    if (touchStartX === null) return;
    const endX = event.changedTouches[0]?.clientX ?? touchStartX;
    if (drawerOpen && touchStartX - endX > 55) setDrawerOpen(false);
    if (!drawerOpen && endX - touchStartX > 75 && touchStartX < 28) setDrawerOpen(true);
    setTouchStartX(null);
  }

  return (
    <main
      className="chat-app"
      data-theme={theme}
      onTouchStart={(event) => setTouchStartX(event.touches[0]?.clientX ?? null)}
      onTouchEnd={handleTouchEnd}
    >
      <section className="chat-phone" aria-label="Cooking chat workspace">
        <div className="chat-screen-glow" aria-hidden="true" />
        <header className="chat-header">
          <div className="chat-header-left">
            <button ref={drawerButtonRef} className="chat-round-button" type="button" aria-label="Open menu" aria-expanded={drawerOpen} onClick={() => setDrawerOpen(true)}>
              <Menu size={25} strokeWidth={2.4} />
            </button>
            <button className="chat-plus-pill" type="button" onClick={() => setPlusInfo(true)}>
              <Sparkles size={19} strokeWidth={2.2} />
              <span>Get Plus</span>
            </button>
          </div>
          <button className="chat-round-button chat-new-button" type="button" aria-label="New chat" onClick={startNewChat}>
            <MessageSquare size={21} strokeWidth={2.1} />
            <span className="chat-new-dot" aria-hidden="true" />
          </button>
        </header>

        {activeView === "chat" ? (
          <>
            <section className={messages.length ? "chat-messages has-messages" : "chat-messages"} aria-live="polite" aria-label="Conversation">
              {messages.map((message) => (
                <article key={message.id} className={message.role === "user" ? "chat-message user-message" : "chat-message assistant-message"}>
                  {message.role === "assistant" && <div className="assistant-avatar" aria-hidden="true"><Sparkles size={16} /></div>}
                  <div className="chat-message-content">
                    <p>{message.text}</p>
                    {message.link && (
                      <>
                        <a className="chat-source-link" href={message.link} target="_blank" rel="noreferrer">
                          <ExternalLink size={15} /> {message.linkLabel ?? "Open source"}
                        </a>
                        <button className="chat-source-transfer" type="button" onClick={() => saveLinkToWorkspace(message.link ?? "")}>
                          Add link to recipe workspace
                        </button>
                      </>
                    )}
                  </div>
                </article>
              ))}
              <div ref={bottomRef} />
            </section>

            {messages.length === 0 && (
              <section className="chat-suggestions" aria-label="Suggestions">
                {CHAT_SUGGESTIONS.map((suggestion) => {
                  const Icon = suggestion.icon;
                  return (
                    <button key={suggestion.id} className="chat-suggestion" type="button" onClick={() => chooseSuggestion(suggestion.prompt)}>
                      <Icon size={23} strokeWidth={1.9} />
                      <span>{suggestion.label}</span>
                    </button>
                  );
                })}
              </section>
            )}

            {notice && <div className="chat-notice" role="status"><span>{notice}</span><button type="button" aria-label="Dismiss message" onClick={() => setNotice("")}><X size={16} /></button></div>}

            <div className="chat-composer-wrap">
              {attachOpen && (
                <div className="chat-attach-menu">
                  <button type="button" onClick={() => { setAttachOpen(false); inputRef.current?.focus(); setNotice("Paste a YouTube, Instagram, recipe-page or other HTTPS link in the message box. This build can open links but does not inspect them automatically yet."); }}>
                    <Link2 size={18} /><span><strong>Add a link</strong><small>YouTube, Instagram, recipe page</small></span>
                  </button>
                  <button type="button" onClick={() => { setAttachOpen(false); router.push("/workspace"); }}>
                    <BookOpen size={18} /><span><strong>Recipe workspace</strong><small>Open saved recipe tools</small></span>
                  </button>
                  <button type="button" onClick={() => { setAttachOpen(false); setActiveView("connections"); }}>
                    <Plug size={18} /><span><strong>Connect apps</strong><small>Account connections</small></span>
                  </button>
                </div>
              )}
              <form className="chat-composer" onSubmit={submit}>
                <button className="chat-attach-button" type="button" aria-label="Attach or add a link" aria-expanded={attachOpen} onClick={() => setAttachOpen((open) => !open)}>
                  {attachOpen ? <X size={24} strokeWidth={1.8} /> : <Plus size={25} strokeWidth={1.8} />}
                </button>
                <input
                  ref={inputRef}
                  aria-label="Ask cooking"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Ask ChatGPT"
                  autoComplete="off"
                  enterKeyHint="send"
                  maxLength={MAX_SAVED_MESSAGE_LENGTH}
                />
                {!hasText ? (
                  <>
                    <button className="chat-mic-button" type="button" aria-label="Voice input" onClick={() => setNotice("Voice input is not connected in this V1 yet. Type your instruction or paste a link instead.")}>
                      <Mic size={22} strokeWidth={1.9} />
                    </button>
                    <button className="chat-voice-button" type="button" aria-label="Start voice mode" onClick={() => setNotice("Voice mode is not connected in this V1 yet.")}>
                      <AudioLines size={22} strokeWidth={2.2} />
                    </button>
                  </>
                ) : (
                  <button className="chat-send-button" type="submit" aria-label="Send message">
                    <ArrowUp size={22} strokeWidth={2.4} />
                  </button>
                )}
              </form>
            </div>
          </>
        ) : activeView === "connections" ? (
          <section className="connections-view">
            <div className="connections-title-row">
              <div><p className="connections-eyebrow">ACCOUNT CONNECTIONS</p><h1>Connect your apps</h1><p>Link your creator accounts through their official sign-in and permission screens.</p></div>
              <button className="chat-icon-button" type="button" aria-label="Back to chat" onClick={() => { setActiveView("chat"); setConnectInfo(null); }}><X size={20} /></button>
            </div>
            <div className="connections-security-note"><ShieldCheck size={19} /><span><strong>Official authorization only</strong><small>Never enter your YouTube, Instagram or other social password into this app. A secure provider sign-in will be used when the integration is configured.</small></span></div>
            <div className="connection-list">
              {SOCIAL_PLATFORMS.map((platform) => {
                const Icon = platform.icon;
                return (
                  <article className="connection-card" key={platform.id}>
                    <div className={`connection-icon connection-icon-${platform.id}`}><Icon size={22} strokeWidth={2.1} /></div>
                    <div className="connection-copy"><strong>{platform.name}</strong><small>{platform.detail}</small><span className="connection-status"><i /> Not connected</span></div>
                    <button className="connection-button" type="button" onClick={() => setConnectInfo(platform.id)}>Connect <ChevronRight size={15} /></button>
                  </article>
                );
              })}
            </div>
            <p className="connection-footnote">Connections are not live yet. This UI is ready for the next integration step, but OAuth client setup, callback routes, permissions and provider review must be implemented and tested before any account can connect. No connection is being simulated.</p>
            {connectInfo && (
              <div className="connection-dialog-backdrop" role="presentation" onClick={() => setConnectInfo(null)}>
                <section className="connection-dialog" role="dialog" aria-modal="true" aria-labelledby="connection-dialog-title" onClick={(event) => event.stopPropagation()}>
                  <button className="chat-icon-button connection-dialog-close" type="button" aria-label="Close connection details" onClick={() => setConnectInfo(null)}><X size={19} /></button>
                  <div className="connection-dialog-icon"><Plug size={23} /></div>
                  <h2 id="connection-dialog-title">Connect {SOCIAL_PLATFORMS.find((platform) => platform.id === connectInfo)?.name}</h2>
                  <p>The connect button is a setup entry point for now. The secure OAuth flow is not configured, so no account has been connected.</p>
                  <ul><li>Use the platform&apos;s official OAuth sign-in, never collect a password here.</li><li>Request only the permissions needed for links and media you authorize.</li><li>Respect private content, API limits, and each platform&apos;s review requirements.</li></ul>
                  <button className="connection-dialog-done" type="button" onClick={() => setConnectInfo(null)}>Got it</button>
                </section>
              </div>
            )}
          </section>
        ) : (
          <section className="connections-view settings-view">
            <div className="connections-title-row">
              <div><p className="connections-eyebrow">PREFERENCES</p><h1>Settings</h1><p>Choose how the private cooking workspace looks on this device.</p></div>
              <button className="chat-icon-button" type="button" aria-label="Back to chat" onClick={() => setActiveView("chat")}><X size={20} /></button>
            </div>
            <section className="settings-panel" aria-labelledby="settings-theme-title">
              <div className="settings-panel-copy">
                <h2 id="settings-theme-title">Appearance</h2>
                <p>The same saved theme is used in the chat and recipe workspace.</p>
              </div>
              <div className="settings-theme-options" role="group" aria-label="Appearance theme">
                <button type="button" aria-label="Use light theme" aria-pressed={theme === "light"} className={theme === "light" ? "settings-theme-choice selected" : "settings-theme-choice"} onClick={() => setTheme("light")}>
                  <span className="theme-preview theme-preview-light" aria-hidden="true"><i /><i /><i /></span>
                  <span>Light</span>
                </button>
                <button type="button" aria-label="Use dark theme" aria-pressed={theme === "dark"} className={theme === "dark" ? "settings-theme-choice selected" : "settings-theme-choice"} onClick={() => setTheme("dark")}>
                  <span className="theme-preview theme-preview-dark" aria-hidden="true"><i /><i /><i /></span>
                  <span>Dark</span>
                </button>
              </div>
              <p className="settings-saved-note" role="status">{theme === "dark" ? "Dark theme selected. Your preference is saved in this browser." : "Light theme selected. Your preference is saved in this browser."}</p>
            </section>
            <section className="settings-panel" aria-labelledby="settings-privacy-title">
              <div className="settings-panel-copy">
                <h2 id="settings-privacy-title">Privacy basics</h2>
                <p>Recent chat history and recipe drafts stay in this browser in V1. They are not encrypted or synced to a cloud account. Lock workspace ends your owner session but does not erase saved data.</p>
              </div>
              {!clearHistoryPrompt ? (
                <button className="settings-danger-action" type="button" onClick={() => setClearHistoryPrompt(true)}>Clear chat history</button>
              ) : (
                <div className="settings-confirm-clear" role="group" aria-label="Confirm clear chat history">
                  <p>Clear saved conversations from this browser? This does not delete your recipe drafts.</p>
                  <div>
                    <button className="settings-danger-action" type="button" onClick={clearSavedChatHistory}>Clear saved chats</button>
                    <button className="settings-cancel-action" type="button" onClick={() => setClearHistoryPrompt(false)}>Keep history</button>
                  </div>
                </div>
              )}
              {notice && <p className="settings-saved-note" role="status">{notice}</p>}
            </section>
          </section>
        )}

        {drawerOpen && (
          <>
            <button className="chat-drawer-scrim" type="button" aria-label="Close menu" onClick={() => setDrawerOpen(false)} />
            <aside className="chat-drawer" aria-label="Main menu">
              <div className="chat-drawer-header">
                <div className="chat-drawer-brand">{CHAT_APP_NAME}</div>
                <button className="chat-round-button chat-search-button" type="button" aria-label="Search chats" onClick={() => { setSearchOpen((open) => !open); setSearchText(""); }}>
                  {searchOpen ? <X size={21} /> : <Search size={22} strokeWidth={2.2} />}
                </button>
              </div>
              {searchOpen && <div className="chat-search-field"><Search size={17} /><input aria-label="Search chats" value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search chats" autoFocus /></div>}
              <nav className="chat-drawer-menu" aria-label="Workspace menu">
                {CHAT_MENU_ITEMS.filter((item) => !searchText || item.label.toLowerCase().includes(searchText.toLowerCase())).map((item) => {
                  const Icon = item.icon;
                  return <button key={item.id} className="chat-menu-item" type="button" onClick={() => selectMenuItem(item.id)}><Icon size={22} strokeWidth={2.05} /><span>{item.label}</span></button>;
                })}
              </nav>
              <div className="chat-drawer-divider" />
              <div className="chat-history">
                <p className="chat-drawer-section-title">Your chats</p>
                {chatHistory.filter((thread) => !searchText ||
                  thread.title.toLowerCase().includes(searchText.toLowerCase()) ||
                  thread.messages.some((message) => message.text.toLowerCase().includes(searchText.toLowerCase()))
                ).map((thread) => (
                  <button
                    className="chat-history-item"
                    key={thread.id}
                    type="button"
                    aria-current={activeThreadId === thread.id ? "page" : undefined}
                    onClick={() => openChatThread(thread)}
                  >
                    <MessageSquare size={17} /><span>{thread.title}</span>
                  </button>
                ))}
                {chatHistoryReady && chatHistory.length === 0 && <p className="chat-history-empty">Your recent conversations will appear here.</p>}
              </div>
              <button className="chat-lock-button" type="button" onClick={() => void lockWorkspace()}>
                <ShieldCheck size={20} strokeWidth={2} /> <span>Lock workspace</span>
              </button>
              <div className="chat-drawer-footer">
                <div className="chat-profile-avatar">C</div>
                <div><strong>Private cooking studio</strong><small>Owner workspace · local prototype</small></div>
                <MoreHorizontal size={21} />
              </div>
            </aside>
          </>
        )}

        {plusInfo && (
          <div className="connection-dialog-backdrop" role="presentation" onClick={() => setPlusInfo(false)}>
            <section className="connection-dialog plus-dialog" role="dialog" aria-modal="true" aria-labelledby="plus-dialog-title" onClick={(event) => event.stopPropagation()}>
              <button className="chat-icon-button connection-dialog-close" type="button" aria-label="Close" onClick={() => setPlusInfo(false)}><X size={19} /></button>
              <div className="connection-dialog-icon"><Sparkles size={24} /></div>
              <h2 id="plus-dialog-title">Cooking Creator</h2>
              <p>This private build has no paid plan, subscription, or upgrade flow. It follows your ₹0 budget. AI generation and account connections will only be added when a suitable no-cost setup is available.</p>
              <button className="connection-dialog-done" type="button" onClick={() => setPlusInfo(false)}>Continue</button>
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
