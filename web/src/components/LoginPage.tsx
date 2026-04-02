import { FormEvent, useState } from 'react';

interface LoginPageProps {
  busy: boolean;
  error: string | null;
  onSubmit(pin: string): Promise<void>;
}

export function LoginPage({ busy, error, onSubmit }: LoginPageProps) {
  const [pin, setPin] = useState('');

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSubmit(pin);
  };

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(229,127,74,0.2),_transparent_30%),linear-gradient(180deg,_#0a1118,_#09111b_45%,_#060b10)] px-5 py-10">
      <section className="w-full max-w-sm rounded-[28px] border border-white/10 bg-slate-950/70 p-6 shadow-shell backdrop-blur">
        <div className="mb-6 space-y-3">
          <p className="text-xs uppercase tracking-[0.32em] text-slate-400">
            Remote Codex CLI Terminal Hub
          </p>
          <h1 className="text-3xl font-semibold text-white">PIN Login</h1>
          <p className="text-sm leading-6 text-slate-300">
            单用户入口。输入服务器端配置的 PIN 后，浏览器会拿到
            HttpOnly 会话 cookie，并直接连接终端 WebSocket。
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-2">
            <span className="text-xs uppercase tracking-[0.24em] text-slate-400">
              PIN
            </span>
            <input
              autoFocus
              autoComplete="one-time-code"
              className="w-full rounded-2xl border border-white/10 bg-slate-900/90 px-4 py-3 text-center font-mono text-2xl tracking-[0.5em] text-slate-100 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/40"
              enterKeyHint="done"
              inputMode="numeric"
              maxLength={12}
              placeholder="000000"
              spellCheck={false}
              type="password"
              value={pin}
              onChange={(event) => setPin(event.target.value)}
            />
          </label>

          {error ? (
            <div className="rounded-2xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          ) : null}

          <button
            className="w-full rounded-2xl bg-accent px-4 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-slate-950 transition hover:bg-[#f09768] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy}
            type="submit"
          >
            {busy ? 'Signing In...' : 'Unlock Terminal Hub'}
          </button>
        </form>
      </section>
    </main>
  );
}
