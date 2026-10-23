$ErrorActionPreference = 'Stop'

if ($env:RESTORE_TEST_CONFIRM -ne 'I_UNDERSTAND') {
  throw 'Set RESTORE_TEST_CONFIRM=I_UNDERSTAND to create and remove a temporary PostgreSQL restore cluster.'
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw 'Node.js was not found.' }
if (-not (Get-Content -LiteralPath (Join-Path $PSScriptRoot '..\..\.env') -ErrorAction SilentlyContinue | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' })) { throw 'DATABASE_URL is missing from the project .env.' }

$pgBin = if ($env:PG_BIN) { [System.IO.Path]::GetFullPath($env:PG_BIN) } else { 'C:\Program Files\PostgreSQL\18\bin' }
foreach ($tool in @('initdb.exe', 'pg_ctl.exe', 'pg_dump.exe', 'pg_restore.exe', 'createdb.exe')) {
  if (-not (Test-Path -LiteralPath (Join-Path $pgBin $tool) -PathType Leaf)) { throw "PostgreSQL restore tool was not found: $tool" }
}

$tempParent = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$restoreRoot = Join-Path $tempParent ('mkschool-restore-check-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $restoreRoot | Out-Null
try {
  $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  & icacls.exe $restoreRoot /inheritance:r /grant:r ("{0}:(OI)(CI)F" -f $identity) | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not restrict the temporary restore directory to the current Windows account.' }

  $resolvedTemp = (Resolve-Path -LiteralPath $restoreRoot).Path
  if (-not $resolvedTemp.StartsWith($tempParent, [System.StringComparison]::OrdinalIgnoreCase) -or [System.IO.Path]::GetFileName($resolvedTemp) -notlike 'mkschool-restore-check-*') {
    throw 'Temporary restore path failed safety validation.'
  }

  $env:PG_BIN = $pgBin
  $env:RESTORE_TEST_ROOT = $resolvedTemp
  $envFile = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..\.env')).Path
  $scriptFile = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot 'verify-db-restore.cjs')).Path
  & node "--env-file=$envFile" $scriptFile
  if ($LASTEXITCODE -ne 0) { throw 'Isolated PostgreSQL backup/restore verification failed.' }
} finally {
  $resolvedTemp = if (Test-Path -LiteralPath $restoreRoot) { (Resolve-Path -LiteralPath $restoreRoot).Path } else { $null }
  if ($resolvedTemp -and $resolvedTemp.StartsWith($tempParent, [System.StringComparison]::OrdinalIgnoreCase) -and [System.IO.Path]::GetFileName($resolvedTemp) -like 'mkschool-restore-check-*') {
    Remove-Item -LiteralPath $resolvedTemp -Recurse -Force -ErrorAction SilentlyContinue
  }
  Remove-Item Env:RESTORE_TEST_ROOT -ErrorAction SilentlyContinue
  Remove-Item Env:PG_BIN -ErrorAction SilentlyContinue
}
