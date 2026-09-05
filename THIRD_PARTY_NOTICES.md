# References and acknowledgements

This release uses original TypeScript implementations informed by the following public projects. No source files, artwork, logos, or application bundles from these repositories are redistributed in this release.

- **Codexion**, MIT, copyright 2026 LYU.ai. Commit `3ab2fb8d4a91cba503313445bd56f1a954d04654`. Its separation of [account quota reads](https://github.com/lyuai/codexion/blob/3ab2fb8d4a91cba503313445bd56f1a954d04654/src/usage/app-server-provider.ts) from [isolated UI widgets](https://github.com/lyuai/codexion/blob/3ab2fb8d4a91cba503313445bd56f1a954d04654/src/ui/injected-meter.ts) informed this architecture. [License](https://github.com/lyuai/codexion/blob/3ab2fb8d4a91cba503313445bd56f1a954d04654/LICENSE).
- **Codex Styler**, Apache-2.0. Commit `ee3dce2e69cc2ec884f0567d4475eb33722054e5`. [Managed CDP design](https://github.com/xuhuanstudio/codex-styler/blob/ee3dce2e69cc2ec884f0567d4475eb33722054e5/docs/adr/0001-managed-cdp-runtime.md) and [Windows application discovery](https://github.com/xuhuanstudio/codex-styler/blob/ee3dce2e69cc2ec884f0567d4475eb33722054e5/apps/desktop/src-tauri/src/codex.rs) informed process verification. [License](https://github.com/xuhuanstudio/codex-styler/blob/ee3dce2e69cc2ec884f0567d4475eb33722054e5/LICENSE).
- **Explodex** was surveyed as a UI extension SDK. No license was found during this research; none of its source is incorporated.
- **Codex Dream Skin** and **Codex Theme Engine** were reviewed for whole-window runtime styling and removal of owned stylesheets. Their code and assets are not copied. Source links and implementation decisions are recorded in [Pearl Atelier research](docs/pearl-atelier.md).
- **OpenAI Codex** provides the documented [app-server protocol](https://learn.chatgpt.com/docs/app-server). The installed CLI is invoked separately; it is not redistributed. Codex, ChatGPT, and OpenAI names and marks belong to their respective owners.

Development dependencies and exact versions are recorded in package-lock.json. Bundled production code has no external npm runtime dependencies. esbuild and TypeScript are build tools; jsdom and tsx are development/test dependencies.

Any future copied or modified upstream files must retain their original copyright/license notices and record modifications here.
