using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Threading;
using Microsoft.Win32.SafeHandles;

namespace TilderNvmeMonitor;

class Program
{
    const uint IOCTL_STORAGE_QUERY_PROPERTY = 0x002D1400;
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
                        // NVMe SMART Log Page 0x02:
                        // Bytes 1-2 contain the real-time Composite Temperature in Kelvins
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

    static int? GetCurrentNvmeTemp()
    {
        // Try known physical drives first, then logical drive letters
        string[] candidates = { @"\\.\PhysicalDrive1", @"\\.\C:", @"\\.\PhysicalDrive0", @"\\.\PhysicalDrive2" };
        foreach (var candidate in candidates)
        {
            var temp = QueryNvmeCompositeTemperature(candidate);
            if (temp.HasValue) return temp.Value;
        }
        return null;
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
            int? temp = GetCurrentNvmeTemp();
            if (temp.HasValue)
            {
                var payload = new
                {
                    tempCelsius = temp.Value,
                    timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                };
                var json = JsonSerializer.Serialize(payload);
                try
                {
                    File.WriteAllText(tmpFile, json);
                    File.Move(tmpFile, outFile, true);
                }
                catch { }

                if (once)
                {
                    Console.WriteLine(json);
                    break;
                }
            }
            else if (once)
            {
                Console.WriteLine("{\"tempCelsius\":null}");
                break;
            }

            Thread.Sleep(1000);
        } while (true);
    }
}
