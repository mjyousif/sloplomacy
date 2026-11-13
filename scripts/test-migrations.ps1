<#
.SYNOPSIS
    Runs Supabase migration & RLS verification tests against a temporary,
    passwordless local PostgreSQL cluster (no changes to system Postgres).
#>
param(
    [int]$Port = 55432
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

# Locate PostgreSQL binaries (PATH first, then C:\Program Files\PostgreSQL\*\bin)
$pgBin = $null
$psqlCmd = Get-Command psql -ErrorAction SilentlyContinue
if ($psqlCmd) {
    $pgBin = Split-Path -Parent $psqlCmd.Source
} else {
    $candidates = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue |
        Sort-Object FullName -Descending
    if ($candidates) {
        $pgBin = Split-Path -Parent $candidates[0].FullName
    }
}

if (-not $pgBin) {
    Write-Error "PostgreSQL binaries (psql, initdb, postgres, pg_isready) not found on PATH or in C:\Program Files\PostgreSQL."
    exit 1
}

$initdb     = Join-Path $pgBin "initdb.exe"
$postgres   = Join-Path $pgBin "postgres.exe"
$pgIsReady  = Join-Path $pgBin "pg_isready.exe"
$psql       = Join-Path $pgBin "psql.exe"

$dataDir = Join-Path $env:TEMP ("sloplomacy_pg_test_" + [guid]::NewGuid().ToString("N"))
$logFile = Join-Path $env:TEMP ("sloplomacy_pg_test_" + [guid]::NewGuid().ToString("N") + ".log")
$pgProc = $null

function Invoke-Psql {
    param([string[]]$ArgsList)
    & $psql -h 127.0.0.1 -p $Port -U postgres -w @ArgsList
    if ($LASTEXITCODE -ne 0) {
        throw "psql failed with exit code $LASTEXITCODE (args: $($ArgsList -join ' '))"
    }
}

try {
    Write-Host "Initializing temporary trust-auth PostgreSQL cluster in $dataDir..."
    & $initdb -D $dataDir -U postgres -A trust --encoding=UTF8 --locale=C | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "initdb failed with exit code $LASTEXITCODE" }

    Write-Host "Starting temporary PostgreSQL on 127.0.0.1:$Port..."
    $pgProc = Start-Process -FilePath $postgres -ArgumentList @(
        "-D", "`"$dataDir`"",
        "-p", "$Port",
        "-h", "127.0.0.1"
    ) -PassThru -WindowStyle Hidden -RedirectStandardOutput $logFile -RedirectStandardError "$logFile.err"

    $ready = $false
    for ($i = 0; $i -lt 30; $i++) {
        & $pgIsReady -h 127.0.0.1 -p $Port -U postgres -q
        if ($LASTEXITCODE -eq 0) {
            $ready = $true
            break
        }
        Start-Sleep -Milliseconds 250
    }
    if (-not $ready) {
        throw "PostgreSQL did not become ready on port $Port (see $logFile.err)"
    }

    Invoke-Psql @("-c", "CREATE DATABASE diplomacy_test;")

    $bootstrap = Join-Path $repoRoot "supabase\tests\bootstrap_auth_stubs.sql"
    $verify    = Join-Path $repoRoot "supabase\tests\verify_migrations.sql"
    $migrations = Get-ChildItem (Join-Path $repoRoot "supabase\migrations\*.sql") | Sort-Object Name

    Write-Host "Bootstrapping auth stubs..."
    Invoke-Psql @("-d", "diplomacy_test", "-v", "ON_ERROR_STOP=1", "-f", $bootstrap)

    $migArgs = @("-d", "diplomacy_test", "-v", "ON_ERROR_STOP=1", "--single-transaction")
    foreach ($m in $migrations) {
        $migArgs += @("-f", $m.FullName)
    }

    Write-Host "Applying $($migrations.Count) migrations (pass 1)..."
    Invoke-Psql $migArgs

    Write-Host "Re-applying $($migrations.Count) migrations (pass 2 - idempotency check)..."
    Invoke-Psql $migArgs

    Write-Host "Running trigger & RLS verification..."
    Invoke-Psql @("-d", "diplomacy_test", "-v", "ON_ERROR_STOP=1", "--single-transaction", "-f", $verify)

    Write-Host "All migration tests passed!" -ForegroundColor Green
}
finally {
    if ($pgProc -and -not $pgProc.HasExited) {
        Stop-Process -Id $pgProc.Id -Force -ErrorAction SilentlyContinue
        $pgProc.WaitForExit(3000) | Out-Null
    }
    if (Test-Path $dataDir) {
        Remove-Item -Recurse -Force $dataDir -ErrorAction SilentlyContinue
    }
    Remove-Item -Force "$logFile*" -ErrorAction SilentlyContinue
}
