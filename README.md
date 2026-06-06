# chat2ide

Self-hosted web and mobile terminal for long-running Codex CLI sessions.

<p align="center">
  <img src="docs/assets/chat2ide-mobile-workbench.png" alt="chat2ide mobile terminal workbench" width="360">
</p>

<p align="center">
  <em>A phone-friendly control surface for real server-side AI coding CLI sessions.</em>
</p>

Read the full README in:

- [English](README.en.md)
- [简体中文](README.zh-CN.md)

In short, this repository runs AI coding CLIs as real server-side PTY processes and lets one authenticated user control them from a browser or phone. Codex CLI is the default target, and `CODEX_COMMAND` can point at another PTY-friendly coding agent or shell wrapper.

It is for a trusted personal server, not for multi-user IDE hosting.

## Communication Architecture

```mermaid
%%{init: {"theme": "base", "themeVariables": {"fontFamily": "Inter, ui-sans-serif, system-ui", "primaryColor": "#0f172a", "lineColor": "#64748b"}}}%%
flowchart TB
  subgraph Surface["Access surface"]
    Mobile["Mobile browser<br/>status, tabs, composer"]
    Desktop["Desktop browser<br/>full terminal workbench"]
  end

  subgraph Ingress["Ingress"]
    Tunnel["Cloudflare Tunnel<br/>HTTPS + WebSocket upgrade"]
  end

  subgraph App["chat2ide app process"]
    UI["React workbench<br/>Vite static UI"]
    Auth["PIN session guard<br/>HttpOnly cookie"]
    API["REST API<br/>create, list, stop, restart"]
    WSGW["WebSocket gateway<br/>attach, input, resize, replay"]
  end

  subgraph Runtime["Terminal runtime"]
    Manager["TerminalSessionManager<br/>lifecycle + limits"]
    Buffer["Ring buffer<br/>recent-output replay"]
    PTY["node-pty<br/>real server-side PTY"]
  end

  subgraph Coding["AI coding environment"]
    CLI["AI coding CLI<br/>Codex / Claude Code / Gemini / Aider / custom"]
    Repo["Project workspace<br/>CODEX_CWD"]
  end

  Mobile -->|HTTPS| Tunnel
  Desktop -->|HTTPS| Tunnel
  Tunnel -->|local HTTP| UI
  UI --> Auth
  UI --> API
  UI <-->|terminal stream| WSGW
  API --> Manager
  WSGW --> Manager
  Manager --> Buffer
  Manager --> PTY
  PTY <-->|stdin / stdout / resize| CLI
  CLI <-->|files, tests, git| Repo

  classDef surface fill:#ecfeff,stroke:#0891b2,color:#164e63
  classDef ingress fill:#eff6ff,stroke:#2563eb,color:#1e3a8a
  classDef app fill:#f8fafc,stroke:#475569,color:#0f172a
  classDef runtime fill:#fff7ed,stroke:#f97316,color:#7c2d12
  classDef coding fill:#f0fdf4,stroke:#16a34a,color:#14532d
  class Mobile,Desktop surface
  class Tunnel ingress
  class UI,Auth,API,WSGW app
  class Manager,Buffer,PTY runtime
  class CLI,Repo coding
```

## Runtime Flow

```mermaid
sequenceDiagram
  autonumber
  participant User as Phone / Browser
  participant UI as React workbench
  participant API as Express REST
  participant WS as WebSocket gateway
  participant TM as TerminalSessionManager
  participant PTY as node-pty PTY
  participant CLI as AI coding CLI

  rect rgb(239, 246, 255)
    Note over User,API: Authenticate and create a terminal
    User->>API: POST /api/auth/login
    API-->>User: HttpOnly session cookie
    User->>API: POST /api/terminals
    API->>TM: allocate starting session
    API-->>UI: terminal summary
  end

  rect rgb(240, 253, 244)
    Note over UI,CLI: Attach starts the real PTY
    UI->>WS: attach terminalId
    WS->>TM: attach subscriber
    TM->>PTY: spawn CODEX_COMMAND in CODEX_CWD
    PTY->>CLI: interactive terminal process
  end

  rect rgb(255, 247, 237)
    Note over User,CLI: Browser input becomes PTY bytes
    CLI-->>WS: output chunks
    WS-->>UI: render in xterm.js
    User->>UI: send command / prompt
    UI->>WS: input, resize, Ctrl+C
    WS->>PTY: write bytes to PTY
  end
```

## Stack

| Layer | Technology |
| --- | --- |
| Browser UI | React, Vite, Tailwind CSS, xterm.js |
| Server | Express, ws, TypeScript |
| Terminal runtime | node-pty with real PTY sessions |
| Remote access | Cloudflare Tunnel to a local `127.0.0.1` service |
| State | In-memory sessions, process handles, and ring buffers |
