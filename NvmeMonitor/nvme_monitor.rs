// NvmeMonitor: Native Windows Hardware Storage & Temperature Monitor
// Real-time detection of NVMe SSD, SATA SSD, and HDD via Win32 kernel IOCTLs.
// Zero dependencies, unprivileged user mode (dwDesiredAccess = 0).

use std::collections::HashMap;
use std::convert::TryInto;
use std::path::PathBuf;
use std::thread::sleep;
use std::time::Duration;

#[link(name = "kernel32")]
extern "system" {
    fn CreateFileW(
        lpFileName: *const u16,
        dwDesiredAccess: u32,
        dwShareMode: u32,
        lpSecurityAttributes: *mut std::ffi::c_void,
        dwCreationDisposition: u32,
        dwFlagsAndAttributes: u32,
        hTemplateFile: *mut std::ffi::c_void,
    ) -> *mut std::ffi::c_void;

    fn DeviceIoControl(
        hDevice: *mut std::ffi::c_void,
        dwIoControlCode: u32,
        lpInBuffer: *const u8,
        nInBufferSize: u32,
        lpOutBuffer: *mut u8,
        nOutBufferSize: u32,
        lpBytesReturned: *mut u32,
        lpOverlapped: *mut std::ffi::c_void,
    ) -> i32;

    fn CloseHandle(hObject: *mut std::ffi::c_void) -> i32;
    fn GetLogicalDrives() -> u32;

    fn OpenFileMappingW(dwDesiredAccess: u32, bInheritHandle: i32, lpName: *const u16) -> *mut std::ffi::c_void;
    fn MapViewOfFile(hEngine: *mut std::ffi::c_void, dwDesiredAccess: u32, dwFileOffsetHigh: u32, dwFileOffsetLow: u32, dwNumberOfBytesToMap: usize) -> *mut u8;
    fn UnmapViewOfFile(lpBaseAddress: *const std::ffi::c_void) -> i32;
}

#[repr(C, packed)]
struct CoreTempSharedData {
    ui_load: [u32; 256],
    ui_tj_max: [u32; 128],
    ui_core_cnt: u32,
    ui_cpu_cnt: u32,
    f_temp: [f32; 256],
    f_vid: f32,
    f_cpu_speed: f32,
    f_fsb_speed: f32,
    f_multiplier: f32,
    s_cpu_name: [u8; 100],
    uc_fahrenheit: u8,
    uc_delta_to_tj_max: u8,
}

fn query_coretemp_cpu() -> Option<i32> {
    let names = ["CoreTempMappingObject\0", "Global\\CoreTempMappingObject\0", "Local\\CoreTempMappingObject\0"];
    for name in names {
        let wide: Vec<u16> = name.encode_utf16().collect();
        unsafe {
            let h = OpenFileMappingW(0x0004, 0, wide.as_ptr());
            if !h.is_null() {
                let ptr = MapViewOfFile(h, 0x0004, 0, 0, std::mem::size_of::<CoreTempSharedData>());
                if !ptr.is_null() {
                    let data = &*(ptr as *const CoreTempSharedData);
                    let core_cnt = std::ptr::read_unaligned(std::ptr::addr_of!(data.ui_core_cnt));
                    let mut max_temp = 0.0f32;
                    if core_cnt > 0 && core_cnt <= 64 {
                        for i in 0..core_cnt as usize {
                            let t = std::ptr::read_unaligned(std::ptr::addr_of!(data.f_temp[i]));
                            if t > max_temp { max_temp = t; }
                        }
                    }
                    UnmapViewOfFile(ptr as *const _);
                    CloseHandle(h);
                    if max_temp > 10.0 && max_temp < 125.0 {
                        return Some(max_temp.round() as i32);
                    }
                } else {
                    CloseHandle(h);
                }
            }
        }
    }
    None
}

const INVALID_HANDLE_VALUE: *mut std::ffi::c_void = -1isize as *mut std::ffi::c_void;
const IOCTL_STORAGE_QUERY_PROPERTY: u32 = 0x002D1400;
const IOCTL_STORAGE_GET_DEVICE_NUMBER: u32 = 0x002D1080;
const FILE_SHARE_READ: u32 = 1;
const FILE_SHARE_WRITE: u32 = 2;
const OPEN_EXISTING: u32 = 3;

fn to_wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

struct PhysicalDiskInfo {
    model: String,
    bus_type: u8,
    incurs_seek_penalty: bool,
    media_type: String,
    disk_temp: Option<i32>,
}

fn query_ata_smart_temp_on_handle(handle: *mut std::ffi::c_void) -> Option<i32> {
    const IOCTL_STORAGE_PREDICT_FAILURE: u32 = 0x002D1100;
    let mut out_buf = vec![0u8; 516];
    let mut bytes_ret = 0u32;
    let ok = unsafe {
        DeviceIoControl(
            handle,
            IOCTL_STORAGE_PREDICT_FAILURE,
            std::ptr::null(),
            0,
            out_buf.as_mut_ptr(),
            516,
            &mut bytes_ret,
            std::ptr::null_mut(),
        )
    };
    if ok != 0 && bytes_ret >= 516 {
        let data = &out_buf[4..];
        for i in 0..30 {
            let entry_offset = 2 + i * 12;
            if entry_offset + 12 > data.len() { break; }
            let entry = &data[entry_offset..entry_offset + 12];
            let id = entry[0];
            if id == 194 || id == 190 {
                let temp = entry[5] as i32;
                if temp > 0 && temp < 100 {
                    return Some(temp);
                }
            }
        }
    }
    None
}

fn query_nvme_temp_on_handle(handle: *mut std::ffi::c_void) -> Option<i32> {
    let total_size = 8 + 40 + 512;
    let mut in_buffer = vec![0u8; total_size];

    // STORAGE_PROPERTY_QUERY: PropertyId = 50 (StorageDeviceProtocolSpecificProperty)
    in_buffer[0..4].copy_from_slice(&50u32.to_ne_bytes());
    in_buffer[4..8].copy_from_slice(&0u32.to_ne_bytes());

    // STORAGE_PROTOCOL_SPECIFIC_DATA:
    in_buffer[8..12].copy_from_slice(&3u32.to_ne_bytes());  // ProtocolTypeNvme = 3
    in_buffer[12..16].copy_from_slice(&2u32.to_ne_bytes()); // NVMeDataTypeLogPage = 2
    in_buffer[16..20].copy_from_slice(&2u32.to_ne_bytes()); // NVME_LOG_PAGE_HEALTH_INFO = 2
    in_buffer[20..24].copy_from_slice(&0u32.to_ne_bytes());
    in_buffer[24..28].copy_from_slice(&40u32.to_ne_bytes()); // Offset = 40
    in_buffer[28..32].copy_from_slice(&512u32.to_ne_bytes());// Length = 512

    let mut out_buffer = vec![0u8; total_size];
    let mut bytes_returned = 0u32;

    let success = unsafe {
        DeviceIoControl(
            handle,
            IOCTL_STORAGE_QUERY_PROPERTY,
            in_buffer.as_ptr(),
            total_size as u32,
            out_buffer.as_mut_ptr(),
            total_size as u32,
            &mut bytes_returned,
            std::ptr::null_mut(),
        )
    };

    if success != 0 && bytes_returned >= 560 {
        let return_offset = u32::from_ne_bytes(out_buffer[24..28].try_into().unwrap()) as usize;
        let log_offset = 8 + return_offset;
        if log_offset + 512 <= bytes_returned as usize {
            // NVMe SMART Log Page 0x02: Bytes 1..2 contain composite temperature in Kelvin
            let kelvin = u16::from_le_bytes(out_buffer[log_offset + 1..log_offset + 3].try_into().unwrap());
            if kelvin > 200 && kelvin < 420 {
                return Some(kelvin as i32 - 273);
            }
        }
    }

    None
}

fn inspect_physical_disk(disk_num: u32) -> Option<PhysicalDiskInfo> {
    let target = format!(r"\\.\PhysicalDrive{}", disk_num);
    let wide = to_wide(&target);
    let handle = unsafe {
        CreateFileW(
            wide.as_ptr(),
            0,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            std::ptr::null_mut(),
            OPEN_EXISTING,
            0,
            std::ptr::null_mut(),
        )
    };

    if handle == INVALID_HANDLE_VALUE || handle.is_null() {
        return None;
    }

    // 1. Query StorageDeviceProperty (0)
    let mut desc_buf = vec![0u8; 1024];
    let mut in_query = [0u8; 12];
    in_query[0..4].copy_from_slice(&0u32.to_ne_bytes()); // PropertyId = 0
    let mut bytes_ret = 0u32;
    let mut bus_type = 0u8;
    let mut model = String::new();

    let ok = unsafe {
        DeviceIoControl(
            handle,
            IOCTL_STORAGE_QUERY_PROPERTY,
            in_query.as_ptr(),
            12,
            desc_buf.as_mut_ptr(),
            1024,
            &mut bytes_ret,
            std::ptr::null_mut(),
        )
    };

    if ok != 0 && bytes_ret >= 32 {
        bus_type = desc_buf[28];
        let prod_offset = i32::from_ne_bytes(desc_buf[16..20].try_into().unwrap()) as usize;
        if prod_offset > 0 && prod_offset < 1024 {
            let mut end = prod_offset;
            while end < 1024 && desc_buf[end] != 0 {
                end += 1;
            }
            if let Ok(m) = std::str::from_utf8(&desc_buf[prod_offset..end]) {
                model = m.trim().to_string();
            }
        }
    }

    // 2. Query StorageDeviceSeekPenaltyProperty (7)
    let mut seek_in = [0u8; 12];
    seek_in[0..4].copy_from_slice(&7u32.to_ne_bytes()); // PropertyId = 7
    let mut seek_out = [0u8; 16];
    let mut seek_ret = 0u32;
    let mut incurs_seek_penalty = true;

    let seek_ok = unsafe {
        DeviceIoControl(
            handle,
            IOCTL_STORAGE_QUERY_PROPERTY,
            seek_in.as_ptr(),
            12,
            seek_out.as_mut_ptr(),
            16,
            &mut seek_ret,
            std::ptr::null_mut(),
        )
    };

    if seek_ok != 0 && seek_ret >= 9 {
        incurs_seek_penalty = seek_out[8] != 0;
    }

    // 3. Query temperature: try NVMe first, then ATA SMART (Attribute 194/190)
    let nvme_temp = query_nvme_temp_on_handle(handle);
    let disk_temp = if nvme_temp.is_some() {
        nvme_temp
    } else {
        query_ata_smart_temp_on_handle(handle)
    };

    unsafe { CloseHandle(handle) };

    let is_nvme = bus_type == 17 || nvme_temp.is_some();
    let media_type = if is_nvme {
        "NVMe SSD".to_string()
    } else if !incurs_seek_penalty {
        if bus_type == 7 { "USB SSD".to_string() } else { "SATA SSD".to_string() }
    } else {
        if bus_type == 7 { "USB HDD".to_string() } else { "HDD".to_string() }
    };

    Some(PhysicalDiskInfo {
        model,
        bus_type,
        incurs_seek_penalty,
        media_type,
        disk_temp,
    })
}

fn get_volume_disk_number(letter: char) -> Option<u32> {
    let target = format!(r"\\.\{}:", letter);
    let wide = to_wide(&target);
    let handle = unsafe {
        CreateFileW(
            wide.as_ptr(),
            0,
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            std::ptr::null_mut(),
            OPEN_EXISTING,
            0,
            std::ptr::null_mut(),
        )
    };

    if handle == INVALID_HANDLE_VALUE || handle.is_null() {
        return None;
    }

    let mut out_buf = [0u8; 12];
    let mut bytes_ret = 0u32;
    let ok = unsafe {
        DeviceIoControl(
            handle,
            IOCTL_STORAGE_GET_DEVICE_NUMBER,
            std::ptr::null(),
            0,
            out_buf.as_mut_ptr(),
            12,
            &mut bytes_ret,
            std::ptr::null_mut(),
        )
    };

    unsafe { CloseHandle(handle) };

    if ok != 0 && bytes_ret >= 8 {
        let disk_num = u32::from_ne_bytes(out_buf[4..8].try_into().unwrap());
        return Some(disk_num);
    }

    None
}

fn scan_all_drives() -> (Option<i32>, HashMap<String, (String, Option<i32>, bool)>) {
    let mut physical_disks = HashMap::new();
    let mut primary_nvme_temp = None;

    for disk_num in 0..8 {
        if let Some(info) = inspect_physical_disk(disk_num) {
            if primary_nvme_temp.is_none() && info.disk_temp.is_some() && info.media_type.contains("NVMe") {
                primary_nvme_temp = info.disk_temp;
            }
            physical_disks.insert(disk_num, info);
        }
    }

    let mut volume_map = HashMap::new();
    let drive_bits = unsafe { GetLogicalDrives() };

    for i in 0..26 {
        if (drive_bits & (1 << i)) != 0 {
            let letter = (b'A' + i) as char;
            if let Some(disk_num) = get_volume_disk_number(letter) {
                if let Some(disk_info) = physical_disks.get(&disk_num) {
                    let key = format!("{}:", letter);
                    let is_nvme = disk_info.media_type.contains("NVMe");
                    volume_map.insert(key, (disk_info.media_type.clone(), disk_info.disk_temp, is_nvme));
                }
            }
        }
    }

    (primary_nvme_temp, volume_map)
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let once = args.len() > 1 && args[1] == "--once";

    let program_data = std::env::var("ProgramData").unwrap_or_else(|_| r"C:\ProgramData".to_string());
    let mut out_dir = PathBuf::from(program_data);
    out_dir.push("Tilder");
    let _ = std::fs::create_dir_all(&out_dir);

    let out_file = out_dir.join("nvme_temp.json");
    let tmp_file = out_dir.join("nvme_temp.tmp");

    loop {
        let (primary_temp, drive_map) = scan_all_drives();
        let cpu_temp = query_coretemp_cpu();
        let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis();

        let mut drives_json = String::new();
        for (letter, (media_type, temp, is_nvme)) in &drive_map {
            if !drives_json.is_empty() {
                drives_json.push(',');
            }
            let temp_str = match temp {
                Some(t) => t.to_string(),
                None => "null".to_string(),
            };
            drives_json.push_str(&format!(
                r#""{}":{{"mediaType":"{}","tempCelsius":{},"isNvme":{}}}"#,
                letter, media_type, temp_str, is_nvme
            ));
        }

        let primary_temp_str = match primary_temp {
            Some(t) => t.to_string(),
            None => "null".to_string(),
        };

        let cpu_temp_str = match cpu_temp {
            Some(t) => t.to_string(),
            None => "null".to_string(),
        };

        let json = format!(
            r#"{{"tempCelsius":{},"cpuTemp":{},"timestamp":{},"drives":{{{}}}}}"#,
            primary_temp_str, cpu_temp_str, now, drives_json
        );

        let _ = std::fs::write(&tmp_file, &json);
        let _ = std::fs::rename(&tmp_file, &out_file);

        if once {
            println!("{}", json);
            break;
        }

        sleep(Duration::from_millis(1000));
    }
}
