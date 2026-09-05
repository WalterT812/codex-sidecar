import childProcess from 'node:child_process';
import fs from 'node:fs/promises';
import { win32 as path } from 'node:path';

export interface AppInstallation { guiPath: string; packageVersion: string; packageFamilyName?: string }
export interface DesktopProcess { pid: number; executablePath: string; debugPort: number | null }

const PACKAGE_SCRIPT = `Get-AppxPackage -Name OpenAI.Codex | Select-Object Name, InstallLocation, Version, PackageFamilyName | ConvertTo-Json -Compress`;
const PROCESSES_SCRIPT = `@(Get-CimInstance Win32_Process -Filter "Name='ChatGPT.exe' OR Name='Codex.exe'" | Select-Object ProcessId, ParentProcessId, ExecutablePath, CommandLine) | ConvertTo-Json -Compress`;
const LISTENERS_SCRIPT = `$sidecarPort = [int]$sidecarInput.port
@(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object LocalPort -eq $sidecarPort | Select-Object LocalAddress, OwningProcess) | ConvertTo-Json -Compress`;
const OWNER_SCRIPT = `$sidecarPort = [int]$sidecarInput.port
$sidecarListeners = @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object LocalPort -eq $sidecarPort | Select-Object LocalAddress, OwningProcess)
$sidecarProcesses = @(Get-CimInstance Win32_Process -Filter "Name='ChatGPT.exe' OR Name='Codex.exe'" | Select-Object ProcessId, ParentProcessId, ExecutablePath, CommandLine)
@{listeners=$sidecarListeners; processes=$sidecarProcesses} | ConvertTo-Json -Depth 4 -Compress`;

/** Scripts are fixed source. Values enter through JSON in a child-only environment variable. */
async function powershell(script: string, input: Record<string, unknown> = {}): Promise<unknown> {
  const command = `$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$sidecarInput = $env:CODEX_SIDECAR_INPUT | ConvertFrom-Json
${script}`;
  return new Promise((resolve, reject) => {
    childProcess.execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], {
      windowsHide: true, encoding: 'utf8', timeout: 15_000, maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, CODEX_SIDECAR_INPUT: JSON.stringify(input) },
    }, (error, stdout) => {
      if (error) { reject(new Error('Windows discovery failed. PowerShell and Windows desktop access are required.', { cause: error })); return; }
      try { resolve(stdout.trim() ? JSON.parse(stdout.replace(/^\uFEFF/, '')) : []); }
      catch { reject(new Error('Windows discovery returned invalid JSON.')); }
    });
  });
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function rows(value: unknown): Record<string, unknown>[] {
  return (Array.isArray(value) ? value : [value]).map(record).filter((row): row is Record<string, unknown> => !!row);
}

function samePath(a: string, b: string): boolean { return path.normalize(a).toLowerCase() === path.normalize(b).toLowerCase(); }
function absoluteLocalPath(file: string): boolean { return /^[a-z]:[\\/]/i.test(file) && path.isAbsolute(file); }

function validateGui(app: AppInstallation): void {
  if (!app || typeof app.guiPath !== 'string' || !absoluteLocalPath(app.guiPath) ||
    path.basename(path.dirname(app.guiPath)).toLowerCase() !== 'app' || !/^(ChatGPT|Codex)\.exe$/i.test(path.basename(app.guiPath))) {
    throw new Error('Expected the installed Codex desktop GUI executable inside its app directory; a CLI cannot be used.');
  }
}

function validatePort(port: number): void {
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Debug port must be an integer between 1024 and 65535.');
}

async function isFile(file: string): Promise<boolean> {
  try { return (await fs.stat(file)).isFile(); }
  catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return false;
    throw error;
  }
}

export async function discoverWindowsApp(): Promise<AppInstallation> {
  const packages = rows(await powershell(PACKAGE_SCRIPT)).filter((item) => item.Name === 'OpenAI.Codex' &&
    typeof item.InstallLocation === 'string' && absoluteLocalPath(item.InstallLocation) &&
    typeof item.Version === 'string' && /^\d+(\.\d+){1,3}$/.test(item.Version));
  packages.sort((a, b) => {
    const av = (a.Version as string).split('.').map(Number), bv = (b.Version as string).split('.').map(Number);
    for (let i = 0; i < 4; i++) { const diff = (bv[i] ?? 0) - (av[i] ?? 0); if (diff) return diff; }
    return 0;
  });
  const item = packages[0];
  if (item) {
    for (const name of ['ChatGPT.exe', 'Codex.exe']) {
      const guiPath = path.join(item.InstallLocation as string, 'app', name);
      if (await isFile(guiPath)) {
        return { guiPath, packageVersion: item.Version as string,
          ...(typeof item.PackageFamilyName === 'string' ? { packageFamilyName: item.PackageFamilyName } : {}) };
      }
    }
  }
  throw new Error('The OpenAI.Codex Windows package and its desktop GUI were not found. Install or update the official desktop app.');
}

function desktopProcesses(raw: unknown, app: AppInstallation): DesktopProcess[] {
  return rows(raw).flatMap((row) => {
    if (typeof row.ExecutablePath !== 'string' || !samePath(row.ExecutablePath, app.guiPath) ||
      typeof row.ProcessId !== 'number' || !Number.isSafeInteger(row.ProcessId) || row.ProcessId <= 0) return [];
    const match = typeof row.CommandLine === 'string' ? /(?:^|\s)"?--remote-debugging-port(?:=|\s+)(\d+)(?="?(?:\s|$))/.exec(row.CommandLine) : null;
    const port = match ? Number(match[1]) : 0;
    return [{ pid: row.ProcessId, executablePath: row.ExecutablePath, debugPort: port >= 1024 && port <= 65535 ? port : null }];
  });
}

export async function listDesktopProcesses(app: AppInstallation): Promise<DesktopProcess[]> {
  validateGui(app);
  return desktopProcesses(await powershell(PROCESSES_SCRIPT), app);
}

export async function verifyPortOwner(port: number, app: AppInstallation): Promise<boolean> {
  validateGui(app); validatePort(port);
  const result = record(await powershell(OWNER_SCRIPT, { port }));
  if (!result) return false;
  const guiPids = new Set(desktopProcesses(result.processes, app).map((item) => item.pid));
  const listeners = rows(result.listeners);
  // Electron subprocesses use the same packaged GUI executable. A CLI, even a descendant, is excluded.
  return listeners.length > 0 && listeners.every((listener) =>
    (listener.LocalAddress === '127.0.0.1' || listener.LocalAddress === '::1') &&
    typeof listener.OwningProcess === 'number' && guiPids.has(listener.OwningProcess));
}

/** Called only by an explicit start operation. Existing desktop sessions are never stopped. */
export async function launchDesktop(app: AppInstallation, port: number): Promise<void> {
  validateGui(app); validatePort(port);
  if ((await listDesktopProcesses(app)).length) throw new Error('Codex is already running. Exit it normally, then run Sidecar start to enable debugging.');
  if (rows(await powershell(LISTENERS_SCRIPT, { port })).length) throw new Error('The requested debug port is already in use.');
  if (!await isFile(app.guiPath)) throw new Error('The verified desktop GUI no longer exists. Run discovery again.');
  await new Promise<void>((resolve, reject) => {
    const child = childProcess.spawn(app.guiPath, [`--remote-debugging-address=127.0.0.1`, `--remote-debugging-port=${port}`], {
      detached: true, stdio: 'ignore', shell: false,
    });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
}

export async function discoverCodexCli(): Promise<string> {
  const override = process.env.CODEX_SIDECAR_CLI;
  if (override !== undefined) {
    if (!absoluteLocalPath(override) || path.basename(override).toLowerCase() !== 'codex.exe') {
      throw new Error('CODEX_SIDECAR_CLI must be an absolute local path to codex.exe.');
    }
    if (path.basename(path.dirname(override)).toLowerCase() === 'app') throw new Error('CODEX_SIDECAR_CLI points to a desktop GUI location, not a CLI.');
    if (!await isFile(override)) throw new Error('CODEX_SIDECAR_CLI does not point to an existing file.');
    return path.normalize(override);
  }
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData || !absoluteLocalPath(localAppData)) throw new Error('LOCALAPPDATA is unavailable; set CODEX_SIDECAR_CLI to the official CLI executable.');
  const bin = path.join(localAppData, 'OpenAI', 'Codex', 'bin');
  let directories;
  try { directories = await fs.readdir(bin, { withFileTypes: true }); }
  catch { throw new Error('The Codex CLI was not found. Set CODEX_SIDECAR_CLI to its absolute path.'); }
  const candidates: { file: string; modified: number }[] = [];
  for (const directory of directories) {
    if (!directory.isDirectory() || !/^[a-zA-Z0-9._-]+$/.test(directory.name)) continue;
    const file = path.join(bin, directory.name, 'codex.exe');
    try {
      const stats = await fs.stat(file);
      if (stats.isFile()) candidates.push({ file, modified: stats.mtimeMs });
    } catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) throw error;
    }
  }
  candidates.sort((a, b) => b.modified - a.modified || a.file.localeCompare(b.file));
  if (candidates[0]) return candidates[0].file;
  throw new Error('The Codex CLI was not found. Set CODEX_SIDECAR_CLI to its absolute path.');
}
