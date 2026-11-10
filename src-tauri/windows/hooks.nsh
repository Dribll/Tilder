; Tilder NSIS installer & uninstaller hooks
; Configured in tauri.conf.json -> bundle.windows.nsis.installerHooks

!macro NSIS_HOOK_PREINSTALL
  ; Terminate any existing Tilder instances cleanly so files are not locked
  nsExec::Exec 'taskkill /F /IM Tilder.exe /IM tilder.exe /IM tilder-node.exe /IM NvmeMonitor.exe /T'

  ; Stop and delete previous monitor service if present
  nsExec::Exec 'sc stop TilderMonitorService'
  nsExec::Exec 'sc delete TilderMonitorService'
  nsExec::Exec 'schtasks /delete /tn "TilderDevDeploy" /f'
  nsExec::Exec 'schtasks /delete /tn "TilderSystemMonitor" /f'
  nsExec::Exec 'schtasks /delete /tn "TilderTelemetry" /f'
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Hardware monitor service setup (fast, non-blocking)
  nsExec::Exec 'sc create TilderMonitorService binPath= "$\"$INSTDIR\monitor_bin\TilderMonitorService.exe$\"" start= auto'
  nsExec::Exec 'sc start TilderMonitorService'

  ; Deploy native NVMe SMART temperature monitor to ProgramData
  CreateDirectory "$PROGRAMDATA\Tilder"
  CopyFiles /SILENT "$INSTDIR\monitor_bin\NvmeMonitor.exe" "$PROGRAMDATA\Tilder\NvmeMonitor.exe"

  ; Clean up legacy tasks safely
  nsExec::Exec 'schtasks /delete /tn "TilderDevDeploy" /f'
  nsExec::Exec 'schtasks /delete /tn "TilderSystemMonitor" /f'
  nsExec::Exec 'schtasks /delete /tn "TilderTelemetry" /f'

  ; Add 'Open with Tilder' to Windows Explorer Context Menu for Folders, Drives and Backgrounds
  WriteRegStr HKCR "Directory\shell\Tilder" "" "Open with Tilder"
  WriteRegStr HKCR "Directory\shell\Tilder" "Icon" "$\"$INSTDIR\Tilder.exe$\",0"
  WriteRegStr HKCR "Directory\shell\Tilder\command" "" "$\"$INSTDIR\Tilder.exe$\" --workspace $\"%1$\""

  WriteRegStr HKCR "Directory\Background\shell\Tilder" "" "Open with Tilder"
  WriteRegStr HKCR "Directory\Background\shell\Tilder" "Icon" "$\"$INSTDIR\Tilder.exe$\",0"
  WriteRegStr HKCR "Directory\Background\shell\Tilder\command" "" "$\"$INSTDIR\Tilder.exe$\" --workspace $\"%V$\""

  WriteRegStr HKCR "Drive\shell\Tilder" "" "Open with Tilder"
  WriteRegStr HKCR "Drive\shell\Tilder" "Icon" "$\"$INSTDIR\Tilder.exe$\",0"
  WriteRegStr HKCR "Drive\shell\Tilder\command" "" "$\"$INSTDIR\Tilder.exe$\" --workspace $\"%1$\""

  WriteRegStr HKCR "*\shell\Tilder" "" "Open with Tilder"
  WriteRegStr HKCR "*\shell\Tilder" "Icon" "$\"$INSTDIR\Tilder.exe$\",0"
  WriteRegStr HKCR "*\shell\Tilder\command" "" "$\"$INSTDIR\Tilder.exe$\" --file $\"%1$\""

  ; Add $INSTDIR\bin to System PATH for instant `tilder .` command globally
  nsExec::Exec 'cmd.exe /c "powershell -NonInteractive -NoProfile -Command \"$b=\\\"$INSTDIR\bin\\\"; $p=[Environment]::GetEnvironmentVariable(\\\"Path\\\",\\\"Machine\\\"); if($p -notlike \\\"*$b*\\\"){[Environment]::SetEnvironmentVariable(\\\"Path\\\",\\\"$p;$b\\\",\\\"Machine\\\")}\""'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; Terminate all running Tilder processes so zero files are locked
  nsExec::Exec 'taskkill /F /IM Tilder.exe /IM tilder.exe /IM tilder-node.exe /IM NvmeMonitor.exe /IM TilderMonitorService.exe /T'

  ; Stop and delete the Windows service
  nsExec::Exec 'sc stop TilderMonitorService'
  nsExec::Exec 'sc delete TilderMonitorService'

  ; Clean up scheduled tasks
  nsExec::Exec 'schtasks /delete /tn "TilderDevDeploy" /f'
  nsExec::Exec 'schtasks /delete /tn "TilderSystemMonitor" /f'
  nsExec::Exec 'schtasks /delete /tn "TilderTelemetry" /f'

  ; Remove Explorer Context Menu entries
  DeleteRegKey HKCR "Directory\shell\Tilder"
  DeleteRegKey HKCR "Directory\Background\shell\Tilder"
  DeleteRegKey HKCR "Drive\shell\Tilder"
  DeleteRegKey HKCR "*\shell\Tilder"

  ; Remove $INSTDIR\bin from System PATH
  nsExec::Exec 'powershell -NonInteractive -NoProfile -Command "$bin = \"$INSTDIR\bin\"; $p = [Environment]::GetEnvironmentVariable(\"Path\", \"Machine\"); if ($p -like \"*$bin*\") { $newP = ($p.Split(\";\") | Where-Object { $_ -ne $bin -and $_ -ne \"\" }) -join \";\"; [Environment]::SetEnvironmentVariable(\"Path\", $newP, \"Machine\") }"'

  ; Cleanly remove heavy directories
  nsExec::Exec 'cmd.exe /c "rd /s /q \"$INSTDIR\app\""'
  nsExec::Exec 'cmd.exe /c "rd /s /q \"$INSTDIR\monitor_bin\""'
  nsExec::Exec 'cmd.exe /c "rd /s /q \"$INSTDIR\binaries\""'
  nsExec::Exec 'cmd.exe /c "rd /s /q \"$INSTDIR\bin\""'
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  RMDir /r "$PROGRAMDATA\Tilder"
  RMDir /r "$INSTDIR"
!macroend
