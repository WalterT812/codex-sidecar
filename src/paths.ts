import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
export function dataDirectory() {
  // MSIX can give packaged and unpackaged callers different AppData file views.
  // Keep locks, stop requests, and state in one shared location outside AppData.
  return process.env.CODEX_SIDECAR_DATA ? resolve(process.env.CODEX_SIDECAR_DATA) : join(homedir(), '.codex-sidecar');
}
