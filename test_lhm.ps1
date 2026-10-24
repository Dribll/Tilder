Add-Type -Path "D:\Tilder - Copy\desktop-app\LibreHardwareMonitorLib.dll"
$c = New-Object LibreHardwareMonitor.Hardware.Computer
$c.IsStorageEnabled = $true
$c.Open()
foreach ($h in $c.Hardware) {
    Write-Host "Hardware: $($h.Name) ($($h.HardwareType))"
    $h.Update()
    foreach ($s in $h.Sensors) {
        Write-Host "   Sensor: $($s.Name) | Type: $($s.SensorType) | Value: $($s.Value) | Identifier: $($s.Identifier)"
    }
}
$c.Close()
