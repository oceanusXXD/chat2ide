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
    <main className="flex min-h-[100dvh] items-start justify-center bg-[#071019] px-4 pb-6 pt-[14dvh] sm:items-center sm:px-5 sm:py-10">
      <section className="w-full max-w-sm rounded-lg border border-white/10 bg-slate-950/70 p-5 shadow-shell backdrop-blur sm:p-6">
        <div className="mb-6 space-y-3">
          <p className="text-xs text-slate-400">chat2ide · 私有远程入口</p>
          <h1 className="text-2xl font-semibold leading-tight text-white sm:text-3xl">
            解锁 Codex 终端
          </h1>
          <p className="text-sm leading-6 text-slate-300">
            输入服务器上配置的 PIN，进入单用户 AI 编程控制台。登录后可从浏览器或手机接管服务器里的 Codex CLI 会话。
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-2">
            <span className="text-xs uppercase tracking-[0.24em] text-slate-400">
              PIN
            </span>
            <input
              autoComplete="current-password"
              className="w-full rounded-lg border border-white/10 bg-slate-900/90 px-4 py-3 font-mono text-lg tracking-normal text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-accent focus:ring-2 focus:ring-accent/40"
              enterKeyHint="done"
              inputMode="text"
              maxLength={128}
              placeholder="PIN 或访问短语"
              spellCheck={false}
              type="password"
              value={pin}
              onChange={(event) => setPin(event.target.value)}
            />
          </label>

          {error ? (
            <div className="rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          ) : null}

          <button
            className="w-full rounded-lg bg-accent px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-[#f09768] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy}
            type="submit"
          >
            {busy ? '正在登录...' : '进入远程终端'}
          </button>
        </form>
      </section>
    </main>
  );
}
