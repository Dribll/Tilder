using System.Diagnostics;
using System.Management;
using System.Text.Json;
using LibreHardwareMonitor.Hardware;

namespace TilderMonitorService;

public class UpdateVisitor : IVisitor
{
    public void VisitComputer(IComputer computer) { computer.Traverse(this); }
    public void VisitHardware(IHardware hardware) { hardware.Update(); foreach (IHardware subHardware in hardware.SubHardware) subHardware.Accept(this); }
    public void VisitSensor(ISensor sensor) { }
    public void VisitParameter(IParameter parameter) { }
}

public class Worker : BackgroundService
{
    private readonly ILogger<Worker> _logger;
    private readonly string _monitorPath;
    private readonly string _tempPath;
    private Computer _computer;
    private UpdateVisitor _visitor;
    private PerformanceCounter? _cpuPerfCounter;
    private double _cpuBaseSpeedGhz = 0;

    public Worker(ILogger<Worker> logger)
    {
        _logger = logger;
        var programData = Environment.GetEnvironmentVariable("ProgramData") ?? @"C:\ProgramData";
        var outDir = Path.Combine(programData, "Tilder");
        Directory.CreateDirectory(outDir);
        _monitorPath = Path.Combine(outDir, "monitor.json");
        _tempPath    = Path.Combine(outDir, "monitor.tmp");
        
        _computer = new Computer {
            IsCpuEnabled = true,
            IsGpuEnabled = true,
            IsMemoryEnabled = true,
            IsMotherboardEnabled = true,
            IsControllerEnabled = true,
            IsNetworkEnabled = true,
            IsStorageEnabled = true
        };
        try { _computer.Open(); } catch {}
        _visitor = new UpdateVisitor();

        // Initialize live CPU clock speed counter (% Processor Performance × base speed = actual GHz)
        try
        {
            _cpuPerfCounter = new PerformanceCounter("Processor Information", "% Processor Performance", "_Total");
            _cpuPerfCounter.NextValue(); // first call always returns 0, discard it
        }
        catch { _cpuPerfCounter = null; }

        // Read base speed from WMI (MHz → GHz)
        try
        {
            using var searcher = new ManagementObjectSearcher("SELECT MaxClockSpeed FROM Win32_Processor");
            foreach (ManagementObject mo in searcher.Get())
            {
                var mhz = Convert.ToDouble(mo["MaxClockSpeed"]);
                if (mhz > 0) { _cpuBaseSpeedGhz = Math.Round(mhz / 1000.0, 2); break; }
            }
        }
        catch { _cpuBaseSpeedGhz = 0; }
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var data = new MonitorData();
            
            try { _computer.Accept(_visitor); } catch {}
            
            CollectLhm(data);
            CollectBattery(data);

            // Live CPU clock speed: base GHz × (% Processor Performance / 100)
            if (_cpuPerfCounter != null && _cpuBaseSpeedGhz > 0)
            {
                try
                {
                    float perfPct = _cpuPerfCounter.NextValue();
                    if (perfPct > 0)
                        data.CpuSpeedGhz = Math.Round(_cpuBaseSpeedGhz * perfPct / 100.0, 2);
                }
                catch { }
            }

            var json = JsonSerializer.Serialize(data, new JsonSerializerOptions { PropertyNamingPolicy = JsonNamingPolicy.CamelCase });
            try
            {
                await File.WriteAllTextAsync(_tempPath, json, stoppingToken);
                File.Move(_tempPath, _monitorPath, overwrite: true);
            }
            catch { }
            await Task.Delay(1000, stoppingToken);
        }
    }

    private void CollectLhm(MonitorData data)
    {
        var fans = new List<FanInfo>();
        var storage = new List<StorageInfo>();
        
        foreach (IHardware hw in _computer.Hardware)
        {
            if (hw.HardwareType == HardwareType.Cpu)
            {
                foreach (ISensor s in hw.Sensors)
                {
                    if (s.SensorType == SensorType.Temperature && s.Name.Contains("Package"))
                        if (s.Value.HasValue) data.CpuTemp = (int)Math.Round(s.Value.Value);
                    
                    if (s.SensorType == SensorType.Load && s.Name.Contains("Total"))
                        if (s.Value.HasValue) data.CpuUsage = (int)Math.Round(s.Value.Value);
                }
            }
            else if (hw.HardwareType == HardwareType.GpuNvidia || hw.HardwareType == HardwareType.GpuAmd)
            {
                data.GpuName = hw.Name;
                foreach (ISensor s in hw.Sensors)
                {
                    if (s.SensorType == SensorType.Temperature && s.Name.Contains("Core"))
                        if (s.Value.HasValue) data.GpuTemp = (int)Math.Round(s.Value.Value);
                        
                    if (s.SensorType == SensorType.Load && s.Name.Contains("Core"))
                        if (s.Value.HasValue) data.GpuUsage = (int)Math.Round(s.Value.Value);
                        
                    if (s.SensorType == SensorType.Fan)
                        if (s.Value.HasValue) fans.Add(new FanInfo { Name = hw.Name + " Fan", Rpm = (int)Math.Round(s.Value.Value), IsPercent = false });
                }
            }
            else if (hw.HardwareType == HardwareType.Motherboard || hw.HardwareType == HardwareType.SuperIO)
            {
                // Sub-hardware for SuperIO
                foreach (IHardware sub in hw.SubHardware)
                {
                    foreach (ISensor s in sub.Sensors)
                    {
                        if (s.SensorType == SensorType.Fan && s.Value.HasValue && s.Value.Value > 0)
                            fans.Add(new FanInfo { Name = s.Name, Rpm = (int)Math.Round(s.Value.Value), IsPercent = false });
                    }
                }
                foreach (ISensor s in hw.Sensors)
                {
                    if (s.SensorType == SensorType.Fan && s.Value.HasValue && s.Value.Value > 0)
                        fans.Add(new FanInfo { Name = s.Name, Rpm = (int)Math.Round(s.Value.Value), IsPercent = false });
                }
            }
            else if (hw.HardwareType == HardwareType.Storage)
            {
                var info = new StorageInfo { Name = hw.Name, MediaType = "Drive" };
                // NVMe drives expose multiple temperature sensors via LHM:
                //   "Temperature"        → Composite temperature (register 0x01) = what Windows Settings shows
                //   "NAND Temperature"   → NAND hot-spot — can be 30-40°C higher, often stuck at 84°C
                // Explicitly prefer the sensor named "Temperature" or "Composite" (index 0).
                // Fall back to minimum value only if no named match is found.
                int? minTemp = null;
                int? compositeTemp = null;
                foreach (ISensor s in hw.Sensors)
                {
                    if (s.SensorType == SensorType.Temperature && s.Value.HasValue)
                    {
                        int val = (int)Math.Round(s.Value.Value);
                        if (s.Name != null &&
                            (s.Name.Equals("Temperature", StringComparison.OrdinalIgnoreCase) ||
                             s.Name.StartsWith("Composite", StringComparison.OrdinalIgnoreCase)))
                        {
                            compositeTemp = val;
                        }
                        if (minTemp == null || val < minTemp)
                            minTemp = val;
                    }
                }
                if (compositeTemp.HasValue) info.TempCelsius = compositeTemp;
                else if (minTemp.HasValue) info.TempCelsius = minTemp;
                storage.Add(info);
            }
        }

        if (fans.Count > 0) data.Fans = fans;
        
        // Also map drives with proper name-based temperature matching
        try
        {
            var existingStorage = new List<StorageInfo>();
            var lhmPool = new List<StorageInfo>(storage); // mutable copy

            foreach (var drive in DriveInfo.GetDrives().Where(d => d.IsReady))
            {
                var info = new StorageInfo
                {
                    Letter  = drive.Name.TrimEnd('\\'),
                    Label   = drive.VolumeLabel,
                    Type    = drive.DriveType.ToString(),
                    TotalGb = Math.Round(drive.TotalSize / 1073741824.0, 1),
                    UsedGb  = Math.Round((drive.TotalSize - drive.AvailableFreeSpace) / 1073741824.0, 1),
                    FreeGb  = Math.Round(drive.AvailableFreeSpace / 1073741824.0, 1),
                };

                // Best-match: find LHM entry whose name most closely matches the drive's label or whose index aligns
                StorageInfo? best = null;
                int bestScore = -1;
                foreach (var lhm in lhmPool.Where(l => l.TempCelsius.HasValue))
                {
                    int score = 0;
                    if (!string.IsNullOrEmpty(drive.VolumeLabel) && lhm.Name != null &&
                        lhm.Name.Contains(drive.VolumeLabel, StringComparison.OrdinalIgnoreCase))
                        score += 10;
                    // Prefer NVMe for the first drive, HDD/SSD for subsequent
                    if (lhm.Name != null && drive.Name.StartsWith("C:", StringComparison.OrdinalIgnoreCase) &&
                        lhm.Name.Contains("nvme", StringComparison.OrdinalIgnoreCase))
                        score += 5;
                    if (score > bestScore) { bestScore = score; best = lhm; }
                }
                // Fallback: take any remaining LHM entry in order
                if (best == null) best = lhmPool.FirstOrDefault(l => l.TempCelsius.HasValue);

                if (best != null)
                {
                    info.TempCelsius = best.TempCelsius;
                    info.Name = best.Name;
                    lhmPool.Remove(best);
                }
                existingStorage.Add(info);
            }
            data.Storage = existingStorage;
        } catch {}
    }

    private void CollectBattery(MonitorData data)
    {
        try
        {
            using var s = new ManagementObjectSearcher("SELECT * FROM Win32_Battery");
            foreach (ManagementObject o in s.Get())
            {
                var pct    = o["EstimatedChargeRemaining"];
                var status = o["BatteryStatus"];
                var mins   = o["EstimatedRunTime"];
                if (pct != null)
                {
                    data.Battery = new BatteryInfo
                    {
                        Percent          = Convert.ToInt32(pct),
                        IsCharging       = status != null && Convert.ToInt32(status) == 2,
                        MinutesRemaining = (mins != null && Convert.ToInt32(mins) < 65535)
                                         ? Convert.ToInt32(mins) : null,
                    };
                }
                break;
            }
        }
        catch { }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        try { _computer?.Close(); } catch {}
        try { _cpuPerfCounter?.Dispose(); } catch {}
        await base.StopAsync(cancellationToken);
    }
}

public class MonitorData
{
    public int?    CpuUsage    { get; set; }
    public int?    CpuTemp     { get; set; }
    public double? CpuSpeedGhz { get; set; }
    public int[]?  CpuCores    { get; set; }
    public int?    GpuUsage { get; set; }
    public int?    GpuTemp  { get; set; }
    public string? GpuName  { get; set; }
    public List<FanInfo>?     Fans    { get; set; }
    public List<StorageInfo>? Storage { get; set; }
    public BatteryInfo?       Battery { get; set; }
}

public class FanInfo
{
    public string Name      { get; set; } = "";
    public int    Rpm       { get; set; }
    public bool   IsPercent { get; set; }
}

public class StorageInfo
{
    public string  Letter    { get; set; } = "";
    public string? Name      { get; set; }
    public string? Label     { get; set; }
    public string? Type      { get; set; }
    public string? MediaType { get; set; }
    public double  TotalGb   { get; set; }
    public double  UsedGb    { get; set; }
    public double  FreeGb    { get; set; }
    public int?    TempCelsius { get; set; }
}

public class BatteryInfo
{
    public int  Percent          { get; set; }
    public bool IsCharging       { get; set; }
    public int? MinutesRemaining { get; set; }
}
