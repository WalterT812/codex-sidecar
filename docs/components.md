# Component development

The host sends `HostMessage` snapshots and action results, defined in `src/shared/types.ts`. UI sends only allowed `BridgeRequest` actions via the main-frame binding. No arbitrary shell/HTTP/model bridge is exposed.

Each renderer owns one Shadow DOM root. Keep component state inside it and register listeners with cleanup. `window.__CODEX_SIDECAR__.destroy()` must remove every node, timer, observer, and listener it introduced. Native controls and React internals are not component state.

Add a component by extending its typed persisted preference, rendering it under the shared root, and wiring explicit actions through `src/bridge.ts`. Data mutations must include the latest store revision; stale saves should preserve the draft and offer a refresh/resolve action. Account refresh must not replace editor contents.

The current alpha has built-in component modules, not an executable third-party plugin loader. A future public registry should define a restricted capabilities contract and lifecycle before loading outside code.

For data acquisition, use documented APIs and separate providers from renderers. Retain unknown values and last-update information. For conversation links, use the official app's copied deep link. Do not invent message-level anchors or start parallel conversations to emulate existing context.
