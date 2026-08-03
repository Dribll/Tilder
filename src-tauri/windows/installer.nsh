; Tilder NSIS installer hooks
; The monitor now runs automatically as a child process of server.js
; No Windows Service or Scheduled Task needed — just install and go.

!macro NSIS_HOOK_PREINSTALL
  ; Clean up any legacy services or scheduled tasks from older versions
  nsExec::ExecToLog `sc stop TilderMonitorService`
  nsExec::ExecToLog `sc delete TilderMonitorService`
  nsExec::ExecToLog `schtasks /delete /tn "TilderSystemMonitor" /f`
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Create ProgramData\Tilder directory for the monitor output
  CreateDirectory "$PROGRAMDATA\Tilder"
  
  ; Install and start the C# Windows Service
  nsExec::ExecToLog `sc create TilderMonitorService binPath= "$INSTDIR\monitor_bin\TilderMonitorService.exe" start= auto`
  nsExec::ExecToLog `sc start TilderMonitorService`
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; Clean up any legacy services or scheduled tasks
  nsExec::ExecToLog `sc stop TilderMonitorService`
  nsExec::ExecToLog `sc delete TilderMonitorService`
  nsExec::ExecToLog `schtasks /delete /tn "TilderSystemMonitor" /f`

  ; Clean up data folder
  RMDir /r "$PROGRAMDATA\Tilder"
!macroend
