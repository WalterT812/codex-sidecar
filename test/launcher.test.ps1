param([string]$SourceLauncher = (Join-Path (Split-Path -Parent $PSScriptRoot) 'scripts\Launch.ps1'))
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$fixtureRoot = Join-Path $projectRoot ('.local\tests\launcher-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $fixtureRoot -Force | Out-Null
$fixtureLauncher = Join-Path $fixtureRoot 'Launch.ps1'
Copy-Item -LiteralPath $SourceLauncher -Destination $fixtureLauncher -Force
$nodePath = (Get-Command node.exe).Source
@{ nodePath = $nodePath } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $fixtureRoot 'install.json') -Encoding UTF8
$env:CODEX_SIDECAR_DATA = Join-Path $fixtureRoot 'logs'

# Exercise real Windows process bookkeeping with a harmless child, never Codex.
$ownedChild = Microsoft.PowerShell.Management\Start-Process -FilePath $nodePath -ArgumentList '-e "setTimeout(()=>process.exit(7),100)"' -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $fixtureRoot 'handle.out') -RedirectStandardError (Join-Path $fixtureRoot 'handle.err')
$null = $ownedChild.Handle
$ownedChild.Refresh()
$ownedChild.WaitForExit()
if ($ownedChild.ExitCode -ne 7) { throw 'Retaining the real process handle did not preserve exit code 7.' }
Write-Output 'PASS actual Windows child exit code survives with retained handle'

Microsoft.PowerShell.Utility\Add-Type -TypeDefinition @'
namespace System.Windows {
    public static class MessageBox {
        public static string LastMessage;
        public static int Count;
        public static object Show(string message, string title, string buttons, string icon) {
            LastMessage = message;
            Count++;
            return null;
        }
    }
}
'@
function Add-Type { param([string]$AssemblyName) }
function Start-Process {
    param([string]$FilePath, [string]$ArgumentList, [string]$WorkingDirectory, [string]$WindowStyle,
        [switch]$PassThru, [string]$RedirectStandardOutput, [string]$RedirectStandardError)
    if ($FilePath -match '^(http|https):') { throw 'No browser should open during this test.' }
    [IO.File]::WriteAllText($RedirectStandardOutput, $global:sidecarLauncherCase.Output)
    [IO.File]::WriteAllText($RedirectStandardError, $global:sidecarLauncherCase.ErrorOutput)
    $fake = [pscustomobject]@{ HasExited=$global:sidecarLauncherCase.Exited; Captured=$false; OutputPath=$RedirectStandardOutput }
    $fake | Add-Member -MemberType ScriptProperty -Name Handle -Value {
        if ($global:sidecarLauncherCase.CannotCapture) { throw 'Process has already exited.' }
        $this.Captured = $true
        return [IntPtr]123
    }
    $fake | Add-Member -MemberType ScriptProperty -Name ExitCode -Value {
        if ($this.Captured) { return $global:sidecarLauncherCase.Code }
        return $null
    }
    $fake | Add-Member -MemberType ScriptMethod -Name Refresh -Value {}
    $fake | Add-Member -MemberType ScriptMethod -Name WaitForExit -Value {
        if ($global:sidecarLauncherCase.AfterExit) { [IO.File]::AppendAllText($this.OutputPath, $global:sidecarLauncherCase.AfterExit) }
    }
    return $fake
}

$cases = @(
    @{ Name='fast reuse exit is successful'; Output="SIDECAR_REUSED=1`n"; Exited=$true; Code=0; ExpectedCount=0 },
    @{ Name='fast ready exit is successful'; Output="SIDECAR_READY=1`n"; Exited=$true; Code=0; ExpectedCount=0 },
    @{ Name='running ready coordinator is successful'; Output="SIDECAR_READY=1`n"; Exited=$false; Code=0; ExpectedCount=0 },
    @{ Name='nonzero exit reports actual code'; Exited=$true; Code=7; ExpectedCount=1; ExpectedText='（代码 7）' },
    @{ Name='already exited process retains acknowledgement'; Output="SIDECAR_REUSED=1`n"; Exited=$true; Code=0; CannotCapture=$true; ExpectedCount=0 },
    @{ Name='unknown exit is explicit'; Exited=$true; Code=$null; CannotCapture=$true; ExpectedCount=1; ExpectedText='未知' },
    @{ Name='stop command zero exit is successful'; Exited=$true; Code=0; Stop=$true; ExpectedCount=0 },
    @{ Name='drains final reuse acknowledgement'; Exited=$true; Code=0; AfterExit="SIDECAR_REUSED=1`n"; ExpectedCount=0 },
    @{ Name='nonzero exit overrides success marker'; Output="SIDECAR_READY=1`n"; Exited=$true; Code=7; ExpectedCount=1; ExpectedText='（代码 7）' },
    @{ Name='malformed acknowledgement does not claim success'; Output="prefix SIDECAR_REUSED=1`n"; Exited=$true; Code=0; ExpectedCount=1 }
)
$failed = 0
foreach ($case in $cases) {
    $global:sidecarLauncherCase = $case
    if (-not $case.ContainsKey('Output')) { $case.Output = '' }
    if (-not $case.ContainsKey('ErrorOutput')) { $case.ErrorOutput = 'controlled child output' }
    [System.Windows.MessageBox]::Count = 0
    [System.Windows.MessageBox]::LastMessage = ''
    & $fixtureLauncher -Stop:([bool]$case.Stop)
    $passed = [System.Windows.MessageBox]::Count -eq $case.ExpectedCount
    if ($case.ExpectedText) { $passed = $passed -and [System.Windows.MessageBox]::LastMessage.Contains($case.ExpectedText) }
    if ($passed) { Write-Output ('PASS ' + $case.Name) }
    else {
        $failed++
        Write-Output ('FAIL ' + $case.Name)
        Write-Output ([System.Windows.MessageBox]::LastMessage)
    }
}
Write-Output ("Result: $($cases.Count + 1 - $failed)/$($cases.Count + 1) passed; one harmless Node child, launcher processes and dialogs mocked.")
if ($failed) { exit 1 }
