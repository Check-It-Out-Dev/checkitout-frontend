#Requires -Version 7
# cutover-app.ps1 - one-shot public cutover of checkitout.app to the demo VPS.
# RUN WITH pwsh (PowerShell 7), NOT the old blue powershell.exe:
#   pwsh -ExecutionPolicy Bypass -File cutover-app.ps1
# Designed to run WITHOUT Claude: every step checks itself, prints [OK]/[FAIL],
# and a failure prints the exact remediation + rollback. Re-runnable (idempotent).
#
#   pwsh -ExecutionPolicy Bypass -File cutover-app.ps1              # cutover
#   pwsh -ExecutionPolicy Bypass -File cutover-app.ps1 -Rollback    # undo
#
# Reads keys from .env.cutover next to this script (see .env.cutover.example).
# What it does: (1) preflight, (2) enable PUBLIC nginx confs on the VPS and
# remove the htaccess gate, (3) flip Cloudflare A records (apex+www) to the
# VPS, (4) test through the real Cloudflare edge, (5) print summary+rollback.
# The TLS cert for checkitout.app was pre-issued 2026-09-03 (DNS-01, renews
# via certbot hooks on the box) - no certbot needed at cutover time.

param([switch]$Rollback, [switch]$PreflightOnly)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Start-Transcript -Path (Join-Path $here ("cutover-log-" + (Get-Date -Format "yyyyMMdd-HHmmss") + ".txt")) | Out-Null

# ---- config ----------------------------------------------------------------
$envFile = Join-Path $here ".env.cutover"
if (-not (Test-Path $envFile)) { Write-Host "[FAIL] $envFile missing - copy .env.cutover.example and fill keys"; exit 1 }
$cfg = @{}
Get-Content $envFile | ForEach-Object {
    if ($_ -match "^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$") { $cfg[$Matches[1]] = $Matches[2] }
}
foreach ($k in @("CF_API_TOKEN","VPS_IP","SSH_KEY","SSH_USER")) {
    if (-not $cfg[$k]) { Write-Host "[FAIL] $k missing in .env.cutover"; exit 1 }
}
$T = $cfg.CF_API_TOKEN
$VPS = $cfg.VPS_IP
$ZONE_APP  = if ($cfg.CF_ZONE_APP)     { $cfg.CF_ZONE_APP }     else { "9926afdbfd68ded1ce973e51ca4df1e1" }
$REC_APEX  = if ($cfg.CF_REC_APP_APEX) { $cfg.CF_REC_APP_APEX } else { "fa2085b59bf342a6b76dfeea68e007db" }
$REC_WWW   = if ($cfg.CF_REC_APP_WWW)  { $cfg.CF_REC_APP_WWW }  else { "efa938ef7b23c573415a6dbdfca567ab" }
$OLD_IP    = if ($cfg.OLD_IP)          { $cfg.OLD_IP }          else { "51.38.135.102" }
$CF = "https://api.cloudflare.com/client/v4"
$H  = @{ Authorization = "Bearer $T" }

function Step($name, [scriptblock]$body) {
    Write-Host ("`n== " + $name)
    try { & $body; Write-Host "[OK] $name" }
    catch {
        Write-Host "[FAIL] $name : $($_.Exception.Message)"
        Write-Host "`n--- EMERGENCY: see CUTOVER-RUNBOOK.md for the manual path of this step."
        Write-Host "--- ROLLBACK ANYTIME: pwsh -File cutover-app.ps1 -Rollback"
        Stop-Transcript | Out-Null
        exit 1
    }
}
function SetDns($recId, $name, $ip) {
    $r = Invoke-RestMethod -Method Patch -Uri "$CF/zones/$ZONE_APP/dns_records/$recId" -Headers $H `
         -ContentType "application/json" -Body (@{ content = $ip } | ConvertTo-Json)
    if (-not $r.success) { throw "CF PATCH $name failed: $($r.errors | ConvertTo-Json -Compress)" }
    Write-Host "   $name -> $($r.result.content)"
}
function VpsExec([string]$cmd) {
    # explicit args (no splatting - 5.1-flaky) + stderr stringified so
    # ErrorActionPreference=Stop cannot fire on ssh banners
    $out = & ssh.exe -o BatchMode=yes -o StrictHostKeyChecking=accept-new `
        -i $cfg.SSH_KEY "$($cfg.SSH_USER)@$($cfg.VPS_IP)" $cmd 2>&1 |
        ForEach-Object { "$_" }
    if ($LASTEXITCODE -ne 0) { throw "ssh failed ($cmd): $($out -join ' | ')" }
    return $out
}
function Probe($url, $expectCode, $marker) {
    $code = ""
    try {
        $resp = Invoke-WebRequest -Uri $url -MaximumRedirection 0 -TimeoutSec 25 -SkipHttpErrorCheck -UseBasicParsing
        $code = [int]$resp.StatusCode
        if ($code -ne $expectCode) { throw "$url returned $code, expected $expectCode" }
        if ($marker -and ($resp.Content -notlike "*$marker*")) { throw "$url : marker '$marker' not found" }
    } catch [System.Net.WebException] { throw "$url unreachable: $($_.Exception.Message)" }
    Write-Host "   $url -> $code $(if ($marker) { '(marker ok)' })"
}

# ---- rollback mode ---------------------------------------------------------
if ($Rollback) {
    Step "Rollback DNS (apex+www back to $OLD_IP)" {
        SetDns $REC_APEX "checkitout.app" $OLD_IP
        SetDns $REC_WWW  "www.checkitout.app" $OLD_IP
    }
    Step "Rollback VPS to gated config" {
        VpsExec "sudo ln -sf /etc/nginx/sites-available/greenfield.conf /etc/nginx/sites-enabled/greenfield.conf && sudo rm -f /etc/nginx/sites-enabled/app-public.conf /etc/nginx/sites-enabled/greenfield-public.conf && sudo systemctl enable --now checkitout-gate && sudo nginx -t && sudo systemctl reload nginx" | Out-Null
    }
    Write-Host "`nROLLBACK COMPLETE - checkitout.app serves from $OLD_IP again; gate restored on the VPS."
    Stop-Transcript | Out-Null
    exit 0
}

# ---- 1. preflight ----------------------------------------------------------
Step "Preflight: Cloudflare token" {
    $r = Invoke-RestMethod -Uri "$CF/zones/$ZONE_APP" -Headers $H
    if (-not $r.success) { throw "token cannot read zone" }
    Write-Host "   zone: $($r.result.name) ($($r.result.status))"
}
Step "Preflight: VPS ssh + nginx + content + cert" {
    VpsExec "sudo nginx -t" | Out-Null
    VpsExec "test -f /var/www/check-it-out.pl/index.html" | Out-Null
    VpsExec "sudo test -f /etc/letsencrypt/live/checkitout.app/fullchain.pem" | Out-Null
    VpsExec "sudo openssl x509 -checkend 1209600 -noout -in /etc/letsencrypt/live/checkitout.app/fullchain.pem" | Out-Null
    Write-Host "   nginx ok, demo content present, .app cert valid for 14+ days"
}
if ($PreflightOnly) {
    Write-Host "`nPREFLIGHT PASSED - nothing was changed. Run without -PreflightOnly to cut over."
    Stop-Transcript | Out-Null
    exit 0
}

# ---- 2. VPS: go public, delete the htaccess gate ---------------------------
Step "VPS: enable public confs, remove gate" {
    VpsExec ("sudo ln -sf /etc/nginx/sites-available/app-public.conf /etc/nginx/sites-enabled/app-public.conf && " +
         "sudo ln -sf /etc/nginx/sites-available/greenfield-public.conf /etc/nginx/sites-enabled/greenfield.conf && " +
         "sudo systemctl disable --now checkitout-gate 2>/dev/null; sudo nginx -t && sudo systemctl reload nginx") | Out-Null
}

# ---- 3. Cloudflare flip ----------------------------------------------------
Step "Cloudflare: point checkitout.app + www at $VPS" {
    SetDns $REC_APEX "checkitout.app" $VPS
    SetDns $REC_WWW  "www.checkitout.app" $VPS
}

# ---- 4. tests through the real edge ---------------------------------------
Step "Verify through Cloudflare edge (waits 15 s first)" {
    Start-Sleep -Seconds 15
    Probe "https://checkitout.app/health" 200 "OK app-public"
    Probe "https://checkitout.app/" 200 "Check It Out"
    Probe "https://www.checkitout.app/health" 200 "OK app-public"
    Probe "https://check-it-out.pl/" 200 ""
}

Write-Host @"

CUTOVER COMPLETE
  checkitout.app + www  ->  $VPS  (public demo, no gate)
  check-it-out.pl       ->  ungated as well
  loki.checkitout.app   ->  untouched (still $OLD_IP)
  Rollback anytime: pwsh -File cutover-app.ps1 -Rollback
"@
Stop-Transcript | Out-Null
