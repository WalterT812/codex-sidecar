# Codex Sidecar v0.1 design

Windows-first personal components for the official Codex desktop app. The official app retains all conversation execution, history, account ownership, and updating. This is an unofficial companion, not a replacement client or official plugin.

## Scope

The first release includes a compact quota indicator, a right-edge hover drawer, local notes, and bookmarks pointing back to original conversations. Each component can be switched off. Translation is a follow-on component after choosing its provider; v0.1 must not display a nonfunctional translation button.

The drawer stays closed by default, opens on deliberate hover or click, supports keyboard access and Escape, and can be pinned open. Its light design uses restrained blue/lavender accents. It must not shift the native conversation or intercept input outside its own surface. Multiple app windows use the same persisted notes/settings and independent drawer visibility.

## Architecture

Node.js >=22.13, TypeScript, native WebSocket, Node test runner, esbuild for a single renderer IIFE. A local coordinator uses stdio Codex app-server only for account quota reads. CDP mounts isolated Shadow DOM UI in verified local desktop renderers. Data uses an independent, versioned local JSON store with serial writes and atomic replacement. No code is written inside the installed application. No web server or new account is required in normal use.

Launch policy: verify the Windows package and GUI executable (Codex.exe or ChatGPT.exe); never mistake the CLI for the GUI. If Codex is already open without debugging, report that the user must normally exit and reopen through the launcher. Never kill or automatically restart active Codex. Debugging binds only to loopback; verify port ownership before attachment. A detached or incompatible UI leaves the native app operational. Auto-reapply is bounded, idempotent, and stops on incompatibility.

Each supported main renderer gets one host root. Embedded browsers, editor previews, authentication pages, and pet overlays are excluded. An adapter verifies native anchors. Missing anchors produce a diagnostic rather than speculative document rewriting. No mutations to React internals or private app databases.

## Components and persistence

Quota uses account/rateLimits/read. Prefer rateLimitsByLimitId, calculate remaining as clamp(100-usedPercent), preserve unavailable values, derive periods from windowDurationMins, and show last refresh and reset times. Refresh at most once per minute automatically; manual refresh is debounced. Never infer remaining quota from local token counts.

Notes have id/title/body/optional threadUrl/timestamps. Bookmarks have id/title/url/excerpt/createdAt. Accept only codex:// conversation links and HTTPS URLs; disallow scripts, file URLs, and commands. A bookmark opens the original conversation; it does not copy or execute its context. A standalone local note works without a coding project. All rendering of stored/user text uses text nodes, not raw HTML.

Settings persist locale, component visibility, and pin preference. Writes carry a revision; stale writes are rejected and fresh state is sent to all windows. Limits: at most 500 notes and 500 bookmarks, note body 100,000 characters, title 200, excerpt 10,000, URL 4,096. Corrupt stores are preserved and reported rather than silently overwritten.

## Bridge contract

The renderer calls window.__codexSidecarSend(JSON.stringify({id, action, payload})). Allowed actions: ui.ready, note.save, note.delete, bookmark.save, bookmark.delete, settings.patch, quota.refresh, open.link, ui.detach. Each result arrives via window.__CODEX_SIDECAR__.receive({type:'result',id,ok,error?}). State broadcasts use {type:'snapshot',state,quota}. Data mutations include payload.revision. The coordinator validates every action. No arbitrary shell or model execution is exposed by the bridge.

## Acceptance

Tests cover malformed/missing quota buckets, reset units, URL rejection, corrupt stores, stale concurrent writes, JSON-RPC timeouts, hostile bridge payloads, and UI cleanup. Browser acceptance covers hover/click/keyboard drawer, notes and bookmark persistence, two-window synchronization, light/dark readability, narrow windows, duplicate injection and full removal. A demo uses explicit sample data and cannot be mistaken for real account usage. Record actual tested Codex versions; never claim all future releases are compatible.

## Open source

Public repository contains generic source and documentation only. Include an original project license and third-party notices for any reused code. Codexion (MIT) informs the quota/isolated-widget architecture; Codex Styler (Apache-2.0) informs Windows package discovery and managed runtime. Explodex is design research only because no license was found. Do not copy official application bundles, credentials, personal conversations, notes, or local runtime paths into the repository.
