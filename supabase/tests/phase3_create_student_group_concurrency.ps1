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
$setupPath = Join-Path $supportRoot 'phase3_create_student_group_concurrency_setup.sql'
$verifyPath = Join-Path $supportRoot 'phase3_create_student_group_concurrency_verify.sql'
$cleanupPath = Join-Path $supportRoot 'phase3_create_student_group_concurrency_cleanup.sql'
$rounds = 10
$jobs = @()
$setupComplete = $false

$contender = {
  param($DockerPath, $Container, $WorkingDirectory, $Round, $Name, $ActorId)
  Set-Location $WorkingDirectory
  ("select private.p3_02_race_create({0}, '{1}', '{2}'::uuid);" -f $Round, $Name, $ActorId) | & $DockerPath exec -i $Container psql --username postgres --dbname postgres --set ON_ERROR_STOP=1 --quiet
  if ($LASTEXITCODE -ne 0) {
    throw ('Contender ' + $Name + ' failed to execute in round ' + $Round)
  }
}

try {
  Invoke-DatabaseFile -Path $setupPath
  $setupComplete = $true

  for ($round = 1; $round -le $rounds; $round++) {
    # The gate holds an exclusive advisory lock so both contenders start the RPC together.
    $gate = Start-Job -ScriptBlock {
      param($DockerPath, $Container)
      'select pg_advisory_lock(3502); select pg_sleep(2); select pg_advisory_unlock(3502);' | & $DockerPath exec -i $Container psql --username postgres --dbname postgres --set ON_ERROR_STOP=1 --quiet
    } -ArgumentList $docker, $dbContainer[0]
    Start-Sleep -Milliseconds 500

    $roundJobs = @(
      (Start-Job -ScriptBlock $contender -ArgumentList $docker, $dbContainer[0], $repoRoot, $round, 'student-a', '00000000-0000-0000-0000-000000003502'),
      (Start-Job -ScriptBlock $contender -ArgumentList $docker, $dbContainer[0], $repoRoot, $round, 'student-b', '00000000-0000-0000-0000-000000003503')
    )
    $jobs += $gate
    $jobs += $roundJobs

    @($gate) + $roundJobs | Wait-Job | Out-Null
    foreach ($job in $roundJobs) {
      if ($job.State -ne 'Completed') {
        Receive-Job $job
        throw ('Group creation race job ended in state ' + $job.State)
      }
      Receive-Job $job | Out-Null
    }
    Receive-Job $gate | Out-Null
  }

  Invoke-DatabaseFile -Path $verifyPath
  Write-Output ('P3-02 final group slot race: PASS (' + $rounds + ' rounds, one created and one GROUP_LIMIT_REACHED per round)')
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
