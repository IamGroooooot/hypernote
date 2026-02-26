# Risk Log (Soft Gate Carry-Over)

## 2026-02-26

### R-001: Peer discovery backend not implemented

- Severity: High
- Area: `src-tauri/src/main.rs`
- Description: `list_peers()` returns in-memory peers, but no mDNS/WebSocket discovery currently populates peer state.
- Impact: LAN status cannot reflect real remote peer topology.
- Mitigation: Add sync service that discovers peers and updates shared state.
- Owner: Sync backend workstream
- Target Gate: Next iteration (post-MVP core merge)

### R-002: Peer update event path is loopback-only

- Severity: High
- Area: `src-tauri/src/main.rs`, `src/lib/tauri-client.ts`, `src/App.svelte`
- Description: `hypernote://peer-update` can be emitted and consumed, but no network receive path produces real remote updates yet.
- Impact: End-to-end LAN collaborative edits are not complete in this iteration.
- Mitigation: Wire WebSocket receive -> `apply_peer_update` command and peer routing by `noteId`.
- Owner: Sync backend workstream
- Target Gate: Next iteration (post-MVP core merge)
