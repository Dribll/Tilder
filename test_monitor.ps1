$ErrorActionPreference = 'Continue'
$data = @{}

# CPU Usage
try {
    $c = (Get-Counter '\Processor Information(_Total)\% Processor Utility' -ErrorAction Stop).CounterSamples[0].CookedValue
    $data['cpuUsage'] = [math]::Min(100, [math]::Round($c))
    Write-Host "CPU Usage: $($data['cpuUsage'])%"
} catch {
    Write-Host "CPU Usage (primary) failed: $_"
    try {
        $c = (Get-Counter '\Processor(_Total)\% Processor Time' -ErrorAction Stop).CounterSamples[0].CookedValue
        $data['cpuUsage'] = [math]::Min(100, [math]::Round($c))
        Write-Host "CPU Usage (fallback): $($data['cpuUsage'])%"
    } catch {
        Write-Host "CPU Usage (fallback) also failed: $_"
        $data['cpuUsage'] = -1
    }
}

# CPU Temp - Method 1 (admin only)
try {
    $tz = Get-CimInstance -Namespace 'root/WMI' -ClassName 'MSAcpi_ThermalZoneTemperature' -ErrorAction Stop
    if ($tz) {
        $kelvin = ($tz | Select-Object -First 1).CurrentTemperature
        $celsius = [math]::Round(($kelvin / 10) - 273.15)
        Write-Host "CPU Temp (WMI admin): ${celsius}C"
        if ($celsius -gt 0 -and $celsius -lt 150) { $data['cpuTemp'] = $celsius }
    }
} catch {
    Write-Host "CPU Temp (admin WMI) failed: $_"
}

# CPU Temp - Method 2 (no admin)
if (-not $data.ContainsKey('cpuTemp')) {
    try {
        $tzInfo = Get-CimInstance -Namespace 'root/cimv2' -ClassName 'Win32_PerfFormattedData_Counters_ThermalZoneInformation' -ErrorAction Stop
        if ($tzInfo) {
            $maxKelvin = 0
            foreach ($zone in $tzInfo) {
                Write-Host "  Zone: $($zone.Name) Temp: $($zone.Temperature)K ($([math]::Round($zone.Temperature - 273.15))C)"
                if ($zone.Temperature -gt $maxKelvin) { $maxKelvin = $zone.Temperature }
            }
            if ($maxKelvin -gt 0) {
                $celsius = [math]::Round($maxKelvin - 273.15)
                Write-Host "CPU Temp (ThermalZone perf, no admin): ${celsius}C"
                if ($celsius -gt 0 -and $celsius -lt 150) { $data['cpuTemp'] = $celsius }
            }
        }
    } catch {
        Write-Host "CPU Temp (ThermalZone perf) failed: $_"
    }
}

# GPU Usage
try {
    $samples = (Get-Counter '\GPU Engine(*)\Utilization Percentage' -ErrorAction Stop).CounterSamples
    $maxUtil = 0
    foreach ($s in $samples) {
        if ($s.CookedValue -gt $maxUtil) { $maxUtil = $s.CookedValue }
    }
    $data['gpuUsage'] = [math]::Min(100, [math]::Round($maxUtil))
    Write-Host "GPU Usage: $($data['gpuUsage'])%"
} catch {
    Write-Host "GPU Usage failed: $_"
    $data['gpuUsage'] = -1
}

# GPU Temp
$nvidiaSmi = "$env:ProgramFiles\NVIDIA Corporation\NVSMI\nvidia-smi.exe"
if (Test-Path $nvidiaSmi) {
    try {
        $out = & $nvidiaSmi --query-gpu=temperature.gpu --format=csv,noheader 2>$null
        if ($out -and $out.Trim() -match '^\d+$') {
            $data['gpuTemp'] = [int]$out.Trim()
            Write-Host "GPU Temp (nvidia-smi): $($data['gpuTemp'])C"
        }
    } catch {
        Write-Host "GPU Temp (nvidia-smi) failed: $_"
    }
} else {
    Write-Host "nvidia-smi not found at $nvidiaSmi"
}

# Write results
$json = $data | ConvertTo-Json -Compress
Write-Host "`nFinal JSON: $json"

# Write to monitor.json
$outDir = "$env:ProgramData\Tilder"
if (-not (Test-Path $outDir)) { New-Item -Path $outDir -ItemType Directory -Force | Out-Null }
$outFile = Join-Path $outDir 'monitor.json'
$tempFile = Join-Path $outDir 'monitor.tmp'
[System.IO.File]::WriteAllText($tempFile, $json, [System.Text.Encoding]::UTF8)
try {
    [System.IO.File]::Move($tempFile, $outFile, $true)
} catch {
    if (Test-Path $outFile) { Remove-Item $outFile -Force }
    Move-Item -Path $tempFile -Destination $outFile -Force
}
Write-Host "Written to $outFile"
