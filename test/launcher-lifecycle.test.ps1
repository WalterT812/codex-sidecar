param([string]$SourceLauncher = (Join-Path (Split-Path -Parent $PSScriptRoot) 'scripts\Launch.ps1'))
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$fixtureRoot = Join-Path $projectRoot ('.local\tests\launcher-lifecycle-' + [Guid]::NewGuid().ToString('N'))
$distRoot = Join-Path $fixtureRoot 'dist'
New-Item -ItemType Directory -Path $distRoot -Force | Out-Null
Copy-Item -LiteralPath $SourceLauncher -Destination (Join-Path $fixtureRoot 'Launch.ps1')
$nodePath = (Get-Command node.exe).Source
$utf8 = [Text.UTF8Encoding]::new($false)
[IO.File]::WriteAllText((Join-Path $fixtureRoot 'package.json'), '{"type":"module"}', $utf8)
@{ nodePath=$nodePath } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $fixtureRoot 'install.json') -Encoding UTF8

# Every process and file below belongs to this fixture; no real Codex is discovered.
$fakeCli = @'
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const heartbeat = fileURLToPath(new URL('../heartbeat.json', import.meta.url));
const stop = fileURLToPath(new URL('../stop.fake', import.meta.url));
const stopped = fileURLToPath(new URL('../stopped.json', import.meta.url));
let tick = 0;
function pulse() {
  if (fs.existsSync(stop)) {
    fs.writeFileSync(stopped, JSON.stringify({pid: process.pid, tick}));
    process.exit(0);
  }
  fs.writeFileSync(heartbeat, JSON.stringify({pid: process.pid, tick: ++tick, at: Date.now()}));
  console.log(`FAKE_HEARTBEAT=${tick}`);
}
pulse();
console.log('SIDECAR_READY=1');
setInterval(pulse, 200);
setTimeout(() => process.exit(9), 20000);
'@
[IO.File]::WriteAllText((Join-Path $distRoot 'cli.js'), $fakeCli, $utf8)

# Keep the real launcher and real Start-Process behavior. Suppress only error dialogs.
$hostScript = @'
$ErrorActionPreference = 'Stop'
Microsoft.PowerShell.Utility\Add-Type -TypeDefinition @"
namespace System.Windows {
    public static class MessageBox {
        public static object Show(string message, string title, string buttons, string icon) {
            System.IO.File.WriteAllText(System.Environment.GetEnvironmentVariable("SIDECAR_TEST_DIALOG_PATH"), message);
            return null;
        }
    }
}
"@
function Add-Type { param([string]$AssemblyName) }
& (Join-Path $PSScriptRoot 'Launch.ps1')
'@
$hostPath = Join-Path $fixtureRoot 'host.ps1'
[IO.File]::WriteAllText($hostPath, $hostScript, [Text.UTF8Encoding]::new($true))

$heartbeatPath = Join-Path $fixtureRoot 'heartbeat.json'
$stopPath = Join-Path $fixtureRoot 'stop.fake'
$stoppedPath = Join-Path $fixtureRoot 'stopped.json'
$dialogPath = Join-Path $fixtureRoot 'dialog.txt'
$oldData = $env:CODEX_SIDECAR_DATA
$oldDialog = $env:SIDECAR_TEST_DIALOG_PATH
$launcher = $null
$fakeProcess = $null
try {
    $env:CODEX_SIDECAR_DATA = Join-Path $fixtureRoot 'logs'
    $env:SIDECAR_TEST_DIALOG_PATH = $dialogPath
    $launcher = Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') -ArgumentList ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -File "{0}"' -f $hostPath) -WorkingDirectory $fixtureRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $fixtureRoot 'host.out') -RedirectStandardError (Join-Path $fixtureRoot 'host.err')
    $null = $launcher.Handle
} finally {
    $env:CODEX_SIDECAR_DATA = $oldData
    $env:SIDECAR_TEST_DIALOG_PATH = $oldDialog
}

try {
    if (-not $launcher.WaitForExit(12000)) { throw 'The fixture launcher did not exit after readiness.' }
    if ($launcher.ExitCode -ne 0) { throw "The fixture launcher exited with code $($launcher.ExitCode)." }
    if (Test-Path -LiteralPath $dialogPath) { throw ('The launcher reported an error: ' + (Get-Content -LiteralPath $dialogPath -Raw)) }
    $before = Get-Content -LiteralPath $heartbeatPath -Raw | ConvertFrom-Json
    $fakeProcess = Get-Process -Id $before.pid -ErrorAction Stop
    $null = $fakeProcess.Handle
    Start-Sleep -Milliseconds 1400
    $after = Get-Content -LiteralPath $heartbeatPath -Raw | ConvertFrom-Json
    if ($after.pid -ne $before.pid -or $after.tick - $before.tick -lt 3) { throw 'The detached fake child did not advance at least three ticks after its launcher exited.' }
    $childLog = Get-ChildItem -LiteralPath (Join-Path $fixtureRoot 'logs') -Filter '*-output.log' | Select-Object -First 1
    $logged = Get-Content -LiteralPath $childLog.FullName -Raw
    if ($logged -notmatch ('(?m)^FAKE_HEARTBEAT=' + $after.tick + '\r?$')) { throw 'The detached child heartbeat continued, but its redirected stdout did not.' }
    [pscustomobject]@{ Source=$SourceLauncher; Fixture=$fixtureRoot; LauncherPid=$launcher.Id; LauncherExit=$launcher.ExitCode; FakeChildPid=$after.pid; TickAtParentExit=$before.tick; TickAfterParentExit=$after.tick; AdvancedTicks=($after.tick-$before.tick); RedirectedOutputContinues=$true } | ConvertTo-Json -Compress
} finally {
    [IO.File]::WriteAllText($stopPath, 'stop', $utf8)
    $deadline = [DateTime]::UtcNow.AddSeconds(5)
    while (-not (Test-Path -LiteralPath $stoppedPath) -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 100 }
    if (-not (Test-Path -LiteralPath $stoppedPath)) { throw ('Fake child did not acknowledge the stop file. Fixture: ' + $fixtureRoot) }
    if ($fakeProcess -and -not $fakeProcess.WaitForExit(2000)) { throw 'The fake child acknowledged stop but did not exit.' }
    Write-Output ('Fake child acknowledged stop and exited: ' + (Get-Content -LiteralPath $stoppedPath -Raw))
}
