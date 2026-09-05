# Codex Sidecar

Personal themes and components for the **official Codex desktop app**: a whole-window visual treatment, shared Codex usage indicator, hover drawer, notes, and bookmarks that take you back to the original conversation.

[简体中文](README.zh-CN.md) · [Compatibility](docs/compatibility.md) · [Architecture](docs/superpowers/specs/2026-09-05-sidecar-design.md)

**Early alpha, Windows-first.** The app keeps its own updates and conversation history. Sidecar mounts isolated components at runtime; it does not edit app.asar, installed binaries, signatures, or the updater. A future desktop UI change may still require an adapter update.

## Features

- Royal Pearl whole-window theme: bright glass wallpaper, purple task selection, champagne accents, and HarmonyOS Sans SC when installed. A single switch restores native appearance. See [design and behavior](docs/royal-pearl.md).
- Shared Codex account quota from the official stdio app-server, with the weekly window first; Spark pools are hidden. Unknown/stale states and reset times remain explicit.
- Bottom-right tool dock: notes, bookmarks and Sol translation open concurrently in independent rounded panels. Drag their headers, resize any edge or corner, and double-click a header to reset. Panels stay open without pinning. Switching conversations hides them; returning restores that conversation’s open panels and geometry.
- Workspace views over native sections, using their original new-chat actions.
- Sol translation with medium reasoning, using Codex quota and local history for up to 50 translations; no new saved chat.
- Local notes and conversation bookmarks, synchronized across attached windows with revision conflict protection.
- Component visibility settings and a complete detach action.
- Original bright abstract cover art, with an independent visibility toggle; it hides while editing.
- Independent browser preview with clearly labeled sample quota and separate demo data.

Translation sends only submitted text to Codex using an ephemeral Sol job. There is no on-device or third-party translation fallback.

## Run from source

Use Node.js 24 LTS for development. The built companion requires Node.js 22.13 or newer.

```powershell
git clone https://github.com/WalterT812/codex-sidecar.git
cd codex-sidecar
npm ci --ignore-scripts
npm run check
npm run demo
```

Open the printed `DEMO_URL` to try the components. This preview does not attach to or restart the desktop app.

For the real desktop:

```powershell
npm run doctor
node dist/cli.js start
```

The first attachment needs a desktop process started with a local debugging connection. **If Codex is already running without one, Sidecar stops with an explanation.** Finish active work, exit Codex normally, then launch Sidecar. It opens the installed official app. It never force-closes or automatically restarts an existing desktop process.

Opening Sidecar again waits for an already-starting instance or verifies and reuses the ready instance. The coordinator exits when its original desktop process closes or is replaced.

```powershell
node dist/cli.js stop
```

Stopping removes the mounted components while leaving the official desktop running. Debugging is a process startup option; fully exit that desktop process and reopen Codex normally to close its debugging endpoint.

## Install a built copy on Windows

```powershell
.\scripts\install.ps1
```

The default destination is `D:\Apps\Codex-Sidecar`. Source code remains wherever you cloned it, such as `D:\Projects\Codex-Sidecar`. The installer copies only built app files and creates a desktop shortcut. Node must already be installed; it is not bundled.

The desktop shortcut targets a Windows-subsystem executable that creates no console. Start menu search and Ctrl+Alt+X are also available. The internal launcher uses a process-only script execution policy. Opt into startup with `scripts\install.ps1 -EnableStartup`; ordinary installation leaves this preference unchanged.

## Data and boundaries

Local data defaults to `~/.codex-sidecar` (`%USERPROFILE%\.codex-sidecar` on Windows); override with `CODEX_SIDECAR_DATA`. This shared location avoids MSIX redirecting AppData writes into a package-private directory. Demo data is in its own `demo` child directory. A single coordinator owns the store. Saves are revisioned and atomically replaced; corrupt/unknown stores are preserved and reported. The store is limited to 2 MB, with individual text limits.

Upgrading from alpha.1: stop the old companion before switching, keep its old `%LOCALAPPDATA%\Codex-Sidecar` folder as a backup, and copy `state.json` to the new data folder only if no new state exists. Do not copy locks or stop requests. Packaged callers can also have an old redirected copy under their MSIX package's `LocalCache\Local\Codex-Sidecar`; preserve it separately if both contain notes.

Bookmark destinations are restricted to HTTPS and existing `codex://threads/<UUID>` links. Copy a conversation deep link from the official app (Windows default: Ctrl+Alt+L). Sidecar does not manage or rewrite native conversation databases.

Normal use does not start a web server. The CDP endpoint is local-only, owned by the verified desktop executable. It is a powerful debugging interface: only run companion code you trust. Browser preview starts its own local demo server, with sample data and guarded mutation endpoints.

## Development

```powershell
npm run typecheck
npm test
npm run build
```

See [component development](docs/components.md), [contributing](CONTRIBUTING.md), and [upstream acknowledgements](THIRD_PARTY_NOTICES.md).

MIT licensed. This is an independent community project, not an OpenAI product or endorsed extension.
