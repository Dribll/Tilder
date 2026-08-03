!macro NSIS_HOOK_PREINSTALL
  ; Stop and delete the Windows Service to release file locks on the executable
  nsExec::ExecToLog 'sc stop TilderMonitorService'
  nsExec::ExecToLog 'sc delete TilderMonitorService'
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Install the secure signed PawnIO driver silently (needed for LibreHardwareMonitor to read CPU temps on Windows 11 with Memory Integrity)
  nsExec::ExecToLog 'winget install -e --id namazso.PawnIO --silent --accept-source-agreements --accept-package-agreements'

  ; Create Tilder's custom hardware monitor service (C# worker)
  ; Install as a real Windows Service running as LocalSystem
  nsExec::ExecToLog 'sc create TilderMonitorService binPath= "$\"$INSTDIR\monitor_bin\TilderMonitorService.exe$\"" start= auto'
  ; Start it immediately so stats are available right after install
  nsExec::ExecToLog 'sc start TilderMonitorService'
  
  ; Clean up legacy scheduled tasks
  nsExec::ExecToLog 'schtasks /delete /tn "TilderSystemMonitor" /f'
  nsExec::ExecToLog 'schtasks /delete /tn "TilderTelemetry" /f'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; Stop and delete the Windows Service
  nsExec::ExecToLog 'sc stop TilderMonitorService'
  nsExec::ExecToLog 'sc delete TilderMonitorService'
  
  ; Clean up legacy tasks just in case
  nsExec::ExecToLog 'schtasks /delete /tn "TilderSystemMonitor" /f'
  nsExec::ExecToLog 'schtasks /delete /tn "TilderTelemetry" /f'
  
  ; Clean up data folder
  RMDir /r "$PROGRAMDATA\Tilder"
!macroend
