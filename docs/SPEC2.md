# SPEC2: HyperNote v0.2 Delta — Mobile-First Writing, Workspace Share, Export

Version: 0.2.0
Status: Draft
Last Updated: 2026-02-26
Authors: jhko, codex

## Executive Summary

This document defines additive and changed requirements relative to the base specification in [docs/SPEC.md](./SPEC.md).
The v0.2 focus is: mobile-first writing UX, private Wi-Fi workspace share, export flows, and design-system governance that prevents ad-hoc UI drift.

This is a delta spec. Unchanged behavior, assumptions, and contracts are inherited from [docs/SPEC.md](./SPEC.md).

---

## 0. Base References

- Base Problem Frame: [docs/SPEC.md](./SPEC.md)
- Base Domain Assumptions and Progression: [docs/SPEC.md](./SPEC.md)
- Base Data model / Invariants / Verification: [docs/SPEC.md](./SPEC.md)

When a rule here conflicts with base SPEC, this SPEC2 takes precedence.

---

## 1. Problem Frame Delta

### 1.1 New / Expanded Domains

#### UtilityDock (Type: Causal)

Description: Desktop top-right focus-aware utility surface replacing plain `LAN: offline` text.

Controls:

- compact status-dot rendering
- utility hub open/close state
- action routing (`share`, `export`, `trusted peers`, `sync details`)

Observes:

- sync state from peer status store
- active typing/focus mode signals

---

#### MobileGestureChannel (Type: Connection)

Description: Mobile edge-swipe gesture channel to open editor actions while preserving full-bleed writing space.

Controls:

- none

Observes:

- touch-start / touch-move / touch-end events near right edge

Assumptions:

- right-edge touch gesture is available in target mobile webview browsers
- volume-key capture is not relied on (non-portable across browsers/OS)

---

#### TrustedPeerStore (Type: Lexical)

Description: Persistent peer trust ledger used for automatic rejoin and explicit host revocation.

Controls:

- none

Observes:

- none

Assumptions:

- trusted peer identities persist across app restarts
- host can revoke trust at any time

### 1.2 Shared Phenomena Delta

| Interface | Domain A  | Domain B             | Phenomena                                              |
| --------- | --------- | -------------------- | ------------------------------------------------------ |
| IF-D1     | User      | UtilityDock          | top-right actions, compact sync status, hub open/close |
| IF-D2     | User      | MobileGestureChannel | right-edge swipe to open mobile action sheet           |
| IF-D3     | HyperNote | TrustedPeerStore     | trust add/revoke/load operations                       |

---

## 2. Domain Assumptions Delta (Breadcrumbs)

#### A2-01: Mobile writing focus

Statement: "On mobile, persistent chrome must not reduce editor usable area during active writing."
Justification: User requirement for distraction-free writing.
Validation Status: Assumed
Impact if False: typing flow degradation and reduced readability.

#### A2-02: Gesture discoverability with low noise

Statement: "A first-run coachmark (1-2 times) plus help recall is enough to teach edge-swipe without persistent UI clutter."
Justification: balances discoverability and distraction budget.
Validation Status: Assumed
Impact if False: users fail to discover share/export entry on mobile editor.

#### A2-03: DS gate effectiveness

Statement: "Token-only design rules enforced in lint are sufficient to prevent ad-hoc style drift."
Justification: deterministic build-time enforcement.
Validation Status: Assumed
Impact if False: visual drift resumes despite documented tokens.

---

## 3. Requirements Delta

### 3.1 Business Requirements (Optative)

| ID    | Requirement                                                                     | Priority | Source |
| ----- | ------------------------------------------------------------------------------- | -------- | ------ |
| R2-01 | 모바일에서 편집 뷰를 최대 폭/높이로 사용해 글쓰기에 방해가 없어야 한다          | Must     | 사용자 |
| R2-02 | 우측 상단 상태 영역은 단순 상태 텍스트가 아니라 실제 유틸리티 진입점이어야 한다 | Must     | 사용자 |
| R2-03 | Command Palette의 모든 액션은 단축키로 실행 가능해야 한다                       | Must     | 사용자 |
| R2-04 | share/export는 자연스럽고 직관적인 진입 경로를 제공해야 한다                    | Must     | 사용자 |
| R2-05 | 디자인 시스템 코어 미사용/임시 스타일 난립이 자동으로 차단되어야 한다           | Must     | 사용자 |

### 3.2 Requirement Progression

#### R2-01 Progression: Mobile full-bleed writing

Level 0 (Original):

> "모바일에서 편집 view를 넓게 쓰고 글쓰기에 방해가 되면 안 된다"

Breadcrumb Applied: A2-01
Level 1:

> "모바일 편집 상태에서는 상시 UI chrome 노출이 최소화되어야 한다"

Breadcrumb Applied: A2-02
Level 2:

> "편집 중 상단 액션 아이콘을 숨기고, gesture-only로 action sheet를 연다"

Level 3 (Machine Specification):

> "viewport <= 800px AND activeTab=editor 조건에서 top bar/tabs를 렌더하지 않는다. editor pane은 full-bleed로 렌더한다. right-edge(16px) swipe-left(>=48px) 제스처가 action sheet를 연다."

#### R2-03 Progression: Palette full shortcut coverage

Level 0 (Original):

> "command palette의 모든 애들은 단축키가 있게 해줘"

Breadcrumb Applied: A2-03
Level 1:

> "모든 액션은 키 매핑 표를 가진다"

Level 2:

> "키 이벤트는 팔레트 외부에서도 동일 액션을 실행한다"

Level 3 (Machine Specification):

> "각 palette action에 고유 keybinding을 부여하고 global keydown 핸들러에서 실행한다. UI에는 shortcut hint를 항상 표시한다."

### 3.3 Technical Requirements (Derived)

| ID    | Derived From | Technical Requirement                                                     |
| ----- | ------------ | ------------------------------------------------------------------------- |
| T2-01 | R2-01        | 모바일 editor 탭에서 full-bleed 레이아웃 (top chrome hidden)              |
| T2-02 | R2-01,R2-04  | 모바일 editor action 진입은 edge-swipe + first-run coachmark              |
| T2-03 | R2-02        | Desktop top-right는 status text 대신 utility dock로 교체                  |
| T2-04 | R2-03        | Palette action 100% shortcut coverage + global handling                   |
| T2-05 | R2-05        | token-only design lint gate (`lint` 단계 실패)                            |
| T2-06 | R2-04        | share/export 진입점: desktop utility hub + palette + mobile gesture sheet |

---

## 4. Specification Delta

### 4.1 UX / Layout Contracts

#### Desktop Top-Right Utility Dock

- replace text status (`LAN: offline`) with:
- status-dot: `offline | syncing | connected | error`
- utility trigger (`⋯`) opening hub
- hub actions: `share workspace`, `export current`, `export workspace`, `trusted peers`

Focus behavior:

- while active typing (recent input <= 1500ms), dock enters compact mode (dot-first)

#### Mobile Layout Contract

- breakpoint: `max-width: 800px`
- tabs: `Notes | Editor`
- default tab: `Editor`
- `Editor` tab contract:
- full-bleed editing area
- no persistent share/export icon
- action entry only through right-edge swipe
- keyboard fallback: `Cmd/Ctrl+K`

#### Gesture Discovery Contract

- show coachmark 1-2 times on first runs only
- no persistent tip text in editor
- recall path provided in Help

### 4.2 Shortcut Table (Normative)

| Action               | Shortcut                 |
| -------------------- | ------------------------ |
| Open palette         | Cmd/Ctrl+K               |
| New note             | Cmd/Ctrl+N               |
| Rename note          | F2                       |
| Delete note to trash | Cmd/Ctrl+Backspace       |
| Restore mode         | Cmd/Ctrl+Shift+Backspace |
| Peers panel          | Cmd/Ctrl+Shift+P         |
| Share workspace      | Cmd/Ctrl+Shift+S         |
| Export current note  | Cmd/Ctrl+E               |
| Export workspace     | Cmd/Ctrl+Shift+E         |
| Mobile tab: Notes    | Cmd/Ctrl+1               |
| Mobile tab: Editor   | Cmd/Ctrl+2               |

### 4.3 Design System Governance

Required files:

- `src/lib/design-system/tokens.css`
- `src/lib/design-system/semantic.css`
- `scripts/check-design-system.mjs`

Lint gate policy:

- color literals and non-token radius values are rejected in app/component styles
- exceptions require inline justification marker: `ds-allow-literal`

### 4.4 Share/Join Connection FSM (Normative)

`share/join` handshake MUST follow the finite state machine below.
No document sync (`hello`, `update`) is allowed before `APPROVED`.

```
DISCONNECTED
  └─(ws open inbound)──────────► PENDING_INBOUND_APPROVAL
  └─(join target connect)──────► PENDING_OUTBOUND_APPROVAL

PENDING_INBOUND_APPROVAL
  └─(host approve)─────────────► APPROVED
  └─(host reject/close)────────► REJECTED

PENDING_OUTBOUND_APPROVAL
  └─(host hello/accept)────────► APPROVED
  └─(host reject/error/close)──► REJECTED

APPROVED
  └─(disconnect)───────────────► DISCONNECTED

REJECTED
  └─(disconnect)───────────────► DISCONNECTED
```

Enforcement:

- In `PENDING_*`, inbound `update` frames are ignored.
- In `PENDING_*`, local app MUST NOT broadcast/sync note updates to that peer.
- Host MUST present explicit approve/reject action for inbound join requests.
- Rejected peer is closed at transport level.

---

## 5. Invariants Delta

| ID    | Category        | Invariant                                                  | Enforcement                          |
| ----- | --------------- | ---------------------------------------------------------- | ------------------------------------ |
| I2-01 | UX              | Mobile editor tab renders without persistent action chrome | responsive layout + component guards |
| I2-02 | UX              | Every palette action has a shortcut and shortcut hint      | action map + render assertion        |
| I2-03 | Safety          | Delete shortcut is reversible via undo toast window        | trash + undo command window          |
| I2-04 | Governance      | Styles violating token policy fail lint                    | DS check script in `npm run lint`    |
| I2-05 | Discoverability | Gesture hint shown only first 1-2 runs                     | local storage counter                |

---

## 6. Verification Delta

### Scenario: Mobile Full-Bleed Editor

Scope: viewport 390x844
Given: active tab = editor
When: user types continuously for 10 seconds
Then: top bar and persistent action icons are hidden
And: editor occupies full available pane width

### Scenario: Edge-Swipe Action Entry

Scope: mobile editor
Given: focus on editor
When: touch starts within right-edge 16px and swipes left >= 48px
Then: action sheet opens

### Scenario: Palette Shortcut Coverage

Scope: all registered actions
Given: app loaded
When: each shortcut is triggered once
Then: corresponding action executes
And: shortcut hint is visible in palette item

### Scenario: DS Lint Gate

Scope: style files
Given: a style line uses `#ff0000` directly
When: `npm run lint` executes
Then: lint fails with file and line reference

---

## 7. Open Questions

- [ASSUMED] exact share/export backend persistence contract will be specified in follow-up implementation spec if backend APIs expand.
- [ASSUMED] v2 protocol details are implemented as hard break in current iteration.
