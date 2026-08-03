using System.Text.Json;
using LibreHardwareMonitor.Hardware;
using System.Diagnostics;

namespace TilderMonitorService;

public class Worker : BackgroundService
{
    private readonly ILogger<Worker> _logger;
    private readonly Computer _computer;
    private readonly string _monitorPath;
    private readonly string _tempPath;
    private PerformanceCounter? _cpuCounter;

    public Worker(ILogger<Worker> logger)
    {
        _logger = logger;
        
        // Initialize LibreHardwareMonitor
        _computer = new Computer
        {
            IsCpuEnabled = true,
            IsGpuEnabled = true,
            IsMemoryEnabled = false,
            IsMotherboardEnabled = false,
            IsControllerEnabled = false,
            IsNetworkEnabled = false,
            IsStorageEnabled = false
        };
        
        // Extract embedded Ring0 drivers from LibreHardwareMonitorLib assembly if not already present on disk.
        // This is required because single-file publish prevents the library from finding its assembly folder.
        try
        {
            var assembly = typeof(Computer).Assembly;
            var resourceNames = assembly.GetManifestResourceNames();
            foreach (var resourceName in resourceNames)
            {
                if (resourceName.Contains("Ring0", StringComparison.OrdinalIgnoreCase))
                {
                    string fileName = "";
                    if (resourceName.EndsWith("Ring0_x64.sys", StringComparison.OrdinalIgnoreCase))
                    {
                        fileName = "WinRing0x64.sys";
                    }
                    else if (resourceName.EndsWith("Ring0.sys", StringComparison.OrdinalIgnoreCase))
                    {
                        fileName = "WinRing0.sys";
                    }
                    else if (resourceName.EndsWith("Ring0.dll", StringComparison.OrdinalIgnoreCase))
                    {
                        fileName = "WinRing0.dll";
                    }
                    else
                    {
                        if (resourceName.Contains("x64") && resourceName.EndsWith(".sys"))
                        {
                            fileName = "WinRing0x64.sys";
                        }
                        else if (resourceName.EndsWith(".dll"))
                        {
                            fileName = "WinRing0.dll";
                        }
                        else if (resourceName.EndsWith(".sys"))
                        {
                            fileName = "WinRing0.sys";
                        }
                    }

                    if (!string.IsNullOrEmpty(fileName))
                    {
                        var destPath = Path.Combine(AppContext.BaseDirectory, fileName);
                        if (!File.Exists(destPath))
                        {
                            using var stream = assembly.GetManifestResourceStream(resourceName);
                            if (stream != null)
                            {
                                using var destStream = File.Create(destPath);
                                stream.CopyTo(destStream);
                                _logger.LogInformation("Extracted native driver resource {Resource} to {Path}", resourceName, destPath);
                            }
                        }
                    }
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to extract native driver resources from LibreHardwareMonitorLib");
        }

        try
        {
            _computer.Open();
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to open hardware monitor");
        }

        var programData = Environment.GetEnvironmentVariable("ProgramData") ?? @"C:\ProgramData";
        var outDir = Path.Combine(programData, "Tilder");
        if (!Directory.Exists(outDir))
        {
            Directory.CreateDirectory(outDir);
        }
        
        _monitorPath = Path.Combine(outDir, "monitor.json");
        _tempPath = Path.Combine(outDir, "monitor.tmp");

        // Initialize Performance Counter for CPU Usage to match Task Manager
        try
        {
            _cpuCounter = new PerformanceCounter("Processor Information", "% Processor Time", "_Total");
            _cpuCounter.NextValue();
        }
        catch
        {
            try
            {
                _cpuCounter = new PerformanceCounter("Processor", "% Processor Time", "_Total");
                _cpuCounter.NextValue();
            }
            catch (Exception ex)
            {
                try
                {
                    _cpuCounter = new PerformanceCounter("Processor Information", "% Processor Utility", "_Total");
                    _cpuCounter.NextValue();
                }
                catch (Exception ex2)
                {
                    _logger.LogError(ex2, "Failed to initialize CPU performance counter");
                    _cpuCounter = null;
                }
            }
        }
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var data = new MonitorData();
                var debugLines = new List<string>();

                foreach (var hardware in _computer.Hardware)
                {
                    hardware.Update();
                    debugLines.Add($"Hardware: {hardware.Name} ({hardware.HardwareType})");
                    
                    if (hardware.HardwareType == HardwareType.Cpu)
                    {
                        foreach (var sensor in hardware.Sensors)
                        {
                            var val = sensor.Value.GetValueOrDefault();
                            debugLines.Add($"  Sensor: {sensor.Name} ({sensor.SensorType}) = {val}");

                            if (sensor.SensorType == SensorType.Load && sensor.Name == "CPU Total")
                            {
                                data.CpuUsage = (int)Math.Round(val);
                            }
                            if (sensor.SensorType == SensorType.Temperature)
                            {
                                int tempVal = (int)Math.Round(val);
                                if (tempVal > 0)
                                {
                                    string name = sensor.Name.ToLowerInvariant();
                                    if (name.Contains("package") || name.Contains("max") || name.Contains("tctl") || name.Contains("tdie") || name.Contains("average"))
                                    {
                                        data.CpuTemp = tempVal;
                                    }
                                    else if (data.CpuTemp == null && (name.Contains("core") || name.Contains("cpu")))
                                    {
                                        data.CpuTemp = tempVal;
                                    }
                                }
                            }
                        }
                    }
                    else if (hardware.HardwareType == HardwareType.GpuNvidia || hardware.HardwareType == HardwareType.GpuAmd || hardware.HardwareType == HardwareType.GpuIntel)
                    {
                        foreach (var sensor in hardware.Sensors)
                        {
                            var val = sensor.Value.GetValueOrDefault();
                            debugLines.Add($"  Sensor: {sensor.Name} ({sensor.SensorType}) = {val}");

                            if (sensor.SensorType == SensorType.Load)
                            {
                                int loadVal = (int)Math.Round(val);
                                string name = sensor.Name.ToLowerInvariant();
                                if (sensor.Name == "GPU Core" || name.Contains("gpu load") || name.Contains("gpu utilization"))
                                {
                                    data.GpuUsage = loadVal;
                                }
                                else if (data.GpuUsage == null && (name.Contains("core") || name.Contains("utilization")) && !name.Contains("memory") && !name.Contains("bus"))
                                {
                                    data.GpuUsage = loadVal;
                                }
                            }
                            if (sensor.SensorType == SensorType.Temperature)
                            {
                                int tempVal = (int)Math.Round(val);
                                string name = sensor.Name.ToLowerInvariant();
                                if (sensor.Name == "GPU Core" || name.Contains("gpu temp") || name.Contains("gpu temperature"))
                                {
                                    data.GpuTemp = tempVal;
                                }
                                else if (data.GpuTemp == null && (name.Contains("core") || name.Contains("gpu") || name.Contains("temp")) && !name.Contains("memory"))
                                {
                                    data.GpuTemp = tempVal;
                                }
                            }
                        }
                    }
                }

                // Fallback: If CPU temp is still null, look for ANY temperature sensor on the CPU
                if (data.CpuTemp == null)
                {
                    foreach (var hardware in _computer.Hardware)
                    {
                        if (hardware.HardwareType == HardwareType.Cpu)
                        {
                            foreach (var sensor in hardware.Sensors)
                            {
                                if (sensor.SensorType == SensorType.Temperature && sensor.Value.HasValue)
                                {
                                    int tempVal = (int)Math.Round(sensor.Value.Value);
                                    if (tempVal > 0)
                                    {
                                        data.CpuTemp = tempVal;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }

                // Fallback: If GPU temp is still null, look for ANY temperature sensor on the GPU
                if (data.GpuTemp == null)
                {
                    foreach (var hardware in _computer.Hardware)
                    {
                        if (hardware.HardwareType == HardwareType.GpuNvidia || hardware.HardwareType == HardwareType.GpuAmd || hardware.HardwareType == HardwareType.GpuIntel)
                        {
                            foreach (var sensor in hardware.Sensors)
                            {
                                if (sensor.SensorType == SensorType.Temperature && sensor.Value.HasValue)
                                {
                                    int tempVal = (int)Math.Round(sensor.Value.Value);
                                    if (tempVal > 0)
                                    {
                                        data.GpuTemp = tempVal;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }

                // Override CPU Usage with Performance Counter if available (matches Task Manager perfectly)
                if (_cpuCounter != null)
                {
                    try
                    {
                        var counterVal = _cpuCounter.NextValue();
                        data.CpuUsage = (int)Math.Round(Math.Clamp(counterVal, 0, 100));
                        debugLines.Add($"Override: CPU Usage from Performance Counter = {data.CpuUsage}");
                    }
                    catch (Exception ex)
                    {
                        _logger.LogError(ex, "Failed to read CPU performance counter");
                    }
                }

                // Write the diagnostic sensors log file so we can troubleshoot if any sensor is missing
                var debugLogPath = Path.Combine(Path.GetDirectoryName(_monitorPath) ?? @"C:\ProgramData\Tilder", "sensors_debug.log");
                await File.WriteAllLinesAsync(debugLogPath, debugLines, stoppingToken);

                // Use camelCase serialization
                var options = new JsonSerializerOptions
                {
                    PropertyNamingPolicy = JsonNamingPolicy.CamelCase
                };
                var json = JsonSerializer.Serialize(data, options);
                await File.WriteAllTextAsync(_tempPath, json, stoppingToken);
                File.Move(_tempPath, _monitorPath, true);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error fetching or writing monitor data");
            }

            await Task.Delay(2000, stoppingToken);
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        _computer.Close();
        await base.StopAsync(cancellationToken);
    }
}

public class MonitorData
{
    public int? CpuUsage { get; set; }
    public int? CpuTemp { get; set; }
    public int? GpuUsage { get; set; }
    public int? GpuTemp { get; set; }
}
