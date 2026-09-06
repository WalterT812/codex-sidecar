# Pearl tools design QA — 6 September 2026

final result: passed

## Evidence and scope

Approved source: combined mockup `exec-81eb21d1-3d68-42e4-8adb-ce85cdb0ac97.png` (1487 × 1058). Rendered implementation: actual renderer modules in the local fixture at `http://127.0.0.1:43822/`, captured in the Codex in-app browser at 1280 × 900. Evidence stays in ignored `.local/design22-final.png` and `.local/design22-narrow.png`. Reference and implementation were opened together for comparison, followed by the final typography capture.

The fixture arranges the independently floating windows side by side to compare the composition; production retains each user's saved geometry. It uses a paused 24:18 timer with two queued blocks and two synthetic bookmarks. The ring correctly shows 24:18 remaining out of 25 minutes; the mock's decorative half-ring is not copied as incorrect time data. The production dock stays at bottom right, as previously requested.

## Findings and corrections

- P1, corrected: separate stacking contexts prevented bookmarks from rising above personal tools and could cover the dock in narrow windows. Floating panels now share one layer sequence; hosts do not create a stacking context. The dock remains above panels. Browser verification at 400 × 800 shows the requested bookmark panel in front and the dock accessible.
- P2, corrected: personal panel positions were not recalculated when the viewport shrank. Resize now reapplies clamped geometry without overwriting saved preferred sizes.
- P2, corrected: initial toolbox and bookmark typography was too small relative to the source. Tool rows now use 16px, headings 18px, bookmark summaries 14px, dual dates 11px, and timer digits 58px. Final screenshot confirms the larger type does not overflow.

## Required visual surfaces

- Typography: existing HarmonyOS Chinese/Latin font stack retained, tabular timer digits, single-line ellipsis on bookmark summaries, full summary available as tooltip and editable title.
- Layout: open single-column groups, independent native disclosure controls, rounded 22px windows, compact 65px bookmark strips, folded add form, two visible queue rows. At 400px viewport, bookmark content has equal scroll/client width and both actions remain inside the strip.
- Color: pearl/lilac backgrounds, aubergine text and ring, subtle champagne window borders; motion remains disabled.
- Assets: existing branded mark and original product icon set retained. No new decorative image assets are implied. The canvas ring is an accessible progress visualization with semantic progress and visible numeric fallback, not an image placeholder.
- Copy: actual tool names; separate message/saved labels; explicit unknown message date when evidence is unavailable. Full original bookmark text stays in the editor. Timer help reflects manual progression rather than automatic Pomodoro cycles.

## Interaction verification

In-app browser: independent group collapse and reload persistence; mouse drag in both queue positions; keyboard ArrowUp reordering; add-block form submission; normal and narrow layouts; dock/bookmark front ordering. Console error log was empty. Store/timer/renderer regression suite: 164 passing tests, plus TypeScript check and production build.

Intentional product differences: retain useful sound toggle, delete controls, app version/footer and existing brand mark; show a small persistent timer badge. These are existing functional controls omitted from the mock. No remaining P0/P1/P2 findings.
