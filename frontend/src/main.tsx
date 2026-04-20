import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import "./styles/index.css";

// Apply saved font size early so ProseMirror renders at the correct size on first paint
try {
  const raw = localStorage.getItem('note-font-size');
  const n = raw ? parseInt(raw, 10) : 18;
  document.documentElement.style.setProperty('--editor-font-size', `${n}px`);
} catch {}

createRoot(document.getElementById("root")!).render(<App />);
