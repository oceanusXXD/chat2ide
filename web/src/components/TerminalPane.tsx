import { memo, useEffect, useRef } from 'react';

import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';

import { TerminalSummary } from '@shared/protocol';

export interface TerminalPaneController {
  write(data: string): void;
  prepareForReplay(): void;
  fit(): void;
  focus(): void;
}

interface TerminalPaneProps {
  session: TerminalSummary;
  active: boolean;
  onInput(terminalId: string, data: string): void;
  onResize(terminalId: string, cols: number, rows: number): void;
  onRegisterController(
    terminalId: string,
    controller: TerminalPaneController | null,
  ): void;
}

const TERMINAL_THEME = {
  background: '#0b131d',
  foreground: '#d8e1e7',
  cursor: '#e57f4a',
  black: '#09111b',
  blue: '#4da3ff',
  brightBlack: '#415166',
  brightBlue: '#8bc0ff',
  brightCyan: '#86e0d6',
  brightGreen: '#74e3a9',
  brightMagenta: '#efb6ff',
  brightRed: '#ffa39d',
  brightWhite: '#f8fbff',
  brightYellow: '#ffd77a',
  cyan: '#4bc0b8',
  green: '#3dd08f',
  magenta: '#cf8df4',
  red: '#ff6b5f',
  white: '#d8e1e7',
  yellow: '#f6c85f',
} as const;

const MIN_TERMINAL_COLS = 20;
const MAX_TERMINAL_COLS = 320;
const MIN_TERMINAL_ROWS = 8;
const MAX_TERMINAL_ROWS = 120;

function TerminalPaneInner({
  session,
  active,
  onInput,
  onResize,
  onRegisterController,
}: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const activeRef = useRef(active);
  const lastReportedSizeRef = useRef<{ cols: number; rows: number } | null>(null);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    const target = containerRef.current;
    if (!target) {
      return;
    }

    // Keep one xterm instance per tab so scrollback and viewport state do not mix.
    const terminal = new Terminal({
      allowTransparency: true,
      convertEol: false,
      cursorBlink: true,
      fontFamily: '"IBM Plex Mono", "SFMono-Regular", monospace',
      fontSize: getResponsiveFontSize(),
      lineHeight: window.innerWidth < 480 ? 1.08 : 1.12,
      scrollback: 6000,
      theme: TERMINAL_THEME,
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(target);

    const flushSize = () => {
      if (!containerRef.current || !activeRef.current) {
        return;
      }
      terminal.options.fontSize = getResponsiveFontSize();
      applyBestFit(terminal, fitAddon);
      reportResizeIfChanged(
        session.id,
        terminal,
        lastReportedSizeRef,
        onResize,
      );
    };

    const handlePointerDown = () => {
      focusTerminal(terminal);
    };

    const observer = new ResizeObserver(() => {
      if (activeRef.current) {
        flushSize();
      }
    });
    observer.observe(target);
    target.addEventListener('pointerdown', handlePointerDown);

    const disposable = terminal.onData((data) => {
      onInput(session.id, data);
    });

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    onRegisterController(session.id, {
      write(data: string) {
        terminal.write(data);
      },
      prepareForReplay() {
        // Clear before replaying the server ring buffer.
        terminal.reset();
      },
      fit() {
        flushSize();
      },
      focus() {
        focusTerminal(terminal);
      },
    });

    if (active) {
      requestAnimationFrame(flushSize);
    }

    return () => {
      observer.disconnect();
      target.removeEventListener('pointerdown', handlePointerDown);
      disposable.dispose();
      onRegisterController(session.id, null);
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      lastReportedSizeRef.current = null;
    };
  }, [onInput, onRegisterController, onResize, session.id]);

  useEffect(() => {
    if (!active) {
      return;
    }
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!terminal || !fitAddon) {
      return;
    }
    requestAnimationFrame(() => {
      applyBestFit(terminal, fitAddon);
      reportResizeIfChanged(
        session.id,
        terminal,
        lastReportedSizeRef,
        onResize,
      );
    });
  }, [active, onResize, session.id]);

  return (
    <div
      className={`min-h-0 flex-1 overflow-hidden rounded-lg border border-white/10 bg-[#0b131d] ${
        active ? 'flex' : 'hidden'
      }`}
    >
      <div
        className="terminal-host h-full min-h-0 w-full px-1.5 py-1.5 sm:px-2 sm:py-2"
        ref={containerRef}
      />
    </div>
  );
}

export const TerminalPane = memo(
  TerminalPaneInner,
  (prevProps, nextProps) =>
    prevProps.session.id === nextProps.session.id &&
    prevProps.active === nextProps.active &&
    prevProps.onInput === nextProps.onInput &&
    prevProps.onResize === nextProps.onResize &&
    prevProps.onRegisterController === nextProps.onRegisterController,
);

function focusTerminal(terminal: Terminal): void {
  if (window.innerWidth >= 1024) {
    terminal.focus();
  }
}

function getResponsiveFontSize(): number {
  if (window.innerWidth < 380) {
    return 11;
  }
  if (window.innerWidth < 520) {
    return 12;
  }
  return 14;
}

function applyBestFit(terminal: Terminal, fitAddon: FitAddon): void {
  const proposed = fitAddon.proposeDimensions();
  if (!proposed) {
    return;
  }

  const nextCols = clampDimension(
    proposed.cols,
    MIN_TERMINAL_COLS,
    MAX_TERMINAL_COLS,
  );
  const nextRows = clampDimension(
    proposed.rows,
    MIN_TERMINAL_ROWS,
    MAX_TERMINAL_ROWS,
  );

  if (terminal.cols === nextCols && terminal.rows === nextRows) {
    return;
  }
  terminal.resize(nextCols, nextRows);
}

function reportResizeIfChanged(
  terminalId: string,
  terminal: Terminal,
  lastReportedSizeRef: { current: { cols: number; rows: number } | null },
  onResize: TerminalPaneProps['onResize'],
): void {
  const nextCols = terminal.cols;
  const nextRows = terminal.rows;
  const lastSize = lastReportedSizeRef.current;

  if (lastSize?.cols === nextCols && lastSize.rows === nextRows) {
    return;
  }

  lastReportedSizeRef.current = {
    cols: nextCols,
    rows: nextRows,
  };
  onResize(terminalId, nextCols, nextRows);
}

function clampDimension(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.floor(value)));
}
