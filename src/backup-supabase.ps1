# backup-supabase.ps1
# Supabase backup via Supavisor/Pooler connection (IPv4-friendly).
# Creates a timestamped .dump using pg_dump (custom format) and keeps last N backups.

$ErrorActionPreference = "Stop"

# --------- CONFIG (from your pooler connection string) ----------
$HostName   = "aws-1-eu-west-1.pooler.supabase.com"
$Port       = 5432
$Database   = "postgres"
$UserName   = "postgres.gvqnkzotlydzssfmufht"   # IMPORTANT: includes project ref
$BackupDir  = "$PSScriptRoot\backups"
$KeepLastN  = 10   # 0 = keep everything
# ---------------------------------------------------------------

function Assert-CommandExists($cmd) {
  $c = Get-Command $cmd -ErrorAction SilentlyContinue
  if (-not $c) {
    throw "Required command '$cmd' not found. Install PostgreSQL client tools so pg_dump is available."
  }
}

Assert-CommandExists "pg_dump"

New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$outFile = Join-Path $BackupDir ("supabase_backup_{0}.dump" -f $timestamp)

Write-Host "Supabase backup starting (pooler)..." -ForegroundColor Cyan
Write-Host "Host: $HostName"
Write-Host "Port: $Port"
Write-Host "User: $UserName"
Write-Host "DB:   $Database"
Write-Host "Out:  $outFile"
Write-Host ""

# Prompt for password securely
$securePwd = Read-Host -AsSecureString "Enter DB password for $UserName"
$plainPwd  = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
  [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePwd)
)

try {
  # Force SSL for Supabase
  $env:PGSSLMODE = "require"
  $env:PGPASSWORD = $plainPwd

  # Run pg_dump
  & pg_dump `
    --host=$HostName `
    --port=$Port `
    --username=$UserName `
    --format=custom `
    --file="$outFile" `
    --no-owner `
    --no-privileges `
    $Database

  if ($LASTEXITCODE -ne 0) {
    throw "pg_dump failed with exit code $LASTEXITCODE"
  }

  if (!(Test-Path $outFile)) {
    throw "Backup file was not created."
  }

  $size = (Get-Item $outFile).Length
  if ($size -lt 1024) {
    throw "Backup file looks too small ($size bytes). Likely failed."
  }

  Write-Host ""
  Write-Host "✅ Backup complete: $outFile ($size bytes)" -ForegroundColor Green
}
finally {
  Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:\PGSSLMODE -ErrorAction SilentlyContinue
  $plainPwd = $null
}

# Retention cleanup
if ($KeepLastN -gt 0) {
  $files = Get-ChildItem -Path $BackupDir -Filter "supabase_backup_*.dump" | Sort-Object LastWriteTime -Descending
  if ($files.Count -gt $KeepLastN) {
    $toDelete = $files | Select-Object -Skip $KeepLastN
    foreach ($f in $toDelete) {
      Remove-Item $f.FullName -Force
    }
    Write-Host "🧹 Retention: kept last $KeepLastN backups, deleted $($toDelete.Count)." -ForegroundColor Yellow
  }
}