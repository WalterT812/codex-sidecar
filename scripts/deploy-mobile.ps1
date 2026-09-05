param([string]$Server = 'walter-platform-codex')
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$bundle = Join-Path $projectRoot 'dist\mobile'
if (-not (Test-Path -LiteralPath (Join-Path $bundle 'server.js'))) { throw 'Run npm run check first.' }
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$remoteRoot = '/home/codex/platform/codex-sidecar-mobile'
$release = "$remoteRoot/releases/$stamp"
& ssh $Server "test -f $remoteRoot/config.json && mkdir -p $release $remoteRoot/data"
if ($LASTEXITCODE -ne 0) { throw 'Provision the private server config before deployment.' }
& scp -r "$bundle\server.js" "$bundle\package.json" "$bundle\web" "${Server}:$release/"
if ($LASTEXITCODE -ne 0) { throw 'Mobile upload failed.' }
& scp (Join-Path $PSScriptRoot 'mobile.service') "${Server}:$remoteRoot/mobile.service"
if ($LASTEXITCODE -ne 0) { throw 'Service upload failed.' }
& ssh $Server "ln -s $release $remoteRoot/current.next && mv -Tf $remoteRoot/current.next $remoteRoot/current && sudo install -m 644 $remoteRoot/mobile.service /etc/systemd/system/codex-sidecar-mobile.service && sudo systemctl daemon-reload && sudo systemctl enable --now codex-sidecar-mobile && sudo systemctl restart codex-sidecar-mobile"
if ($LASTEXITCODE -ne 0) { throw 'Mobile service activation failed. Prior release directories remain available.' }
& ssh $Server 'systemctl is-active codex-sidecar-mobile'
if ($LASTEXITCODE -ne 0) { throw 'Mobile service is not active.' }
Write-Output "Mobile release: $release"
