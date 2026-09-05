param([string]$InstallDir = 'D:\Apps\Codex-Sidecar')
$ErrorActionPreference = 'Stop'
$sourceRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
$targetRoot = [IO.Path]::GetFullPath($InstallDir).TrimEnd('\')
if ($targetRoot -eq $sourceRoot -or $targetRoot.StartsWith($sourceRoot + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Keep the installed application outside the source checkout.' }
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$nodeVersion = & $nodePath --version
if ([version]$nodeVersion.TrimStart('v') -lt [version]'22.13.0') { throw 'Node.js 22.13 or newer is required.' }
foreach ($name in @('cli.js','renderer.js')) {
    if (-not (Test-Path -LiteralPath (Join-Path $sourceRoot "dist\$name") -PathType Leaf)) { throw 'Run npm run build before installing.' }
}
$markerPath = Join-Path $targetRoot 'install.json'
if (Test-Path -LiteralPath $targetRoot) {
    if (-not (Test-Path -LiteralPath $markerPath)) { throw 'The target already exists and is not a managed Sidecar installation.' }
    $oldMarker = Get-Content -LiteralPath $markerPath -Raw | ConvertFrom-Json
    if ($oldMarker.name -ne 'codex-sidecar') { throw 'The destination belongs to another application.' }
}
New-Item -ItemType Directory -Path (Join-Path $targetRoot 'dist') -Force | Out-Null
foreach ($name in @('cli.js','renderer.js')) { Copy-Item -LiteralPath (Join-Path $sourceRoot "dist\$name") -Destination (Join-Path $targetRoot "dist\$name") -Force }
foreach ($name in @('LICENSE','THIRD_PARTY_NOTICES.md','README.zh-CN.md')) { Copy-Item -LiteralPath (Join-Path $sourceRoot $name) -Destination (Join-Path $targetRoot $name) -Force }
$launcherText = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'Launch.ps1') -Raw -Encoding UTF8
[IO.File]::WriteAllText((Join-Path $targetRoot 'Launch.ps1'), $launcherText, (New-Object Text.UTF8Encoding($true)))
$package = Get-Content -LiteralPath (Join-Path $sourceRoot 'package.json') -Raw | ConvertFrom-Json
$installedPackage = @{ name='codex-sidecar'; version=$package.version; type='module'; private=$true } | ConvertTo-Json
[IO.File]::WriteAllText((Join-Path $targetRoot 'package.json'), $installedPackage, (New-Object Text.UTF8Encoding($false)))
@{ name='codex-sidecar'; version=$package.version; nodePath=$nodePath; installedAt=(Get-Date).ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath $markerPath -Encoding UTF8
$shellLink = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop 'Codex Sidecar.lnk'
$shortcut = $shellLink.CreateShortcut($shortcutPath)
$shortcut.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + (Join-Path $targetRoot 'Launch.ps1') + '"'
$shortcut.WorkingDirectory = $targetRoot
$shortcut.Description = 'Codex Sidecar - personal components for the official app'
$shortcut.IconLocation = (Join-Path $env:SystemRoot 'System32\shell32.dll') + ',167'
$shortcut.Save()
foreach ($name in @('cli.js','renderer.js')) {
    if ((Get-FileHash -LiteralPath (Join-Path $sourceRoot "dist\$name")).Hash -ne (Get-FileHash -LiteralPath (Join-Path $targetRoot "dist\$name")).Hash) { throw "Installed file verification failed: $name" }
}
Write-Output "Installed Codex Sidecar $($package.version) to $targetRoot"
Write-Output "Desktop shortcut: $shortcutPath"
