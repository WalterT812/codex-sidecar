param([switch]$Preview, [switch]$Stop, [switch]$Startup)
$ErrorActionPreference = 'Stop'
$configPath = Join-Path $PSScriptRoot 'install.json'
try {
    $config = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    $nodePath = $config.nodePath
    if (-not (Test-Path -LiteralPath $nodePath -PathType Leaf)) { $nodePath = (Get-Command node.exe -ErrorAction Stop).Source }
    $dataRoot = if ($env:CODEX_SIDECAR_DATA) { $env:CODEX_SIDECAR_DATA } else { Join-Path ([Environment]::GetFolderPath('UserProfile')) '.codex-sidecar' }
    New-Item -ItemType Directory -Path $dataRoot -Force | Out-Null
    # A second launcher or stop command must not truncate an active run's logs.
    $runId = '{0}-{1}-{2}' -f (Get-Date -Format 'yyyyMMdd-HHmmss'), $PID, ([Guid]::NewGuid().ToString('N').Substring(0, 8))
    $outLog = Join-Path $dataRoot ("launch-$runId-output.log")
    $errLog = Join-Path $dataRoot ("launch-$runId-error.log")
    $cliPath = Join-Path $PSScriptRoot 'dist\cli.js'
    $mode = if ($Preview) { 'demo' } elseif ($Stop) { 'stop' } else { 'start' }
    $process = Start-Process -FilePath $nodePath -ArgumentList ('"{0}" {1}' -f $cliPath, $mode) -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput $outLog -RedirectStandardError $errLog
    # WinPS 5.1 may otherwise lose ExitCode after its Start-Process wrapper exits.
    # An already-exited rendezvous can still acknowledge success in its log.
    try { $null = $process.Handle } catch { }
    $timeoutSeconds = if ($mode -eq 'start') { 60 } else { 15 }
    $clock = [Diagnostics.Stopwatch]::StartNew()
    $failure = $null
    while ($clock.Elapsed.TotalSeconds -lt $timeoutSeconds) {
        $process.Refresh()
        $hasExited = $process.HasExited
        $exitCode = $null
        if ($hasExited) {
            $process.WaitForExit()
            $exitCode = $process.ExitCode
        }
        # Read after draining a finished child, before deciding that its exit failed.
        if ($mode -ne 'stop' -and (Test-Path -LiteralPath $outLog)) {
            $output = (Get-Content -LiteralPath $outLog -Tail 40 -Encoding UTF8) -join "`n"
            $knownFailure = $hasExited -and $null -ne $exitCode -and $exitCode -ne 0
            if (-not $knownFailure -and $mode -eq 'start' -and $output -match '(?m)^SIDECAR_(?:READY|REUSED)=1\r?$') { return }
            if (-not $knownFailure -and $mode -eq 'demo') {
                $match = [regex]::Match($output, '(?m)^DEMO_URL=(http://127\.0\.0\.1:\d+)\r?$')
                if ($match.Success) { Start-Process -FilePath $match.Groups[1].Value; return }
            }
        }
        if ($hasExited) {
            if ($mode -eq 'stop' -and $null -ne $exitCode -and $exitCode -eq 0) { return }
            $exitLabel = if ($null -eq $exitCode) { '未知' } else { [string]$exitCode }
            $failure = "启动进程已退出（代码 $exitLabel），尚未确认连接。"
            if ($mode -eq 'stop') { $failure = "停止请求未能完成（代码 $exitLabel）。" }
            break
        }
        Start-Sleep -Milliseconds 200
    }
    if (-not $failure) { $failure = "等待 $timeoutSeconds 秒后仍未确认就绪。Sidecar 可能仍在后台等待连接。" }
    $detail = if (Test-Path -LiteralPath $errLog) { (Get-Content -LiteralPath $errLog -Tail 12 -Encoding UTF8) -join "`n" } else { '' }
    if ($detail.Length -gt 3000) { $detail = $detail.Substring($detail.Length - 3000) }
    if ($Startup) { Add-Content -LiteralPath $errLog -Value $failure -Encoding UTF8; return }
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show("$failure`n`nCodex 没有被强制关闭。首次启用时，请完成手上的工作并正常退出 Codex，再打开这个入口。`n`n$detail`n`n本次日志：`n$outLog`n$errLog", 'Codex Sidecar', 'OK', 'Information') | Out-Null
} catch {
    if ($Startup) { return }
    Add-Type -AssemblyName PresentationFramework
    $detail = [string]$_.Exception.Message
    if ($detail.Length -gt 3000) { $detail = $detail.Substring(0, 3000) }
    [System.Windows.MessageBox]::Show($detail, 'Codex Sidecar', 'OK', 'Error') | Out-Null
}
