import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import fs from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { test, mock, afterEach } from 'node:test';
import { discoverWindowsApp, listDesktopProcesses, verifyPortOwner, launchDesktop, discoverCodexCli } from '../src/platform/windows.js';

const install = 'C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.901.2854.0_x64__test';
const app = { guiPath: `${install}\\app\\ChatGPT.exe`, packageVersion: '26.901.2854.0', packageFamilyName: 'OpenAI.Codex_test' };
const processRow = (pid: number, executablePath = app.guiPath, commandLine = '') => ({ ProcessId: pid, ParentProcessId: 0, ExecutablePath: executablePath, CommandLine: commandLine });

function powershellResponses(...responses: unknown[]) {
  mock.method(childProcess, 'execFile', (executable: string, args: string[], options: unknown, callback: (error: Error | null, stdout: string, stderr: string) => void) => {
    assert.equal(executable, 'powershell.exe');
    assert.ok(args.includes('-NoProfile') && args.includes('-NonInteractive'));
    assert.ok(responses.length, 'Unexpected PowerShell call');
    queueMicrotask(() => callback(null, JSON.stringify(responses.shift()), ''));
    return {};
  });
}

afterEach(() => mock.restoreAll());

test('discovers the newest installed GUI and never selects the bundled CLI', async () => {
  powershellResponses([
    { Name: 'OpenAI.Codex', InstallLocation: install.replace('26.901.2854.0', '26.800.1.0'), Version: '26.800.1.0', PackageFamilyName: 'OpenAI.Codex_test' },
    { Name: 'OpenAI.Codex', InstallLocation: install, Version: app.packageVersion, PackageFamilyName: app.packageFamilyName },
  ]);
  mock.method(fs, 'stat', async (path: string) => {
    if (path !== app.guiPath) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    return { isFile: () => true };
  });
  assert.deepEqual(await discoverWindowsApp(), app);
});

test('does not silently launch an older package when the newest package GUI is missing', async () => {
  const oldInstall = install.replace('26.901.2854.0', '26.800.1.0');
  powershellResponses([
    { Name: 'OpenAI.Codex', InstallLocation: oldInstall, Version: '26.800.1.0' },
    { Name: 'OpenAI.Codex', InstallLocation: install, Version: app.packageVersion },
  ]);
  mock.method(fs, 'stat', async (file: string) => {
    if (file === `${oldInstall}\\app\\ChatGPT.exe`) return { isFile: () => true };
    throw Object.assign(new Error('missing'), { code: 'ENOENT' });
  });
  await assert.rejects(discoverWindowsApp(), /GUI|package/i);
});

test('ignores AppData CLI and unrelated processes when finding desktop debugging ports', async () => {
  powershellResponses([
    processRow(1, 'C:\\Users\\Someone\\AppData\\Local\\OpenAI\\Codex\\bin\\abc\\codex.exe', '--remote-debugging-port=9333'),
    processRow(2, app.guiPath, '"ChatGPT.exe" --remote-debugging-port=9444 --type=renderer'),
    processRow(3, app.guiPath.toLowerCase(), '"ChatGPT.exe"'),
    processRow(4, 'D:\\unrelated\\ChatGPT.exe', '--remote-debugging-port=9555'),
  ]);
  assert.deepEqual(await listDesktopProcesses(app), [
    { pid: 2, executablePath: app.guiPath, debugPort: 9444 },
    { pid: 3, executablePath: app.guiPath.toLowerCase(), debugPort: null },
  ]);
});

test('rejects ports exposed on all interfaces or owned by another executable', async () => {
  powershellResponses(
    { processes: [processRow(2)], listeners: [{ LocalAddress: '0.0.0.0', OwningProcess: 2 }] },
    { processes: [processRow(2), processRow(8, 'D:\\unknown.exe')], listeners: [{ LocalAddress: '127.0.0.1', OwningProcess: 8 }] },
    { processes: [processRow(2)], listeners: [{ LocalAddress: '127.0.0.1', OwningProcess: 2 }, { LocalAddress: '::1', OwningProcess: 2 }] },
    { processes: [processRow(2)], listeners: [] },
  );
  assert.equal(await verifyPortOwner(9444, app), false);
  assert.equal(await verifyPortOwner(9444, app), false);
  assert.equal(await verifyPortOwner(9444, app), true);
  assert.equal(await verifyPortOwner(9444, app), false);
});

test('refuses to launch while a desktop process exists and rejects CLI paths', async () => {
  powershellResponses([processRow(2)]);
  let spawns = 0;
  mock.method(childProcess, 'spawn', () => { spawns++; throw new Error('must not launch'); });
  await assert.rejects(launchDesktop(app, 9444), /already running/i);
  await assert.rejects(launchDesktop({ ...app, guiPath: 'C:\\Users\\Me\\AppData\\Local\\OpenAI\\Codex\\bin\\abc\\codex.exe' }, 9444), /GUI/i);
  assert.equal(spawns, 0);
});

test('launch passes a verified GUI path and an explicit loopback debugging address without a shell', async () => {
  powershellResponses([], []);
  mock.method(fs, 'stat', async () => ({ isFile: () => true }));
  const child = new EventEmitter() as EventEmitter & { unref: () => void };
  child.unref = () => {};
  let command: { executable: string; args: string[]; options: Record<string, unknown> } | undefined;
  mock.method(childProcess, 'spawn', (executable: string, args: string[], options: Record<string, unknown>) => {
    command = { executable, args, options };
    queueMicrotask(() => child.emit('spawn'));
    return child;
  });
  await launchDesktop(app, 9444);
  assert.equal(command?.executable, app.guiPath);
  assert.deepEqual(command?.args, ['--remote-debugging-address=127.0.0.1', '--remote-debugging-port=9444']);
  assert.notEqual(command?.options.shell, true);
});

test('explicit CLI override must point at an existing absolute codex.exe', async () => {
  const previous = process.env.CODEX_SIDECAR_CLI;
  try {
    process.env.CODEX_SIDECAR_CLI = 'relative\\codex.exe';
    await assert.rejects(discoverCodexCli(), /absolute/i);
    process.env.CODEX_SIDECAR_CLI = '\\Tools\\codex.exe';
    await assert.rejects(discoverCodexCli(), /absolute/i);
    process.env.CODEX_SIDECAR_CLI = `${install}\\app\\Codex.exe`;
    await assert.rejects(discoverCodexCli(), /GUI|CLI/i);
    process.env.CODEX_SIDECAR_CLI = 'D:\\Tools\\codex.exe';
    mock.method(fs, 'stat', async () => ({ isFile: () => true }));
    assert.equal(await discoverCodexCli(), 'D:\\Tools\\codex.exe');
  } finally {
    if (previous === undefined) delete process.env.CODEX_SIDECAR_CLI;
    else process.env.CODEX_SIDECAR_CLI = previous;
  }
});

test('finds a CLI only in installed bin subdirectories and selects the most recently installed executable', async () => {
  const previousCli = process.env.CODEX_SIDECAR_CLI;
  const previousLocal = process.env.LOCALAPPDATA;
  delete process.env.CODEX_SIDECAR_CLI;
  process.env.LOCALAPPDATA = 'C:\\Users\\Test\\AppData\\Local';
  const bin = 'C:\\Users\\Test\\AppData\\Local\\OpenAI\\Codex\\bin';
  try {
    mock.method(fs, 'readdir', async () => [
      { name: 'old-hash', isDirectory: () => true },
      { name: 'new-hash', isDirectory: () => true },
      { name: 'shortcut', isDirectory: () => false },
    ]);
    mock.method(fs, 'stat', async (file: string) => ({ isFile: () => true, mtimeMs: file.includes('new-hash') ? 500 : 100 }));
    assert.equal(await discoverCodexCli(), `${bin}\\new-hash\\codex.exe`);
  } finally {
    if (previousCli === undefined) delete process.env.CODEX_SIDECAR_CLI; else process.env.CODEX_SIDECAR_CLI = previousCli;
    if (previousLocal === undefined) delete process.env.LOCALAPPDATA; else process.env.LOCALAPPDATA = previousLocal;
  }
});
