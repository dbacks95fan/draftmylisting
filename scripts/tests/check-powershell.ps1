# Copyright (c) 2026 DPSystems, LLC.
# Lints and format-checks the PowerShell scripts with PSScriptAnalyzer, then checks the
# deploy script's helper functions without contacting the NAS.
#
#   pwsh -NoProfile -File scripts/tests/check-powershell.ps1

$ErrorActionPreference = 'Stop'
Import-Module PSScriptAnalyzer
$scripts = Get-ChildItem -Path (Join-Path $PSScriptRoot '..') -Recurse -Filter '*.ps1'
$failures = 0

foreach ($file in $scripts) {
    $findings = Invoke-ScriptAnalyzer -Path $file.FullName -Severity Information, Warning, Error
    foreach ($finding in $findings) {
        Write-Output "  FAIL  $($file.Name):$($finding.Line) $($finding.RuleName): $($finding.Message)"
        $failures++
    }
    $text = Get-Content -LiteralPath $file.FullName -Raw
    if ((Invoke-Formatter -ScriptDefinition $text) -ne $text) {
        Write-Output "  FAIL  $($file.Name) is not formatted (run Invoke-Formatter)"
        $failures++
    }
    else {
        Write-Output "  ok    $($file.Name) lint and format"
    }
}

# Dot-sourcing defines the functions without deploying.
. (Join-Path $PSScriptRoot '..\deploy-synology.ps1')

$command = Get-RemoteInstallCommand -AppDir '/volume2/docker/draftmylisting' -SettingsPath '/volume2/docker/draftmylisting-config/runtime.env' -WithSettings $true
$expected = @(
    'set -eu; umask 077; mkdir -p /volume2/docker/draftmylisting-config;'
    'mv -f /tmp/draftmylisting-runtime.env /volume2/docker/draftmylisting-config/runtime.env;'
    'tar xf /tmp/draftmylisting-release.tar -C /volume2/docker/draftmylisting.staging;'
    'DML_ROOT=/volume2/docker/draftmylisting DML_SETTINGS=/volume2/docker/draftmylisting-config/runtime.env bash /volume2/docker/draftmylisting.staging/scripts/install-on-nas.sh /volume2/docker/draftmylisting.staging'
)
foreach ($part in $expected) {
    if (-not $command.Contains($part)) {
        Write-Output "  FAIL  remote command is missing: $part"
        $failures++
    }
}
if ($command.Contains('"')) {
    Write-Output '  FAIL  remote command contains a double quote'
    $failures++
}
$withoutSettings = Get-RemoteInstallCommand -AppDir '/volume2/docker/draftmylisting' -SettingsPath '/volume2/docker/draftmylisting-config/runtime.env' -WithSettings $false
if ($withoutSettings.Contains('draftmylisting-runtime.env')) {
    Write-Output '  FAIL  remote command moves a settings file that was not uploaded'
    $failures++
}
Write-Output '  ok    remote install command'

$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$inside = Join-Path $repo 'docker-compose.yml'
try {
    Assert-OutsideRepository -Path $inside -Repo $repo | Out-Null
    Write-Output '  FAIL  a settings file inside the repository was accepted'
    $failures++
}
catch {
    Write-Output '  ok    refuses a settings file inside the repository'
}
$outsideFile = New-TemporaryFile
try {
    $accepted = Assert-OutsideRepository -Path $outsideFile.FullName -Repo $repo
    if ($accepted -ne (Resolve-Path -LiteralPath $outsideFile.FullName).Path) {
        Write-Output '  FAIL  an outside settings file was not returned as a full path'
        $failures++
    }
    else {
        Write-Output '  ok    accepts a settings file outside the repository'
    }
}
finally {
    Remove-Item -LiteralPath $outsideFile.FullName -Force
}

if ($failures -gt 0) {
    Write-Output "$failures check(s) failed"
    exit 1
}
Write-Output 'all checks passed'
