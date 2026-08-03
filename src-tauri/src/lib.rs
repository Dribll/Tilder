#![allow(non_snake_case)]

use std::env;
use std::{
    error::Error,
    fs,
    net::{TcpListener, TcpStream},
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::atomic::AtomicU64,
    sync::Mutex,
    thread,
    time::{Duration, Instant},
};

mod jumplist;
pub mod search;

use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use rfd::FileDialog;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};

#[derive(Default)]
struct BackendState {
    child: Mutex<Option<Child>>,
}

#[derive(Default)]
struct DesktopRuntimeState {
    api_base_url: Mutex<Option<String>>,
}

static WINDOW_COUNTER: AtomicU64 = AtomicU64::new(2);
const DEFAULT_BACKEND_PORT: u16 = 33210;

// ---------------------------------------------------------------------------
// Backend lifecycle helpers
// ---------------------------------------------------------------------------

fn find_available_port(start: u16, tries: u16) -> Result<u16, String> {
    for port in start..start + tries {
        if TcpListener::bind(("127.0.0.1", port)).is_ok() {
            return Ok(port);
        }
    }
    Err("No available port found".into())
}

fn spawn_backend(app: &AppHandle, port: u16) -> Result<(Child, Vec<String>), Box<dyn Error>> {
    let resource_dir = normalize_for_child_process(app.path().resource_dir()?);
    let app_root = normalize_for_child_process(resource_dir.join("app"));
    let server_entry = app_root.join("server.js");

    let mut log_lines = Vec::new();
    log_lines.push(format!("resource_dir={}", resource_dir.display()));
    log_lines.push(format!("app_root={}", app_root.display()));
    log_lines.push(format!("server_entry={}", server_entry.display()));
    log_lines.push(format!("port={port}"));

    let child = Command::new("node")
        .arg(server_entry.to_string_lossy().as_ref())
        .current_dir(&app_root)
        .env("PORT", port.to_string())
        .env("TILDER_RESOURCE_DIR", resource_dir.to_string_lossy().as_ref())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| {
            log_lines.push(format!("spawn_error={e}"));
            format!("Failed to spawn backend: {e}")
        })?;

    Ok((child, log_lines))
}

fn normalize_for_child_process(path: PathBuf) -> PathBuf {
    #[cfg(target_os = "windows")]
    {
        let s = path.to_string_lossy();
        if let Some(stripped) = s.strip_prefix("\\\\?\\") {
            return PathBuf::from(stripped);
        }
    }
    path
}

fn create_main_window(
    app: &AppHandle,
    window_url: WebviewUrl,
    initialization_script: Option<String>,
) -> Result<(), Box<dyn Error>> {
    let mut builder = WebviewWindowBuilder::new(app, "main", window_url)
        .title("Tilder")
        .inner_size(1440.0, 920.0)
        .min_inner_size(1024.0, 720.0)
        .resizable(true)
        .transparent(true)
        .decorations(false)
        .visible(true);

    if let Some(script) = initialization_script {
        builder = builder.initialization_script(&script);
    }

    builder.build()?;

    Ok(())
}

fn create_window_with_label(
    app: &AppHandle,
    label: String,
    window_url: WebviewUrl,
    initialization_script: Option<String>,
) -> Result<(), Box<dyn Error>> {
    let mut builder = WebviewWindowBuilder::new(app, label, window_url)
        .title("Tilder")
        .inner_size(1440.0, 920.0)
        .min_inner_size(1024.0, 720.0)
        .resizable(true)
        .transparent(true)
        .decorations(false)
        .visible(true);

    if let Some(script) = initialization_script {
        builder = builder.initialization_script(&script);
    }

    builder.build()?;

    Ok(())
}

fn wait_for_backend(port: u16, timeout: Duration) -> Result<(), String> {
    let start = Instant::now();
    while start.elapsed() < timeout {
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            return Ok(());
        }
        thread::sleep(Duration::from_millis(100));
    }
    Err("Timeout waiting for backend".into())
}

fn stop_backend(app: &AppHandle) {
    if let Some(state) = app.try_state::<BackendState>() {
        let mut lock = state.child.lock().unwrap();
        if let Some(mut child) = lock.take() {
            let _ = child.kill();
        }
    }
}

fn write_startup_log(path: &Path, lines: &[String]) -> std::io::Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, lines.join("\n"))
}

// ---------------------------------------------------------------------------
// Data structures
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone)]
pub struct DesktopTreeNode {
    pub name: String,
    pub path: String,
    #[serde(rename = "type")]
    pub node_type: String,
    #[serde(rename = "isDir")]
    pub is_dir: bool,
    pub size: u64,
    pub children: Option<Vec<DesktopTreeNode>>,
}

#[derive(Serialize, Deserialize)]
pub struct DesktopPathSelection {
    pub path: String,
    pub name: String,
}

// ---------------------------------------------------------------------------
// Tauri commands — External URL / Windows
// ---------------------------------------------------------------------------

#[tauri::command]
fn open_external_url(app: AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    
    let target = url.trim();
    if target.is_empty() {
        return Err("Missing OAuth URL.".into());
    }

    app.opener().open_url(target, None::<&str>).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn open_new_window(app: AppHandle) -> Result<(), String> {
    let runtime_state = app.state::<DesktopRuntimeState>();
    let api_base_url = runtime_state
        .api_base_url
        .lock()
        .unwrap()
        .clone()
        .unwrap_or_default();

    let counter = WINDOW_COUNTER.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    let label = format!("tilder-{counter}");

    let init_script = if !api_base_url.is_empty() {
        Some(format!(
            "window.__TILDER_API_BASE_URL__ = '{}'; window.__TILDER_RUNTIME_MODE__ = 'desktop-local';",
            api_base_url
        ))
    } else {
        None
    };

    create_window_with_label(
        &app,
        label,
        WebviewUrl::App("index.html".into()),
        init_script,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn list_system_fonts() -> Result<Vec<String>, String> {
    #[cfg(target_os = "windows")]
    {
        let output = Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "[System.Reflection.Assembly]::LoadWithPartialName('System.Drawing') | Out-Null; (New-Object System.Drawing.Text.InstalledFontCollection).Families | ForEach-Object { $_.Name }",
            ])
            .output()
            .map_err(|e| e.to_string())?;
        let text = String::from_utf8_lossy(&output.stdout);
        let fonts: Vec<String> = text
            .lines()
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty())
            .collect();
        return Ok(fonts);
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(vec![])
    }
}

// ---------------------------------------------------------------------------
// File / Folder dialogs
// ---------------------------------------------------------------------------

#[tauri::command]
fn desktop_pick_folder() -> Result<Option<DesktopPathSelection>, String> {
    Ok(FileDialog::new().pick_folder().map(|path| {
        let fallback_name = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        DesktopPathSelection {
            path: path.to_string_lossy().into_owned(),
            name: fallback_name,
        }
    }))
}

#[tauri::command]
fn desktop_pick_file() -> Result<Option<DesktopPathSelection>, String> {
    Ok(FileDialog::new().pick_file().map(|path| {
        let fallback_name = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();
        DesktopPathSelection {
            path: path.to_string_lossy().into_owned(),
            name: fallback_name,
        }
    }))
}

#[tauri::command]
fn desktop_pick_save_path(suggestedName: Option<String>) -> Result<Option<String>, String> {
    let mut dialog = FileDialog::new();
    if let Some(name) = suggestedName {
        dialog = dialog.set_file_name(&name);
    }
    Ok(dialog
        .save_file()
        .map(|p| p.to_string_lossy().into_owned()))
}

// ---------------------------------------------------------------------------
// File tree / read / write
// ---------------------------------------------------------------------------

fn read_tree_recursive(dir: &Path, recursive: bool) -> Result<Vec<DesktopTreeNode>, String> {
    let mut nodes = Vec::new();
    let entries = fs::read_dir(dir).map_err(|e| e.to_string())?;

    let mut items: Vec<_> = entries.filter_map(|e| e.ok()).collect();
    items.sort_by_key(|e| {
        let is_dir = e.file_type().map_or(false, |t| t.is_dir());
        (!is_dir, e.file_name().to_ascii_lowercase())
    });

    for entry in items {
        let meta = entry.metadata().map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        let path_str = entry.path().to_string_lossy().to_string();
        let is_dir = meta.is_dir();

        // Skip hidden / build directories
        if name.starts_with('.') || name == "node_modules" || name == "target" {
            continue;
        }

        let children = if is_dir && recursive {
            Some(read_tree_recursive(&entry.path(), true).unwrap_or_default())
        } else if is_dir {
            Some(Vec::new())
        } else {
            None
        };

        nodes.push(DesktopTreeNode {
            name,
            path: path_str,
            node_type: if is_dir { "folder".to_string() } else { "file".to_string() },
            is_dir,
            size: meta.len(),
            children,
        });
    }

    Ok(nodes)
}

#[tauri::command]
fn desktop_read_tree(rootPath: String, recursive: bool) -> Result<Vec<DesktopTreeNode>, String> {
    let target = Path::new(rootPath.trim());
    if !target.exists() {
        return Err(format!("Path does not exist: {}", rootPath));
    }
    read_tree_recursive(target, recursive)
}

#[tauri::command]
fn desktop_read_file(filePath: String) -> Result<String, String> {
    let path = Path::new(filePath.trim());
    if !path.exists() {
        return Err(format!("File not found: {filePath}"));
    }
    // Try reading as text first, fall back to base64 for binary
    match fs::read_to_string(path) {
        Ok(content) => Ok(content),
        Err(_) => {
            let bytes = fs::read(path).map_err(|e| e.to_string())?;
            Ok(format!("data:application/octet-stream;base64,{}", BASE64_STANDARD.encode(&bytes)))
        }
    }
}

#[tauri::command]
fn desktop_write_file(filePath: String, content: String, isBinary: bool) -> Result<(), String> {
    let path = Path::new(filePath.trim());
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    if isBinary {
        let bytes = BASE64_STANDARD
            .decode(&content)
            .map_err(|e| e.to_string())?;
        fs::write(path, bytes).map_err(|e| e.to_string())
    } else {
        fs::write(path, content).map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn desktop_write_workspace(rootPath: String, entries: Vec<serde_json::Value>) -> Result<(), String> {
    let root = Path::new(rootPath.trim());
    for entry in entries {
        let rel_path = entry["path"].as_str().unwrap_or("");
        let content = entry["content"].as_str().unwrap_or("");
        let is_dir = entry["isDirectory"].as_bool().unwrap_or(false);
        let full_path = root.join(rel_path);

        if is_dir {
            fs::create_dir_all(&full_path).map_err(|e| e.to_string())?;
        } else {
            if let Some(parent) = full_path.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            fs::write(&full_path, content).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
fn desktop_create_file(filePath: String) -> Result<(), String> {
    let path = Path::new(filePath.trim());
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(path, "").map_err(|e| e.to_string())
}

#[tauri::command]
fn desktop_create_folder(folderPath: String) -> Result<(), String> {
    fs::create_dir_all(folderPath.trim()).map_err(|e| e.to_string())
}

#[tauri::command]
fn desktop_delete_path(targetPath: String, recursive: bool) -> Result<(), String> {
    let path = PathBuf::from(targetPath.trim());
    let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
    if metadata.is_dir() {
        if recursive {
            fs::remove_dir_all(&path).map_err(|e| e.to_string())
        } else {
            fs::remove_dir(&path).map_err(|e| e.to_string())
        }
    } else {
        fs::remove_file(&path).map_err(|e| e.to_string())
    }
}

fn copy_path_recursive(src: &Path, dst: &Path) -> Result<(), String> {
    if src.is_dir() {
        fs::create_dir_all(dst).map_err(|e| e.to_string())?;
        for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let child_src = entry.path();
            let child_dst = dst.join(entry.file_name());
            copy_path_recursive(&child_src, &child_dst)?;
        }
        Ok(())
    } else {
        if let Some(parent) = dst.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::copy(src, dst).map_err(|e| e.to_string())?;
        Ok(())
    }
}

#[tauri::command]
fn desktop_copy_path(sourcePath: String, destinationPath: String) -> Result<(), String> {
    copy_path_recursive(Path::new(sourcePath.trim()), Path::new(destinationPath.trim()))
}

#[tauri::command]
fn desktop_move_path(sourcePath: String, destinationPath: String) -> Result<(), String> {
    let source = PathBuf::from(sourcePath.trim());
    let destination = PathBuf::from(destinationPath.trim());
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    // Try rename first (fast, same filesystem)
    match fs::rename(&source, &destination) {
        Ok(()) => Ok(()),
        // Cross-device: copy then remove
        Err(_) => {
            copy_path_recursive(&source, &destination)?;
            if source.is_dir() {
                fs::remove_dir_all(&source).map_err(|e| e.to_string())
            } else {
                fs::remove_file(&source).map_err(|e| e.to_string())
            }
        }
    }
}

#[tauri::command]
fn desktop_read_dir(path: String) -> Result<Vec<DesktopTreeNode>, String> {
    let target = Path::new(path.trim());
    let mut children = Vec::new();
    let entries = fs::read_dir(target).map_err(|e| e.to_string())?;

    let mut items: Vec<_> = entries.filter_map(|e| e.ok()).collect();
    items.sort_by_key(|e| {
        let is_dir = e.file_type().map_or(false, |t| t.is_dir());
        (!is_dir, e.file_name().to_ascii_lowercase())
    });

    for entry in items {
        let is_dir = entry.file_type().map_or(false, |t| t.is_dir());
        let meta = entry.metadata().ok();
        let size = meta.map(|m| m.len()).unwrap_or(0);
        let name = entry.file_name().to_string_lossy().to_string();
        let entry_path = entry.path().to_string_lossy().to_string();
        children.push(DesktopTreeNode {
            name,
            path: entry_path,
            node_type: if is_dir { "folder".to_string() } else { "file".to_string() },
            is_dir,
            size,
            children: if is_dir { Some(vec![]) } else { None },
        });
    }
    Ok(children)
}

/// Alias for `desktop_read_dir` — the Explorer component invokes this name.
#[tauri::command]
fn list_directory(path: String) -> Result<Vec<DesktopTreeNode>, String> {
    desktop_read_dir(path)
}

#[tauri::command]
fn reveal_in_explorer(path: String) -> Result<(), String> {
    let target = path.trim();
    #[cfg(target_os = "windows")]
    {
        Command::new("explorer")
            .args(["/select,", target])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .args(["-R", target])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(Path::new(target).parent().unwrap_or(Path::new(target)))
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// System stats
// ---------------------------------------------------------------------------

#[tauri::command]
fn get_system_stats() -> Result<serde_json::Value, String> {
    use sysinfo::System;

    let mut sys = System::new_all();
    sys.refresh_all();
    // sysinfo needs two measurement points to calculate CPU usage;
    // without a brief sleep between refreshes, global_cpu_usage() returns 0.
    thread::sleep(Duration::from_millis(200));
    sys.refresh_all();

    let total_mem = sys.total_memory(); // bytes
    let used_mem = sys.used_memory();   // bytes
    let ram_mb = (used_mem as f64 / 1_048_576.0).round() as u64;
    let cpu_count = sys.cpus().len();
    let global_cpu = sys.global_cpu_usage();

    Ok(serde_json::json!({
        "cpu": global_cpu.round() as u32,
        "ram": ram_mb,
        "totalMemory": total_mem,
        "usedMemory": used_mem,
        "cpuCount": cpu_count,
        "cpuUsage": global_cpu,
        "os": System::name().unwrap_or_default(),
        "osVersion": System::os_version().unwrap_or_default(),
        "hostname": System::host_name().unwrap_or_default(),
    }))
}

// ---------------------------------------------------------------------------
// Debug / process management
// ---------------------------------------------------------------------------

#[tauri::command]
async fn spawn_debug_process(
    app: tauri::AppHandle,
    path: String,
    runtime: String,
    args: Vec<String>,
    customExecutable: Option<String>,
) -> Result<serde_json::Value, String> {
    if runtime == "java" {
        // For Java: compile first, then run with JDWP debug agent
        let file_path = Path::new(&path);
        let dir = file_path.parent().unwrap_or(Path::new("."));
        let class_name = file_path
            .file_stem()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        // Compile
        let compile = Command::new("javac")
            .arg(&path)
            .current_dir(dir)
            .output()
            .map_err(|e| format!("Failed to compile Java: {e}"))?;

        if !compile.status.success() {
            let stderr = String::from_utf8_lossy(&compile.stderr);
            return Err(format!("Java compilation failed: {stderr}"));
        }

        let port = find_available_port(5005, 20)?;

        let mut child = Command::new("java")
            .arg(format!(
                "-agentlib:jdwp=transport=dt_socket,server=y,suspend=y,address=*:{port}"
            ))
            .arg(&class_name)
            .args(&args)
            .current_dir(dir)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn java process: {e}"))?;

        let pid = child.id();

        if let Some(stdout) = child.stdout.take() {
            let app_stdout = app.clone();
            thread::spawn(move || {
                use std::io::{BufRead, BufReader};
                let reader = BufReader::new(stdout);
                for line in reader.lines() {
                    if let Ok(l) = line {
                        let _ = app_stdout.emit("debug-stdout", l);
                    }
                }
            });
        }

        if let Some(stderr) = child.stderr.take() {
            let app_stderr = app.clone();
            thread::spawn(move || {
                use std::io::{BufRead, BufReader};
                let reader = BufReader::new(stderr);
                for line in reader.lines() {
                    if let Ok(l) = line {
                        let _ = app_stderr.emit("debug-stderr", l);
                    }
                }
            });
        }

        return Ok(serde_json::json!({
            "port": port,
            "pid": pid,
            "runtime": "java"
        }));
    }

    // Non-Java runtimes (Node, Python, etc.)
    let port = find_available_port(9229, 20)?;

    let executable = customExecutable.unwrap_or_else(|| runtime.clone());

    let mut command = Command::new(&executable);

    if runtime == "node" {
        command.arg(format!("--inspect-brk={port}"));
    }

    let mut child = command
        .arg(&path)
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn {runtime} process: {e}"))?;

    let pid = child.id();

    if let Some(stdout) = child.stdout.take() {
        let app_stdout = app.clone();
        thread::spawn(move || {
            use std::io::{BufRead, BufReader};
            let reader = BufReader::new(stdout);
            for line in reader.lines() {
                if let Ok(l) = line {
                    let _ = app_stdout.emit("debug-stdout", l);
                }
            }
        });
    }

    if let Some(stderr) = child.stderr.take() {
        let app_stderr = app.clone();
        thread::spawn(move || {
            use std::io::{BufRead, BufReader};
            let reader = BufReader::new(stderr);
            for line in reader.lines() {
                if let Ok(l) = line {
                    let _ = app_stderr.emit("debug-stderr", l);
                }
            }
        });
    }

    Ok(serde_json::json!({
        "port": port,
        "pid": pid,
        "runtime": runtime
    }))
}

#[tauri::command]
async fn kill_process(pid: u32) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        Command::new("taskkill")
            .args(["/F", "/PID", &pid.to_string()])
            .output()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        Command::new("kill")
            .arg("-9")
            .arg(pid.to_string())
            .output()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Runtime detection
// ---------------------------------------------------------------------------

#[tauri::command]
fn desktop_detect_runtimes() -> Result<serde_json::Value, String> {
    let mut runtimes = serde_json::Map::new();

    // Node.js
    if let Ok(output) = Command::new("node").arg("--version").output() {
        if output.status.success() {
            let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
            runtimes.insert("node".to_string(), serde_json::json!({ "version": version }));
        }
    }

    // Python
    for cmd in &["python3", "python"] {
        if let Ok(output) = Command::new(cmd).arg("--version").output() {
            if output.status.success() {
                let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
                runtimes.insert("python".to_string(), serde_json::json!({ "version": version, "command": cmd }));
                break;
            }
        }
    }

    // Java
    if let Ok(output) = Command::new("java").arg("-version").output() {
        // Java outputs version to stderr
        let version = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if !version.is_empty() {
            runtimes.insert("java".to_string(), serde_json::json!({ "version": version }));
        }
    }

    // Go
    if let Ok(output) = Command::new("go").arg("version").output() {
        if output.status.success() {
            let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
            runtimes.insert("go".to_string(), serde_json::json!({ "version": version }));
        }
    }

    // Rust
    if let Ok(output) = Command::new("rustc").arg("--version").output() {
        if output.status.success() {
            let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
            runtimes.insert("rust".to_string(), serde_json::json!({ "version": version }));
        }
    }

    Ok(serde_json::Value::Object(runtimes))
}

// ---------------------------------------------------------------------------
// Execute arbitrary command (terminal)
// ---------------------------------------------------------------------------

#[tauri::command]
fn desktop_execute_command(
    command: String,
    args: Vec<String>,
    cwd: Option<String>,
) -> Result<serde_json::Value, String> {
    let mut cmd = Command::new(&command);
    cmd.args(&args);
    if let Some(dir) = &cwd {
        cmd.current_dir(dir);
    }

    let output = cmd.output().map_err(|e| e.to_string())?;

    Ok(serde_json::json!({
        "stdout": String::from_utf8_lossy(&output.stdout).to_string(),
        "stderr": String::from_utf8_lossy(&output.stderr).to_string(),
        "exitCode": output.status.code().unwrap_or(-1),
    }))
}

// ---------------------------------------------------------------------------
// Window controls
// ---------------------------------------------------------------------------

#[tauri::command]
fn window_minimize(window: tauri::Window) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
fn window_maximize(window: tauri::Window) -> Result<(), String> {
    let is_max = window.is_maximized().unwrap_or(false);
    if is_max {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn window_close(window: tauri::Window) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
fn enable_glass_theme(window: tauri::Window) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use window_vibrancy::{apply_vibrancy, NSVisualEffectMaterial};
        apply_vibrancy(&window, NSVisualEffectMaterial::Sidebar, None, None)
            .map_err(|e| e.to_string())?;
    }

    #[cfg(target_os = "windows")]
    {
        use window_vibrancy::apply_mica;
        // Apply Mica effect on Windows 11 (requires transparent window)
        // This subtly tints the background based on the desktop wallpaper
        // without making the window transparent to other apps.
        let _ = apply_mica(&window, Some(true));
    }

    Ok(())
}

#[tauri::command]
fn disable_glass_theme(window: tauri::Window) -> Result<(), String> {
    use window_vibrancy::clear_vibrancy;
    clear_vibrancy(&window).map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------------------------
// App entry point
// ---------------------------------------------------------------------------

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            open_external_url,
            open_new_window,
            list_system_fonts,
            desktop_pick_folder,
            desktop_pick_file,
            desktop_pick_save_path,
            desktop_read_tree,
            desktop_read_file,
            desktop_write_file,
            desktop_write_workspace,
            desktop_create_file,
            desktop_create_folder,
            desktop_delete_path,
            desktop_copy_path,
            desktop_move_path,
            get_system_stats,
            spawn_debug_process,
            kill_process,
            desktop_read_dir,
            list_directory,
            search::tilder_search_workspace,
            reveal_in_explorer,
            desktop_detect_runtimes,
            desktop_execute_command,
            window_minimize,
            window_maximize,
            window_close,
            enable_glass_theme,
            disable_glass_theme,
            jumplist::desktop_update_jump_list
        ])
        .manage(BackendState::default())
        .manage(DesktopRuntimeState::default())
        .setup(|app| {
            let port = find_available_port(DEFAULT_BACKEND_PORT, 20)?;
            let (child, startup_log_lines) = spawn_backend(app.handle(), port)?;
            let api_base_url = format!("http://localhost:{port}");
            let resource_dir = normalize_for_child_process(app.path().resource_dir()?);
            let startup_log_path = resource_dir.join("startup.log");

            {
                let state = app.state::<BackendState>();
                *state.child.lock().unwrap() = Some(child);
            }
            {
                let state = app.state::<DesktopRuntimeState>();
                *state.api_base_url.lock().unwrap() = Some(api_base_url.clone());
            }

            // Build initialization script from CLI args
            let mut init_script = format!(
                "window.__TILDER_API_BASE_URL__ = '{}'; window.__TILDER_RUNTIME_MODE__ = 'desktop-local';",
                api_base_url
            );

            let args: Vec<String> = env::args().collect();
            let mut i = 1;
            while i < args.len() {
                if args[i] == "--file" && i + 1 < args.len() {
                    let file_path = &args[i + 1];
                    let escaped = file_path.replace("\\", "\\\\");
                    init_script.push_str(&format!(
                        "window.__TILDER_STARTUP_FILE__ = '{}';",
                        escaped
                    ));
                    i += 1;
                } else if args[i] == "--workspace" && i + 1 < args.len() {
                    let ws_path = &args[i + 1];
                    let escaped = ws_path.replace("\\", "\\\\");
                    init_script.push_str(&format!(
                        "window.__TILDER_STARTUP_WORKSPACE__ = '{}';",
                        escaped
                    ));
                    i += 1;
                }
                i += 1;
            }

            create_main_window(
                app.handle(),
                WebviewUrl::App("index.html".into()),
                Some(init_script),
            )?;

            thread::spawn(move || {
                let backend_ready = wait_for_backend(port, Duration::from_secs(20));
                let mut log_lines = startup_log_lines;
                log_lines.push(match backend_ready {
                    Ok(()) => "backend_ready=true".to_string(),
                    Err(error) => format!("backend_ready=false error={error}"),
                });
                let _ = write_startup_log(&startup_log_path, &log_lines);
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building the Tauri application")
        .run(|app_handle, event| {
            if matches!(event, RunEvent::Exit | RunEvent::ExitRequested { .. }) {
                stop_backend(app_handle);
            }
        });
}
