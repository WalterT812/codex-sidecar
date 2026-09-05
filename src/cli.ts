import { parseArgs } from 'node:util';
import { startCompanion, VERSION } from './runtime.js';
import { startDemo } from './demo.js';
import { dataDirectory } from './paths.js';
import { requestStop } from './lock.js';
import { discoverWindowsApp, listDesktopProcesses, discoverCodexCli } from './platform/windows.js';

const { positionals, values } = parseArgs({ allowPositionals: true, options: { port: { type: 'string' }, help: { type: 'boolean', short: 'h' }, version: { type: 'boolean', short: 'v' } } });
const command = positionals[0] ?? 'help';
async function main() {
  if (values.version) { console.log(VERSION); return; }
  if (values.help || command === 'help') {
    console.log(`Codex Sidecar ${VERSION}\n\n  start             Open or attach to the official desktop\n  attach --port N   Attach to a verified running desktop\n  stop              Remove widgets and stop the companion\n  doctor            Read-only environment diagnostics\n  demo              Openable browser preview with sample data\n\nEnvironment: CODEX_SIDECAR_DATA, CODEX_SIDECAR_CLI\nThe launcher never forcibly closes or restarts Codex.`); return;
  }
  if (command === 'demo') { await startDemo(); return; }
  if (command === 'stop') { await requestStop(dataDirectory()); console.log('Stop requested. Components will be removed shortly.'); return; }
  if (command === 'doctor') {
    const app = await discoverWindowsApp();
    const running = await listDesktopProcesses(app);
    const cli = await discoverCodexCli().catch(() => null);
    console.log(JSON.stringify({ version: VERSION, app, desktopProcesses: running.length, debugPorts: [...new Set(running.map(p => p.debugPort).filter(Boolean))], cli, dataDirectory: dataDirectory(), installationModified: false }, null, 2)); return;
  }
  if (!['start', 'attach'].includes(command)) throw new Error(`Unknown command: ${command}`);
  const port = values.port === undefined ? undefined : Number(values.port);
  if (port !== undefined && (!Number.isInteger(port) || port < 1 || port > 65535)) throw new Error('Port must be a number between 1 and 65535.');
  await startCompanion({ port, attachOnly: command === 'attach' });
}
main().catch(error => { console.error(`Codex Sidecar: ${error instanceof Error ? error.message : 'Unexpected error'}`); process.exitCode = 1; });
