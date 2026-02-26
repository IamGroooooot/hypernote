# HyperNote Contract Lock (Gate 1)

## Tauri Commands

- `create_note() -> NoteMeta`
- `open_note(note_id: String) -> NoteDocument`
- `apply_local_edit(note_id: String, update: Vec<u8>) -> ()`
- `apply_peer_update(note_id: String, update: Vec<u8>) -> ()`
- `list_notes() -> Vec<NoteMeta>`
- `delete_note_to_trash(note_id: String) -> ()`
- `list_peers() -> Vec<PeerInfo>`
- `get_share_target() -> String`
- `join_workspace(target: String) -> CommandAck`

## WebSocket Protocol

Common envelope:

```json
{
  "type": "hello | note_list | state_vector | update | error",
  "noteId": "note-id",
  "senderId": "peer-id",
  "protocolVersion": 1,
  "payload": "type-specific"
}
```

Type details:

- `hello`: `payload = { peerName: string, openNoteIds: string[] }`
- `note_list`: `payload = { noteIds: string[] }`
- `state_vector`: `payload = { vector: base64 }`
- `update`: `payload = { update: base64 }`
- `error`: `payload = { code: string, message: string }`

## `.yjs` Storage Container

Binary layout:

1. `magic`: 4 bytes (`HYPN`)
2. `version`: 1 byte (`0x01`)
3. `metadata_len`: 4 bytes unsigned big-endian
4. `metadata_json`: UTF-8 JSON bytes
5. `body_len`: 8 bytes unsigned big-endian
6. `body`: Yjs update bytes
7. `checksum`: 4 bytes unsigned big-endian (CRC32 of body)

Metadata JSON (minimum):

```json
{
  "id": "note-id",
  "title": "note title",
  "createdAt": 0,
  "updatedAt": 0,
  "deletedAt": null
}
```
