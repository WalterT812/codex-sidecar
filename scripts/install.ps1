param([string]$InstallDir = 'D:\Apps\Codex-Sidecar', [switch]$EnableStartup)
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
foreach ($name in @('LICENSE','THIRD_PARTY_NOTICES.md','README.md','README.zh-CN.md','CONTRIBUTING.md','docs/compatibility.md','docs/components.md','docs/pearl-atelier.md','assets/ARTWORK.md','assets/ROYAL-ARTWORK.md','assets/royal-pearl-wallpaper-v2.png','docs/royal-pearl.md','assets/pearl-wallpaper-v1.png','assets/pearl-icon-study-v1.png','assets/lilac-cover-v1.png','docs/superpowers/specs/2026-09-05-sidecar-design.md')) {
    $documentationTarget = Join-Path $targetRoot $name
    New-Item -ItemType Directory -Path (Split-Path -Parent $documentationTarget) -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $sourceRoot $name) -Destination $documentationTarget -Force
}
$launcherText = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'Launch.ps1') -Raw -Encoding UTF8
[IO.File]::WriteAllText((Join-Path $targetRoot 'Launch.ps1'), $launcherText, (New-Object Text.UTF8Encoding($true)))
$package = Get-Content -LiteralPath (Join-Path $sourceRoot 'package.json') -Raw | ConvertFrom-Json
$installedPackage = @{ name='codex-sidecar'; version=$package.version; type='module'; private=$true } | ConvertTo-Json
[IO.File]::WriteAllText((Join-Path $targetRoot 'package.json'), $installedPackage, (New-Object Text.UTF8Encoding($false)))
@{ name='codex-sidecar'; version=$package.version; nodePath=$nodePath; installedAt=(Get-Date).ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath $markerPath -Encoding UTF8
$shellLink = New-Object -ComObject WScript.Shell
$compiler = Join-Path $env:SystemRoot 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$launcherExe = Join-Path $targetRoot 'CodexSidecar.exe'
$builtLauncher = Join-Path $sourceRoot 'dist\CodexSidecar.exe'
& $compiler /nologo /target:winexe /optimize+ /reference:System.Windows.Forms.dll ("/out:$builtLauncher") (Join-Path $PSScriptRoot 'Launcher.cs')
if ($LASTEXITCODE -ne 0) { throw 'Native launcher build failed.' }
Copy-Item -LiteralPath $builtLauncher -Destination $launcherExe -Force
$desktop = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktop 'Codex Sidecar.lnk'
$shortcut = $shellLink.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $launcherExe
$shortcut.Arguments = ''
$shortcut.Hotkey = 'CTRL+ALT+X'
$shortcut.WorkingDirectory = $targetRoot
$shortcut.Description = 'Codex Sidecar - personal components for the official app'
$shortcut.IconLocation = (Join-Path $env:SystemRoot 'System32\shell32.dll') + ',167'
$shortcut.Save()
$startMenu = Join-Path ([Environment]::GetFolderPath('Programs')) 'Codex Sidecar.lnk'
Copy-Item -LiteralPath $shortcutPath -Destination $startMenu -Force
if ($EnableStartup) {
    $startupPath = Join-Path ([Environment]::GetFolderPath('Startup')) 'Codex Sidecar.lnk'
    $startupLink = $shellLink.CreateShortcut($startupPath)
    $startupLink.TargetPath = $launcherExe
    $startupLink.Arguments = '--startup'
    $startupLink.WorkingDirectory = $targetRoot
    $startupLink.Description = 'Start Codex with personal components after Windows sign-in'
    $startupLink.Save()
    Write-Output "Startup enabled: $startupPath"
}
foreach ($name in @('cli.js','renderer.js')) {
    if ((Get-FileHash -LiteralPath (Join-Path $sourceRoot "dist\$name")).Hash -ne (Get-FileHash -LiteralPath (Join-Path $targetRoot "dist\$name")).Hash) { throw "Installed file verification failed: $name" }
}
Write-Output "Installed Codex Sidecar $($package.version) to $targetRoot"
Write-Output "Desktop shortcut: $shortcutPath"
