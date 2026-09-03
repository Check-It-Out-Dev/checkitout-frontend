#requires -Version 7.0
<#
.SYNOPSIS
    Health probe for the local full-stack dev topology. Run before each session.

.DESCRIPTION
    Probes (all three apps serve HTTPS with self-signed certs):
      - BE on :8080  via GET /api/actuator/health (context-path is /api) → expects 200
      - Legacy FE on :4200 via GET / → expects 200
      - Greenfield FE on :4201 via GET / → expects 200
      - Postgres via pg_isready or `docker exec instagram-postgres pg_isready`
      - Redis via redis-cli ping or `docker exec instagram-redis redis-cli ping`

    Exits 0 on full health, 1 with a status table on any failure.
    On failure the loop driver writes .loop/escalation.md and halts.

.PARAMETER Quiet
    Suppress per-probe output; only print the table on failure.

.NOTES
    Run from the greenfield repo root. Curl + pg_isready + redis-cli are
    optional — the script falls back to docker exec if the local CLIs
    aren't installed.
#>

param(
    [switch]$Quiet
)

$ErrorActionPreference = 'Stop'

$results = @()

function Probe-Http {
    param([string]$Name, [string]$Url)
    try {
        $r = Invoke-WebRequest -Uri $Url -TimeoutSec 5 -SkipCertificateCheck -UseBasicParsing
        $ok = $r.StatusCode -eq 200
        return [pscustomobject]@{
            Name   = $Name
            Url    = $Url
            Status = if ($ok) { 'UP' } else { "HTTP $($r.StatusCode)" }
            Ok     = $ok
        }
    } catch {
        return [pscustomobject]@{
            Name   = $Name
            Url    = $Url
            Status = "DOWN ($($_.Exception.Message.Split([Environment]::NewLine)[0]))"
            Ok     = $false
        }
    }
}

function Probe-Postgres {
    # Try local pg_isready first, fall back to docker exec.
    $pgReady = Get-Command pg_isready -ErrorAction SilentlyContinue
    if ($pgReady) {
        $out = & pg_isready -h localhost -p 5432 2>&1
        $ok = $LASTEXITCODE -eq 0
    } else {
        $out = & docker exec instagram-postgres pg_isready 2>&1
        $ok = $LASTEXITCODE -eq 0
    }
    return [pscustomobject]@{
        Name   = 'postgres'
        Url    = 'localhost:5432'
        Status = if ($ok) { 'UP' } else { "DOWN ($out)" }
        Ok     = $ok
    }
}

function Probe-Redis {
    $redisCli = Get-Command redis-cli -ErrorAction SilentlyContinue
    if ($redisCli) {
        $out = & redis-cli -p 6379 ping 2>&1
    } else {
        $out = & docker exec instagram-redis redis-cli ping 2>&1
    }
    $ok = $out -match 'PONG'
    return [pscustomobject]@{
        Name   = 'redis'
        Url    = 'localhost:6379'
        Status = if ($ok) { 'UP' } else { "DOWN ($out)" }
        Ok     = $ok
    }
}

$results += Probe-Http 'be (springboot)' 'https://localhost:8080/api/actuator/health'
$results += Probe-Http 'legacy-fe'        'https://localhost:4200/'
$results += Probe-Http 'greenfield-fe'    'https://localhost:4201/'
$results += Probe-Postgres
$results += Probe-Redis

if (-not $Quiet) {
    $results | Format-Table Name, Url, Status -AutoSize
}

$failed = $results | Where-Object { -not $_.Ok }
if ($failed) {
    if ($Quiet) {
        $results | Format-Table Name, Url, Status -AutoSize
    }
    Write-Host ""
    Write-Host "[health-check] $($failed.Count) of $($results.Count) probes FAILED" -ForegroundColor Red
    exit 1
}

if (-not $Quiet) {
    Write-Host ""
    Write-Host "[health-check] all $($results.Count) probes UP" -ForegroundColor Green
}
exit 0
