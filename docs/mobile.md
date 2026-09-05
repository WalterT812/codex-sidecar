# Private mobile entrance

As of 6 September 2026 (alpha.17), this custom mobile entry is on hold: phone use has moved to official ChatGPT Remote, and Sidecar focuses on the desktop. The pairing tool is hidden and saved layouts do not reopen it. The existing website, service and data are retained; the instructions below describe the earlier interface.

This optional, single-owner PWA keeps the Windows Codex desktop as the execution owner. The server never receives a Codex login token, API key, CDP endpoint, generic shell bridge or filesystem access. It serves the phone UI, authenticates paired devices, caches recently requested text history and stores an outbound message queue.

## Use

1. Open the desktop tool dock → **＋ → 手机入口**.
2. Generate a one-use pairing code. Open the configured HTTPS URL on the phone and enter it, or use the copied pairing link. Codes expire after ten minutes; authenticated cookies expire after thirty days.
3. Choose an existing task and send text or images. The desktop's own follow-up coordinator retains its model, workspace and permission settings. Active tasks use the native coordinator's normal follow-up behavior.
4. Use **随手记** for text, pictures or explicitly recorded audio. These arrive in the desktop idea library; attachments are local files. Audio is an attachment, not an automatic transcription. The phone keyboard's dictation can produce ordinary chat text.
5. Add the page to the phone's home screen using the browser's normal action. **撤销所有手机登录** revokes every paired cookie.

Desktop offline means cached reading and queued submissions. The computer must be awake with Codex and Sidecar running to execute work. This does not wake the PC, replace remote desktop, or handle native approval dialogs remotely. Verify any “结果未知” send in the original task before submitting it again.

## Provision

The host requires Node.js 22.13+, HTTPS and a loopback reverse proxy. `scripts/mobile.service` and `scripts/deploy-mobile.ps1` are an example for the maintainer's Ubuntu host; adapt account, paths and SSH alias before using another machine.

Generate a random relay secret of at least 32 characters. Keep it out of Git and command-line arguments. Save this local configuration in `~/.codex-sidecar/mobile.json`:

```json
{"endpoint":"https://example.com/sidecar/","token":"<private random secret>"}
```

The endpoint must end in `/`. The server's private `config.json`:

```json
{"publicUrl":"https://example.com/sidecar/","relayToken":"<same private secret>","path":"/private/mobile/data/state.json","port":4388}
```

Set `SIDECAR_MOBILE_CONFIG` to its path, restrict it to the service account, and run the built `dist/mobile/server.js`. Build with `npm run check`; upload the mobile bundle without local configuration or state. The service listens only on `127.0.0.1`. The example deployment keeps timestamped releases and a `current` symlink. A symlink switch is followed by restarting only this service.

For a subpath deployment, add an isolated Caddy handler, leaving the rest of the site in a separate fallback handler. Existing site's restrictive CSP must not be applied to the mobile route:

```caddyfile
redir /sidecar /sidecar/ 308
handle_path /sidecar/* {
    header Permissions-Policy "camera=(), microphone=(self), geolocation=(), payment=()"
    reverse_proxy 127.0.0.1:4388
}
```

Validate Caddy before a reload, preserve its prior file, and verify both the existing site and `/sidecar/api/threads` (anonymous access must return 401). Restart Sidecar alone after provisioning its config. No official desktop files are patched.

## Storage and delivery

- Pairing code and session values are stored as hashes. Cookies are Secure, HttpOnly and SameSite=Strict. Mutating phone requests require the configured origin. The relay uses a separate bearer secret over HTTPS.
- Phone command UUIDs deduplicate kind, text, target and attachments. The server persists a dispatch record before returning a command; the desktop writes its own journal before invoking a native send. A restart or uncertain native result never causes automatic send replay. Acknowledgement retries reuse the recorded result.
- The list contains up to 100 recent unarchived tasks. Only requested history is cached, up to 20 tasks with bounded rows and storage. Very large histories remain available in the native desktop. Plain text, basic Markdown, links, tables and code are rendered; native artifacts, approval interfaces and interactive tool cards are not reproduced.
- Server state is private plaintext, restricted by file permissions. Completed commands expire after seven days and are bounded; successful idea/send attachments are removed from the server after desktop acknowledgement. Paired phone storage retains recently read text for offline viewing. Logout clears its local cache. The service worker caches only the static app shell, never API responses.
- Local ideas and attachments are under `~/.codex-sidecar/mobile-inbox`; local send records are in `mobile-journal.json`. Existing notes, source bookmarks and preferences remain in `state.json`. Do not upload these directories to a public repository.

The adapter is verified against Windows Codex `26.901.2854.0`, with native app module names deliberately versioned in `src/renderer/native.ts`. An official update may require adaptation. Unsupported versions fail without substituting a second CLI conversation owner.

## Acceptance scope

Automated tests cover authentication, one-use pairing, origin rejection, queue deduplication including attachments, history privacy, native-owner relay dispatch through an injected host, and local attachment import. A live 390×844 browser read 44 actual tasks and their messages, preserved drafts across task changes, and produced no page errors or horizontal page overflow. A physical iPhone, device microphone permissions and a real phone-triggered model response have not yet been exercised; do not treat the browser test as those measurements.
