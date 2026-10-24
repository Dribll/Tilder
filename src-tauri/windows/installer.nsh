; Tilder NSIS installer & uninstaller hooks
; Configured in tauri.conf.json -> bundle.windows.nsis.installerHooks

!macro NSIS_HOOK_PREINSTALL
  ; Terminate any existing instances to unlock binaries
  nsExec::Exec 'taskkill /F /IM Tilder.exe /T'
  nsExec::Exec 'taskkill /F /IM tilder.exe /T'
  nsExec::Exec 'taskkill /F /IM tilder-node.exe /T'
  nsExec::Exec 'taskkill /F /IM NvmeMonitor.exe /T'

  ; Stop and delete the Windows Service to release file locks on the executable
  nsExec::Exec 'sc stop TilderMonitorService'
  nsExec::Exec 'sc delete TilderMonitorService'
  nsExec::Exec 'schtasks /delete /tn "TilderSystemMonitor" /f'
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Install the secure signed PawnIO driver silently (needed for LibreHardwareMonitor to read CPU temps on Windows 11 with Memory Integrity)
  nsExec::Exec 'winget install -e --id namazso.PawnIO --silent --accept-source-agreements --accept-package-agreements'

  ; Create Tilder's custom hardware monitor service (C# worker)
  ; Install as a real Windows Service running as LocalSystem
  nsExec::Exec 'sc create TilderMonitorService binPath= "$\"$INSTDIR\monitor_bin\TilderMonitorService.exe$\"" start= auto'
  ; Start it immediately so stats are available right after install
  nsExec::Exec 'sc start TilderMonitorService'

  ; Deploy native NVMe SMART temperature monitor to ProgramData
  CreateDirectory "$PROGRAMDATA\Tilder"
  CopyFiles /SILENT "$INSTDIR\monitor_bin\NvmeMonitor.exe" "$PROGRAMDATA\Tilder\NvmeMonitor.exe"
  
  ; Create the TilderDevDeploy scheduled task (runs as SYSTEM, no UAC needed)
  ; This allows the dev build pipeline to hot-swap the service binary without elevation
  nsExec::Exec 'powershell -WindowStyle Hidden -ExecutionPolicy Bypass -Command "Register-ScheduledTask -Force -TaskName TilderDevDeploy -Principal (New-ScheduledTaskPrincipal -UserId S-1-5-18 -RunLevel Highest) -Action (New-ScheduledTaskAction -Execute powershell.exe -Argument \"-WindowStyle Hidden -ExecutionPolicy Bypass -Command sc.exe stop TilderMonitorService; Start-Sleep 2; Copy-Item (Join-Path $env:ProgramFiles Tilder\monitor_bin\TilderMonitorService.exe) (Join-Path $env:ProgramFiles Tilder\monitor_bin\TilderMonitorService.exe) -Force; sc.exe start TilderMonitorService\") -Settings (New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 2))"'

  ; Clean up legacy scheduled tasks
  nsExec::Exec 'schtasks /delete /tn "TilderSystemMonitor" /f'
  nsExec::Exec 'schtasks /delete /tn "TilderTelemetry" /f'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; 1. Forcibly terminate all running Tilder processes so ZERO files are locked
  ; Without this, running processes lock binaries and Windows RestartManager hangs for minutes!
  nsExec::Exec 'taskkill /F /IM Tilder.exe /T'
  nsExec::Exec 'taskkill /F /IM tilder.exe /T'
  nsExec::Exec 'taskkill /F /IM tilder-node.exe /T'
  nsExec::Exec 'taskkill /F /IM NvmeMonitor.exe /T'
  nsExec::Exec 'taskkill /F /IM TilderMonitorService.exe /T'

  ; 2. Stop and delete the Windows service immediately
  nsExec::Exec 'sc stop TilderMonitorService'
  nsExec::Exec 'sc delete TilderMonitorService'

  ; 3. Clean up scheduled tasks
  nsExec::Exec 'schtasks /delete /tn "TilderDevDeploy" /f'
  nsExec::Exec 'schtasks /delete /tn "TilderSystemMonitor" /f'
  nsExec::Exec 'schtasks /delete /tn "TilderTelemetry" /f'

  ; 4. INSTANT UNINSTALL OPTIMIZATION:
  ; Pre-delete heavy directories via native Windows cmd rd /s /q (~1 second).
  ; When NSIS subsequently runs its per-file Delete loop for thousands of files,
  ; each delete returns immediately with zero disk I/O, eliminating the 3.5 minute wait!
  nsExec::Exec 'cmd.exe /c "rd /s /q \"$INSTDIR\app\""'
  nsExec::Exec 'cmd.exe /c "rd /s /q \"$INSTDIR\monitor_bin\""'
  nsExec::Exec 'cmd.exe /c "rd /s /q \"$INSTDIR\binaries\""'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; Clean up data folder in ProgramData
  RMDir /r "$PROGRAMDATA\Tilder"

  ; Clean up any remaining files and the installation root folder
  RMDir /r "$INSTDIR"
!macroend
