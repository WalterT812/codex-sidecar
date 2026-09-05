# Contributing

Use Node.js 24 and run `npm ci --ignore-scripts`, then `npm run check`.

Changes should keep each component removable, preserve editing drafts during snapshots, and use the validated bridge for persistence. Do not add direct access to authentication files, arbitrary command execution, blanket process termination, installation patching, or silent translation/network providers.

Include focused tests for behavior and regressions. A desktop adapter change needs its tested app version, Windows version, main-window/secondary-window behavior, and cleanup evidence. A browser demo is useful but is not evidence of real desktop compatibility.

Never include account credentials, real notes, conversation transcripts, local runtime files, or screenshots containing personal data in an issue or pull request. For a security issue, use GitHub private vulnerability reporting if enabled rather than posting a working exploit with private data publicly.

Keep copied upstream notices intact and update THIRD_PARTY_NOTICES.md. Do not copy code from a repository lacking a license.
