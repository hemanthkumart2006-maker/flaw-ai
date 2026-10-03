# Flaw AI Ultra — Desktop & Laptop Startup Voice Agent

This directory provides automated Windows startup integration and desktop launcher scripts for **Flaw AI Ultra**.

## Features
- **Automatic Laptop Boot Startup**: Automatically launches the server and opens the voice assistant upon Windows login.
- **Hands-Free Availability**: Once started, the 3D Anime AI Assistant and F.R.I.D.A.Y. Voice mode are ready immediately.
- **Privacy & Safety**: Safe start; does not record secretly. Microphone access follows standard browser and system permissions.

## How to Enable Windows Startup
To have Flaw AI start every time your laptop turns on, run PowerShell as your user:

```powershell
.\setup-startup.ps1 -Action enable
```

To disable startup at any time:
```powershell
.\setup-startup.ps1 -Action disable
```

To check current startup status:
```powershell
.\setup-startup.ps1 -Action status
```

## Manual Launch
Double-click `launcher.bat` to launch the server and open the Flaw AI Ultra interface immediately.
