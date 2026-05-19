# OpenStatusKeepAlive — Windows Scheduled Task registration.
#
# Holds the `openstatus` WSL2 distro open with `sleep infinity` so docker
# compose (and cloudflared in particular) stays up across idle periods. WSL2
# terminates idle distros otherwise → tunnel dies → 530 on status.afframe.com.
#
# Run once on a fresh VPS as an Administrator PowerShell session, or via:
#   ssh ovh-vps 'powershell -File C:\Hosting\scripts\openstatus-task.ps1'
#
# Idempotent: re-running re-registers with -Force.
#
# LogonType Interactive runs only when Hleb is logged on (RDP session,
# including disconnected sessions, counts). For reboot-without-login survival,
# upgrade to -LogonType Password and store credentials. See STATUS-PAGE.md
# Phase 4 step 20 for the trade-off discussion.

$ErrorActionPreference = "Stop"

$action = New-ScheduledTaskAction `
    -Execute "wsl.exe" `
    -Argument "-d openstatus -u root -- bash /opt/openstatus/keepalive.sh"

$triggers = @(
    New-ScheduledTaskTrigger -AtStartup
    New-ScheduledTaskTrigger -AtLogOn
)

$settings = New-ScheduledTaskSettingsSet `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew

$principal = New-ScheduledTaskPrincipal `
    -UserId "Hleb" `
    -LogonType Interactive `
    -RunLevel Highest

Register-ScheduledTask `
    -TaskName "OpenStatusKeepAlive" `
    -Action $action `
    -Trigger $triggers `
    -Settings $settings `
    -Principal $principal `
    -Force

Start-ScheduledTask -TaskName "OpenStatusKeepAlive"

Write-Output "OpenStatusKeepAlive registered + started."
