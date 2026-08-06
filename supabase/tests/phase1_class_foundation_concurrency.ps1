$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$docker = (Get-Command docker -ErrorAction Stop).Source
$projectId = 'ai-escort-application'
$dbContainer = @(& $docker ps --filter ('label=com.supabase.cli.project=' + $projectId) --filter 'name=supabase_db_' --format '{{.Names}}')
if ($dbContainer.Count -ne 1) {
  throw 'Expected exactly one local AI Escort Supabase database container'
}

function Invoke-DatabaseFile {
  param([Parameter(Mandatory = $true)][string]$Path)

  Get-Content -Raw $Path | & $docker exec -i $dbContainer[0] psql --username postgres --dbname postgres --set ON_ERROR_STOP=1 --quiet
  if ($LASTEXITCODE -ne 0) {
    throw ('Database file failed: ' + $Path)
  }
}

$supportRoot = Join-Path $PSScriptRoot '..\test-support'
$setupPath = Join-Path $supportRoot 'phase1_class_foundation_concurrency_setup.sql'
$verifyPath = Join-Path $supportRoot 'phase1_class_foundation_concurrency_verify.sql'
$cleanupPath = Join-Path $supportRoot 'phase1_class_foundation_concurrency_cleanup.sql'
$jobs = @()
$setupComplete = $false

try {
  Invoke-DatabaseFile -Path $setupPath
  $setupComplete = $true

  $jobs += Start-Job -ScriptBlock {
    param($DockerPath, $Container, $WorkingDirectory)
    Set-Location $WorkingDirectory
    'select private.p1_02_race_insert_membership(''a'', true);' | & $DockerPath exec -i $Container psql --username postgres --dbname postgres --set ON_ERROR_STOP=1 --quiet
    if ($LASTEXITCODE -ne 0) {
      throw 'First membership contender failed to execute'
    }
  } -ArgumentList $docker, $dbContainer[0], $repoRoot

  Start-Sleep -Milliseconds 1000

  $jobs += Start-Job -ScriptBlock {
    param($DockerPath, $Container, $WorkingDirectory)
    Set-Location $WorkingDirectory
    'select private.p1_02_race_insert_membership(''b'', false);' | & $DockerPath exec -i $Container psql --username postgres --dbname postgres --set ON_ERROR_STOP=1 --quiet
    if ($LASTEXITCODE -ne 0) {
      throw 'Second membership contender failed to execute'
    }
  } -ArgumentList $docker, $dbContainer[0], $repoRoot

  $jobs | Wait-Job | Out-Null
  foreach ($job in $jobs) {
    if ($job.State -ne 'Completed') {
      Receive-Job $job
      throw ('Membership race job ended in state ' + $job.State)
    }
    Receive-Job $job | Out-Null
  }

  Invoke-DatabaseFile -Path $verifyPath
  Write-Output 'P1-02 membership race: PASS (one insert, one 23505, one final row)'
}
finally {
  foreach ($job in $jobs) {
    if ($job.State -eq 'Running') {
      Stop-Job $job
    }
  }
  if ($jobs.Count -gt 0) {
    $jobs | Remove-Job -Force
  }
  if ($setupComplete) {
    Invoke-DatabaseFile -Path $cleanupPath
  }
}
