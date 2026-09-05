# Royal Pearl — bright purple and champagne

The approved concept pairs a bright reading canvas with royal-purple selected tasks, primary actions and quota status. Champagne gold is reserved for small markers and hairline edging. After live feedback, the ornate first wallpaper was replaced with V2: an almost-white center with restrained frosted-glass light at the edges.

Both sidebars support slow CSS gradient motion (24–27 seconds). Motion has an independent setting. Unspecified preference follows the operating system; an explicit switch can override it only for this companion. Walter's final preference is motion off with Windows reduced motion on. No animation runs a JavaScript frame loop. The native input DOM and conversation records remain owned by Codex.

Selected task text overrides descendant native text tokens as well as inherited color. The selected row's icon is a transparent white outline. Notes, bookmarks and translation now open concurrently, with separate drafts and geometry. The duplicate tab row is hidden. Drag a panel header to move it; all eight edges/corners resize it. Header arrow keys move, bottom-right handle arrow keys resize, and Shift increases the step. Double-click a header or use Reset to restore its default position. Each tool has its own session layout; the most recently saved layout is a default for newly opened windows. User-positioned panels remain where placed instead of automatically avoiding the summary.

The horizontal tool dock sits 16px from the bottom-right corner. A rounded, 390px-wide popover opens upward, capped at 640px high. An open native summary limits available height without moving Sidecar sideways or toggling either panel. Short popovers omit decorative artwork and duplicate quota details, with tools scrolling internally. If fewer than 180px remain, only the dock remains available until the summary is collapsed.

UI, conversation text, Latin letters and numbers prefer the locally installed HarmonyOS Sans SC family. User messages, assistant replies and the native composer use 16px text with 1.8 line height, including the assistant-specific text-style marker and the composer inline-size override. No Huawei font binary is redistributed. Standard UI fallbacks apply on other machines. Code and mathematical notation retain their specialized fonts for alignment and correct symbols.

Wide native tables are constrained to the reply card with their existing horizontal scroll surface, neutralizing the native negative-margin expansion.

## Workspaces

The workspace selector reads native sidebar sections. Selecting a workspace limits the visible section list and expands that section. “New chat here” calls its existing native new-chat button, retaining native section association. Returning to All spaces reveals everything. Selection is per-window session storage. Switching spaces preserves the currently open conversation, so navigation never silently discards an unsent draft. Existing conversations can be placed in sections through the original Codex menu.

This is a view over native sections, not a separate conversation database or a filesystem project requirement. Duplicate section names are intentionally not filtered, because a display name alone would be ambiguous. Unknown native layouts are left untouched.

## Translation

Translation defaults to Sol with medium reasoning through the user's existing Codex sign-in. Each request is a bounded ephemeral CLI job using an empty working directory, ignored user configuration, no project instructions, disabled shell tool and no user MCP configuration. It consumes Codex quota and does not save a new conversation. The source and translation are saved locally in Sidecar history. History retains up to the most recent 50 items within the storage budget and supports recall and explicit clearing.

Only Sol is supported. The on-device experiment and external translation link were removed following user feedback. A real submitted sentence and history recall after a companion reload were verified in the native client.

## Windows entry point

The installer compiles `scripts/Launcher.cs` as a Windows-subsystem executable using the bundled .NET Framework compiler. It starts its PowerShell coordinator with `UseShellExecute=false` and `CreateNoWindow=true`. Desktop and Start menu shortcuts target the executable, and the desktop hotkey is Ctrl+Alt+X. Clicking again requests the existing Sidecar and restores an existing verified-path Codex GUI window.

`scripts/install.ps1 -EnableStartup` explicitly creates a current-user Startup-folder shortcut. Subsequent ordinary installs update the same target executable without silently opting other users into startup. Remove that Startup shortcut or disable it in Windows startup settings to opt out. The launcher never terminates Codex. Login failures go to local logs instead of a modal dialog.

Official Codex package files are never patched; future selector changes may require a Sidecar compatibility update.
