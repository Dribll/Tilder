using System;
using System.Collections.Generic;
using System.IO;
using System.Management;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.RegularExpressions;
using System.Threading;
using Microsoft.Win32.SafeHandles;

namespace TilderNvmeMonitor;

class PhysicalDriveInfo
{
    public int Index { get; set; }
    public string Model { get; set; } = "";
    public string MediaType { get; set; } = "Drive";
    public bool IsNvme { get; set; }
    public int? TempCelsius { get; set; }
}

class Program
{
    const uint IOCTL_STORAGE_QUERY_PROPERTY = 0x002D1400;
    const uint IOCTL_STORAGE_PREDICT_FAILURE = 0x002D1100;
    const uint FILE_SHARE_READ = 1;
    const uint FILE_SHARE_WRITE = 2;
    const uint OPEN_EXISTING = 3;

    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Auto)]
    static extern SafeFileHandle CreateFile(
        string lpFileName,
        uint dwDesiredAccess,
        uint dwShareMode,
        IntPtr lpSecurityAttributes,
        uint dwCreationDisposition,
        uint dwFlagsAndAttributes,
        IntPtr hTemplateFile);

    [DllImport("kernel32.dll", SetLastError = true)]
    static extern bool DeviceIoControl(
        SafeFileHandle hDevice,
        uint dwIoControlCode,
        IntPtr lpInBuffer,
        uint nInBufferSize,
        IntPtr lpOutBuffer,
        uint nOutBufferSize,
        out uint lpBytesReturned,
        IntPtr lpOverlapped);

    static int? QueryNvmeCompositeTemperature(string target)
    {
        try
        {
            using var handle = CreateFile(target, 0, FILE_SHARE_READ | FILE_SHARE_WRITE, IntPtr.Zero, OPEN_EXISTING, 0, IntPtr.Zero);
            if (handle.IsInvalid) return null;

            int totalSize = 8 + 40 + 512;
            byte[] inBuffer = new byte[totalSize];

            // STORAGE_PROPERTY_QUERY
            BitConverter.GetBytes((uint)50).CopyTo(inBuffer, 0); // StorageDeviceProtocolSpecificProperty
            BitConverter.GetBytes((uint)0).CopyTo(inBuffer, 4);  // PropertyStandardQuery

            // STORAGE_PROTOCOL_SPECIFIC_DATA (offset 8)
            BitConverter.GetBytes((uint)3).CopyTo(inBuffer, 8);   // ProtocolType = 3 (ProtocolTypeNvme)
            BitConverter.GetBytes((uint)2).CopyTo(inBuffer, 12);  // DataType = 2 (NVMeDataTypeLogPage)
            BitConverter.GetBytes((uint)2).CopyTo(inBuffer, 16);  // ProtocolDataRequestValue = 2 (NVME_LOG_PAGE_HEALTH_INFO)
            BitConverter.GetBytes((uint)0).CopyTo(inBuffer, 20);  // SubValue = 0
            BitConverter.GetBytes((uint)40).CopyTo(inBuffer, 24); // ProtocolDataOffset = 40
            BitConverter.GetBytes((uint)512).CopyTo(inBuffer, 28);// ProtocolDataLength = 512

            byte[] outBuffer = new byte[totalSize];
            GCHandle inHandle = GCHandle.Alloc(inBuffer, GCHandleType.Pinned);
            GCHandle outHandle = GCHandle.Alloc(outBuffer, GCHandleType.Pinned);
            try
            {
                if (DeviceIoControl(handle, IOCTL_STORAGE_QUERY_PROPERTY,
                    inHandle.AddrOfPinnedObject(), (uint)totalSize,
                    outHandle.AddrOfPinnedObject(), (uint)totalSize,
                    out uint bytesReturned, IntPtr.Zero))
                {
                    uint returnOffset = BitConverter.ToUInt32(outBuffer, 24);
                    int logOffset = 8 + (int)returnOffset;
                    if (logOffset + 512 <= bytesReturned)
                    {
                        // NVMe SMART Log Page 0x02: Bytes 1-2 contain Composite Temperature in Kelvins
                        ushort kelvin = BitConverter.ToUInt16(outBuffer, logOffset + 1);
                        if (kelvin > 200 && kelvin < 420)
                        {
                            return (int)kelvin - 273; // Celsius
                        }
                    }
                }
            }
            finally
            {
                inHandle.Free();
                outHandle.Free();
            }
        }
        catch { }
        return null;
    }

    static int? QuerySataSmartTemperature(string target)
    {
        try
        {
            using var handle = CreateFile(target, 0, FILE_SHARE_READ | FILE_SHARE_WRITE, IntPtr.Zero, OPEN_EXISTING, 0, IntPtr.Zero);
            if (handle.IsInvalid) return null;

            byte[] outBuf = new byte[516];
            GCHandle outHandle = GCHandle.Alloc(outBuf, GCHandleType.Pinned);
            try
            {
                if (DeviceIoControl(handle, IOCTL_STORAGE_PREDICT_FAILURE,
                    IntPtr.Zero, 0,
                    outHandle.AddrOfPinnedObject(), (uint)outBuf.Length,
                    out uint bytesReturned, IntPtr.Zero))
                {
                    int bestTemp = -1;
                    for (int i = 2; i < 362; i += 12)
                    {
                        int idx = 4 + i;
                        if (idx + 12 > outBuf.Length) break;
                        byte id = outBuf[idx];
                        if (id == 0) continue;

                        // Attribute 194 (0xC2) = Temperature Celsius
                        // Attribute 190 (0xBE) = Airflow Temperature
                        // Attribute 231 (0xE7) = SSD Temperature
                        if (id == 194 || id == 190 || id == 231)
                        {
                            byte raw0 = outBuf[idx + 5];
                            int temp = (int)raw0;
                            if (temp > 10 && temp < 100)
                            {
                                bestTemp = temp;
                                if (id == 194) break; // Priority: 194 is definitive
                            }
                        }
                    }
                    if (bestTemp > 0) return bestTemp;
                }
            }
            finally
            {
                outHandle.Free();
            }
        }
        catch { }
        return null;
    }

    static Dictionary<int, PhysicalDriveInfo> ScanPhysicalDrives()
    {
        var result = new Dictionary<int, PhysicalDriveInfo>();

        try
        {
            using var searcher = new ManagementObjectSearcher("SELECT DeviceID, Index, Caption, Model, InterfaceType, MediaType FROM Win32_DiskDrive");
            foreach (ManagementObject mo in searcher.Get())
            {
                int index = -1;
                if (mo["Index"] != null)
                {
                    index = Convert.ToInt32(mo["Index"]);
                }
                else if (mo["DeviceID"] != null)
                {
                    var m = Regex.Match(mo["DeviceID"].ToString() ?? "", @"\d+$");
                    if (m.Success) index = int.Parse(m.Value);
                }

                if (index < 0) continue;

                string model = mo["Model"]?.ToString() ?? mo["Caption"]?.ToString() ?? $"Disk {index}";
                string iface = mo["InterfaceType"]?.ToString() ?? "";
                string mediaType = mo["MediaType"]?.ToString() ?? "";

                var driveInfo = new PhysicalDriveInfo
                {
                    Index = index,
                    Model = model,
                    MediaType = "Drive"
                };

                string target = @"\\.\PhysicalDrive" + index;

                // 1. Try NVMe query
                int? nvmeTemp = QueryNvmeCompositeTemperature(target);
                if (nvmeTemp.HasValue)
                {
                    driveInfo.IsNvme = true;
                    driveInfo.MediaType = "NVMe SSD";
                    driveInfo.TempCelsius = nvmeTemp.Value;
                }
                else
                {
                    // 2. Try SATA SMART query
                    int? sataTemp = QuerySataSmartTemperature(target);
                    if (sataTemp.HasValue)
                    {
                        driveInfo.IsNvme = false;
                        driveInfo.MediaType = (model.Contains("SSD", StringComparison.OrdinalIgnoreCase) || mediaType.Contains("SSD", StringComparison.OrdinalIgnoreCase))
                            ? "SATA SSD" : "HDD";
                        driveInfo.TempCelsius = sataTemp.Value;
                    }
                    else
                    {
                        driveInfo.MediaType = (model.Contains("NVMe", StringComparison.OrdinalIgnoreCase)) ? "NVMe SSD" : "HDD";
                    }
                }

                result[index] = driveInfo;
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[ScanPhysicalDrives WMI Error] {ex.Message}");
        }

        // If WMI failed, probe PhysicalDrive0..3 directly
        if (result.Count == 0)
        {
            for (int i = 0; i < 4; i++)
            {
                string target = @"\\.\PhysicalDrive" + i;
                int? nvme = QueryNvmeCompositeTemperature(target);
                if (nvme.HasValue)
                {
                    result[i] = new PhysicalDriveInfo { Index = i, Model = $"PhysicalDrive{i}", MediaType = "NVMe SSD", IsNvme = true, TempCelsius = nvme.Value };
                    continue;
                }
                int? sata = QuerySataSmartTemperature(target);
                if (sata.HasValue)
                {
                    result[i] = new PhysicalDriveInfo { Index = i, Model = $"PhysicalDrive{i}", MediaType = "HDD", IsNvme = false, TempCelsius = sata.Value };
                }
            }
        }

        return result;
    }

    static Dictionary<string, int> GetLogicalDriveToDiskMap()
    {
        var map = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        try
        {
            using var searcher = new ManagementObjectSearcher("SELECT Antecedent, Dependent FROM Win32_LogicalDiskToPartition");
            foreach (ManagementObject mo in searcher.Get())
            {
                string ant = mo["Antecedent"]?.ToString() ?? "";
                string dep = mo["Dependent"]?.ToString() ?? "";

                var matchDisk = Regex.Match(ant, @"Disk #(\d+)");
                var matchLetter = Regex.Match(dep, @"DeviceID=""([A-Za-z]:)""");

                if (matchDisk.Success && matchLetter.Success)
                {
                    int diskIdx = int.Parse(matchDisk.Groups[1].Value);
                    string letter = matchLetter.Groups[1].Value.ToUpper();
                    map[letter] = diskIdx;
                }
            }
        }
        catch { }
        return map;
    }

    static void Main(string[] args)
    {
        var programData = Environment.GetEnvironmentVariable("ProgramData") ?? @"C:\ProgramData";
        var outDir = Path.Combine(programData, "Tilder");
        Directory.CreateDirectory(outDir);
        var outFile = Path.Combine(outDir, "nvme_temp.json");
        var tmpFile = Path.Combine(outDir, "nvme_temp.tmp");

        bool once = args.Length > 0 && args[0] == "--once";

        do
        {
            var physDrives = ScanPhysicalDrives();
            var letterMap = GetLogicalDriveToDiskMap();

            var drivesOutput = new Dictionary<string, object>();
            int? primaryTemp = null;

            foreach (var drive in DriveInfo.GetDrives())
            {
                if (!drive.IsReady) continue;
                string letter = drive.Name.TrimEnd('\\').ToUpper();

                PhysicalDriveInfo? matchedPhys = null;

                if (letterMap.TryGetValue(letter, out int diskIdx) && physDrives.TryGetValue(diskIdx, out var p))
                {
                    matchedPhys = p;
                }
                else
                {
                    // Fallback heuristics: C: -> NVMe; other drives -> HDD
                    if (letter.Equals("C:", StringComparison.OrdinalIgnoreCase))
                    {
                        foreach (var kvp in physDrives.Values)
                        {
                            if (kvp.IsNvme) { matchedPhys = kvp; break; }
                        }
                    }
                    else
                    {
                        foreach (var kvp in physDrives.Values)
                        {
                            if (!kvp.IsNvme) { matchedPhys = kvp; break; }
                        }
                    }
                }

                if (matchedPhys != null)
                {
                    drivesOutput[letter] = new
                    {
                        mediaType = matchedPhys.MediaType,
                        tempCelsius = matchedPhys.TempCelsius,
                        isNvme = matchedPhys.IsNvme,
                        name = matchedPhys.Model
                    };

                    if (!primaryTemp.HasValue && matchedPhys.TempCelsius.HasValue)
                    {
                        primaryTemp = matchedPhys.TempCelsius;
                    }
                }
            }

            // Fallback for primaryTemp if null
            if (!primaryTemp.HasValue)
            {
                foreach (var p in physDrives.Values)
                {
                    if (p.TempCelsius.HasValue) { primaryTemp = p.TempCelsius; break; }
                }
            }

            var payload = new
            {
                tempCelsius = primaryTemp,
                timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                drives = drivesOutput
            };

            var json = JsonSerializer.Serialize(payload, new JsonSerializerOptions { WriteIndented = false });
            try
            {
                File.WriteAllText(tmpFile, json);
                File.Move(tmpFile, outFile, true);
            }
            catch { }

            if (once)
            {
                Console.WriteLine(JsonSerializer.Serialize(payload, new JsonSerializerOptions { WriteIndented = true }));
                break;
            }

            Thread.Sleep(1000);
        } while (true);
    }
}
