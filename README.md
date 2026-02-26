# HyperNote

HyperNote is a local-first note app built with Svelte + Tauri.
It supports offline-first writing, LAN peer sync, and workspace share/join via WebSocket targets.

## What Works Now

- Local-first note editing and persistence (`.yjs` container format)
- Trash + restore flow
- LAN sync status and peer list
- `share workspace`: generates a copyable join target (for example `ws://192.168.x.x:4747`)
- `join workspace`: accepts `host`, `host:port`, or `ws://host:port`
- Export:
  - current note: `.md` + `.pdf`
  - workspace: `.zip` bundle with manifest
- Command Palette shortcuts and mobile gesture action entry

## Quick Start

### 1) Install

```bash
npm install
```

### 2) Run Web UI (frontend-only)

```bash
npm run dev
```

Note: browser mode is useful for UI development. LAN share/join requires the Tauri runtime.

### 3) Run Desktop App (Tauri)

```bash
cd src-tauri
cargo tauri dev
```

## Share / Join Workspace

1. Put both devices on the same private network.
2. On the host device:
   - open Utility Hub
   - click `share workspace`
   - copy the generated share target
3. On the joining device:
   - open Utility Hub
   - paste target into `join workspace`
   - click `join`
4. Confirm connection in `active peers`.

Auto-discovery via mDNS is also running in parallel, but manual join target is the direct path.

## Quality Commands

```bash
npm run format
npm run lint
npm run test
```

## Specs and Contracts

- Base spec: `docs/SPEC.md`
- Delta spec (mobile/share/export): `docs/SPEC2.md`
- Command and protocol contracts: `docs/contracts.md`

## Current Constraints

- Same-LAN usage only (no internet relay server)
- No auth/permission model yet for shared sessions
- Manual join target currently expects hostname/IPv4 style host (no IPv6 bracket path yet)
