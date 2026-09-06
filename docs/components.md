# Component development

## Grouped toolbox and personal shortcuts (alpha.21)

The toolbox groups tools into learning/focus, conversation/review, records/resources
and appearance/input. Each tool has a separate pin button: pinning does not launch
it. Pins are stored in `settings.shortcuts`, preserve selection order and sync
through ordinary revision-checked snapshots. The bottom rail keeps notes,
bookmarks, translation and the toolbox, adding chosen tools before the plus button.
Unpinning removes only the shortcut, not its tool data or open panel. The custom
mobile entry remains hidden. A bounded horizontal scroll keeps a full rail inside
narrow windows. All 157 tests passed; browser acceptance covered pin, launch,
unpin and all tools pinned at 430px with no page overflow or page errors. The live
desktop showed the four groups and 13 pin controls on alpha.21.

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


## Pearl tools redesign (alpha.22)

- Toolbox uses single-column tool rows within four independently collapsible groups. Collapse choices are local UI preferences; quick-launch pins remain shared saved settings.
- Study timer uses a circular remaining-time dial. Drag a queue handle or focus it and press Up/Down to reorder upcoming blocks. Current countdown and deadline are untouched. Add a block through the folding form; expiry still requires a deliberate next start.
- Bookmarks are compact one-line summaries. Source text is retained in the editor and original-message link. Message time and saved time are distinct; hover a time for its full date. Unknown original times are explicitly labeled unknown.
- New long message bookmarks ask the existing ephemeral Sol medium helper for a short summary; if it is unavailable, the original title prefix is retained so saving is not lost. The helper sees only the selected source text and cannot use tools.
- Original timestamps are resolved from the requested conversation's local rollout only: exact message ID first, then a unique sufficiently long quotation inside the exact turn. Ambiguous matches stay unknown. No turn completion date is substituted. Local transcripts above 64 MiB are skipped.
- Added native adapter for Codex 26.901.4073.0, retaining the prior known bundle fallback. No installed Codex application files are modified.
