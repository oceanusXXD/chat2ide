import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ServerWsMessage, TerminalSummary } from '@shared/protocol';

import {
  closeTerminal,
  createTerminal,
  getAuthStatus,
  listTerminals,
  loginWithPin,
  renameTerminal,
  logout,
  restartTerminal,
  stopTerminal,
} from './lib/api';
import { ComposerBar } from './components/ComposerBar';
import { LoginPage } from './components/LoginPage';
import { TerminalPane, TerminalPaneController } from './components/TerminalPane';
import { TerminalTabs } from './components/TerminalTabs';
import { useTerminalSocket } from './hooks/useTerminalSocket';

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);
  const [busyAction, setBusyAction] = useState(false);
  const [terminals, setTerminals] = useState<TerminalSummary[]>([]);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
  const [composerValue, setComposerValue] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [unreadById, setUnreadById] = useState<Record<string, number>>({});
  // imperative controller 只负责桥接 xterm 实例，不参与 React 渲染。
  const paneControllersRef = useRef(new Map<string, TerminalPaneController>());
  // 浏览器同一时刻只订阅一个活动 terminal 的实时输出，其余 terminal 靠回放按需恢复。
  const attachedTerminalIdRef = useRef<string | null>(null);
  // socket 回调里经常需要读取最新 terminal 列表，避免闭包拿到旧值。
  const terminalsRef = useRef<TerminalSummary[]>([]);
  const activeTerminalIdRef = useRef<string | null>(null);

  const loadTerminals = useCallback(async () => {
    const nextTerminals = await listTerminals();
    setTerminals(sortTerminalsByCreatedAt(nextTerminals));
    setActiveTerminalId((current) => {
      if (current && nextTerminals.some((terminal) => terminal.id === current)) {
        return current;
      }
      return nextTerminals[0]?.id ?? null;
    });
  }, []);

  useEffect(() => {
    terminalsRef.current = terminals;
  }, [terminals]);

  useEffect(() => {
    activeTerminalIdRef.current = activeTerminalId;
  }, [activeTerminalId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const status = await getAuthStatus();
        if (!active) {
          return;
        }
        setAuthenticated(status.authenticated);
        if (status.authenticated) {
          await loadTerminals();
        }
      } catch (error) {
        if (active) {
          setAuthError(error instanceof Error ? error.message : '初始化失败');
        }
      } finally {
        if (active) {
          setAuthReady(true);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [loadTerminals]);

  const handleSocketMessage = useCallback(
    (message: ServerWsMessage) => {
      switch (message.type) {
        case 'ready':
          setNotice(null);
          return;
        case 'pong':
          return;
        case 'terminal_list':
          startTransition(() => {
            setTerminals(sortTerminalsByCreatedAt(message.items));
            setActiveTerminalId((current) => {
              if (current && message.items.some((terminal) => terminal.id === current)) {
                return current;
              }
              return message.items[0]?.id ?? null;
            });
          });
          return;
        case 'terminal_created':
          startTransition(() => {
            setTerminals((current) => upsertTerminal(current, message.item));
            setActiveTerminalId((current) => current ?? message.item.id);
          });
          return;
        case 'terminal_updated':
          startTransition(() => {
            setTerminals((current) => upsertTerminal(current, message.item));
          });
          return;
        case 'terminal_closed':
          startTransition(() => {
            setTerminals((current) =>
              current.filter((terminal) => terminal.id !== message.terminalId),
            );
            setUnreadById((current) => {
              const next = { ...current };
              delete next[message.terminalId];
              return next;
            });
            setActiveTerminalId((current) => {
              if (current !== message.terminalId) {
                return current;
              }
              const remaining = terminalsRef.current.filter(
                (terminal) => terminal.id !== message.terminalId,
              );
              return remaining[0]?.id ?? null;
            });
          });
          paneControllersRef.current.delete(message.terminalId);
          if (attachedTerminalIdRef.current === message.terminalId) {
            attachedTerminalIdRef.current = null;
          }
          return;
        case 'terminal_reset':
          paneControllersRef.current.get(message.terminalId)?.prepareForReplay();
          setUnreadById((current) => ({
            ...current,
            [message.terminalId]: 0,
          }));
          return;
        case 'terminal_output': {
          const controller = paneControllersRef.current.get(message.terminalId);
          controller?.write(message.data);
          if (!message.replay && activeTerminalId !== message.terminalId) {
            setUnreadById((current) => ({
              ...current,
              [message.terminalId]: (current[message.terminalId] ?? 0) + 1,
            }));
          }
          return;
        }
        case 'terminal_exit':
          setNotice(
            `${formatTerminalLabel(message.terminalId, terminalsRef.current)} 已退出，退出码 ${
              message.code ?? 'unknown'
            }`,
          );
          return;
        case 'terminal_error':
          setNotice(
            `${formatTerminalLabel(message.terminalId, terminalsRef.current)}: ${message.message}`,
          );
          return;
      }
    },
    [activeTerminalId],
  );

  const handleSocketOpen = useCallback(() => {
    attachedTerminalIdRef.current = null;
    const activeTerminalId = activeTerminalIdRef.current;
    if (activeTerminalId) {
      paneControllersRef.current.get(activeTerminalId)?.prepareForReplay();
    }
  }, []);

  const handleSocketAuthError = useCallback(() => {
    setAuthenticated(false);
    setAuthError('登录已失效，请重新输入 PIN');
    setTerminals([]);
    setActiveTerminalId(null);
    setComposerValue('');
    setNotice(null);
    setUnreadById({});
    paneControllersRef.current.clear();
    attachedTerminalIdRef.current = null;
  }, []);

  const {
    connectionState,
    connectionEpoch,
    reconnect,
    sendMessage,
  } = useTerminalSocket({
    enabled: authReady && authenticated,
    onAuthError: handleSocketAuthError,
    onMessage: handleSocketMessage,
    onOpen: handleSocketOpen,
  });

  const activeTerminal = useMemo(
    () => terminals.find((terminal) => terminal.id === activeTerminalId) ?? null,
    [activeTerminalId, terminals],
  );

  const registerController = useCallback(
    (terminalId: string, controller: TerminalPaneController | null) => {
      if (!controller) {
        paneControllersRef.current.delete(terminalId);
        return;
      }
      paneControllersRef.current.set(terminalId, controller);
    },
    [],
  );

  const requestTerminalReplay = useCallback(
    (terminalId: string, force = false) => {
      if (!force && attachedTerminalIdRef.current === terminalId) {
        return true;
      }
      paneControllersRef.current.get(terminalId)?.prepareForReplay();
      const sent = sendMessage({
        type: 'attach',
        terminalId,
      });
      if (sent) {
        attachedTerminalIdRef.current = terminalId;
      }
      return sent;
    },
    [sendMessage],
  );

  useEffect(() => {
    if (!authenticated || connectionState !== 'connected' || !activeTerminalId) {
      return;
    }

    const timer = window.setTimeout(() => {
      // 多后台高速输出时，浏览器只订阅当前活动 tab 的实时流。
      // 切换 tab 或主动刷新时，再对目标 terminal 触发一次回放与后续流式输出。
      requestTerminalReplay(activeTerminalId);
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    activeTerminalId,
    authenticated,
    connectionEpoch,
    connectionState,
    requestTerminalReplay,
  ]);

  const handleTerminalInput = useCallback(
    (terminalId: string, data: string) => {
      sendMessage({
        type: 'input',
        terminalId,
        data,
      });
    },
    [sendMessage],
  );

  const handleTerminalResize = useCallback(
    (terminalId: string, cols: number, rows: number) => {
      sendMessage({
        type: 'resize',
        terminalId,
        cols,
        rows,
      });
    },
    [sendMessage],
  );

  const handleLogin = useCallback(async (pin: string) => {
    setLoginBusy(true);
    setAuthError(null);
    try {
      await loginWithPin(pin);
      setAuthenticated(true);
      setNotice(null);
      await loadTerminals();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : '登录失败');
    } finally {
      setLoginBusy(false);
    }
  }, [loadTerminals]);

  const handleLogout = useCallback(async () => {
    setBusyAction(true);
    try {
      await logout();
      setAuthenticated(false);
      setTerminals([]);
      setActiveTerminalId(null);
      setComposerValue('');
      setNotice(null);
      setUnreadById({});
      paneControllersRef.current.clear();
      attachedTerminalIdRef.current = null;
    } finally {
      setBusyAction(false);
    }
  }, []);

  const handleCreateTerminal = useCallback(async () => {
    setBusyAction(true);
    try {
      const created = await createTerminal();
      setActiveTerminalId(created.id);
      setTerminals((current) => upsertTerminal(current, created));
      setUnreadById((current) => ({ ...current, [created.id]: 0 }));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '创建终端失败');
    } finally {
      setBusyAction(false);
    }
  }, []);

  const handleRenameTerminal = useCallback(async () => {
    if (!activeTerminal) {
      return;
    }

    const nextName = window.prompt('Rename terminal', activeTerminal.name);
    if (!nextName || nextName.trim() === activeTerminal.name) {
      return;
    }

    setBusyAction(true);
    try {
      const updated = await renameTerminal(activeTerminal.id, {
        name: nextName.trim(),
      });
      setTerminals((current) => upsertTerminal(current, updated));
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '重命名终端失败');
    } finally {
      setBusyAction(false);
    }
  }, [activeTerminal]);

  const handleSelectTerminal = useCallback((terminalId: string) => {
    setActiveTerminalId(terminalId);
    setUnreadById((current) => ({
      ...current,
      [terminalId]: 0,
    }));
    const controller = paneControllersRef.current.get(terminalId);
    controller?.fit();
    controller?.focus();
  }, []);

  const handleRefreshActiveTerminal = useCallback(() => {
    if (!activeTerminalId) {
      return;
    }
    requestTerminalReplay(activeTerminalId, true);
  }, [activeTerminalId, requestTerminalReplay]);

  const handleSendInput = useCallback(() => {
    if (!activeTerminalId) {
      return;
    }
    const normalized = normalizeComposerInput(composerValue);
    if (!normalized) {
      return;
    }
    const sent = sendMessage({
      type: 'input',
      terminalId: activeTerminalId,
      data: normalized,
    });
    if (sent) {
      setComposerValue('');
    }
  }, [activeTerminalId, composerValue, sendMessage]);

  const handleInterrupt = useCallback(() => {
    if (!activeTerminalId) {
      return;
    }
    sendMessage({
      type: 'input',
      terminalId: activeTerminalId,
      data: '\u0003',
    });
  }, [activeTerminalId, sendMessage]);

  const handleStop = useCallback(async () => {
    if (!activeTerminalId) {
      return;
    }
    setBusyAction(true);
    try {
      await stopTerminal(activeTerminalId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '停止终端失败');
    } finally {
      setBusyAction(false);
    }
  }, [activeTerminalId]);

  const handleRestart = useCallback(async () => {
    if (!activeTerminalId) {
      return;
    }
    setBusyAction(true);
    try {
      await restartTerminal(activeTerminalId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '重启终端失败');
    } finally {
      setBusyAction(false);
    }
  }, [activeTerminalId]);

  const handleClose = useCallback(async () => {
    if (!activeTerminalId) {
      return;
    }
    setBusyAction(true);
    try {
      await closeTerminal(activeTerminalId);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '关闭终端失败');
    } finally {
      setBusyAction(false);
    }
  }, [activeTerminalId]);

  if (!authReady) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-canvas text-slate-200">
        <div className="rounded-2xl border border-white/10 bg-panel px-6 py-4 shadow-shell">
          Loading terminal hub...
        </div>
      </main>
    );
  }

  if (!authenticated) {
    return <LoginPage busy={loginBusy} error={authError} onSubmit={handleLogin} />;
  }

  return (
    <main className="app-shell flex min-h-[100dvh] flex-col bg-[radial-gradient(circle_at_top,_rgba(77,163,255,0.14),_transparent_28%),radial-gradient(circle_at_bottom_left,_rgba(229,127,74,0.12),_transparent_22%),linear-gradient(180deg,_#09111b,_#060b10)] text-ink">
      <header className="border-b border-white/10 bg-panel/95 px-4 py-4 backdrop-blur">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-[0.28em] text-slate-400">
                chat2ide
              </p>
              <h1 className="truncate text-2xl font-semibold text-white">
                Remote Codex CLI Terminal Hub
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <StatusChip
                label="socket"
                tone={
                  connectionState === 'connected'
                    ? 'success'
                    : connectionState === 'connecting'
                    ? 'warning'
                    : connectionState === 'auth_error'
                    ? 'danger'
                    : 'muted'
                }
                value={connectionState}
              />

              {activeTerminal ? (
                <StatusChip
                  label={activeTerminal.name}
                  tone={
                    activeTerminal.status === 'running'
                      ? 'success'
                      : activeTerminal.status === 'starting'
                      ? 'warning'
                      : activeTerminal.status === 'error'
                      ? 'danger'
                      : 'muted'
                  }
                  value={activeTerminal.status}
                />
              ) : null}
            </div>
          </div>

          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            <button
              className="shrink-0 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-100"
              type="button"
              onClick={handleCreateTerminal}
            >
              New Terminal
            </button>
            <button
              className="hidden shrink-0 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-100 disabled:opacity-50 sm:inline-flex"
              disabled={!activeTerminal || busyAction}
              type="button"
              onClick={handleRenameTerminal}
            >
              Rename
            </button>
            <button
              className="shrink-0 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-100"
              type="button"
              onClick={reconnect}
            >
              Reconnect
            </button>
            <button
              className="shrink-0 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-100 disabled:opacity-50"
              disabled={!activeTerminal || connectionState !== 'connected'}
              type="button"
              onClick={handleRefreshActiveTerminal}
            >
              刷新输出
            </button>
            <button
              className="shrink-0 rounded-2xl border border-danger/40 bg-danger/10 px-4 py-2 text-sm font-medium text-red-100"
              disabled={busyAction}
              type="button"
              onClick={handleLogout}
            >
              Logout
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.18em] text-slate-400">
            <span className="max-w-full truncate">{activeTerminal?.cwd ?? 'No terminal selected'}</span>
            {activeTerminal?.pid ? <span>PID {activeTerminal.pid}</span> : null}
          </div>
        </div>

        {notice ? (
          <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200">
            {notice}
          </div>
        ) : null}
      </header>

      <TerminalTabs
        activeTerminalId={activeTerminalId}
        terminals={terminals}
        unreadById={unreadById}
        onCreate={handleCreateTerminal}
        onSelect={handleSelectTerminal}
      />

      <section className="flex min-h-0 flex-1 flex-col gap-3 px-3 py-3">
        <div className="flex min-h-0 flex-1 flex-col rounded-[28px] border border-white/10 bg-panel/85 p-3 shadow-shell">
          {terminals.length === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-[24px] border border-dashed border-white/10 bg-[#0b131d] px-8 text-center text-slate-400">
              还没有活跃终端。点击上方的 New Terminal，服务器会直接启动一个新的
              Codex CLI PTY 会话。
            </div>
          ) : (
            terminals.map((terminal) => (
              <TerminalPane
                key={terminal.id}
                active={terminal.id === activeTerminalId}
                session={terminal}
                onInput={handleTerminalInput}
                onRegisterController={registerController}
                onResize={handleTerminalResize}
              />
            ))
          )}
        </div>
      </section>

      <div className="sticky bottom-0 z-10 pb-[env(safe-area-inset-bottom)]">
        <ComposerBar
          activeTerminal={activeTerminal}
          busy={busyAction}
          connected={connectionState === 'connected'}
          value={composerValue}
          onChange={setComposerValue}
          onClose={handleClose}
          onInterrupt={handleInterrupt}
          onRestart={handleRestart}
          onSend={handleSendInput}
          onStop={handleStop}
        />
      </div>
    </main>
  );
}

function StatusChip({
  label,
  tone,
  value,
}: {
  label: string;
  tone: 'success' | 'warning' | 'danger' | 'muted';
  value: string;
}) {
  const toneClass =
    tone === 'success'
      ? 'border-success/40 bg-success/10 text-emerald-100'
      : tone === 'warning'
      ? 'border-warning/40 bg-warning/10 text-amber-100'
      : tone === 'danger'
      ? 'border-danger/40 bg-danger/10 text-red-100'
      : 'border-white/10 bg-white/5 text-slate-200';

  return (
    <div className={`rounded-2xl border px-3 py-2 text-xs uppercase tracking-[0.16em] ${toneClass}`}>
      <span className="mr-2 text-slate-400">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function upsertTerminal(
  terminals: TerminalSummary[],
  nextTerminal: TerminalSummary,
): TerminalSummary[] {
  const index = terminals.findIndex((terminal) => terminal.id === nextTerminal.id);
  if (index === -1) {
    return sortTerminalsByCreatedAt([...terminals, nextTerminal]);
  }
  if (areTerminalSummariesEqual(terminals[index], nextTerminal)) {
    return terminals;
  }
  const next = [...terminals];
  next[index] = nextTerminal;
  return sortTerminalsByCreatedAt(next);
}

function sortTerminalsByCreatedAt(terminals: TerminalSummary[]): TerminalSummary[] {
  return [...terminals].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

function formatTerminalLabel(
  terminalId: string,
  terminals: TerminalSummary[],
): string {
  return terminals.find((terminal) => terminal.id === terminalId)?.name ?? '终端';
}

function areTerminalSummariesEqual(
  left: TerminalSummary,
  right: TerminalSummary,
): boolean {
  return (
    left.id === right.id &&
    left.name === right.name &&
    left.status === right.status &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt &&
    left.cwd === right.cwd &&
    left.pid === right.pid &&
    left.cols === right.cols &&
    left.rows === right.rows &&
    left.lastError === right.lastError &&
    left.lastExitCode === right.lastExitCode &&
    left.lastExitSignal === right.lastExitSignal
  );
}

function normalizeComposerInput(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  if (value.endsWith('\n') || value.endsWith('\r')) {
    return value;
  }
  return `${value}\r`;
}
