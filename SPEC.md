# SPEC: HyperNote — 세상에서 제일 빠른 노트

Version: 0.1.0
Status: Draft
Last Updated: 2026-02-26
Authors: jhko

## Executive Summary

손가락이 키에서 떠나기 전에 이미 화면에 있다. HyperNote는 타이핑의 흐름을 끊지 않는 것을 첫 번째 원칙으로 삼는다.

타이핑이 멈추면, 앱이 숨을 고른 뒤 기록한다. 저장 버튼은 없다. 쉼표 하나의 시간(500ms)이면 충분하다.

같은 LAN의 여러 기기가 같은 노트를 함께 편집할 때, 지휘자는 없다. 각자가 자신의 속도로 입력하고, 연주가 끝나면 같은 악보가 된다.

---

**기술 요약:** macOS 전용 데스크탑 앱 (Tauri v2 + Svelte). 로컬 파일 우선 저장(`.yjs` + `.md`). LAN 피어 자동 발견(mDNS) 후 CRDT(Yjs) 기반 동시편집. 인터넷·중앙 서버 없음. 보안은 설계 범위 밖.

---

## 1. Problem Frame

### 1.1 Domains

#### User (Type: Biddable)

Description: 노트를 작성·편집하는 인간. 타이핑 속도·패턴을 예측할 수 없음.

Controls:
- 키보드 입력 이벤트 (keydown, keyup)
- 마우스/포인터 이벤트
- 앱 실행·종료 시점

Observes:
- 화면에 렌더링된 텍스트
- 동기화 상태 표시 (피어 수, sync progress)
- 파일 목록

---

#### HyperNote (Type: Causal — Machine to build)

Description: 빌드 대상 데스크탑 앱. Tauri(Rust) + 웹 프론트엔드.

Controls:
- CRDT 문서 상태 (in-memory Yjs Doc)
- DOM 렌더링
- 로컬 파일 I/O
- WebSocket 서버/클라이언트

Observes:
- 키보드 이벤트
- 피어로부터 수신한 CRDT diff
- LocalFS 읽기 결과

---

#### LocalFS (Type: Lexical)

Description: 운영체제 파일시스템. 노트의 영속 저장소.

Controls:
- 없음 (수동적 저장소)

Observes:
- 없음

Assumptions:
- SSD 기준 fsync < 50ms
- 앱 데이터 디렉터리 읽기/쓰기 권한 보장
- 파일당 최대 크기: 50MB (CRDT 바이너리 포함)

---

#### LANNetwork (Type: Connection)

Description: 같은 IP 서브넷 내 네트워크. 피어 발견 및 CRDT 메시지 전달.

Controls:
- 없음 (수동적 채널)

Observes:
- 없음

Assumptions:
- mDNS 멀티캐스트 지원 (일반 홈/오피스 라우터)
- 피어 간 RTT < 5ms (동일 LAN)
- 패킷 손실률 < 0.1% (유선) / < 1% (Wi-Fi)
- 최대 동시 피어: 10

---

#### PeerInstance (Type: Causal)

Description: 같은 LAN의 다른 HyperNote 인스턴스. 동일 소프트웨어, 독립 실행.

Controls:
- 자신의 CRDT 상태
- WebSocket 연결 개시/종료

Observes:
- 로컬 사용자의 편집

---

### 1.2 Shared Phenomena

| Interface | Domain A | Domain B | Phenomena |
|-----------|----------|----------|-----------|
| IF-01 | User | HyperNote | keydown 이벤트, 마우스 클릭, DOM 텍스트/커서 상태 |
| IF-02 | HyperNote | LocalFS | `.yjs` 바이너리 파일 read/write, 파일 목록 |
| IF-03 | HyperNote | LANNetwork | mDNS 서비스 레코드, WebSocket 메시지 (CRDT diff) |
| IF-04 | LANNetwork | PeerInstance | WebSocket 연결 수락, CRDT diff 메시지 수신 |

### 1.3 Context Diagram

```
┌─────────────┐  IF-01  ┌─────────────────────────┐  IF-02  ┌──────────────┐
│    User     │◄───────►│       HyperNote          │◄───────►│   LocalFS    │
│  (Biddable) │         │    (Machine to build)    │         │   (Lexical)  │
└─────────────┘         └────────────┬────────────┘         └──────────────┘
                                     │ IF-03
                              ┌──────▼──────┐
                              │ LANNetwork  │
                              │(Connection) │
                              └──────┬──────┘
                                     │ IF-04
                              ┌──────▼──────┐
                              │PeerInstance │
                              │  (Causal)   │
                              └─────────────┘
```

**Problem Frame 분류:**
- **Simple Workpieces** (노트 생성·편집): 주 프레임
- **Commanded Behavior** (동시편집 제어): 복합 프레임
- **Information Display** (sync 상태 표시): 보조 프레임

---

## 2. Domain Assumptions (Breadcrumbs)

### 2.1 User Assumptions

#### A-01: 지각 임계값 (Perceptual Threshold)
Statement: "인간이 입력 응답을 '즉각적'으로 지각하는 임계값은 16ms (60fps 1 프레임)이다"
Justification: HCI 연구 (Nielsen 1993: "0.1s feels instantaneous for typing"; 60fps displays make <16ms perceptible)
Validation Status: Validated
Impact if False: 더 낮은 임계값(8ms)이면 120fps 대응 필요 — 성능 요구사항 상향

#### A-02: 키보드 연속 입력 속도
Statement: "사용자의 최대 타이핑 속도는 200WPM = 약 17 keystrokes/s ≈ 60ms 간격"
Justification: 세계 기록 수준. 일반 사용자 80WPM = 150ms 간격
Validation Status: Validated
Impact if False: 더 빠른 입력 시 이벤트 큐 백로그 발생 가능

#### A-03: 사용자 파일 관리 기대
Statement: "사용자는 노트를 명시적으로 저장하지 않는다 (auto-save 기대)"
Justification: 현대 노트앱(Notion, Obsidian, Bear) 모두 auto-save
Validation Status: Assumed
Impact if False: 명시적 save UI가 필요해짐

---

### 2.2 LocalFS Assumptions

#### A-04: 비동기 쓰기 허용
Statement: "사용자는 편집 후 500ms 이내 디스크 반영을 기대한다"
Justification: 앱 크래시 시 500ms 데이터 손실은 허용 가능 (노트 앱 특성)
Validation Status: Assumed
Impact if False: 즉시 fsync 필요 → 렌더 경로에 I/O 블로킹 발생

#### A-05: 파일 형식 이중성
Statement: ".yjs 파일이 CRDT 상태를 담고, 사이드카 .md 파일이 읽기용 텍스트를 담는다"
Justification: CRDT 바이너리는 인간 가독 불가 → Markdown export 필요
Validation Status: Assumed
Impact if False: .yjs만 쓰면 외부 도구 연동 불가

---

### 2.3 LANNetwork Assumptions

#### A-06: mDNS 가용성
Statement: "동일 LAN 내 모든 기기에서 mDNS(_hypernote._tcp.local)가 동작한다"
Justification: macOS 기본 지원; Linux(Ubuntu 24.04.1)는 avahi-daemon 설치 시 지원
Validation Status: Pending (Linux avahi-daemon 사전 설치 여부 확인 필요)
Impact if False: 수동 IP 입력 fallback 또는 UDP broadcast 필요

#### A-06c: Linux mDNS 의존성
Statement: "Ubuntu 24.04.1 aarch64 환경에서 avahi-daemon이 실행 중이다"
Justification: Ubuntu 24.04 LTS에 avahi-daemon 기본 포함 (`systemctl status avahi-daemon`)
Validation Status: Pending (Ubuntu 24.04.1 기본 설치 확인 필요)
Impact if False: 앱 설치 시 avahi-daemon 설치 안내 필요

#### A-06b: 피어 목록 교환 프로토콜
Statement: "WebSocket 연결 수립 직후 양 피어는 자신의 noteId 목록을 JSON으로 교환한다"
Justification: 공통 noteId 탐지를 위한 핸드셰이크 필수
Validation Status: Assumed
Impact if False: 공통 noteId 탐지 불가 → 수동 sync만 가능

#### A-07: WebSocket 연결 안정성
Statement: "피어 간 WebSocket 연결은 재연결 없이 세션 지속 가능하다 (30분 이상)"
Justification: 동일 LAN에서 NAT/방화벽 없음 가정
Validation Status: Assumed
Impact if False: heartbeat + 자동 재연결 로직 필수

#### A-08: CRDT diff 크기
Statement: "단일 keystroke의 CRDT diff는 < 100 bytes"
Justification: Yjs 벤치마크 — 단일 insert는 ~50 bytes
Validation Status: Validated (Yjs docs)
Impact if False: 대용량 diff → 네트워크 배압 처리 필요

---

### 2.4 CRDT Assumptions

#### A-09: Yjs 수렴 보장
Statement: "같은 Yjs 문서에 동일한 operations 집합을 임의 순서로 적용하면 동일 상태에 수렴한다"
Justification: Yjs CRDT 논문 (Nicolaescu et al.) — 수학적 증명됨
Validation Status: Validated
Impact if False: 수동 conflict resolution UI 필요

#### A-10: Clock-free 병합
Statement: "Yjs는 벡터 클록 없이 클라이언트 측 고유 clientID로 연산 순서를 결정한다"
Justification: Yjs 내부 구현 — clientID는 앱 시작 시 random uint32
Validation Status: Validated
Impact if False: 충돌 시 LWW(Last-Write-Wins) fallback 필요

---

## 3. Requirements

### 3.1 Business Requirements (Optative)

| ID | Requirement | Priority | Source |
|----|-------------|----------|--------|
| R-01 | 노트 입력이 지연 없이 즉각 반응해야 한다 | Must | 사용자 |
| R-02 | 노트는 앱 재시작 후에도 유지되어야 한다 | Must | 사용자 |
| R-03 | 같은 LAN의 여러 기기에서 동시에 같은 노트를 편집할 수 있어야 한다 | Must | 사용자 |
| R-04 | 동시 편집 시 데이터가 손실되지 않아야 한다 | Must | 사용자 |
| R-05 | UI가 사이버펑크/다크 긱 감성이어야 한다 | Should | 사용자 |
| R-06 | 노트를 빠르게 전환하고 검색할 수 있어야 한다 | Should | 사용자 |

---

### 3.2 Requirement Progression

#### R-01 Progression: 입력 즉각 반응

Level 0 (Original):
> "노트 입력이 지연 없이 즉각 반응해야 한다"

Breadcrumb Applied: A-01 (인간 지각 임계값 = 16ms)
Level 1:
> "사용자가 키를 누른 시점부터 화면에 문자가 나타나기까지 16ms 이내여야 한다"

Breadcrumb Applied: A-02 (파일 쓰기를 렌더 경로에서 분리)
Level 2:
> "편집기 렌더 경로(keydown → CRDT update → DOM repaint)는 동기적이며 16ms 이내 완료. 디스크 쓰기 및 네트워크 전송은 비동기 off-path"

Breadcrumb Applied: A-08 (CRDT diff < 100 bytes, WebSocket.send는 비블로킹)
Level 3 (Machine Specification):
> "keydown 핸들러에서 `ydoc.getText().insert(index, char)` 호출 후 CodeMirror dispatch까지 동기 실행, 16ms wall-clock 내 완료. `encodeStateAsUpdate(ydoc)` 및 `fs.writeFile` 호출은 microtask/setTimeout으로 deferred."

---

#### R-02 Progression: 데이터 영속성

Level 0 (Original):
> "노트는 앱 재시작 후에도 유지되어야 한다"

Breadcrumb Applied: A-03 (auto-save 기대, 명시적 저장 없음)
Level 1:
> "사용자가 저장 동작 없이 편집해도 노트가 영속된다"

Breadcrumb Applied: A-04 (편집 후 500ms 이내 디스크 반영 허용)
Level 2:
> "편집 후 500ms 이내에 변경사항이 LocalFS에 기록된다"

Breadcrumb Applied: A-05 (.yjs + .md 이중 파일 구조)
Level 3 (Machine Specification):
> "편집 이벤트마다 debounce(500ms) 타이머를 리셋. 타이머 만료 시 `Y.encodeStateAsUpdate(ydoc)` → `{noteId}.yjs` 쓰기 + `ydoc.getText().toString()` → `{noteId}.md` 쓰기. 앱 시작 시 데이터 디렉터리 내 모든 `.yjs` 파일을 읽어 `Y.applyUpdate(ydoc, bytes)`로 복원."

---

#### R-03 Progression: LAN 동시편집

Level 0 (Original):
> "같은 LAN의 여러 기기에서 동시에 같은 노트를 편집할 수 있어야 한다"

Breadcrumb Applied: A-06 (mDNS로 피어 자동 발견)
Level 1:
> "같은 LAN의 HyperNote 인스턴스들이 자동으로 서로를 발견한다"

Breadcrumb Applied: A-07 (WebSocket 세션 안정)
Level 2:
> "발견된 피어와 WebSocket 연결을 수립하고, 편집 시 CRDT diff를 브로드캐스트한다"

Breadcrumb Applied: A-08 (diff < 100 bytes, 즉시 전송)
Level 3 (Machine Specification):
> "앱 시작 시 TCP 4747 포트에서 WebSocket 서버 시작 + mDNS `_hypernote._tcp.local` 등록. 동일 LAN의 mDNS 응답 수신 시 해당 피어에 WebSocket 클라이언트로 연결. 로컬 편집 시 `Y.encodeStateAsUpdate(ydoc, lastSentState)` delta를 모든 연결된 피어에 `ws.send(binaryDiff)`. 피어 연결 해제 시 자동 mDNS 재발견."

---

#### R-04 Progression: 데이터 무손실 동시편집

Level 0 (Original):
> "동시 편집 시 데이터가 손실되지 않아야 한다"

Breadcrumb Applied: A-09 (Yjs 수렴 보장)
Level 1:
> "어떤 순서로 편집이 도착해도 모든 피어가 동일한 최종 상태에 수렴한다"

Breadcrumb Applied: A-10 (clientID 기반 결정론적 병합)
Level 2:
> "충돌 해결은 Yjs 내부 알고리즘에 위임되며, 앱 레이어에서 별도 처리 없음"

Level 3 (Machine Specification):
> "수신한 모든 WebSocket 메시지에 `Y.applyUpdate(ydoc, receivedBytes)` 호출. 반환값으로 변경된 텍스트 범위를 계산하여 CodeMirror에 `view.dispatch(tr)` 적용. 자기 자신의 diff를 수신해도 Yjs가 멱등 처리."

---

### 3.3 Technical Requirements (Derived)

| ID | Derived From | Technical Requirement |
|----|--------------|----------------------|
| T-01 | R-01, A-01 | keydown → CodeMirror dispatch ≤ 16ms (P99, 측정 기준: `performance.now()`) |
| T-02 | R-02, A-04 | 편집 후 debounce 500ms → `{id}.yjs` + `{id}.md` 원자적 쓰기 |
| T-03 | R-02 | 앱 시작 → 첫 노트 렌더 ≤ 200ms (cold start, 노트 100개 기준) |
| T-04 | R-03, A-06 | mDNS `_hypernote._tcp.local` 등록; 피어 발견 ≤ 3s |
| T-05 | R-03 | WebSocket 서버: TCP 4747, 바이너리 프레임, 최대 10 동시 연결 |
| T-06 | R-04, A-09 | CRDT: Yjs v13+; `Y.Doc` per note; `Y.Text` 타입 사용 |
| T-07 | R-05 | 테마 토큰: bg `#0a0a0f`, accent `#00ffcc`, font `JetBrains Mono` |
| T-08 | R-06 | Command Palette (`⌘K`): 노트 열기/생성/삭제/이름변경/복구, 피어 목록 보기 지원 |
| T-09 | R-03 | 피어 연결/재연결 시 noteId 목록 교환 → 공통 noteId 노트는 전체 Y.Doc state 교환 후 자동 full merge |
| T-10 | R-05 | 에디터: CodeMirror 6 Markdown 모드 (소스 편집 + 인라인 렌더링) |
| T-11 | — | 노트 삭제 → `~/.hypernote/trash/`로 이동; 30일 초과 항목 앱 시작 시 자동 제거 |
| T-12 | R-06 | 검색: 제목 fuzzy match 우선 → 결과 없으면 본문 전문(full-text) fallback; 통합 결과 ≤ 100ms |
| T-13 | NC-01 | 노트 크기 하드 제한 없음; 단 CRDT 크기 > 100MB 시 에디터 성능 저하 경고 표시 |
| T-14 | — | 노트 목록 정렬: updatedAt DESC (최근 수정 우선), 정렬 변경 UI 없음 |
| T-15 | — | 노트 구조: 완전 플랫 (폴더/태그 없음). `~/.hypernote/notes/` 단일 디렉터리 |
| T-16 | R-03 | 오프라인 편집 후 피어 재연결 시 전체 Y.Doc state 교환 → CRDT 자동 full merge (데이터 무손실) |
| T-17 | — | 앱 시작 시 `~/.hypernote/notes/` 내 모든 `.yjs` 파일의 metadata(id, title, updatedAt)만 파싱하여 목록 구성; Y.Doc 전체 로드는 해당 노트를 열 때 수행 |
| T-18 | — | 앱 시작 시 `~/.hypernote/trash/` 스캔; `deletedAt` 기준 30일 초과 파일 영구 삭제 |
| T-19 | — | `.yjs` 파일에 4바이트 매직 헤더 + metadata(JSON) + CRDT 바이너리 구조로 저장하여 전체 파싱 없이 metadata 추출 가능 |

---

## 4. Specification

### 4.1 Data Model

#### Types

```
Entity: Note
  id:           NanoID (21 chars, URL-safe, unique)
  title:        String (첫 줄 텍스트, 최대 200자)
  crdtState:    Bytes  (Yjs Y.Doc 직렬화)
  plaintextMd:  String (사이드카 export, 읽기용)
  createdAt:    UnixTimestampMs
  updatedAt:    UnixTimestampMs

Entity: Peer
  peerId:       String (mDNS hostname + port)
  wsUrl:        String ("ws://192.168.x.x:4747")
  status:       PeerStatus
  noteIds:      Set<NoteID>  -- 현재 열린 노트들

Enum: PeerStatus
  DISCOVERING | CONNECTING | CONNECTED | DISCONNECTED

Entity: SyncSession
  noteId:       NoteID
  peers:        Set<PeerID>
  lastSentVec:  Bytes  -- Y.encodeStateVector(ydoc), delta 계산용
```

#### File Layout

```
~/.hypernote/
  notes/
    {noteId}.yjs     -- CRDT 바이너리 (영속 저장)
    {noteId}.md      -- 평문 sidecar (읽기/백업용)
  trash/
    {noteId}.yjs     -- 삭제된 노트 (30일 자동 비우기)
    {noteId}.md      -- 삭제된 노트 sidecar
  config.json        -- 앱 설정
```

#### Type Diagram

```
┌──────────────────┐         ┌──────────────────┐
│      Note        │         │      Peer        │
├──────────────────┤         ├──────────────────┤
│ id: NanoID       │         │ peerId: String   │
│ title: String    │  syncs  │ wsUrl: String    │
│ crdtState: Bytes │◄───────►│ status: Enum     │
│ plaintextMd: Str │         │ noteIds: Set     │
│ createdAt: Long  │         └──────────────────┘
│ updatedAt: Long  │
└──────────────────┘
```

---

### 4.2 Invariants

| ID | Category | Invariant | Enforcement |
|----|----------|-----------|-------------|
| I-01 | Uniqueness | Note.id는 전역 유일 (NanoID collision probability < 1/10^30) | NanoID 생성 시 보장 |
| I-02 | Consistency | Note.plaintextMd = Y.Text.toString() (항상 CRDT에서 파생) | 쓰기 시 동기 생성 |
| I-03 | Temporal | Note.createdAt ≤ Note.updatedAt | 편집 시 updatedAt 갱신 |
| I-04 | CRDT Idempotency | 동일 update bytes를 N회 적용해도 상태 변화 없음 | Yjs 내부 보장 |
| I-05 | CRDT Convergence | 임의 순서로 동일 update set 적용 시 모든 피어의 Y.Text 동일 | Yjs CRDT 수학적 보장 |
| I-06 | Render Causality | DOM에 표시된 텍스트 ⊆ 로컬 Y.Doc 상태 (phantom 문자 없음) | CodeMirror ↔ Y.Text 바인딩 |
| I-07 | No Orphan Sync | SyncSession은 연결된 Peer와 1:1 매핑 | WebSocket onclose 시 세션 제거 |
| I-08 | Bounded Debounce | 편집 이벤트 발생 후 최대 500ms 이내 파일 쓰기 스케줄됨 | debounce 타이머 invariant |

---

### 4.3 State Machines

#### Note Edit → Persist Lifecycle

```
편집 이벤트 수신
        │
        ▼
┌───────────────┐    debounce     ┌──────────────────┐
│  IN_MEMORY    │─────500ms──────►│  PENDING_WRITE   │
│  (Y.Doc live) │                 │  (timer active)  │
└───────────────┘                 └────────┬─────────┘
        ▲                                  │ timer 만료
        │ 새 편집 (타이머 리셋)            ▼
        │                         ┌──────────────────┐
        └─────────────────────────│   WRITING        │
                                  │  (fs.writeFile)  │
                                  └────────┬─────────┘
                                           │ 완료
                                           ▼
                                  ┌──────────────────┐
                                  │    PERSISTED     │
                                  └──────────────────┘
```

#### Peer Sync Lifecycle

```
              앱 시작
                 │
                 ▼
       ┌──────────────────┐
       │   DISCOVERING    │◄─────────────────────────┐
       │ (mDNS listening) │                          │
       └────────┬─────────┘                          │
                │ 피어 발견                           │ 연결 끊김 (onclose)
                ▼                                    │
       ┌──────────────────┐                          │
       │   CONNECTING     │                          │
       │ (ws.connect)     │                          │
       └────────┬─────────┘                          │
                │ onopen                             │
                ▼                                    │
       ┌──────────────────┐    편집 발생    ┌────────┴────────┐
       │    CONNECTED     │───────────────►│  BROADCASTING   │
       │ (양방향 sync 중) │◄───────────────│  (ws.send diff) │
       └──────────────────┘    브로드캐스트 └─────────────────┘
                │ 연결 끊김
                └─────────────────────► DISCOVERING (재시도)
```

---

### 4.4 API Contracts (Internal IPC: Tauri Commands)

#### `create_note() → Note`

Purpose: 새 빈 노트 생성

Preconditions:
- 없음 (항상 호출 가능)

Postconditions:
- Q1: 새 Note 레코드 in-memory 생성 (id=NanoID, title="Untitled", crdtState=empty Y.Doc)
- Q2: 500ms debounce 타이머 시작 (즉시 디스크 쓰기 없음)
- Q3: 반환된 Note.id가 I-01 만족

Response: `Note`

---

#### `open_note(noteId: NanoID) → Note`

Purpose: LocalFS에서 노트 로드

Preconditions:
- P1: `~/.hypernote/notes/{noteId}.yjs` 파일 존재

Postconditions:
- Q1: Y.Doc 인스턴스 생성 후 `Y.applyUpdate(doc, bytes)` 완료
- Q2: `note.plaintextMd = doc.getText().toString()`

Error:
| Code | Condition |
|------|-----------|
| NOT_FOUND | P1 위반 — 파일 없음 |

---

#### `apply_local_edit(noteId: NanoID, delta: YjsDelta) → void`

Purpose: 로컬 키 입력을 CRDT에 반영

Preconditions:
- P1: noteId의 Y.Doc이 메모리에 로드됨
- P2: delta가 해당 doc에 적용 가능한 유효 위치

Side Effects (synchronous up to DOM paint, then async):
1. `ydoc.getText().applyDelta(delta)` — CRDT 상태 업데이트
2. CodeMirror `view.dispatch(tr)` — DOM repaint 트리거
3. [비동기, off-path] `encodeStateAsUpdate(ydoc)` → WebSocket broadcast
4. [비동기, debounced 500ms] LocalFS 쓰기

Performance Contract:
- Step 1+2 합계 ≤ 16ms (P99)

---

#### `apply_peer_update(noteId: NanoID, update: Uint8Array) → void`

Purpose: 피어로부터 수신한 CRDT diff 적용

Preconditions:
- P1: noteId의 Y.Doc이 메모리에 로드됨

Side Effects:
1. `Y.applyUpdate(ydoc, update)` — 멱등 적용
2. 변경된 텍스트 범위를 CodeMirror에 반영 (있는 경우만)
3. [비동기, debounced 500ms] LocalFS 쓰기

Postconditions:
- Q1: I-04 (멱등), I-05 (수렴) 만족

---

### 4.5 UI Specification

#### 디자인 토큰

```css
--bg-base:    #0a0a0f;   /* 거의 검정 */
--bg-surface: #12121a;   /* 카드/패널 */
--bg-overlay: rgba(18, 18, 26, 0.85); /* 블러 backdrop */
--accent:     #00ffcc;   /* 네온 시안 */
--accent-dim: #00bfa5;   /* 호버 상태 */
--text:       #e0e0e0;   /* 본문 */
--text-dim:   #666680;   /* 보조 텍스트 */
--danger:     #ff4560;   /* 경고/에러 */
--font-mono:  'JetBrains Mono', 'Fira Code', monospace;
--border:     1px solid rgba(0, 255, 204, 0.2);
--blur:       backdrop-filter: blur(12px);
```

#### 레이아웃 구조

```
┌─────────────────────────────────────────────────────────┐
│ ◈ HYPERNOTE          [⌘K 검색]              [LAN: 2●]  │  ← 상단 바 (32px)
├─────────────┬───────────────────────────────────────────┤
│             │                                           │
│  NOTE LIST  │           EDITOR (CodeMirror 6)          │
│  (200px)    │                                           │
│             │  > 현재 노트 제목_                        │
│ ▸ today     │  ────────────────────────────────         │
│ ▸ meeting   │  내용...                                  │
│ ▸ alpha     │                                           │
│             │                                           │
├─────────────┴───────────────────────────────────────────┤
│ Ln 4  Col 12  UTF-8  CRDT:synced  peers:jhko-mac       │  ← 상태바 (24px)
└─────────────────────────────────────────────────────────┘
```

#### Command Palette (⌘K)

```
┌─────────────────────────────────────────────────┐
│  ⌘ > _                          [ESC to close]  │
├─────────────────────────────────────────────────┤
│  ── ACTIONS ──────────────────────────────────  │
│  ◈ new note                          [⌘N]       │
│  ✎ rename note                                  │
│  ⌦ delete note → trash                          │
│  ↩ restore from trash                           │
│  ⊕ peers (2 connected)                          │
│  ── NOTES ─────────────────────────────────── │
│  ▸ meeting 2026-02-26     [제목 매치]           │
│  ▸ arch decisions         [본문 매치: redis]    │
└─────────────────────────────────────────────────┘
```

#### 동기화 상태 표시 (우상단)

| 상태 | 표시 |
|------|------|
| 피어 없음 | `LAN: offline` (--text-dim) |
| 동기 중 | `LAN: 2● ████░ syncing` (--accent, 애니메이션) |
| 동기 완료 | `LAN: 2●` (--accent) |
| 피어 연결 실패 | `LAN: ERR` (--danger) |

---

## 5. Verification

### 5.1 Invariant Verification Scenarios

#### Scenario: I-01 Note ID Uniqueness

Scope: 1000회 연속 `create_note()` 호출
Given: 빈 앱 상태
When: 1000개 노트 순차 생성
Then: 모든 Note.id가 서로 다름
And: 각 id가 NanoID 형식(21자, URL-safe chars) 만족

```typescript
it('generates unique IDs across 1000 notes', () => {
  const ids = Array.from({ length: 1000 }, () => generateNoteId());
  const unique = new Set(ids);
  expect(unique.size).toBe(1000);
  ids.forEach(id => expect(id).toMatch(/^[A-Za-z0-9_-]{21}$/));
});
```

---

#### Scenario: I-02 Plaintext Consistency

Scope: 50 편집 연산
Given: 빈 Y.Doc
When: insert/delete 연산 50회 순차 적용
Then: `note.plaintextMd === ydoc.getText().toString()` (항상)

```typescript
it('plaintextMd always mirrors Y.Text', () => {
  const ydoc = new Y.Doc();
  const ytext = ydoc.getText();
  const ops = generateRandomOps(50);

  for (const op of ops) {
    applyOp(ytext, op);
    const note = buildNote(ydoc);
    expect(note.plaintextMd).toBe(ytext.toString());
  }
});
```

---

#### Scenario: I-04 + I-05 CRDT Convergence (핵심 시나리오)

Scope: 3 피어, 30 동시 편집 연산
Given: Peer A, B, C 각각 동일한 초기 Y.Doc
When:
- A가 10개 문자 삽입
- B가 10개 문자 삽입 (A와 동시, 충돌 위치 포함)
- C가 10개 문자 삭제
- 모든 update를 임의 순서로 교차 적용
Then:
- A, B, C의 `ydoc.getText().toString()`이 모두 동일
- 어떤 문자도 소실되지 않음 (삭제 연산 제외)
- 적용 횟수 무관하게 상태 동일 (멱등)

```typescript
it('converges to same state regardless of operation order', () => {
  const [docA, docB, docC] = [new Y.Doc(), new Y.Doc(), new Y.Doc()];

  const updateA = captureUpdate(docA, () => docA.getText().insert(0, 'Hello'));
  const updateB = captureUpdate(docB, () => docB.getText().insert(0, 'World'));
  const updateC = captureUpdate(docC, () => docC.getText().insert(5, '!'));

  // 임의 순서로 적용
  Y.applyUpdate(docA, updateB); Y.applyUpdate(docA, updateC);
  Y.applyUpdate(docB, updateC); Y.applyUpdate(docB, updateA);
  Y.applyUpdate(docC, updateA); Y.applyUpdate(docC, updateB);

  const [stateA, stateB, stateC] = [docA, docB, docC].map(d => d.getText().toString());
  expect(stateA).toBe(stateB);
  expect(stateB).toBe(stateC);

  // 멱등성: 재적용해도 변화 없음
  Y.applyUpdate(docA, updateA);
  expect(docA.getText().toString()).toBe(stateA);
});
```

---

#### Scenario: T-01 Render Performance (Safety: 16ms wall clock)

Scope: 200 WPM 연속 입력 10초
Given: 1000자 기존 텍스트가 로드된 에디터
When: 자동화된 keystroke 이벤트 33회/s (200 WPM) 발송
Then: 각 keydown → DOM update 측정값 ≤ 16ms (P99)
And: 측정 기간 중 프레임 드롭 없음 (60fps 유지)

```typescript
it('renders keystrokes within 16ms P99', async () => {
  const timings: number[] = [];

  for (let i = 0; i < 330; i++) {
    const t0 = performance.now();
    await simulateKeystroke('a');
    await waitForPaint();
    timings.push(performance.now() - t0);
    await sleep(30);
  }

  timings.sort((a, b) => a - b);
  const p99 = timings[Math.floor(timings.length * 0.99)];
  expect(p99).toBeLessThanOrEqual(16);
});
```

---

#### Scenario: I-08 Bounded Debounce (Liveness)

Scope: 편집 이벤트 1회
Given: 새 빈 노트, 파일 없음
When: 문자 1개 삽입
Then: 500ms ± 50ms 이내에 `{noteId}.yjs` 파일 생성
And: `{noteId}.md` 파일 생성

```typescript
it('writes to disk within 550ms of first edit', async () => {
  const note = await createNote();
  applyLocalEdit(note.id, { insert: 'x', index: 0 });

  await sleep(550);

  expect(await fileExists(`~/.hypernote/notes/${note.id}.yjs`)).toBe(true);
  expect(await fileExists(`~/.hypernote/notes/${note.id}.md`)).toBe(true);
});
```

---

### 5.2 Bounded Model Check Summary

| Property | Scope | Status | Notes |
|----------|-------|--------|-------|
| I-01 Note ID 유일성 | 1000 notes | [PENDING] | NanoID 충돌 확률 이론적 보장 |
| I-02 Plaintext 일관성 | 50 ops | [PENDING] | Y.Text 바인딩 구현 후 검증 |
| I-04 CRDT 멱등성 | 3 peers, 30 ops | [PENDING] | Yjs 수학적 보장이나 바인딩 레이어 검증 필요 |
| I-05 CRDT 수렴 | 3 peers, 30 ops | [PENDING] | 핵심 시나리오 |
| T-01 <16ms P99 | 330 keystrokes | [PENDING] | 구현 후 프로파일링 필수 |
| I-08 500ms 쓰기 | 1 edit | [PENDING] | |

---

## 6. Open Questions

### [NEEDS CLARIFICATION]

- [x] NC-01: 노트 최대 크기 → **제한 없음** (성능 저하 경고만 표시, T-13)
- [x] NC-03: 플랫폼 → **macOS + Linux ARM** (darwin arm64/x86_64, linux aarch64 Ubuntu 24.04.1). CI/CD는 TBD-08.

### [TBD - Technical Decisions]

- [x] TBD-01: CRDT 라이브러리 → **Yjs v13 확정** (y-codemirror.next 공식 바인딩 사용)
- [x] TBD-02: 에디터 → **CodeMirror 6 확정** (Markdown 렌더링 모드 + y-codemirror.next)
- [x] TBD-03: Tauri 버전 → **v2 확정** (안정 릴리즈, plugin API 성숙)
- [x] TBD-04: mDNS → **Rust `mdns-sd` crate 확정** (Tauri command로 JS에 브릿지, network layer는 Rust에서 처리)
- [x] TBD-05: 노트 삭제 → **Trash 폴더 확정** (`~/.hypernote/trash/`, 30일 자동 비우기)
- [x] TBD-06: Lazy load → **목록 metadata만 eager, Y.Doc 내용은 열 때 lazy 로드**
- [x] TBD-07: Trash GC → **앱 시작 시 trash/ 스캔, deletedAt 기준 30일 초과 파일 삭제**
- [ ] TBD-08: Linux ARM 크로스컴파일 파이프라인 — GitHub Actions matrix vs cargo cross (CI/CD 설정 시 결정)

---

## Appendix

### A. Glossary

| Term | Definition |
|------|------------|
| CRDT | Conflict-free Replicated Data Type. 분산 환경에서 수렴이 보장되는 데이터 구조 |
| Yjs | JavaScript CRDT 라이브러리. Y.Doc, Y.Text 등의 공유 타입 제공 |
| mDNS | Multicast DNS. LAN 내 서버리스 서비스 발견 프로토콜 |
| delta | Yjs에서 문서 변경 사항의 최소 표현 (insert/delete/retain 연산 목록) |
| update | Yjs에서 피어 간 교환하는 바이너리 CRDT 상태 diff |
| debounce | 연속 이벤트의 마지막 발생 후 N ms 대기 후 핸들러 실행 패턴 |
| P99 | 99번째 백분위수 응답 시간. 100회 중 99회가 이 값 이하 |
| Tauri | Rust 기반 크로스 플랫폼 데스크탑 앱 프레임워크 (Electron 대안) |

### B. Technology Stack (Confirmed)

| Layer | Choice | Status | Rationale |
|-------|--------|--------|-----------|
| Platform | macOS (darwin arm64/x86_64) | **확정** | mDNS 기본 지원 |
| Platform | Linux aarch64 (Ubuntu 24.04.1) | **추가** | avahi-daemon mDNS; 크로스컴파일 TBD-08 |
| Runtime | Tauri v2 (Rust) | **확정** | 네이티브 속도, 낮은 메모리, 빠른 시작 |
| Frontend | Svelte 5 | 권장 | 최소 런타임 오버헤드, <16ms 목표에 유리 |
| Editor | CodeMirror 6 | **확정** | Markdown 모드 + Yjs 공식 바인딩(`y-codemirror.next`) |
| CRDT | Yjs v13 | 권장 | 텍스트 편집 CRDT 업계 표준, 성숙한 생태계 |
| LAN Sync | 커스텀 WebSocket | 권장 | 공통 noteId 핸드셰이크 후 CRDT diff 교환 |
| mDNS | `mdns-sd` (Rust crate) | **확정** | Tauri command로 JS 브릿지; network layer 전체 Rust 처리 |
| File I/O | Tauri FS API | 권장 | 샌드박스 우회 없는 안전한 파일 접근 |
| Search | Fuse.js (제목) + 커스텀 풀텍스트 인덱스 | 권장 | 제목 fuzzy + 본문 fallback (T-12) |

### C. Change Log

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1.0 | 2026-02-26 | jhko | Initial draft (jackson-sdd) |

