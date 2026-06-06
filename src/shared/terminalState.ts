import { TerminalStatus, TerminalSummary } from './protocol';

export const DEFAULT_COMMAND_HISTORY_LIMIT = 30;

export interface TerminalWorkbenchStats {
  total: number;
  running: number;
  starting: number;
  stopped: number;
  error: number;
  unread: number;
}

export interface CommandHistoryNavigationResult {
  value: string;
  cursor: number | null;
  draft: string;
}

export function chooseAdjacentTerminalId<T extends { id: string }>(
  terminals: readonly T[],
  closedTerminalId: string,
): string | null {
  const closedIndex = terminals.findIndex((terminal) => terminal.id === closedTerminalId);
  if (closedIndex === -1) {
    return terminals[0]?.id ?? null;
  }

  return terminals[closedIndex + 1]?.id ?? terminals[closedIndex - 1]?.id ?? null;
}

export function summarizeTerminals(
  terminals: readonly Pick<TerminalSummary, 'status'>[],
  unreadById: Record<string, number>,
): TerminalWorkbenchStats {
  const stats: TerminalWorkbenchStats = {
    total: terminals.length,
    running: 0,
    starting: 0,
    stopped: 0,
    error: 0,
    unread: 0,
  };

  for (const terminal of terminals) {
    stats[terminal.status as TerminalStatus] += 1;
  }

  for (const count of Object.values(unreadById)) {
    if (Number.isFinite(count) && count > 0) {
      stats.unread += count;
    }
  }

  return stats;
}

export function addCommandToHistory(
  history: readonly string[],
  command: string,
  maxItems = DEFAULT_COMMAND_HISTORY_LIMIT,
): string[] {
  const normalized = command.trim();
  if (!normalized || maxItems <= 0) {
    return maxItems <= 0 ? [] : [...history];
  }

  const withoutDuplicate = history.filter((entry) => entry !== normalized);
  return [...withoutDuplicate, normalized].slice(-maxItems);
}

export function getPreviousCommandHistoryValue(
  history: readonly string[],
  cursor: number | null,
  draft: string,
  currentValue: string,
): CommandHistoryNavigationResult {
  if (history.length === 0) {
    return {
      cursor,
      draft,
      value: currentValue,
    };
  }

  const nextCursor = cursor === null ? history.length - 1 : Math.max(0, cursor - 1);
  return {
    cursor: nextCursor,
    draft: cursor === null ? currentValue : draft,
    value: history[nextCursor] ?? currentValue,
  };
}

export function getNextCommandHistoryValue(
  history: readonly string[],
  cursor: number | null,
  draft: string,
  currentValue: string,
): CommandHistoryNavigationResult {
  if (history.length === 0 || cursor === null) {
    return {
      cursor,
      draft,
      value: currentValue,
    };
  }

  if (cursor >= history.length - 1) {
    return {
      cursor: null,
      draft: '',
      value: draft,
    };
  }

  const nextCursor = cursor + 1;
  return {
    cursor: nextCursor,
    draft,
    value: history[nextCursor] ?? currentValue,
  };
}

export function formatCompactCount(value: number, max = 99): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '0';
  }
  return value > max ? `${max}+` : String(value);
}
