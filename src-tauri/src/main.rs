// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// --- Standard Library Imports ---
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::Command;

// --- Platform-specific imports for process creation ---
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;


// --- Crate Imports ---
use futures_util::StreamExt;
use serde::Serialize;
use sysinfo::{System};
use tauri::{command, Manager, Window};

// --- Error Handling ---
// A custom error type to simplify mapping various errors to a String
type Result<T, E = String> = std::result::Result<T, E>;

// --- Helper Functions ---

/// Helper to get the path to the BambooClaw configuration directory.
/// Typically ~/.bambooclaw/
fn get_config_dir() -> Result<PathBuf> {
    dirs::home_dir()
        .map(|path| path.join(".bambooclaw"))
        .ok_or_else(|| "Could not find home directory.".to_string())
}

/// Helper to get the full path to the BambooClaw configuration file.
/// Typically ~/.bambooclaw/config.toml
fn get_config_path() -> Result<PathBuf> {
    get_config_dir().map(|path| path.join("config.toml"))
}

/// Ensures the configuration directory (~/.bambooclaw) exists, creating it if necessary.
fn ensure_config_dir_exists() -> Result<()> {
    let config_dir = get_config_dir()?;
    if !config_dir.exists() {
        fs::create_dir_all(&config_dir).map_err(|e| format!("Failed to create config directory: {}", e))?;
    }
    Ok(())
}


// --- Tauri Commands ---

/// Returns the current operating system platform.
/// "windows", "macos", or "linux"
#[command]
fn get_platform() -> String {
    // std::env::consts::OS provides the canonical lowercase name for the OS.
    std::env::consts::OS.to_string()
}

/// Executes a generic shell command and returns the combined stdout and stderr.
/// This is a synchronous, blocking command.
#[command]
fn run_shell_command(command: String, args: Vec<String>) -> Result<String> {
    // System call to execute a command with arguments
    let output = Command::new(&command)
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to execute command '{}': {}", command, e))?;

    // Combine stdout and stderr for a complete output log
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let combined_output = format!("{}\n{}", stdout, stderr).trim().to_string();

    if output.status.success() {
        Ok(combined_output)
    } else {
        Err(format!(
            "Command '{} {}' failed with exit code {:?}:\n{}",
            command,
            args.join(" "),
            output.status.code(),
            combined_output
        ))
    }
}

/// A specialized command to run the 'bambooclaw' binary with given arguments.
/// Runs in a non-blocking way from the perspective of the webview.
#[command]
async fn run_bambooclaw(args: Vec<String>) -> Result<String> {
    // Use tokio::task::spawn_blocking to run our synchronous shell command
    // on a dedicated thread, preventing it from blocking the async runtime.
    tokio::task::spawn_blocking(move || {
        run_shell_command("bambooclaw".to_string(), args)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))? // Handle join error
}


#[cfg(target_os = "windows")]
fn check_vs_build_tools() -> Result<String> {
    // vswhere.exe is the official tool for locating Visual Studio installations.
    let vswhere_path = PathBuf::from(std::env::var("ProgramFiles(x86)").unwrap_or_default())
        .join("Microsoft Visual Studio/Installer/vswhere.exe");

    if !vswhere_path.exists() {
        return Err("Visual Studio Installer (vswhere.exe) not found. Build Tools are likely not installed.".to_string());
    }
    
    // Arguments to find the latest C++ workload installation
    let args = vec![
        "-latest",
        "-products", "*",
        "-requires", "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
        "-property", "installationPath"
    ];
    
    let output = Command::new(vswhere_path)
        .args(args)
        .output()
        .map_err(|e| format!("Failed to run vswhere.exe: {}", e))?;

    if output.status.success() {
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if path.is_empty() {
            Err("Visual Studio Build Tools with C++ workload not found.".to_string())
        } else {
            Ok(format!("Found Visual Studio Build Tools at: {}", path))
        }
    } else {
        Err(format!("vswhere.exe failed: {}", String::from_utf8_lossy(&output.stderr)))
    }
}

/// Checks for required system prerequisites like 'rustc', 'cargo', etc.
#[command]
async fn check_prerequisite(name: String) -> Result<String> {
    match name.as_str() {
        "rustc" => run_shell_command("rustc".to_string(), vec!["--version".to_string()]).await,
        "cargo" => run_shell_command("cargo".to_string(), vec!["--version".to_string()]).await,
        "bambooclaw" => {
            // "which" crate is the idiomatic way to find an executable in PATH.
            match which::which("bambooclaw") {
                Ok(path) => Ok(format!("Found at: {}", path.to_string_lossy())),
                Err(_) => Err("bambooclaw binary not found in system PATH.".to_string()),
            }
        }
        "vs_build_tools" => {
            // IMPORTANT: Call sites of cfg-gated functions MUST also be cfg-gated.
            #[cfg(target_os = "windows")]
            {
                check_vs_build_tools()
            }
            #[cfg(not(target_os = "windows"))]
            {
                // On non-Windows platforms, this check is not applicable.
                Ok("Not applicable on this platform.".to_string())
            }
        }
        _ => Err(format!("Unknown prerequisite check: {}", name)),
    }
}

/// Payload for the download progress event emitted to the frontend.
#[derive(Clone, Serialize)]
struct DownloadProgress {
    downloaded: u64,
    total: u64,
}

/// Downloads a file from a URL to a destination path, emitting progress events.
#[command]
async fn download_binary(window: Window, url: String, dest: String) -> Result<()> {
    let dest_path = PathBuf::from(dest);

    // Ensure parent directory exists.
    if let Some(parent) = dest_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create destination directory: {}", e))?;
    }

    // Perform the HTTP GET request.
    let res = reqwest::get(&url)
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    // Check for successful status code.
    if !res.status().is_success() {
        return Err(format!("Download failed with status: {}", res.status()));
    }

    let total_size = res.content_length().unwrap_or(0);
    let mut file = fs::File::create(&dest_path)
        .map_err(|e| format!("Failed to create file: {}", e))?;

    let mut stream = res.bytes_stream();
    let mut downloaded: u64 = 0;

    // Process the download stream chunk by chunk.
    while let Some(item) = stream.next().await {
        let chunk = item.map_err(|e| format!("Error while downloading: {}", e))?;
        file.write_all(&chunk).map_err(|e| format!("Error writing to file: {}", e))?;
        downloaded += chunk.len() as u64;

        // Emit progress event to the frontend.
        window.emit("DOWNLOAD_PROGRESS", DownloadProgress {
            downloaded,
            total: total_size,
        }).map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// Starts the 'bambooclaw daemon' as a detached background process.
#[command]
fn start_daemon() -> Result<()> {
    let mut command = Command::new("bambooclaw");
    command.arg("daemon");

    // Platform-specific configuration for detaching the process.
    #[cfg(target_os = "windows")]
    {
        // On Windows, CREATE_NO_WINDOW prevents the process from creating a console window.
        // It's detached by default if the parent exits.
        command.creation_flags(CREATE_NO_WINDOW);
    }
    
    // On Unix-like systems (macOS, Linux), the process is detached automatically
    // when the `Child` handle from `spawn()` is dropped without calling `wait()`.

    // Spawn the process
    command.spawn()
        .map_err(|e| format!("Failed to start bambooclaw daemon: {}. Is 'bambooclaw' in your PATH?", e))?;

    Ok(())
}

/// Finds and kills the running 'bambooclaw daemon' process.
#[command]
fn stop_daemon() -> Result<()> {
    // sysinfo provides cross-platform process inspection.
    let mut sys = System::new_all();
    sys.refresh_processes(); // Crucial: load the latest process list.

    let mut process_found = false;

    // Iterate over all processes to find the daemon.
    for process in sys.processes().values() {
        // Use `process.name()` for the executable name and check `process.cmd()` for arguments.
        // This is a robust way to identify the specific daemon process.
        let name = process.name();
        let cmd = process.cmd();

        if name == "bambooclaw" || name == "bambooclaw.exe" {
            if cmd.contains(&"daemon".to_string()) {
                // We found the daemon. Attempt to kill it.
                if process.kill() {
                    println!("Successfully sent kill signal to bambooclaw daemon (PID: {}).", process.pid());
                    process_found = true;
                } else {
                    return Err(format!("Failed to kill bambooclaw daemon (PID: {}). It might require elevated privileges.", process.pid()));
                }
                // Break after finding and killing one instance to avoid killing multiple if they exist.
                break;
            }
        }
    }

    if process_found {
        Ok(())
    } else {
        Err("BambooClaw daemon process not found.".to_string())
    }
}

/// Reads the content of the bambooclaw config file.
/// Assumes config is at ~/.bambooclaw/config.toml
#[command]
fn read_config() -> Result<String> {
    let path = get_config_path()?;
    fs::read_to_string(path).map_err(|e| {
        format!(
            "Failed to read config file. Have you run the setup yet? Error: {}",
            e
        )
    })
}

/// Writes content to the bambooclaw config file.
/// Assumes config is at ~/.bambooclaw/config.toml
#[command]
fn write_config(content: String) -> Result<()> {
    // Ensure the ~/.bambooclaw directory exists before writing.
    ensure_config_dir_exists()?;
    let path = get_config_path()?;
    fs::write(path, content).map_err(|e| format!("Failed to write to config file: {}", e))
}


// --- Main Application Entry Point ---
fn main() {
    // Set up the Tauri application builder.
    tauri::Builder::default()
        // Register all our backend commands so the frontend can call them.
        .invoke_handler(tauri::generate_handler![
            check_prerequisite,
            run_shell_command,
            download_binary,
            run_bambooclaw,
            start_daemon,
            stop_daemon,
            read_config,
            write_config,
            get_platform,
        ])
        // Run the Tauri application.
        .run(tauri::generate_context!())
        // Handle any fatal errors during startup.
        .expect("error while running tauri application");
}