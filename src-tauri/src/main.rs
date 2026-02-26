#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod contracts;

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use contracts::{
    CommandAck, NoteDocument, NoteMeta, PeerConnectedEvent, PeerDisconnectedEvent, PeerInfo,
    PeerUpdateEvent, WsMessageEvent,
};
use tauri::{Emitter, Manager};
use tokio::sync::mpsc::UnboundedSender;

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------

/// peerId → channel to send outgoing WS text messages to that peer.
type WsPeers = Arc<Mutex<HashMap<String, UnboundedSender<String>>>>;

struct AppState {
    notes: Mutex<HashMap<String, NoteDocument>>,
    peers: Mutex<HashMap<String, PeerInfo>>,
    /// Shared (Arc) so async tasks can clone it cheaply without holding State<'_, ...>.
    ws_peers: WsPeers,
    /// Stable identity for this HyperNote instance (UUID, generated at startup).
    peer_id: String,
}

impl AppState {
    fn new(peer_id: String) -> Self {
        Self {
            notes: Default::default(),
            peers: Default::default(),
            ws_peers: Arc::new(Mutex::new(HashMap::new())),
            peer_id,
        }
    }
}

// ---------------------------------------------------------------------------
// Note commands (unchanged from prior implementation)
// ---------------------------------------------------------------------------

#[tauri::command]
fn create_note(state: tauri::State<'_, AppState>) -> NoteMeta {
    let now = unix_now_ms();
    let meta = NoteMeta {
        id: uuid::Uuid::new_v4().to_string(),
        title: "Untitled".to_string(),
        created_at: now,
        updated_at: now,
        deleted_at: None,
    };

    let mut notes = state.notes.lock().expect("note store poisoned");
    notes.insert(
        meta.id.clone(),
        NoteDocument {
            meta: meta.clone(),
            yjs_state: Vec::new(),
            markdown: String::new(),
        },
    );

    meta
}

#[tauri::command]
fn open_note(note_id: String, state: tauri::State<'_, AppState>) -> Result<NoteDocument, String> {
    let notes = state.notes.lock().map_err(|_| "note store poisoned")?;

    notes
        .get(&note_id)
        .cloned()
        .ok_or_else(|| format!("note not found: {note_id}"))
}

#[tauri::command]
fn apply_local_edit(
    note_id: String,
    update: Vec<u8>,
    state: tauri::State<'_, AppState>,
) -> CommandAck {
    let mut notes = match state.notes.lock() {
        Ok(value) => value,
        Err(_) => {
            return CommandAck {
                accepted: false,
                reason: Some("note store poisoned".to_string()),
            }
        }
    };

    if let Some(note) = notes.get_mut(&note_id) {
        note.yjs_state = update;
        note.meta.updated_at = unix_now_ms();
        return CommandAck {
            accepted: true,
            reason: None,
        };
    }

    CommandAck {
        accepted: false,
        reason: Some(format!("note not found: {note_id}")),
    }
}

#[tauri::command]
fn apply_peer_update(
    note_id: String,
    update: Vec<u8>,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> CommandAck {
    let mut notes = match state.notes.lock() {
        Ok(value) => value,
        Err(_) => {
            return CommandAck {
                accepted: false,
                reason: Some("note store poisoned".to_string()),
            }
        }
    };

    if let Some(note) = notes.get_mut(&note_id) {
        note.yjs_state = update.clone();
        note.meta.updated_at = unix_now_ms();

        let payload = PeerUpdateEvent { note_id, update };

        if let Err(error) = app.emit("hypernote://peer-update", payload) {
            return CommandAck {
                accepted: false,
                reason: Some(format!("emit failed: {error}")),
            };
        }

        return CommandAck {
            accepted: true,
            reason: None,
        };
    }

    CommandAck {
        accepted: false,
        reason: Some("note not found".to_string()),
    }
}

#[tauri::command]
fn list_notes(state: tauri::State<'_, AppState>) -> Vec<NoteMeta> {
    let notes = match state.notes.lock() {
        Ok(value) => value,
        Err(_) => return Vec::new(),
    };

    let mut metas: Vec<NoteMeta> = notes.values().map(|note| note.meta.clone()).collect();
    metas.sort_by_key(|note| std::cmp::Reverse(note.updated_at));
    metas
}

#[tauri::command]
fn delete_note_to_trash(note_id: String, state: tauri::State<'_, AppState>) -> CommandAck {
    let mut notes = match state.notes.lock() {
        Ok(value) => value,
        Err(_) => {
            return CommandAck {
                accepted: false,
                reason: Some("note store poisoned".to_string()),
            }
        }
    };

    if notes.remove(&note_id).is_some() {
        return CommandAck {
            accepted: true,
            reason: None,
        };
    }

    CommandAck {
        accepted: false,
        reason: Some("note not found".to_string()),
    }
}

#[tauri::command]
fn list_peers(state: tauri::State<'_, AppState>) -> Vec<PeerInfo> {
    let peers = match state.peers.lock() {
        Ok(value) => value,
        Err(_) => return Vec::new(),
    };

    peers.values().cloned().collect()
}

// ---------------------------------------------------------------------------
// WebSocket / sync commands
// ---------------------------------------------------------------------------

#[tauri::command]
fn broadcast_update(payload: String, state: tauri::State<'_, AppState>) -> CommandAck {
    let ws_peers = match state.ws_peers.lock() {
        Ok(value) => value,
        Err(_) => {
            return CommandAck {
                accepted: false,
                reason: Some("ws_peers poisoned".to_string()),
            }
        }
    };

    let mut failed = 0usize;
    for tx in ws_peers.values() {
        if tx.send(payload.clone()).is_err() {
            failed += 1;
        }
    }

    CommandAck {
        accepted: true,
        reason: if failed > 0 {
            Some(format!("{failed} peer(s) unreachable"))
        } else {
            None
        },
    }
}

#[tauri::command]
fn send_to_peer(peer_id: String, payload: String, state: tauri::State<'_, AppState>) -> CommandAck {
    let ws_peers = match state.ws_peers.lock() {
        Ok(value) => value,
        Err(_) => {
            return CommandAck {
                accepted: false,
                reason: Some("ws_peers poisoned".to_string()),
            }
        }
    };

    if let Some(tx) = ws_peers.get(&peer_id) {
        let ok = tx.send(payload).is_ok();
        CommandAck {
            accepted: ok,
            reason: if ok {
                None
            } else {
                Some("channel closed".to_string())
            },
        }
    } else {
        CommandAck {
            accepted: false,
            reason: Some(format!("peer not found: {peer_id}")),
        }
    }
}

#[tauri::command]
fn get_peer_id(state: tauri::State<'_, AppState>) -> String {
    state.peer_id.clone()
}

#[tauri::command]
fn get_share_target() -> String {
    let host = detect_local_ipv4_host()
        .map(|ip| ip.to_string())
        .unwrap_or_else(default_share_host);
    format!("ws://{host}:4747")
}

#[tauri::command]
fn join_workspace(
    target: String,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> CommandAck {
    let addr = match normalize_join_target(&target) {
        Ok(value) => value,
        Err(reason) => {
            return CommandAck {
                accepted: false,
                reason: Some(reason),
            }
        }
    };

    if is_self_join_target(&addr) {
        return CommandAck {
            accepted: false,
            reason: Some("cannot join your own workspace target".to_string()),
        };
    }

    let ws_peers = Arc::clone(&state.ws_peers);
    tauri::async_runtime::spawn(async move {
        connect_to_peer_ws(addr, app, ws_peers).await;
    });

    CommandAck {
        accepted: true,
        reason: None,
    }
}

// ---------------------------------------------------------------------------
// WebSocket connection handler (shared by server-accept and client-connect)
// ---------------------------------------------------------------------------

async fn handle_ws_connection<S>(
    ws: tokio_tungstenite::WebSocketStream<S>,
    addr: String,
    app: tauri::AppHandle,
    ws_peers: WsPeers,
) where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static,
{
    use futures_util::{SinkExt, StreamExt};
    use tokio_tungstenite::tungstenite::Message;

    let peer_id = uuid::Uuid::new_v4().to_string();
    let (mut sink, mut stream) = ws.split();
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<String>();

    // Register peer sender — Arc<Mutex<...>> is 'static, safe across awaits.
    if let Ok(mut peers) = ws_peers.lock() {
        peers.insert(peer_id.clone(), tx);
    }

    let _ = app.emit(
        "hypernote://peer-connected",
        PeerConnectedEvent {
            peer_id: peer_id.clone(),
            addr: addr.clone(),
        },
    );

    // Forward outgoing messages to the WS sink in a background task.
    let sink_task = tauri::async_runtime::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if sink.send(Message::Text(msg.into())).await.is_err() {
                break;
            }
        }
    });

    // Read incoming messages and forward to frontend.
    while let Some(msg_result) = stream.next().await {
        match msg_result {
            Ok(Message::Text(text)) => {
                let _ = app.emit(
                    "hypernote://ws-message",
                    WsMessageEvent {
                        peer_id: peer_id.clone(),
                        payload: text.to_string(),
                    },
                );
            }
            Ok(Message::Close(_)) | Err(_) => break,
            _ => {}
        }
    }

    sink_task.abort();

    // Deregister peer.
    if let Ok(mut peers) = ws_peers.lock() {
        peers.remove(&peer_id);
    }

    let _ = app.emit(
        "hypernote://peer-disconnected",
        PeerDisconnectedEvent { peer_id },
    );
}

// ---------------------------------------------------------------------------
// WebSocket server (TCP 4747)
// ---------------------------------------------------------------------------

async fn run_ws_server(app: tauri::AppHandle, ws_peers: WsPeers) {
    use tokio::net::TcpListener;

    let listener = match TcpListener::bind("0.0.0.0:4747").await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[hypernote] WS server bind failed on 4747: {e}");
            return;
        }
    };

    eprintln!("[hypernote] WS server listening on 0.0.0.0:4747");

    loop {
        match listener.accept().await {
            Ok((stream, addr)) => {
                let app = app.clone();
                let ws_peers = Arc::clone(&ws_peers);
                let addr_str = addr.to_string();
                tauri::async_runtime::spawn(async move {
                    match tokio_tungstenite::accept_async(stream).await {
                        Ok(ws) => handle_ws_connection(ws, addr_str, app, ws_peers).await,
                        Err(e) => eprintln!("[hypernote] WS handshake error: {e}"),
                    }
                });
            }
            Err(e) => eprintln!("[hypernote] WS accept error: {e}"),
        }
    }
}

// ---------------------------------------------------------------------------
// WebSocket client (connects to a discovered peer)
// ---------------------------------------------------------------------------

async fn connect_to_peer_ws(addr: String, app: tauri::AppHandle, ws_peers: WsPeers) {
    let url = format!("ws://{addr}/");

    match tokio_tungstenite::connect_async(&url).await {
        Ok((ws, _)) => handle_ws_connection(ws, addr, app, ws_peers).await,
        Err(e) => eprintln!("[hypernote] WS connect to {addr} failed: {e}"),
    }
}

// ---------------------------------------------------------------------------
// mDNS registration + peer discovery
// ---------------------------------------------------------------------------

fn run_mdns(peer_id: String, app: tauri::AppHandle, ws_peers: WsPeers) {
    use mdns_sd::{ServiceDaemon, ServiceEvent, ServiceInfo};

    let mdns = match ServiceDaemon::new() {
        Ok(d) => d,
        Err(e) => {
            eprintln!("[hypernote] mDNS daemon start failed: {e}");
            return;
        }
    };

    let host = format!("{}.local.", local_hostname());
    let service_info = ServiceInfo::new(
        "_hypernote._tcp.local.",
        &peer_id,
        &host,
        "", // IP: auto-detect from bound interfaces
        4747,
        None,
    );

    match service_info {
        Ok(info) => {
            if let Err(e) = mdns.register(info) {
                eprintln!("[hypernote] mDNS register failed: {e}");
            } else {
                eprintln!("[hypernote] mDNS registered as {peer_id}._hypernote._tcp.local.");
            }
        }
        Err(e) => eprintln!("[hypernote] mDNS ServiceInfo build failed: {e}"),
    }

    let receiver = match mdns.browse("_hypernote._tcp.local.") {
        Ok(r) => r,
        Err(e) => {
            eprintln!("[hypernote] mDNS browse failed: {e}");
            return;
        }
    };

    loop {
        match receiver.recv_timeout(std::time::Duration::from_secs(5)) {
            Ok(ServiceEvent::ServiceResolved(info)) => {
                let name = info.get_fullname();

                // Skip self.
                if name.contains(&peer_id) {
                    continue;
                }

                for addr in info.get_addresses() {
                    let ws_addr = format!("{addr}:4747");
                    let app = app.clone();
                    let ws_peers = Arc::clone(&ws_peers);
                    tauri::async_runtime::spawn(async move {
                        connect_to_peer_ws(ws_addr, app, ws_peers).await;
                    });
                }
            }
            Ok(ServiceEvent::ServiceRemoved(_, name)) => {
                eprintln!("[hypernote] mDNS peer removed: {name}");
            }
            Ok(_) => {}
            Err(_) => {
                // Timeout or channel closed — keep looping.
            }
        }
    }
}

fn local_hostname() -> String {
    std::process::Command::new("hostname")
        .output()
        .ok()
        .and_then(|out| String::from_utf8(out.stdout).ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "hypernote-host".to_string())
}

fn normalize_join_target(raw: &str) -> Result<String, String> {
    let target = raw.trim();
    if target.is_empty() {
        return Err("target is empty".to_string());
    }

    if let Some(without_scheme) = target.strip_prefix("ws://") {
        return parse_host_port_target(without_scheme, true);
    }

    if target.contains("://") {
        return Err("only ws:// scheme is supported".to_string());
    }

    parse_host_port_target(target, false)
}

fn parse_host_port_target(value: &str, require_port: bool) -> Result<String, String> {
    if value.is_empty() {
        return Err("target is empty".to_string());
    }

    if value
        .chars()
        .any(|ch| ch.is_whitespace() || matches!(ch, '/' | '?' | '#'))
    {
        return Err("target contains unsupported characters".to_string());
    }

    if let Some((host, port_raw)) = value.rsplit_once(':') {
        if host.is_empty() {
            return Err("host is missing".to_string());
        }

        if host.contains(':') {
            return Err("target host format is invalid".to_string());
        }

        let port = match port_raw.parse::<u16>() {
            Ok(value) if value > 0 => value,
            _ => return Err("port must be between 1 and 65535".to_string()),
        };

        return Ok(format!("{host}:{port}"));
    }

    if require_port {
        return Err("target must be ws://host:port".to_string());
    }

    Ok(format!("{value}:4747"))
}

fn is_self_join_target(addr: &str) -> bool {
    let (host, port_raw) = match addr.rsplit_once(':') {
        Some(value) => value,
        None => return false,
    };

    let port = match port_raw.parse::<u16>() {
        Ok(value) => value,
        Err(_) => return false,
    };

    if port != 4747 {
        return false;
    }

    let host_lower = host.to_ascii_lowercase();
    if matches!(
        host_lower.as_str(),
        "localhost" | "127.0.0.1" | "0.0.0.0" | "::1"
    ) {
        return true;
    }

    let local_host = local_hostname().to_ascii_lowercase();
    if host_lower == local_host || host_lower == format!("{local_host}.local") {
        return true;
    }

    if let Some(local_ip) = detect_local_ipv4_host() {
        if host == local_ip.to_string() {
            return true;
        }
    }

    false
}

fn detect_local_ipv4_host() -> Option<std::net::Ipv4Addr> {
    use std::net::{IpAddr, UdpSocket};

    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    match socket.local_addr().ok()?.ip() {
        IpAddr::V4(ip) if !ip.is_loopback() => Some(ip),
        _ => None,
    }
}

fn default_share_host() -> String {
    let host = local_hostname();
    if host.contains('.') {
        host
    } else {
        format!("{host}.local")
    }
}

#[cfg(test)]
mod tests {
    use super::{is_self_join_target, normalize_join_target};

    #[test]
    fn blocks_loopback_self_join_targets() {
        assert!(is_self_join_target("localhost:4747"));
        assert!(is_self_join_target("127.0.0.1:4747"));
        assert!(!is_self_join_target("127.0.0.1:4748"));
    }

    #[test]
    fn normalizes_host_without_port() {
        let normalized = normalize_join_target("peer-host").expect("normalize should succeed");
        assert_eq!(normalized, "peer-host:4747");
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn unix_now_ms() -> i64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

fn main() {
    let peer_id = uuid::Uuid::new_v4().to_string();

    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .manage(AppState::new(peer_id))
        .setup(|app| {
            // Clone the WsPeers Arc once; share it across WS server and mDNS tasks.
            let state = app.state::<AppState>();
            let ws_peers = Arc::clone(&state.ws_peers);
            let peer_id = state.peer_id.clone();
            drop(state);

            // Start WebSocket server.
            let app_handle = app.handle().clone();
            let ws_peers_ws = Arc::clone(&ws_peers);
            tauri::async_runtime::spawn(async move {
                run_ws_server(app_handle, ws_peers_ws).await;
            });

            // Start mDNS in a blocking OS thread (mdns-sd uses sync channels).
            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                run_mdns(peer_id, app_handle, ws_peers);
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            create_note,
            open_note,
            apply_local_edit,
            apply_peer_update,
            list_notes,
            delete_note_to_trash,
            list_peers,
            broadcast_update,
            send_to_peer,
            get_peer_id,
            get_share_target,
            join_workspace,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
