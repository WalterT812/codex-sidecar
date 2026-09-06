# Pearl desktop tools

Approved target: the 6 September combined mockup (collapsible toolbox, circular timer, reorderable queue, compact bookmark strips). Implement in the existing desktop component runtime and preserve saved content, quick-launch pins and per-conversation floating layouts.

1. Single-column tool groups with native details/summary toggles and remembered collapse state.
2. Circular countdown with manual progression; pointer and keyboard queue reordering; collapsible add form.
3. One-line bookmark summary, separate original/saved timestamps, icon navigation and delete actions. Missing original timestamps remain explicitly unknown.
4. Verify store compatibility, state transitions, interactions and rendered density at normal and narrow panel sizes. Update only Sidecar, preserving the official app process.

No new decorative assets are needed. Reuse existing brand/icon assets and HarmonyOS typography. The timer ring is a live data visualization; it is not a raster decoration.
