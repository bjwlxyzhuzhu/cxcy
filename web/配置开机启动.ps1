$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$vbs = Join-Path $root "scripts\start-hidden.vbs"
$action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$vbs`"" -WorkingDirectory $root
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
Register-ScheduledTask -TaskName "双创AI星际-网站" -Action $action -Trigger $trigger -Description "登录 Windows 后启动双创 AI 星际平台" -Force | Out-Null
Write-Host "已配置登录后自动启动：双创AI星际-网站"
