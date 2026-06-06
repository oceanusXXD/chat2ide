import {
  startTransition,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  LogOut,
  type LucideIcon,
  Pencil,
  Plus,
  RefreshCw,
  RotateCw,
} from 'lucide-react';

import { ServerWsMessage, TerminalSummary } from '@shared/protocol';

import {
  closeTerminal,
  createTerminal,
  getAuthStatus,
  listTerminals,
  loginWithPin,
  logout,
  renameTerminal,
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
  const paneControllersRef = useRef(new Map<string, TerminalPaneController>());
  const attachedTerminalIdRef = useRef<string | null>(null);
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

  const { connectionState, connectionEpoch, reconnect, sendMessage } =
    useTerminalSocket({
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

  const handleLogin = useCallback(
    async (pin: string) => {
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
    },
    [loadTerminals],
  );

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

    const nextName = window.prompt('重命名终端', activeTerminal.name);
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
        <div className="rounded-lg border border-white/10 bg-panel px-6 py-4 shadow-shell">
          正在加载远程终端...
        </div>
      </main>
    );
  }

  if (!authenticated) {
    return <LoginPage busy={loginBusy} error={authError} onSubmit={handleLogin} />;
  }

  return (
    <main className="app-shell flex min-h-[100dvh] flex-col bg-[#071019] text-ink">
      <header className="shrink-0 border-b border-white/10 bg-panel/95 px-3 py-2.5 backdrop-blur sm:px-4 sm:py-4">
        <div className="flex flex-col gap-2 sm:gap-3">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] leading-4 text-slate-400 sm:text-xs">
                chat2ide · 单用户 AI 编程控制台
              </p>
              <h1 className="truncate text-xl font-semibold leading-tight text-white sm:text-2xl">
                私有 Codex 远程终端
              </h1>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <StatusChip
                label="连接"
                tone={
                  connectionState === 'connected'
                    ? 'success'
                    : connectionState === 'connecting'
                    ? 'warning'
                    : connectionState === 'auth_error'
                    ? 'danger'
                    : 'muted'
                }
                value={formatConnectionState(connectionState)}
              />

              {activeTerminal ? (
                <div className="hidden sm:block">
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
                    value={formatTerminalStatus(activeTerminal.status)}
                  />
                </div>
              ) : null}
            </div>
          </div>

          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [-ms-overflow-style:none] sm:gap-2">
            <ToolbarButton
              icon={Plus}
              label="新建终端"
              disabled={busyAction}
              onClick={handleCreateTerminal}
            />
            <ToolbarButton
              icon={Pencil}
              label="重命名"
              disabled={!activeTerminal || busyAction}
              hideLabelOnMobile
              onClick={handleRenameTerminal}
            />
            <ToolbarButton
              icon={RotateCw}
              label="重连"
              disabled={busyAction}
              hideLabelOnMobile
              onClick={reconnect}
            />
            <ToolbarButton
              icon={RefreshCw}
              label="刷新输出"
              disabled={!activeTerminal || connectionState !== 'connected'}
              hideLabelOnMobile
              onClick={handleRefreshActiveTerminal}
            />
            <ToolbarButton
              icon={LogOut}
              label="退出登录"
              tone="danger"
              disabled={busyAction}
              hideLabelOnMobile
              onClick={handleLogout}
            />
          </div>

          <div className="flex min-w-0 items-center gap-2 text-[11px] leading-4 text-slate-400 sm:text-xs">
            {activeTerminal ? (
              <span className="shrink-0 text-slate-300 sm:hidden">
                {activeTerminal.name} · {formatTerminalStatus(activeTerminal.status)}
              </span>
            ) : null}
            <span className="min-w-0 flex-1 truncate">
              {activeTerminal?.cwd ?? '尚未选择终端'}
            </span>
            {activeTerminal?.pid ? <span className="shrink-0">PID {activeTerminal.pid}</span> : null}
          </div>
        </div>

        {notice ? (
          <div className="mt-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 sm:mt-3 sm:px-4 sm:py-3 sm:text-sm">
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

      <section className="flex min-h-0 flex-1 flex-col px-2 py-2 sm:px-3 sm:py-3">
        <div className="flex min-h-0 flex-1 flex-col">
          {terminals.length === 0 ? (
            <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-white/10 bg-[#0b131d] px-6 text-center text-sm leading-6 text-slate-400">
              还没有活动终端。新建一个 Codex 会话后，浏览器连接并附着到该标签页时会启动服务器上的 PTY 进程。
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

      <div className="sticky bottom-0 z-10 shrink-0 pb-[env(safe-area-inset-bottom)]">
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
    <div
      className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] leading-none ${toneClass}`}
    >
      <span className="text-slate-400">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function ToolbarButton({
  disabled,
  hideLabelOnMobile,
  icon: Icon,
  label,
  onClick,
  tone = 'default',
}: {
  disabled?: boolean;
  hideLabelOnMobile?: boolean;
  icon: LucideIcon;
  label: string;
  onClick(): void;
  tone?: 'default' | 'danger';
}) {
  const toneClass =
    tone === 'danger'
      ? 'border-danger/40 bg-danger/10 text-red-100'
      : 'border-white/10 bg-white/5 text-slate-100';

  return (
    <button
      aria-label={label}
      className={`inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 sm:px-4 sm:text-sm ${toneClass}`}
      disabled={disabled}
      title={label}
      type="button"
      onClick={onClick}
    >
      <Icon aria-hidden className="h-4 w-4" />
      <span className={hideLabelOnMobile ? 'hidden sm:inline' : ''}>{label}</span>
    </button>
  );
}

function formatConnectionState(state: string): string {
  switch (state) {
    case 'logged_out':
      return '未登录';
    case 'connecting':
      return '连接中';
    case 'connected':
      return '已连接';
    case 'disconnected':
      return '已断开';
    case 'auth_error':
      return '登录失效';
    default:
      return state;
  }
}

function formatTerminalStatus(status: TerminalSummary['status']): string {
  switch (status) {
    case 'starting':
      return '启动中';
    case 'running':
      return '运行中';
    case 'stopped':
      return '已停止';
    case 'error':
      return '错误';
  }
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
