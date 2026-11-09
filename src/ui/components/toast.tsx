import { create } from 'zustand';
import { CircleCheck, CircleAlert } from 'lucide-react';

interface Toast {
  id: number;
  text: string;
  tone: 'ok' | 'danger';
}
const useToasts = create<{ list: Toast[] }>(() => ({ list: [] }));
let n = 0;

export function toast(text: string, tone: 'ok' | 'danger' = 'ok') {
  const id = ++n;
  useToasts.setState((s) => ({ list: [...s.list.slice(-3), { id, text, tone }] }));
  setTimeout(() => useToasts.setState((s) => ({ list: s.list.filter((t) => t.id !== id) })), tone === 'danger' ? 7000 : 3200);
}

export function Toaster() {
  const list = useToasts((s) => s.list);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast toast--${t.tone}`}>
          {t.tone === 'ok' ? <CircleCheck size={15} aria-hidden /> : <CircleAlert size={15} aria-hidden />}
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}
