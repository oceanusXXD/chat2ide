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
flowchart LR
  subgraph Client["Client devices"]
    Phone["Phone / tablet browser"]
    Desktop["Desktop browser"]
  end

  subgraph Edge["Optional public edge"]
    CF["Cloudflare Tunnel<br/>HTTPS origin"]
  end

  subgraph Server["Trusted server"]
    App["chat2ide<br/>Express + static React UI"]
    Auth["PIN auth<br/>HttpOnly cookie"]
    WS["/ws WebSocket<br/>attach · input · resize · replay"]
    Manager["TerminalSessionManager<br/>limits + ring buffer"]
    PTY["node-pty<br/>real PTY process"]
    Agent["AI coding CLI<br/>Codex CLI / other command"]
    Project["CODEX_CWD<br/>project workspace"]
  end

  Phone -->|HTTPS| CF
  Desktop -->|HTTPS| CF
  CF -->|127.0.0.1:3000| App
  Phone -. local dev .-> App
  App --> Auth
  App <--> WS
  WS --> Manager
  Manager --> PTY
  PTY <--> Agent
  Agent <--> Project
```

## Stack

| Layer | Technology |
| --- | --- |
| Browser UI | React, Vite, Tailwind CSS, xterm.js |
| Server | Express, ws, TypeScript |
| Terminal runtime | node-pty with real PTY sessions |
| Remote access | Cloudflare Tunnel to a local `127.0.0.1` service |
| State | In-memory sessions, process handles, and ring buffers |
