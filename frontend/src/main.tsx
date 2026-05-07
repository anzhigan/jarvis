import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./app/App.tsx";
import { applyInitialTheme } from "./lib/theme";
import "./styles/index.css";

// Sentry — opt-in via VITE_SENTRY_DSN. No-op when unset (dev / OSS contributors).
const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.MODE,
    release: (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "1.0.0",
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: import.meta.env.PROD ? 0.1 : 0,
    // Don't ship request bodies / headers automatically — token leaks.
    sendDefaultPii: false,
  });
}

// Apply theme before first paint to avoid FOUC.
applyInitialTheme();

// Apply saved font size early so ProseMirror renders at the correct size on first paint
try {
  const raw = localStorage.getItem('note-font-size');
  const n = raw ? parseInt(raw, 10) : 16;
  document.documentElement.style.setProperty('--editor-font-size', `${n}px`);
} catch {}

createRoot(document.getElementById("root")!).render(<App />);
