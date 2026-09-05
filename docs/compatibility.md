# Compatibility and acceptance

Status checked on **5 September 2026**. Version **0.1.0-alpha.1** is an early Windows companion, not an official extension API.

## Verified locally

| Area | Evidence |
| --- | --- |
| Windows app discovery | Microsoft Store package `OpenAI.Codex` 26.901.2854.0; GUI identified as `ChatGPT.exe`, distinct from the CLI |
| Account transport | Official Codex CLI 0.153.0; live stdio `account/rateLimits/read` returned three quota windows; helper exited cleanly |
| Runtime | Node.js 24.16.0; type checking, bundled build, and all 67 automated tests passed |
| Browser components | Full-size and 430 × 680 preview; notes, bookmarks, artwork toggle, cross-window synchronization and conflict indication |
| Desktop anchor inspection | Read-only packaged source confirms `#root`, `main[data-app-shell-main-surface="default"]`, and `header[data-pip-obstacle="app-shell-header"][data-app-shell-header-layout]`; no proprietary source is redistributed |
| Isolation | Separate demo data, literal text rendering, duplicate mount cleanup, guarded bridge, verified loopback targets |
| Installed copy | Built-file hashes match the source build; installed CLI version/doctor and browser preview run successfully; existing non-debuggable Codex is refused with exit code 1 and its companion lock released |
| Launcher | Windows PowerShell 5.1 syntax checks passed; actual desktop readiness and failure-dialog presentation still await interactive acceptance |

The browser preview uses **sample quota**, clearly marked DEMO. The successful account transport check does not turn those sample values into real account values.

## Still awaiting real desktop acceptance

Actual CDP attachment, native header placement, multi-window attachment, and post-update remount must be checked in an official desktop process launched through Sidecar. During development the user's active Codex process had no debugging endpoint; it was left running. Static source inspection and browser tests are not a substitute for that desktop check.

The adapter intentionally refuses unknown desktop layouts. An alpha with this boundary may decline to mount after a Codex UI update rather than overlay unrelated content. No macOS or Linux desktop support is claimed; cross-platform checks cover portable components only.

## First launch

1. Finish active Codex work and exit the app normally, including any background app process.
2. Open the installed **Codex Sidecar** shortcut, or run `node dist/cli.js start`.
3. Sidecar discovers the installed Store app and starts it with a loopback debugging endpoint. A successful launch prints `SIDECAR_READY=1` after a supported window accepts the components.
4. Check the quota indicator, drawer, a saved note, and a second Codex window.

No process is force-closed. If an existing desktop has no verified connection, startup fails with an explanation. Translation remains a planned component; this release does not provide translation.

## Updates and recovery

- The official package, signatures, and updater are never patched. Package discovery runs each time Sidecar starts.
- After an official update/restart, launch Sidecar again when convenient. It does not watch for updates and kill or relaunch the client.
- Runtime component placement depends on the desktop DOM and can need an adapter update. Preserving the official updater does **not** guarantee compatibility with every future UI version.
- `node dist/cli.js doctor` performs read-only discovery. Startup logs are in the Sidecar data directory; review local paths before sharing logs.
- `node dist/cli.js stop` requests orderly component removal. The official app remains open. Fully exit and reopen the app from its original shortcut to remove the debugging endpoint itself.
- Notes and bookmarks are independent of the install directory. Uninstalling built files does not erase them.
- A corrupt store or interrupted lock-recovery file is preserved. Confirm that no Sidecar process is running and back up the data before manually addressing such a file; never delete a live instance's lock.

## Security boundary

CDP grants powerful access to the desktop renderer. The companion binds only to a loopback endpoint owned by the exact detected desktop executable, validates main-frame targets, and exposes a small action allowlist. Run only companion code you trust. These checks do not protect against malicious code already running as the same Windows user.

Personal account data, authentication files and native conversation databases are not bundled with this project. Notes and bookmarks are local plain-text data, not an encrypted vault.
