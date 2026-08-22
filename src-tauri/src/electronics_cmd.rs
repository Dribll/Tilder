use std::io::BufRead;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use tauri::{Emitter, Manager};

/// Find the arduino-cli binary. Checks PATH first, then app data dir.
pub fn find_cli_binary(app_handle: &tauri::AppHandle) -> Option<PathBuf> {
    // 1. Check if it's in PATH
    let path_check = Command::new("cmd")
        .args(["/C", "where arduino-cli"])
        .output();

    if let Ok(out) = path_check {
        if out.status.success() {
            let path_str = String::from_utf8_lossy(&out.stdout).trim().to_string();
            let first_line = path_str.lines().next().unwrap_or("").trim().to_string();
            if !first_line.is_empty() {
                return Some(PathBuf::from(first_line));
            }
        }
    }

    // 2. Check app data directory
    if let Ok(data_dir) = app_handle.path().app_data_dir() {
        let cli_dir = data_dir.join("arduino-cli");
        let local_path = cli_dir.join("arduino-cli.exe");
        if local_path.exists() {
            return Some(local_path);
        }
    }

    None
}

/// Returns the path to arduino-cli if found, or an error string.
#[tauri::command]
pub fn get_electronics_cli_path(app_handle: tauri::AppHandle) -> Result<String, String> {
    match find_cli_binary(&app_handle) {
        Some(path) => Ok(path.to_string_lossy().to_string()),
        None => Err("not_found".to_string()),
    }
}

/// Downloads and installs arduino-cli into the app data directory.
#[tauri::command]
pub fn download_electronics_cli(app_handle: tauri::AppHandle) -> Result<String, String> {
    let data_dir = app_handle.path().app_data_dir().map_err(|e| e.to_string())?;
    let cli_dir = data_dir.join("arduino-cli");
    std::fs::create_dir_all(&cli_dir).map_err(|e| e.to_string())?;

    let exe_path = cli_dir.join("arduino-cli.exe");
    let zip_path = cli_dir.join("arduino-cli.zip");

    if exe_path.exists() {
        return Ok(exe_path.to_string_lossy().to_string());
    }

    let download_url = "https://downloads.arduino.cc/arduino-cli/arduino-cli_latest_Windows_64bit.zip";

    let ps_download = format!(
        "Invoke-WebRequest -Uri '{}' -OutFile '{}' -UseBasicParsing",
        download_url,
        zip_path.to_string_lossy()
    );

    let dl_output = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &ps_download])
        .output()
        .map_err(|e| format!("Failed to launch PowerShell: {}", e))?;

    if !dl_output.status.success() {
        return Err(format!(
            "Download failed: {}",
            String::from_utf8_lossy(&dl_output.stderr)
        ));
    }

    let ps_extract = format!(
        "Expand-Archive -Path '{}' -DestinationPath '{}' -Force",
        zip_path.to_string_lossy(),
        cli_dir.to_string_lossy()
    );

    let extract_output = Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &ps_extract])
        .output()
        .map_err(|e| format!("Failed to extract: {}", e))?;

    if !extract_output.status.success() {
        return Err(format!(
            "Extraction failed: {}",
            String::from_utf8_lossy(&extract_output.stderr)
        ));
    }

    let _ = std::fs::remove_file(&zip_path);

    if exe_path.exists() {
        Ok(exe_path.to_string_lossy().to_string())
    } else {
        Err("Extraction succeeded but arduino-cli.exe was not found".to_string())
    }
}

/// Run an arduino-cli command using the found binary (blocking, returns all output).
#[tauri::command]
pub fn run_electronics_cli(app_handle: tauri::AppHandle, args: Vec<String>) -> Result<String, String> {
    let cli_path = find_cli_binary(&app_handle)
        .ok_or_else(|| "arduino-cli not found".to_string())?;

    let output = Command::new(&cli_path)
        .args(&args)
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).to_string())
    }
}

/// Run an arduino-cli command with real-time streaming output via Tauri events.
/// Emits events named "arduino-output" with payload { type: "stdout"|"stderr"|"done"|"error", data: "..." }
#[tauri::command]
pub fn run_electronics_cli_stream(
    app_handle: tauri::AppHandle,
    args: Vec<String>,
    stream_id: String,
) -> Result<(), String> {
    let cli_path = find_cli_binary(&app_handle)
        .ok_or_else(|| "arduino-cli not found".to_string())?;

    let mut child = Command::new(&cli_path)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    let event_name = format!("arduino-stream-{}", stream_id);

    // Spawn stdout thread
    if let Some(stdout) = child.stdout.take() {
        let app = app_handle.clone();
        let ev = event_name.clone();
        std::thread::spawn(move || {
            let reader = std::io::BufReader::new(stdout);
            for line in reader.lines().flatten() {
                let _ = app.emit(&ev, serde_json::json!({
                    "type": "stdout",
                    "data": line
                }));
            }
        });
    }

    // Spawn stderr thread
    if let Some(stderr) = child.stderr.take() {
        let app = app_handle.clone();
        let ev = event_name.clone();
        std::thread::spawn(move || {
            let reader = std::io::BufReader::new(stderr);
            for line in reader.lines().flatten() {
                let _ = app.emit(&ev, serde_json::json!({
                    "type": "stderr",
                    "data": line
                }));
            }
        });
    }

    // Wait for process in a thread and emit done/error
    let ev_done = event_name.clone();
    std::thread::spawn(move || {
        match child.wait() {
            Ok(status) => {
                let code = status.code().unwrap_or(-1);
                let _ = app_handle.emit(&ev_done, serde_json::json!({
                    "type": if code == 0 { "done" } else { "error" },
                    "data": format!("Process exited with code {}", code),
                    "code": code
                }));
            }
            Err(e) => {
                let _ = app_handle.emit(&ev_done, serde_json::json!({
                    "type": "error",
                    "data": e.to_string(),
                    "code": -1
                }));
            }
        }
    });

    Ok(())
}

/// Initialize arduino-cli: update board index and library index.
#[tauri::command]
pub fn electronics_init(app_handle: tauri::AppHandle) -> Result<String, String> {
    let cli_path = find_cli_binary(&app_handle)
        .ok_or_else(|| "arduino-cli not found".to_string())?;

    // Run config init (ignore error if already exists)
    let _ = Command::new(&cli_path)
        .args(["config", "init"])
        .output();

    // Update board index
    let _ = Command::new(&cli_path)
        .args(["core", "update-index"])
        .output();

    // Update library index
    let out = Command::new(&cli_path)
        .args(["lib", "update-index"])
        .output()
        .map_err(|e| e.to_string())?;

    if out.status.success() {
        Ok("Indexes updated".to_string())
    } else {
        Err(String::from_utf8_lossy(&out.stderr).to_string())
    }
}

/// Open serial monitor using arduino-cli monitor (streams data via events).
#[tauri::command]
pub fn serial_monitor_start(
    app_handle: tauri::AppHandle,
    port: String,
    baud: u32,
    stream_id: String,
) -> Result<(), String> {
    let cli_path = find_cli_binary(&app_handle)
        .ok_or_else(|| "arduino-cli not found".to_string())?;

    let mut child = Command::new(&cli_path)
        .args([
            "monitor",
            "-p",
            &port,
            "-c",
            &format!("baudrate={}", baud),
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    let event_name = format!("serial-stream-{}", stream_id);

    if let Some(stdout) = child.stdout.take() {
        let app = app_handle.clone();
        let ev = event_name.clone();
        std::thread::spawn(move || {
            let reader = std::io::BufReader::new(stdout);
            for line in reader.lines().flatten() {
                let _ = app.emit(&ev, serde_json::json!({
                    "type": "data",
                    "data": line
                }));
            }
            let _ = app.emit(&ev, serde_json::json!({ "type": "closed" }));
        });
    }

    Ok(())
}
