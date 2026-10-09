import React, { createContext, useCallback, useContext, useState } from 'react';

interface Toast { id: number; kind: 'success' | 'error' | 'info'; text: string }
interface ToastApi { push: (kind: Toast['kind'], text: string) => void; success: (t: string) => void; error: (t: string) => void; info: (t: string) => void }

const Ctx = createContext<ToastApi | null>(null);
let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: Toast['kind'], text: string) => {
    const id = nextId++;
    setToasts((t) => [...t.slice(-3), { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5200);
  }, []);
  const apiVal: ToastApi = {
    push,
    success: (t) => push('success', t),
    error: (t) => push('error', t),
    info: (t) => push('info', t),
  };
  return (
    <Ctx.Provider value={apiVal}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind === 'success' ? 'success' : t.kind === 'error' ? 'error' : ''}`}>
            <span style={{ color: t.kind === 'success' ? 'var(--accent-2)' : t.kind === 'error' ? 'var(--danger)' : 'var(--info)' }}>
              {t.kind === 'success' ? '✓' : t.kind === 'error' ? '✕' : 'ℹ'}
            </span>
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useToast outside provider');
  return v;
}
