import { TerminalSummary } from '@shared/protocol';

interface TerminalTabsProps {
  terminals: TerminalSummary[];
  activeTerminalId: string | null;
  unreadById: Record<string, number>;
  onCreate(): void;
  onSelect(terminalId: string): void;
}

export function TerminalTabs({
  terminals,
  activeTerminalId,
  unreadById,
  onCreate,
  onSelect,
}: TerminalTabsProps) {
  return (
    <div className="border-b border-white/10 bg-panelAlt/80 px-3 py-3">
      <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none]">
        {terminals.map((terminal) => {
          const active = terminal.id === activeTerminalId;
          return (
            <button
              aria-selected={active}
              key={terminal.id}
              className={`flex min-w-[10rem] shrink-0 items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                active
                  ? 'border-accent bg-accent/15 text-white'
                  : 'border-white/10 bg-white/5 text-slate-300'
              }`}
              type="button"
              onClick={() => onSelect(terminal.id)}
            >
              <span
                className={`h-2.5 w-2.5 rounded-full ${
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
                <span className="block truncate font-medium">{terminal.name}</span>
                <span className="block truncate text-xs uppercase tracking-[0.16em] text-slate-400">
                  {terminal.status}
                </span>
              </span>
              {unreadById[terminal.id] ? (
                <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-slate-950">
                  {unreadById[terminal.id]}
                </span>
              ) : null}
            </button>
          );
        })}

        <button
          className="shrink-0 rounded-2xl border border-dashed border-accent/60 bg-accent/10 px-4 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-accent transition hover:bg-accent/20"
          type="button"
          onClick={onCreate}
        >
          + New
        </button>
      </div>
    </div>
  );
}
