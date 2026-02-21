// Prevents a console window from appearing on Windows in release builds.
#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use std::path::{Path, PathBuf};
use std::process::Command;
use tokio::fs::{self, File};
use tokio::io::AsyncWriteExt;

use futures_util::StreamExt;
use sysinfo::{ProcessExt, System, SystemExt};
use tauri::{AppHandle, Manager};

// --- Helper Structs ---

/// Payload for the download progress event sent to the frontend.
#[derive(Clone, serde::Serialize)]
struct ProgressPayload {
    downloaded: u64,
    total: u64,
}

// --- Main Application Entry Point ---

fn main() {
    // Build and run the Tauri application.
    tauri::Builder::default()
        // Register all our backend commands so the frontend can call them.
        .invoke_handler(tauri::generate_handler![
            get_platform,
            check_prerequisite,
            run_shell_command,
            run_bambooclaw,
            download_binary,
            start_daemon,
            stop_daemon,
            read_config,
            write_config,
        ])
        .run(tauri::generate_context!())
        .expect("error while running BambooClaw Companion App");
}

// --- Tauri Commands ---

/// Returns the current operating system platform.
/// Expected values: "windows", "macos", "linux".
#[tauri::command]
fn get_platform() -> String {
    std::env::consts::OS.to_string()
}

/// Executes a shell command and returns the combined stdout and stderr.
/// This is a generic utility for running external processes.
#[tauri::command]
async fn run_shell_command(command: String, args: Vec<String>) -> Result<String, String> {
    // Use tokio::task::spawn_blocking for synchronous I/O operations (like Command::output)
    // to avoid blocking the async runtime.
    let result = tokio::task::spawn_blocking(move || Command::new(command).args(args).output())
        .await
        // Handle potential task panic
        .map_err(|e| format!("Task execution failed: {}", e))?
        // Handle potential command execution error
        .map_err(|e| format!("Failed to execute command: {}", e));

    match result {
        Ok(output) => {
            if output.status.success() {
                // If the command was successful, return its stdout.
                Ok(String::from_utf8_lossy(&output.stdout).to_string())
            } else {
                // If the command failed, return a detailed error with stdout and stderr.
                let stdout = String::from_utf8_lossy(&output.stdout);
                let stderr = String::from_utf8_lossy(&output.stderr);
                Err(format!(
                    "Command failed with exit code: {:?}\n--- STDOUT ---\n{}\n--- STDERR ---\n{}",
                    output.status.code(),
                    stdout,
                    stderr
                ))
            }
        }
        Err(e) => Err(e.to_string()),
    }
}

/// Checks for a specific prerequisite on the user's system.
#[tauri::command]
async fn check_prerequisite(name: String) -> Result<String, String> {
    match name.as_str() {
        "rustc" => run_shell_command("rustc".into(), vec!["--version".into()]).await,
        "cargo" => run_shell_command("cargo".into(), vec!["--version".into()]).await,
        "bambooclaw" => {
            // Use the `which` crate for a reliable, cross-platform PATH check.
            which::which("bambooclaw")
                .map(|path| format!("Found at: {}", path.display()))
                .map_err(|e| format!("'bambooclaw' not found in PATH: {}", e))
        },
        "vs_build_tools" => {
             // Platform-specific check for Visual Studio Build Tools on Windows.
            if cfg!(target_os = "windows") {
                check_windows_vs_build_tools()
            } else {
                // Not applicable on non-Windows systems.
                Ok("Not applicable on this platform.".to_string())
            }
        }
        _ => Err(format!("Unknown prerequisite check: {}", name)),
    }
}

/// A shorthand command to execute the 'bambooclaw' binary with arguments.
#[tauri::command]
async fn run_bambooclaw(args: Vec<String>) -> Result<String, String> {
    run_shell_command("bambooclaw".to_string(), args).await
}

/// Downloads a file from a URL to a destination, emitting progress events.
#[tauri::command]
async fn download_binary(
    app: AppHandle,
    url: String,
    dest: String,
) -> Result<(), String> {
    // Create a reqwest client for making HTTP requests.
    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to initiate download: {}", e))?;

    // Get total file size from the 'content-length' header for progress calculation.
    let total_size = response
        .content_length()
        .ok_or_else(|| "Could not get content length from server.".to_string())?;

    // Ensure the destination directory exists.
    let dest_path = Path::new(&dest);
    if let Some(parent) = dest_path.parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed to create destination directory: {}", e))?;
    }
    
    // Create the destination file.
    let mut file = File::create(&dest_path)
        .await
        .map_err(|e| format!("Failed to create destination file: {}", e))?;

    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();

    // Process the download stream chunk by chunk.
    while let Some(item) = stream.next().await {
        let chunk = item.map_err(|e| format!("Error while downloading file: {}", e))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Error writing to file: {}", e))?;
        
        downloaded += chunk.len() as u64;

        // Emit a progress event to the frontend.
        app.emit_all(
            "download-progress",
            ProgressPayload {
                downloaded,
                total: total_size,
            },
        )
        .map_err(|e| format!("Failed to emit progress event: {}", e))?;
    }

    Ok(())
}

/// Spawns 'bambooclaw daemon' as a detached background process.
#[tauri::command]
fn start_daemon() -> Result<(), String> {
    // Use Command::spawn() to run the process without waiting for it.
    // By not capturing the `Child` process handle, it becomes detached.
    Command::new("bambooclaw")
        .arg("daemon")
        .spawn()
        .map_err(|e| format!("Failed to start bambooclaw daemon: {}", e))?;

    Ok(())
}

/// Finds and kills any running 'bambooclaw' daemon processes.
#[tauri::command]
fn stop_daemon() -> Result<(), String> {
    let mut sys = System::new_all();
    // Refresh the process list to get the current state.
    sys.refresh_processes();

    // Determine the process name based on the OS.
    let process_name = if cfg!(target_os = "windows") {
        "bambooclaw.exe"
    } else {
        "bambooclaw"
    };

    let mut found = false;
    for process in sys.processes_by_name(process_name) {
        println!("Found running bambooclaw process with PID: {}", process.pid());
        // Attempt to kill the process.
        if process.kill() {
            println!("Successfully sent kill signal to PID {}", process.pid());
            found = true;
        } else {
            // This might happen due to permissions issues.
            eprintln!("Failed to kill bambooclaw process with PID {}", process.pid());
        }
    }

    if !found {
        // It's not an error if the process wasn't running.
        println!("No running bambooclaw daemon process found to stop.");
    }

    Ok(())
}

/// Reads the content of the BambooClaw configuration file.
#[tauri::command]
async fn read_config() -> Result<String, String> {
    let config_path = get_config_path()?;
    fs::read_to_string(config_path)
        .await
        .map_err(|e| format!("Failed to read config file: {}", e))
}

/// Writes content to the BambooClaw configuration file.
#[tauri::command]
async fn write_config(content: String) -> Result<(), String> {
    let config_path = get_config_path()?;

    // Ensure the parent directory (`~/.bambooclaw`) exists before writing.
    if let Some(parent) = config_path.parent() {
        fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }

    fs::write(config_path, content)
        .await
        .map_err(|e| format!("Failed to write to config file: {}", e))
}


// --- Helper Functions ---

/// Constructs the full path to the `config.toml` file in a cross-platform way.
fn get_config_path() -> Result<PathBuf, String> {
    // Use the `dirs` crate to reliably find the user's home directory.
    let home_dir = dirs::home_dir().ok_or("Could not find home directory.")?;
    Ok(home_dir.join(".bambooclaw").join("config.toml"))
}

/// A Windows-specific helper to check for Visual Studio Build Tools.
/// It uses the `vswhere.exe` utility, which is the official way to locate VS installations.
#[cfg(target_os = "windows")]
fn check_windows_vs_build_tools() -> Result<String, String> {
    let output = Command::new("vswhere")
        .args([
            "-latest",
            "-requires", "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
            "-property", "installationPath"
        ])
        .output();

    match output {
        Ok(out) if out.status.success() && !out.stdout.is_empty() => {
            let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
            Ok(format!("Found Visual Studio installation at: {}", path))
        }
        _ => {
            Err("Visual Studio Build Tools (C++) not found. Please install them from the Visual Studio Installer.".to_string())
        }
    }
}