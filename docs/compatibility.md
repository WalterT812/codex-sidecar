# Compatibility and acceptance

Status checked on **5 September 2026**. Version **0.1.0-alpha.3** is an early Windows companion, not an official extension API.

## Verified locally

| Area | Evidence |
| --- | --- |
| Windows app discovery | Microsoft Store package `OpenAI.Codex` 26.901.2854.0; GUI identified as `ChatGPT.exe`, distinct from the CLI |
| Account transport | Official Codex CLI 0.153.0; live stdio `account/rateLimits/read` returned three quota windows; helper exited cleanly |
| Runtime | Node.js 24.16.0; all 105 automated tests, type checking, and bundled build passed, including duplicate-start, immediate-reopen, quota selection, theme restore, and coordinator lifecycle regressions |
| Browser components | Full-size and 430 × 680 preview; notes, bookmarks, artwork toggle, cross-window synchronization and conflict indication |
| Desktop anchor inspection | Read-only packaged source confirms `#root`, `main[data-app-shell-main-surface="default"]`, and `header[data-pip-obstacle="app-shell-header"][data-app-shell-header-layout]`; no proprietary source is redistributed |
| Isolation | Separate demo data, literal text rendering, duplicate mount cleanup, guarded bridge, verified loopback targets |
| Installed copy | Built-file hashes match the source build; installed CLI version/doctor and browser preview run successfully; existing non-debuggable Codex is refused with exit code 1 and its companion lock released |
| Launcher | Windows PowerShell 5.1 error/success handling regression and real orphan-child heartbeat/stop regression passed without touching Codex |
| Shared control directory | A hidden desktop-shell-launched helper confirmed it was unpackaged (`GetCurrentPackageFullName` returned 15700), read a marker written from Codex, and wrote a reply that Codex read under `~/.codex-sidecar` |
| Whole-window theme | Alpha.3 installed renderer reached READY on the live native Windows client. Chromium accepted 40 CSS rules. Native task-row content fits within all seven visible rows; profile menu colors/radius were checked. 2562 × 1394 and emulated 1000 × 800 captures were visually inspected |
| Live quota presentation | The native title chip displayed only `Codex · 7d` with the live shared-pool percentage; the drawer no longer contained Spark |
| Live theme restoration | Toggling the actual Sidecar setting off removed the theme style and marker; toggling back restored them. The original composer node and its unsent content were retained, and the original desktop PID/creation-time pair remained unchanged |

The browser preview uses **sample quota**, clearly marked DEMO. The successful account transport check does not turn those sample values into real account values.

## Remaining acceptance scope

Alpha.1's first real desktop launch reached READY but exposed duplicate-start and exit-cleanup problems. Alpha.2 added a local instance handshake and exact desktop PID/creation-time tracking; the user subsequently confirmed the sidebar worked after reopening. Alpha.3 was attached and visually checked in the live client. Full multi-window operation, every native dialog, and a future official client update remain outside this single-window acceptance. Static source inspection and browser tests are not a substitute for those checks.

The old file-based stop request was also observed inside the Codex MSIX package's redirected AppData directory, invisible to the unpackaged desktop-launched companion. The new `~/.codex-sidecar` default is outside AppData so both callers share the same control files. See [Microsoft's explanation of packaged desktop file virtualization](https://learn.microsoft.com/en-us/windows/msix/desktop/desktop-to-uwp-behind-the-scenes).

The adapter intentionally refuses unknown desktop layouts. An alpha with this boundary may decline to mount after a Codex UI update rather than overlay unrelated content. No macOS or Linux desktop support is claimed; cross-platform checks cover portable components only.

## First launch

1. Finish active Codex work and exit the app normally, including any background app process.
2. Open the installed **Codex Sidecar** shortcut, or run `node dist/cli.js start`.
3. Sidecar discovers the installed Store app and starts it with a loopback debugging endpoint. A successful launch prints `SIDECAR_READY=1` after a supported window accepts the components.
4. Check the quota indicator, drawer, a saved note, and a second Codex window.

No process is force-closed. If an existing desktop has no verified connection, startup fails with an explanation. Alpha.6 provides explicit Sol translation with medium reasoning and local translation history.

## Alpha.6 live verification (2026-09-05)

- 119 automated tests passed, plus the Windows launcher parent-exit and error-handling checks.
- The installed Windows-subsystem launcher reused a ready companion in about 1.85 seconds. Five seconds of visible-shell-window sampling detected no new console windows. A current-user Startup shortcut and Ctrl+Alt+X desktop hotkey were verified; no full sign-out/reboot test was performed.
- The native drawer began at y=94 below the header bottom y=82, with no quota-chip overlap. It returned to its normal right-edge position, hid the pinned summary while open, and handed the area back on a native summary click.
- The selected task title was white at full opacity and its icon used a transparent white outline. Chromium reported HarmonyOS Sans SC as the actual rendered font for a mixed Chinese/Latin/digit sample, and both native UI and drawer CSS used that family.
- Sol returned a real Chinese translation. Saved history survived the next companion reload and was recalled in the drawer. Motion remained off on both sides and Windows reduced motion stayed enabled.
- Codex's original desktop PID and creation time remained unchanged. Full future-version and every-native-dialog coverage remain outside this acceptance.

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
