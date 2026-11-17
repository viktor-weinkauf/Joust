[CmdletBinding()]
param([string]$UpstreamRef = 'upstream/main')
$ErrorActionPreference = 'Stop'
$oldNodeOptions = $env:NODE_OPTIONS
$oldElectronSkip = $env:ELECTRON_SKIP_BINARY_DOWNLOAD
Push-Location $PSScriptRoot
try {
    if (git status --porcelain) { throw 'Commit or stash local work before updating.' }
    if ((git branch --show-current) -ne 'fix/hidden-transformations') { throw 'Switch to fix/hidden-transformations first.' }
    git fetch upstream --tags
    if ($LASTEXITCODE -ne 0) { throw 'Upstream fetch failed.' }
    git rev-parse --verify $UpstreamRef | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Unknown upstream ref.' }
    $backup = 'backup/replay-' + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff')
    git branch $backup
    if ($LASTEXITCODE -ne 0) { throw 'Could not preserve the previous branch.' }
    git rebase $UpstreamRef
    if ($LASTEXITCODE -ne 0) {
        git rebase --abort
        throw "Patch conflict. Rebase aborted; inspect upstream changes. Previous state: $backup"
    }
    $env:ELECTRON_SKIP_BINARY_DOWNLOAD = '1'
    pnpm install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { throw 'Dependency install failed.' }
    pnpm test
    if ($LASTEXITCODE -ne 0) { throw 'Viewer regression tests failed.' }
    pnpm typecheck
    if ($LASTEXITCODE -ne 0) { throw 'Viewer typecheck failed.' }
    $env:NODE_OPTIONS = '--openssl-legacy-provider'
    pnpm build
    if ($LASTEXITCODE -ne 0) { throw 'Viewer build failed.' }
    Write-Output "Viewer patches verified. Previous state: $backup. Nothing deployed or pushed."
} finally {
    $env:NODE_OPTIONS = $oldNodeOptions
    $env:ELECTRON_SKIP_BINARY_DOWNLOAD = $oldElectronSkip
    Pop-Location
}
