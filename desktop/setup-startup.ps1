# Flaw AI Ultra - Windows Startup Registration Script
param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("enable", "disable", "status")]
    [string]$Action = "status"
)

$AppName = "FlawAIUltraVoiceAgent"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$LauncherPath = Join-Path $ScriptDir "launcher.bat"
$RegPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"

Write-Host "=== Flaw AI Ultra - Startup Manager ===" -ForegroundColor Cyan

if ($Action -eq "enable") {
    if (Test-Path $LauncherPath) {
        Set-ItemProperty -Path $RegPath -Name $AppName -Value "`"$LauncherPath`""
        Write-Host "[SUCCESS] Flaw AI Ultra registered for Windows Startup." -ForegroundColor Green
        Write-Host "The voice agent will automatically launch whenever this laptop boots." -ForegroundColor Yellow
    } else {
        Write-Host "[ERROR] Could not find launcher at: $LauncherPath" -ForegroundColor Red
    }
}
elseif ($Action -eq "disable") {
    if ((Get-ItemProperty -Path $RegPath -Name $AppName -ErrorAction SilentlyContinue)) {
        Remove-ItemProperty -Path $RegPath -Name $AppName
        Write-Host "[SUCCESS] Flaw AI Ultra removed from Windows Startup." -ForegroundColor Yellow
    } else {
        Write-Host "[INFO] Flaw AI Ultra is not currently registered for startup." -ForegroundColor Gray
    }
}
else {
    $Current = Get-ItemProperty -Path $RegPath -Name $AppName -ErrorAction SilentlyContinue
    if ($Current) {
        Write-Host "Status: ENABLED" -ForegroundColor Green
        Write-Host "Path: $($Current.$AppName)" -ForegroundColor Gray
    } else {
        Write-Host "Status: DISABLED" -ForegroundColor Gray
        Write-Host "To enable startup run: .\setup-startup.ps1 -Action enable" -ForegroundColor Yellow
    }
}
