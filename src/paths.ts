import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
export function dataDirectory() {
  return process.env.CODEX_SIDECAR_DATA ? resolve(process.env.CODEX_SIDECAR_DATA) : join(process.env.LOCALAPPDATA || join(homedir(), '.local', 'share'), 'Codex-Sidecar');
}
