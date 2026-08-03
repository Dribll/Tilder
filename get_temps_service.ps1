$ErrorActionPreference = 'SilentlyContinue'
$dllPath = "$PSScriptRoot\LibreHardwareMonitorLib.dll"
if (-not (Test-Path $dllPath)) { exit 0 }
Add-Type -Path $dllPath
$computer = New-Object LibreHardwareMonitor.Hardware.Computer
$computer.IsCpuEnabled = $true
$computer.IsGpuEnabled = $true
$computer.Open()

$outPath = "$env:ProgramData\Tilder"
if (-not (Test-Path $outPath)) { New-Item -Path $outPath -ItemType Directory | Out-Null }
$outFile = "$outPath\temps.json"
$tempFile = "$outPath\temps.tmp"

while ($true) {
    $temps = @{}
    foreach ($hardware in $computer.Hardware) {
        $hardware.Update()
        foreach ($sensor in $hardware.Sensors) {
            if ($sensor.SensorType -eq 'Temperature') {
                if ($sensor.Name -match 'Package|Core' -and $hardware.HardwareType -match 'Cpu') {
                    if (-not $temps.cpu) { $temps.cpu = $sensor.Value }
                }
                if ($hardware.HardwareType -match 'Gpu') {
                    if (-not $temps.gpu) { $temps.gpu = $sensor.Value }
                }
            }
        }
    }
    
    $temps | ConvertTo-Json -Compress | Out-File -FilePath $tempFile -Encoding ASCII
    Move-Item -Path $tempFile -Destination $outFile -Force
    
    Start-Sleep -Seconds 2
}
