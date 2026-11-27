# Copyright (c) 2026 DPSystems, LLC.
# Deploys a committed revision of DraftMyListing to the Synology NAS over SSH: ships the code,
# optionally the settings file, then runs scripts/install-on-nas.sh there.
#
#   .\scripts\deploy-synology.ps1 -NasHost <nas-address>
#   .\scripts\deploy-synology.ps1 -NasHost <nas-address> -SettingsFile C:\Repos\.config\draftmylisting\runtime.env
#
# -NasHost can also come from the DRAFTMYLISTING_NAS_HOST environment variable, so the address
# never has to be written into this public repository.

[CmdletBinding()]
param(
    [string]$NasHost = $env:DRAFTMYLISTING_NAS_HOST,
    # The NAS listens for SSH on 7070, not the default 22.
    [int]$SshPort = 7070,
    [string]$SshKeyPath = (Join-Path ([Environment]::GetFolderPath('UserProfile')) '.ssh\nas_key'),
    [string]$Ref = 'HEAD',
    [string]$RemoteUser = 'DockerDeploy',
    [string]$AppDir = '/volume2/docker/draftmylisting',
    [string]$SettingsPath = '/volume2/docker/draftmylisting-config/runtime.env',
    # A local settings file to upload first. Must live outside the repository.
    [string]$SettingsFile = ''
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'WindowsTools.ps1')

function Get-RemoteInstallCommand {
    # One line for ssh. No double quotes: Windows PowerShell strips them from arguments to
    # native programs, and none of these paths contain spaces.
    param([string]$AppDir, [string]$SettingsPath, [bool]$WithSettings)
    $staging = "$AppDir.staging"
    $settingsDir = Split-Path -Parent $SettingsPath
    $settingsDir = $settingsDir -replace '\\', '/'
    $command = 'set -eu; '
    if ($WithSettings) {
        # umask 077 so the file is never readable by anyone else, even for a moment.
        $command += "umask 077; mkdir -p $settingsDir; mv -f /tmp/draftmylisting-runtime.env $SettingsPath; chmod 600 $SettingsPath; "
    }
    $command += "rm -rf $staging; mkdir -p $staging; " +
    "tar xf /tmp/draftmylisting-release.tar -C $staging; rm -f /tmp/draftmylisting-release.tar; " +
    "DML_ROOT=$AppDir DML_SETTINGS=$SettingsPath bash $staging/scripts/install-on-nas.sh $staging"
    $command
}

function Assert-OutsideRepository {
    # A settings file inside the repo is one `git add` away from publishing the password.
    param([string]$Path, [string]$Repo)
    $full = (Resolve-Path -LiteralPath $Path).Path
    $root = (Resolve-Path -LiteralPath $Repo).Path.TrimEnd('\', '/') + [System.IO.Path]::DirectorySeparatorChar
    if ($full.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "The settings file $full is inside the repository. Keep it outside, e.g. C:\Repos\.config\draftmylisting\runtime.env."
    }
    $full
}

# Dot-sourcing this file (as tests would) only defines the functions above.
if ($MyInvocation.InvocationName -ne '.') {
    if ([string]::IsNullOrWhiteSpace($NasHost)) {
        throw 'Give the NAS address with -NasHost or set DRAFTMYLISTING_NAS_HOST.'
    }
    $repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
    $dirty = git -C $repo status --porcelain
    if ($dirty) {
        Write-Warning 'There are uncommitted changes. Only committed files are deployed.'
    }
    $settingsLocal = ''
    if ($SettingsFile -ne '') {
        $settingsLocal = Assert-OutsideRepository -Path $SettingsFile -Repo $repo
    }

    $work = Join-Path ([System.IO.Path]::GetTempPath()) ('draftmylisting-' + [guid]::NewGuid().ToString())
    New-Item -ItemType Directory -Path $work | Out-Null
    $target = "$RemoteUser@$NasHost"
    try {
        # git archive ships only committed files, so an uncommitted secret can never be deployed.
        $release = Join-Path $work 'draftmylisting-release.tar'
        git -C $repo archive --format=tar --output=$release $Ref
        if ($LASTEXITCODE -ne 0) { throw 'git archive failed' }

        $scp = Get-WindowsTool scp
        $ssh = Get-WindowsTool ssh
        $files = @($release)
        if ($settingsLocal -ne '') {
            $settingsCopy = Join-Path $work 'draftmylisting-runtime.env'
            Copy-Item -LiteralPath $settingsLocal -Destination $settingsCopy
            $files += $settingsCopy
        }
        # -O: the classic SCP protocol. OpenSSH 9+ defaults to SFTP, which this NAS has off.
        & $scp -O -P $SshPort -i $SshKeyPath @files "${target}:/tmp/"
        if ($LASTEXITCODE -ne 0) { throw 'Copying the release to the NAS failed' }

        $command = Get-RemoteInstallCommand -AppDir $AppDir -SettingsPath $SettingsPath -WithSettings ($settingsLocal -ne '')
        & $ssh -p $SshPort -i $SshKeyPath $target $command
        if ($LASTEXITCODE -ne 0) { throw "Install on the NAS failed (exit $LASTEXITCODE)" }
    }
    finally {
        Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
    }
}
