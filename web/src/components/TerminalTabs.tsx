import { TerminalSummary } from '@shared/protocol';
import { formatCompactCount } from '@shared/terminalState';

interface TerminalTabsProps {
  terminals: TerminalSummary[];
  activeTerminalId: string | null;
  unreadById: Record<string, number>;
  onSelect(terminalId: string): void;
}

export function TerminalTabs({
  terminals,
  activeTerminalId,
  unreadById,
  onSelect,
}: TerminalTabsProps) {
  if (terminals.length === 0) {
    return null;
  }

  return (
    <div className="shrink-0 border-b border-white/10 bg-panelAlt/80 px-2 py-1.5 sm:px-3 sm:py-2">
      <div
        className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [-ms-overflow-style:none] sm:gap-2 sm:pb-1"
        role="tablist"
      >
        {terminals.map((terminal) => {
          const active = terminal.id === activeTerminalId;
          return (
            <button
              aria-label={`${terminal.name}，${formatTerminalBackend(terminal.backend)}，${terminal.profileName}，${formatTerminalStatus(terminal.status)}`}
              aria-selected={active}
              key={terminal.id}
              className={`flex min-h-10 min-w-[7rem] max-w-[9rem] shrink-0 items-center gap-2 rounded-md border px-2.5 py-1.5 text-left transition sm:min-h-12 sm:min-w-[10rem] sm:max-w-[10.5rem] sm:gap-3 sm:rounded-lg sm:px-4 sm:py-2 ${
                active
                  ? 'border-accent bg-accent/15 text-white'
                  : 'border-white/10 bg-white/5 text-slate-300'
              }`}
              role="tab"
              title={`${terminal.name} · ${formatTerminalBackend(terminal.backend)} · ${terminal.profileName} · ${terminal.commandDisplay}`}
              type="button"
              onClick={() => onSelect(terminal.id)}
            >
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                  terminal.status === 'running'
                    ? 'bg-success'
                    : terminal.status === 'error'
                    ? 'bg-danger'
                    : terminal.status === 'starting'
                    ? 'bg-warning'
                    : 'bg-slate-500'
                }`}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium sm:text-base">
                  {terminal.name}
                </span>
                <span className="hidden truncate text-[11px] leading-4 text-slate-400 sm:block sm:text-xs">
                  {formatTerminalBackend(terminal.backend)} · {formatTerminalStatus(terminal.status)}
                </span>
              </span>
              {unreadById[terminal.id] ? (
                <span className="min-w-6 rounded bg-accent px-1.5 py-0.5 text-center text-[10px] font-semibold tabular-nums text-slate-950 sm:px-2 sm:text-xs">
                  {formatCompactCount(unreadById[terminal.id])}
                </span>
              ) : null}
            </button>
          );
        })}

      </div>
    </div>
  );
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

function formatTerminalBackend(backend: TerminalSummary['backend']): string {
  return backend === 'client_bridge' ? 'Bridge' : 'PTY';
}
