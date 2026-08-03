$ErrorActionPreference = 'SilentlyContinue'
$dllPath = "$PSScriptRoot\LibreHardwareMonitorLib.dll"
if (-not (Test-Path $dllPath)) { exit 0 }
Add-Type -Path $dllPath
$computer = New-Object LibreHardwareMonitor.Hardware.Computer
$computer.IsCpuEnabled = $true
$computer.Open()
$temps = @{}
foreach ($hardware in $computer.Hardware) {
    $hardware.Update()
    foreach ($sensor in $hardware.Sensors) {
        if ($sensor.SensorType -eq 'Temperature' -and $sensor.Name -match 'Package|Core') {
            if (-not $temps.cpu) { $temps.cpu = $sensor.Value }
        }
    }
}
$computer.Close()
$temps | ConvertTo-Json -Compress
