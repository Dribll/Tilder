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

# Setup LibreHardwareMonitorLib


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

    # ── CPU Temperature (No Admin Required) ──────────
    try {
        $tz = Get-CimInstance -ClassName 'Win32_PerfFormattedData_Counters_ThermalZoneInformation' -ErrorAction Stop
        if ($tz) {
            $kelvin = ($tz | Select-Object -First 1).Temperature
            $celsius = [math]::Round($kelvin - 273.15)
            if ($celsius -gt 0 -and $celsius -lt 150) {
                $data['cpuTemp'] = $celsius
            }
        }
    } catch {}

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

    # ── Write atomically ──────────────────────────────────────
    try {
        $json = $data | ConvertTo-Json -Compress
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
