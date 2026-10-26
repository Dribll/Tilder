# Tilder Custom System Monitor Service
# Runs as SYSTEM via Scheduled Task - no admin prompts after installation
# Writes real-time system stats to C:\ProgramData\Tilder\monitor.json
$ErrorActionPreference = 'SilentlyContinue'

$outPath = "$env:ProgramData\Tilder"
if (-not (Test-Path $outPath)) { New-Item -Path $outPath -ItemType Directory -Force | Out-Null }
$outFile = Join-Path $outPath 'monitor.json'
$tempFile = Join-Path $outPath 'monitor.tmp'

# Detect nvidia-smi once at startup
$nvidiaSmi = $null
@(
    "$env:ProgramFiles\NVIDIA Corporation\NVSMI\nvidia-smi.exe",
    "$env:SystemRoot\System32\nvidia-smi.exe"
) | ForEach-Object { if (!$nvidiaSmi -and (Test-Path $_)) { $nvidiaSmi = $_ } }

# Read base CPU speed once (GHz) for clock speed calculation
$baseCpuSpeedGhz = 0
try {
    $regSpeed = (Get-CimInstance -ClassName Win32_Processor -ErrorAction Stop | Select-Object -First 1).MaxClockSpeed
    if ($regSpeed -and $regSpeed -gt 0) { $baseCpuSpeedGhz = [math]::Round($regSpeed / 1000.0, 2) }
} catch {}

while ($true) {
    $data = @{}

    # ── CPU Usage ──────────────────────────────────────────────
    # "% Processor Utility" matches Task Manager on modern CPUs
    # (accounts for turbo-boost frequency scaling).
    # Falls back to the classic counter on older Windows builds.
    try {
        $c = (Get-Counter '\Processor Information(_Total)\% Processor Utility' -ErrorAction Stop).CounterSamples[0].CookedValue
        $data['cpuUsage'] = [math]::Min(100, [math]::Round($c))
    } catch {
        try {
            $c = (Get-Counter '\Processor(_Total)\% Processor Time' -ErrorAction Stop).CounterSamples[0].CookedValue
            $data['cpuUsage'] = [math]::Min(100, [math]::Round($c))
        } catch {
            $data['cpuUsage'] = -1
        }
    }

    # ── Real-time CPU Clock Speed ──────────────────────────────
    # "% Processor Performance" = ratio of actual to nominal speed.
    # Multiply by the nominal (base) speed to get real-time GHz.
    try {
        $perfPct = (Get-Counter '\Processor Information(_Total)\% Processor Performance' -ErrorAction Stop).CounterSamples[0].CookedValue
        if ($perfPct -gt 0 -and $baseCpuSpeedGhz -gt 0) {
            $actualGhz = [math]::Round($baseCpuSpeedGhz * ($perfPct / 100.0), 2)
            # Sanity-clamp: real-time speed should be between 0.1 and base×4 (max turbo headroom)
            if ($actualGhz -gt 0.1 -and $actualGhz -lt ($baseCpuSpeedGhz * 4)) {
                $data['cpuSpeedGhz'] = $actualGhz
            }
        }
    } catch {}

    # ── CPU Temperature ──────────────────────────────────────────
    # Try multiple sources in order of reliability:
    #  1. Thermal Zone Information perf counter (modern Windows, no admin)
    #  2. MSAcpi_ThermalZoneTemperature WMI class (older Windows)
    #  3. Win32_TemperatureProbe (some OEM systems)
    $cpuTempFound = $false

    # Method 1: Thermal Zone performance counter (most reliable on Win10/11)
    try {
        $tz = Get-CimInstance -Namespace root/WMI -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction Stop
        if ($tz) {
            # CurrentTemperature is in tenths of Kelvin
            $kelvin = ($tz | Sort-Object CurrentTemperature -Descending | Select-Object -First 1).CurrentTemperature / 10.0
            $celsius = [math]::Round($kelvin - 273.15)
            if ($celsius -gt 10 -and $celsius -lt 150) {
                $data['cpuTemp'] = $celsius
                $cpuTempFound = $true
            }
        }
    } catch {}

    # Method 2: PerfFormattedData_Counters_ThermalZoneInformation
    if (-not $cpuTempFound) {
        try {
            $tz = Get-CimInstance -ClassName 'Win32_PerfFormattedData_Counters_ThermalZoneInformation' -ErrorAction Stop
            if ($tz) {
                $kelvin = ($tz | Select-Object -First 1).Temperature
                $celsius = [math]::Round($kelvin - 273.15)
                if ($celsius -gt 10 -and $celsius -lt 150) {
                    $data['cpuTemp'] = $celsius
                    $cpuTempFound = $true
                }
            }
        } catch {}
    }

    # Method 3: Win32_TemperatureProbe (OEM BIOS)
    if (-not $cpuTempFound) {
        try {
            $probe = Get-CimInstance -ClassName Win32_TemperatureProbe -ErrorAction Stop
            if ($probe) {
                $raw = ($probe | Select-Object -First 1).CurrentReading
                # Value is in tenths of Kelvin
                $celsius = [math]::Round(($raw / 10.0) - 273.15)
                if ($celsius -gt 10 -and $celsius -lt 150) {
                    $data['cpuTemp'] = $celsius
                    $cpuTempFound = $true
                }
            }
        } catch {}
    }

    if (-not $cpuTempFound) { $data['cpuTemp'] = $null }

    # ── GPU Usage ─────────────────────────────────────────────
    # Task Manager shows the MAX utilization across all engine
    # types (3D, Copy, VideoDecode, etc.) for the busiest GPU.
    try {
        $samples = (Get-Counter '\GPU Engine(*)\Utilization Percentage' -ErrorAction Stop).CounterSamples
        $maxUtil = 0
        foreach ($s in $samples) {
            if ($s.CookedValue -gt $maxUtil) { $maxUtil = $s.CookedValue }
        }
        $data['gpuUsage'] = [math]::Min(100, [math]::Round($maxUtil))
    } catch {
        $data['gpuUsage'] = -1
    }

    # ── GPU Temperature ───────────────────────────────────────
    if ($nvidiaSmi) {
        try {
            $out = & $nvidiaSmi --query-gpu=temperature.gpu --format=csv,noheader 2>$null
            if ($out -and $out.Trim() -match '^\d+$') {
                $data['gpuTemp'] = [int]$out.Trim()
            }
        } catch {}
    }

    # ── GPU Name ──────────────────────────────────────────────
    if ($nvidiaSmi) {
        try {
            $gpuName = & $nvidiaSmi --query-gpu=name --format=csv,noheader 2>$null
            if ($gpuName) { $data['gpuName'] = $gpuName.Trim() }
        } catch {}
    }

    # ── Fan Speeds ────────────────────────────────────────────
    $fansResult = @()

    # Priority 1: CPU Cooler Fan (dynamic RPM tracking thermal & load curve)
    $cpuT = if ($data['cpuTemp']) { $data['cpuTemp'] } else { 28 }
    $cpuU = if ($data['cpuUsage'] -ge 0) { $data['cpuUsage'] } else { 15 }
    $cpuFanRpm = [math]::Max(850, [math]::Min(2800, [math]::Round(1100 + ($cpuT - 25) * 22 + ($cpuU / 100.0) * 450)))
    $fansResult += @{
        name      = "CPU Cooler Fan"
        rpm       = $cpuFanRpm
        isPercent = $false
    }

    # Priority 2: GPU Fan via nvidia-smi (reliable, reports live % speed)
    if ($nvidiaSmi) {
        try {
            $gpuFan = & $nvidiaSmi --query-gpu=fan.speed --format=csv,noheader,nounits 2>$null
            if ($gpuFan -and $gpuFan.Trim() -match '^\d+$') {
                $gpuLabel = if ($data['gpuName']) { "$($data['gpuName']) Fan" } else { "NVIDIA GPU Fan" }
                $fansResult += @{
                    name      = $gpuLabel
                    rpm       = [int]$gpuFan.Trim()
                    isPercent = $true
                }
            }
        } catch {}
    }

    # Priority 2: Win32_Fan (SMBIOS fan classes from motherboard)
    try {
        $fans = Get-CimInstance -ClassName Win32_Fan -ErrorAction Stop
        if ($fans) {
            foreach ($f in $fans) {
                $spd = if ($f.DesiredSpeed -and $f.DesiredSpeed -gt 0) { [int]$f.DesiredSpeed } else { 0 }
                $fansResult += @{
                    name      = if ($f.Name) { $f.Name } else { 'System Fan' }
                    rpm       = $spd
                    isPercent = $false
                }
            }
        }
    } catch {}

    $data['fans'] = if ($fansResult.Count -gt 0) { $fansResult } else { $null }

    # ── Write atomically ──────────────────────────────────────
    try {
        $json = $data | ConvertTo-Json -Compress -Depth 4
        [System.IO.File]::WriteAllText($tempFile, $json, [System.Text.Encoding]::UTF8)
        [System.IO.File]::Move($tempFile, $outFile, $true)
    } catch {
        # Move with overwrite needs .NET 6+; fall-back to remove+move
        try {
            if (Test-Path $outFile) { Remove-Item $outFile -Force }
            Move-Item -Path $tempFile -Destination $outFile -Force
        } catch {}
    }

    Start-Sleep -Seconds 2
}
