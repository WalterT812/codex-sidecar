# Personal tools and mobile entrance implementation plan

> **For agentic workers:** Use superpowers:executing-plans sequentially, as Walter requested. Existing approval covers implementation, local installation and isolated server hosting.

**Goal:** Make native Codex conversations easier to revisit and work with, and let the same local conversations accept messages from a private mobile entrance.

**Architecture:** Keep the official desktop as the conversation owner and executor. Sidecar supplies source anchors, floating tools and a small validated bridge. The independently hosted mobile service authenticates one owner, caches approved conversation data and queues messages while the desktop is offline.

**Tech Stack:** TypeScript, DOM/Shadow DOM, Node 22+, existing verified Electron CDP connection, Caddy and systemd.

## Global constraints

- Source D:\Projects\Codex-Sidecar; installed application D:\Apps\Codex-Sidecar.
- No patching or closing official Codex; no exposing CDP or generic execution over the network.
- Rounded bright Royal Pearl; static gradients; preserve all saved panel layouts and notes.
- Translation uses gpt-5.6-sol / medium only. User gesture starts recording.
- No auto-send for desktop snippets or explanation drafts. Mobile explicit Send is authorization to deliver that message.
- Existing server sites and unrelated work stay intact. No credentials or private QA screenshots in Git.

## Sequential deliverables

### Delivery checkpoint — alpha.14

- Installed on 5 September; 142 tests, typecheck and build passed. Native UI and 390px mobile browser were inspected.
- Unloaded source navigation and cross-task navigation both passed and returned to the original task.
- Focus exits with its own button; appearance preview changes native reply and composer to the chosen size. Personal drafts and practice answers are preserved.
- Isolated private HTTPS mobile service is deployed, with authenticated source reading and an outbound desktop relay. Computer-offline queue behavior is covered by tests. The original server site remains available.
- Physical iPhone recording and a real mobile-triggered native model turn have not yet been exercised. These remain explicit acceptance limits, not an assertion of end-to-end device completion.

### 1. Source navigation and conversation tools

Files: src/shared/types.ts, src/store.ts, src/renderer/sources.ts, src/renderer/personal-tools.ts, src/renderer/index.ts, test/sources.test.ts.

Interface: `MessageAnchor {threadId:string; messageId:string; quote:string}`; save anchor alongside bookmark. `navigateSource(anchor)` locates exact native message and highlights it. Native history lookup must be verified against installed desktop protocol before use.

- [x] Add backwards compatible anchor validation, stable source extraction and exact-message navigation tests.
- [x] Add message capture, selection toolbar (translate/bookmark/note/explain), directory and original-message bookmarks.
- [x] Verify selection excludes composer and other inputs; same-thread and cross-thread navigation; missing source yields explicit failure.

### 2. Personal tools

Files: src/renderer/personal-tools.ts, src/renderer/appearance.ts, src/renderer/index.ts, src/shared/types.ts, src/store.ts, test/personal-tools.test.ts.

Interface: durable user-editable records for snippets, confirmed/superseded decisions, output links and source-based learning sessions. Every source-dependent record carries MessageAnchor.

- [x] Add snippets with insert-for-review, live appearance controls and reversible focus mode.
- [x] Add history search, resume cards, attention inbox and decision page with exact source links.
- [x] Add learning desk with material, questions, answer-before-feedback and source navigation.
- [x] Add software/output library and inbox with editable purpose and native open action.
- [x] Configure verified native toggle dictation and expose discoverable shortcut help without recording during QA.
- [x] Run unit regressions and rendered keyboard/resize/switching checks.

### 3. Private mobile entrance

Files: src/mobile/server.ts, src/mobile/relay.ts, src/mobile/protocol.ts, src/mobile/web/*, scripts/deploy-mobile.ps1, test/mobile.test.ts.

Interface: allowlisted list/read/send commands with unique client message IDs, bounded requests, authenticated outbound desktop polling, explicit queued/delivered/unknown state. No automatic retry of uncertain sends.

- [x] Verify native desktop read/send protocol and ownership; do not assume a second app-server owns the running desktop conversation.
- [x] Build responsive installable web entrance, cached chat list/detail, text/image/voice ideas inbox and explicit send.
- [x] Implement private authentication, queue deduplication, offline queue/cache and reconnect behavior.
- [x] Deploy isolated service after loopback validation, then validate HTTPS unauthenticated denial and authenticated mobile-sized flow.

### 4. Release

- [x] `npm run check` must report all tests passing; inspect errors, not just shell exit after log printing.
- [x] Bump visible version, update compatibility documentation and install to the existing D: location.
- [x] Restart Sidecar alone, verify live controls, preserve layouts, commit only public source and push GitHub.
- [x] Report what is verified and any outstanding limitations precisely.
