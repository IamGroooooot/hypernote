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

### 2) Install Tauri CLI (once)

If `cargo tauri` is missing, install it:

```bash
cargo install tauri-cli --version '^2.0.0' --locked
```

Verify:

```bash
cargo tauri --version
```

Troubleshooting:

```text
error: no such command: tauri
```

This means the CLI is not installed yet. Run the install command above.

### 3) Run Web UI (frontend-only)

```bash
npm run dev
```

Note: browser mode is useful for UI development. LAN share/join requires the Tauri runtime.

### 4) Run Desktop App (Tauri)

```bash
cd src-tauri
cargo tauri dev
```

### 5) Build Desktop App (Tauri)

```bash
cd src-tauri
cargo tauri build
```

Build artifacts are generated under `src-tauri/target/release/bundle`.

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
4. On the host device:
   - a pending join request appears in Utility Hub
   - click `approve` or `reject`
5. After approval, both sides show the peer in `active peers` and sync starts.

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
- No account/auth identity layer yet (approval is per-connection, local runtime only)
- Manual join target currently expects hostname/IPv4 style host (no IPv6 bracket path yet)
