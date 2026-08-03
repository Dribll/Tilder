import { desktopWriteFile, desktopCreateFolder } from './desktopFileApi.js';

/**
 * Helper to generate and prepare a sandboxed run execution
 * @param {string} filePath - Absolute path to the .exe file
 * @param {string} workspaceCwd - Workspace root folder path
 * @returns {Promise<{script: string, wsbPath: string}>}
 */
export async function prepareSandboxRun(filePath, workspaceCwd) {
  if (!filePath || !workspaceCwd) {
    throw new Error("Missing file path or workspace folder path for sandbox execution.");
  }

  // Normalize paths to Windows style
  const normalizedFile = filePath.replace(/\//g, '\\');
  const normalizedCwd = workspaceCwd.replace(/\//g, '\\');
  
  const lastSlash = normalizedFile.lastIndexOf('\\');
  const hostFolder = normalizedFile.substring(0, lastSlash);
  const exeName = normalizedFile.substring(lastSlash + 1);

  // Setup sandbox temp directory inside .tilder
  const tempDir = `${normalizedCwd}\\.tilder\\temp`;
  const wsbPath = `${tempDir}\\run_sandbox.wsb`;
  const ps1Path = `${tempDir}\\run_sandbox.ps1`;

  // Create the WSB configuration XML
  const wsbConfig = `<Configuration>
  <VGpu>Enable</VGpu>
  <Networking>Disable</Networking>
  <MappedFolders>
    <MappedFolder>
      <HostFolder>${hostFolder}</HostFolder>
      <SandboxFolder>C:\\Users\\WDAGUtilityAccount\\Desktop\\App</SandboxFolder>
      <ReadOnly>true</ReadOnly>
    </MappedFolder>
  </MappedFolders>
  <LogonCommand>
    <Command>C:\\Users\\WDAGUtilityAccount\\Desktop\\App\\${exeName}</Command>
  </LogonCommand>
</Configuration>`;

  // Build the unified PowerShell execution script
  const script = `
# Clear previous output
Clear-Host

# 1. System Feature & Dependency Verification
$sandboxExe = "C:\\Windows\\System32\\WindowsSandbox.exe"
if (!(Test-Path $sandboxExe)) {
    Write-Host "❌ [Tilder Sandbox] ERROR: Windows Sandbox feature is not enabled on your machine!" -ForegroundColor Red
    Write-Host "💡 To enable Windows Sandbox:" -ForegroundColor Yellow
    Write-Host "   1. Press Win+R, type 'OptionalFeatures.exe', and press Enter." -ForegroundColor White
    Write-Host "   2. Scroll down and check 'Windows Sandbox'." -ForegroundColor White
    Write-Host "   3. Click OK and restart your PC." -ForegroundColor White
    exit 1
}

$defenderPath = "C:\\Program Files\\Windows Defender\\MpCmdRun.exe"
if (!(Test-Path $defenderPath)) {
    Write-Host "⚠️ [Tilder Shield] Warning: Windows Defender CLI (MpCmdRun.exe) was not found." -ForegroundColor Yellow
    Write-Host "🚀 Launching in Windows Sandbox directly without threat pre-scan..." -ForegroundColor Green
    Start-Process -FilePath $sandboxExe -ArgumentList '"${wsbPath}"'
    exit 0
}

# 2. Perform Windows Defender Scan
Write-Host "🛡️ [Tilder Shield] Initiating Malware Pre-scan on: ${exeName}..." -ForegroundColor Cyan
Write-Host "⏳ Scanning file, please wait..." -ForegroundColor DarkGray

# MpCmdRun.exe exit codes: 0 = No threats, 2 = Threats found, 1 = Error
Start-Process -FilePath $defenderPath -ArgumentList "-Scan -ScanType 3 -File \\"${normalizedFile}\\"" -Wait -NoNewWindow
$scanResult = $LASTEXITCODE

# 3. Handle Scan Result
if ($scanResult -eq 0) {
    Write-Host "✅ [Tilder Shield] Scan Clean! No threats detected." -ForegroundColor Green
    Write-Host "🚀 Launching ${exeName} inside isolated Windows Sandbox (Read-Only)..." -ForegroundColor Cyan
    Start-Process -FilePath $sandboxExe -ArgumentList '"${wsbPath}"'
} elseif ($scanResult -eq 2) {
    Write-Host "🚨 [Tilder Shield] MALWARE OR SECURITY THREAT DETECTED!" -ForegroundColor Red -BackgroundColor Black
    Write-Host "🛑 For your safety, Tilder has BLOCKED execution of this file." -ForegroundColor Red
    Write-Host "⚠️ File Path: ${normalizedFile}" -ForegroundColor Yellow
} else {
    Write-Host "⚠️ [Tilder Shield] Scanner returned exit code: $scanResult (possibly unable to scan)." -ForegroundColor Yellow
    Write-Host "🚀 Launching inside isolated Windows Sandbox anyway for safety..." -ForegroundColor Green
    Start-Process -FilePath $sandboxExe -ArgumentList '"${wsbPath}"'
}
`.trim();

  // Create temp dir and write the wsb & ps1 files
  await desktopCreateFolder(tempDir).catch(() => {});
  await desktopWriteFile(wsbPath, wsbConfig);
  await desktopWriteFile(ps1Path, script);

  return { script, wsbPath, ps1Path };
}
