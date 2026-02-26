# HyperNote MVP Core Implementation Plan

## Scope

- MVP Core only: local edit/persist, LAN sync, minimal shell UI.
- CI default for Linux ARM path: `cargo-cross`.
- Work model: 2 builder worktrees + 1 devil's advocate reviewer.

## Branch and Worktree Layout

- Integration branch: `int/mvp-core`
- Builder A branch/worktree: `feat/a-core-persistence` in `../hypernote-wt-a`
- Builder B branch/worktree: `feat/b-sync-ui` in `../hypernote-wt-b`
- Devil's advocate: review-only, no code commits.

## Shared Rules

- After each meaningful change: run `npm run lint`, `npm run format:check`, `npm run test`.
- Commit and push incrementally after each green cycle.
- No direct pushes to `main`.

## Progressive Gates (Soft)

1. Gate 0 Bootstrap

- Tooling and base app skeleton are runnable.

2. Gate 1 Contract Lock

- Tauri command names, WS envelope, and `.yjs` container schema are frozen.

3. Gate 2 Parallel Build

- Agent A: persistence and note metadata flow.
- Agent B: sync/UI wiring and peer status UX.

4. Gate 3 Integration

- Merge into `int/mvp-core`, run full checks, devil's advocate review, then merge to `main`.

## Interface Lock

- Tauri commands: `create_note`, `open_note`, `apply_local_edit`, `apply_peer_update`, `list_notes`, `delete_note_to_trash`, `list_peers`
- WS frame: `{ type, noteId, senderId, protocolVersion, payload }`
- `.yjs` file container: `magic(4) + version(1) + metadataLen(4) + metadataJSON + bodyLen(8) + body + checksum(4)`
