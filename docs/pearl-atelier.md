# Pearl Atelier / 珠光工坊

Whole-window appearance work, researched and implemented on 5 September 2026.
This is an independent personal theme for the official client.

Code readability update, 6 September 2026 (alpha.18): the observed native block
uses `code.text-size-code` without a `pre` wrapper. It previously rendered at
12px with italic Chinese comments. Fenced code now follows the appearance size
(16px by default, minimum 15px), uses 1.7 line spacing and an explicit HarmonyOS
Sans SC fallback after the Latin monospace fonts. Comments are upright, with
darker comment, string and numeric colors. Inline code and editor panes keep
their existing sizes. Live desktop CSS probes confirmed 16px / 27.2px, upright
comments and the available Chinese font; all 147 existing tests passed.

## Design brief

The user wants the entire native workspace to feel personal: task entries,
upper-left branding, every control family, wallpaper, conversation surfaces,
composer, typography, and the lower-left account area. The companion drawer is
only one part of that workspace. New subjects still start separate conversations;
existing subjects keep their original context. Appearance must not reorganize or
rename those conversations.

The chosen direction is a bright anime atelier with pearl white, powder blue,
lilac, and a little rose. The portrait occupies the outer edge. The reading area
stays quiet. Task rows receive a conversation glyph, a soft surface, and a clear
selected state. Menu and dialog backgrounds are opaque enough to read. The
original status indicators, error colors, and click handlers retain their meaning.

Palette: paper `#fbfaff`, ink `#34384c`, muted text `#666a7e`, accent `#78609e`,
lavender `#eee6f7`, mist blue `#edf3fc`. UI uses Segoe UI Variable / Segoe UI /
Microsoft YaHei UI; prose uses Microsoft YaHei as the Chinese fallback; code
retains an independent Cascadia Code / Consolas stack. No font is downloaded.

## Research and decisions

These are community projects, not official OpenAI extension APIs. Their documented
capabilities are not a promise of compatibility with every Codex release.

| Reference | Observed approach | Decision for this project |
| --- | --- | --- |
| [Codex Dream Skin](https://github.com/Fei-Away/Codex-Dream-Skin) and its [runtime CSS](https://github.com/Fei-Away/Codex-Dream-Skin/blob/main/runtime/dream-skin.css) | Runtime styling of native controls, local CDP, restorable theme layer | Use semantic native surfaces; avoid an application fork and avoid a wallpaper containing fake controls |
| [Codex Theme Engine](https://github.com/than0112/codex-theme-engine), [CSS builder](https://github.com/than0112/codex-theme-engine/blob/main/src/engine/css-builder.ts), [injector](https://github.com/than0112/codex-theme-engine/blob/main/src/engine/injector.ts) | Theme data becomes a stylesheet; the injector owns and removes its own style node | Keep a single owned style node with exact removal; reuse Sidecar's existing verified connection |
| [Codex Styler](https://github.com/xuhuanstudio/codex-styler) | Separates theme, renderer adapter, and optional characters; documents runtime checks and restoration | Keep artwork independent from utility components; treat adapter compatibility as an ongoing maintenance responsibility |
| [codexthemes skills](https://github.com/codexthemes/skills) | Theme creation and installation workflow with native UI review | Review real conversations, sidebar states, menus, composer, and narrow layouts rather than relying only on a concept image |

The implementation is original. No third-party runtime, CSS, or character artwork
is copied into the distribution. Native selectors and computed design tokens were
observed on the local Windows client, version 26.901.2854.0.

## Architecture and restoration

`src/renderer/theme.ts` owns one style element and one namespaced HTML attribute.
No React-owned node is replaced. Existing inputs, drafts, focus, native task
actions, and event listeners remain in place. The theme is enabled by default on
supported native layouts. Sidecar settings expose a persistent whole-theme switch.
Turning it off or stopping Sidecar removes its style and marker. Unknown pages and
occupied ownership markers are refused.

App installation files, signatures, executable icons, and the official updater are
untouched. The upper-left in-app mark is styled at runtime; this does not replace
the Windows executable/taskbar identity. Future DOM changes may need an adapter
revision even though official updates remain usable.

Wallpaper is a bundled PNG data URL, with no runtime requests to image or font
servers. Narrow windows use a stronger reading scrim. Reduced-motion and forced
color preferences have dedicated rules. Diff/error/success semantic colors are
not remapped to decorative lavender.

## Quota correction

Only windows from the exact shared `codex` bucket are displayed. A 10080-minute
window sorts first. The title chip includes the pool name, period and remaining
percentage. Spark (`codex_bengalfox`) and other model-specific pools are excluded
from both the chip and drawer. A missing shared pool stays unknown; a Spark 100%
value never becomes a substitute. Normalization retains all provider data so this
presentation choice does not destroy information.

## Assets and acceptance

Original background and icon concept sheet are in `assets/`; provenance and
generation prompts are in [ARTWORK.md](../assets/ARTWORK.md). Small native glyphs
are original vector drawings interpreted from the same palette, rather than
blurry slices of the concept sheet.

Tests cover the pool selection/order, unknown values, setting persistence,
native-input preservation, theme removal, and existing lifecycle behavior.
Desktop acceptance uses private local captures under `.local/`; captures can
include personal conversation titles and are never committed or published.
