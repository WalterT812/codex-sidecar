# Codex Sidecar

Personal themes and components for the **official Codex desktop app**: a whole-window visual treatment, shared Codex usage indicator, hover drawer, notes, and bookmarks that take you back to the original conversation.

[简体中文](README.zh-CN.md) · [Compatibility](docs/compatibility.md) · [Architecture](docs/superpowers/specs/2026-09-05-sidecar-design.md)

**Early alpha, Windows-first.** The app keeps its own updates and conversation history. Sidecar mounts isolated components at runtime; it does not edit app.asar, installed binaries, signatures, or the updater. A future desktop UI change may still require an adapter update.

## Features

- Pearl Atelier whole-window theme: task rows, brand ornament, wallpaper, typography, menus, composer, and account area; a single switch restores native appearance. See the [design and research](docs/pearl-atelier.md).
- Shared Codex account quota from the official stdio app-server, with the weekly window first; Spark pools are hidden. Unknown/stale states and reset times remain explicit.
- Right-edge drawer: hover, click, keyboard, pin, and Escape.
- Local notes and conversation bookmarks, synchronized across attached windows with revision conflict protection.
- Component visibility settings and a complete detach action.
- Original adult anime cover art, with an independent visibility toggle; it hides while editing.
- Independent browser preview with clearly labeled sample quota and separate demo data.

Translation is planned after selecting a provider. The alpha does not send selected text to a translation service or alter chat submission.

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

The shortcut allows its local launcher script with a **process-only** execution policy; it does not change the system or user policy. Startup waits for an actual mounted window and reports failure visibly.

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
