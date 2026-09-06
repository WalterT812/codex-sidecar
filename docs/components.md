# Component development

## Study timer (alpha.20)

Open **＋ → 学习计时**. Add named study or break blocks with 1–180 minutes
each (up to 30 queued blocks); reorder or remove upcoming blocks. Start, pause,
resume or finish the current block explicitly. Expiry never starts the next
block automatically. The floating panel retains the existing drag/resize behavior.

The timer plan is shared across desktop windows in the revision-checked local
store. A persisted deadline drives elapsed time, so navigation, sleeping and
reopening do not restart the countdown. A small badge remains available when
the panel is closed or focus mode is active. Clicking it opens the timer.
Expiry leaves a visible notice. Sound is a best-effort two-note Web Audio chime
armed by user interaction, played in an eligible visible window and deduplicated
across windows; it depends on audio permissions and system volume. No OS alarm
is scheduled while Sidecar is closed. Reopening shows an overdue block as ended.

Acceptance: 155 tests passed, including clock recovery, pause/resume, queue edits,
stale-window rejection and persistence. A real Chromium flow exercised three
blocks, pause/resume, badge reopening, focus mode visibility, expiry and explicit
advance to the break, with no page errors. Alpha.20's empty timer was opened in
the live Codex desktop; no real study timer was started during acceptance.

The host sends `HostMessage` snapshots and action results, defined in `src/shared/types.ts`. UI sends only allowed `BridgeRequest` actions via the main-frame binding. No arbitrary shell/HTTP/model bridge is exposed.

Each renderer owns one Shadow DOM root. Keep component state inside it and register listeners with cleanup. `window.__CODEX_SIDECAR__.destroy()` must remove every node, timer, observer, and listener it introduced. Native controls and React internals are not component state.

The optional whole-window theme additionally owns exactly one document stylesheet
and one namespaced HTML attribute. `src/renderer/theme.ts` removes both on disable
or destroy. It may style native semantic anchors but must never replace native
controls, their event handlers, or user-entered text. See [Pearl Atelier](pearl-atelier.md).

Add a component by extending its typed persisted preference, rendering it under the shared root, and wiring explicit actions through `src/bridge.ts`. Data mutations must include the latest store revision; stale saves should preserve the draft and offer a refresh/resolve action. Account refresh must not replace editor contents.

The current alpha has built-in component modules, not an executable third-party plugin loader. A future public registry should define a restricted capabilities contract and lifecycle before loading outside code.

For data acquisition, use documented APIs and separate providers from renderers. Retain unknown values and last-update information. For conversation links, use the official app's copied deep link. Do not invent message-level anchors or start parallel conversations to emulate existing context.

## Bookmark controls (alpha.19)

Saved cards expose a direct Delete action using the current store revision.
Message-hover and selection bookmark buttons derive their saved state from shared
snapshots, so re-hovering or deleting a bookmark updates the label. Identical
pending captures are coalesced; an already-saved source/excerpt is not saved
again. Existing records are preserved. Local verification passed all 150 tests;
the live desktop showed a Delete button on the saved card and an inactive
“已收藏” button on its original message.

## Personal tools and mobile adapter

Alpha.14 introduces per-tool shadow panels and a separate appearance stylesheet. Personal views retain draft DOM nodes across task switches. Whole-message and selection bookmarks use validated native message/turn IDs; a versioned adapter reads the already-running desktop manager and its reveal controller. It does not create a replacement app-server for conversation execution.

The optional mobile bridge exposes only list/read/send to the outbound relay. It never accepts method names, arbitrary scripts or shell commands from the server. Phone sends use the native follow-up coordinator; other host actions remain separately allowlisted. See [mobile protocol and limitations](mobile.md).
