[CmdletBinding()]
param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$helpers = [IO.Path]::GetFullPath((Join-Path $repo '..\..'))
$python = Join-Path $helpers 'Runtime\LocalReplayViewer\Scripts\pythonw.exe'
$log = Join-Path $helpers 'Cache\LocalReplayViewer\server.log'
$url = 'http://127.0.0.1:8879'
try {
    if (-not (Test-Path -LiteralPath $python)) {
        throw 'The local viewer Python environment is missing. See local-viewer/README.md for setup.'
    }
    foreach ($file in @('dist\joust.js','dist\joust.css','node_modules\react\umd\react.production.min.js','node_modules\react-dom\umd\react-dom.production.min.js')) {
        if (-not (Test-Path -LiteralPath (Join-Path $repo $file))) {
            throw 'The viewer build is missing. Run Forks/Update-All.ps1 first.'
        }
    }
    $health = $null
    try { $health = Invoke-RestMethod "$url/api/health" -TimeoutSec 2 } catch { }
    if ($health -and $health.application -ne 'maintained-joust-local-viewer') {
        throw 'Another application is using the local viewer address.'
    }
    if (-not $health) {
        $server = Join-Path $PSScriptRoot 'server.py'
        $arguments = @('"' + $server + '"', '--log', '"' + $log + '"')
        $process = Start-Process -FilePath $python -ArgumentList $arguments -WorkingDirectory $repo -WindowStyle Hidden -PassThru
        for ($attempt = 0; $attempt -lt 50; $attempt++) {
            Start-Sleep -Milliseconds 200
            try { $health = Invoke-RestMethod "$url/api/health" -TimeoutSec 1 } catch { }
            if ($health -and $health.application -eq 'maintained-joust-local-viewer') { break }
            if ($process.HasExited) { throw "The viewer could not start. See $log" }
        }
        if (-not $health -or $health.application -ne 'maintained-joust-local-viewer') {
            throw "The viewer did not become ready. See $log"
        }
    }
    if (-not $NoBrowser) { Start-Process $url | Out-Null }
    Write-Output "Local Replay Viewer: $url"
} catch {
    if (-not $NoBrowser) {
        Add-Type -AssemblyName PresentationFramework
        [System.Windows.MessageBox]::Show($_.Exception.Message, 'Local Replay Viewer') | Out-Null
    }
    throw
}
