// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// --- Imports ---
// Standard library
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Command, Stdio};

// Tauri
use tauri::Window;

// Crates for system interaction
use sysinfo::System; // Per constraint, no `SystemExt` or `ProcessExt` traits are needed or exist in 0.30+
use which::which;

// Crates for async download
use futures_util::StreamExt;
use serde::{Clone, Serialize};

// Conditional imports for platform-specific functionality
#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

// --- Main Application Entry Point ---

fn main() {
    // Build and run the Tauri application.
    // All backend commands are registered here in the invoke_handler.
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            check_prerequisite,
            run_shell_command,
            download_binary,
            run_bambooclaw,
            start_daemon,
            stop_daemon,
            read_config,
            write_config,
            get_platform
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

// --- Helper Functions ---

/// A helper to resolve the full path to the BambooClaw config file.
/// The path is typically ~/.bambooclaw/config.toml
fn get_config_path() -> Result<PathBuf, String> {
    let home_dir = home::home_dir().ok_or_else(|| "Could not find home directory.".to_string())?;
    let config_dir = home_dir.join(".bambooclaw");
    Ok(config_dir.join("config.toml"))
}

// A Windows-specific helper to check for Visual Studio Build Tools using `vswhere`.
// The function and its call site must be guarded by `cfg(target_os = "windows")`.
#[cfg(target_os = "windows")]
fn check_visual_studio_build_tools() -> Result<String, String> {
    // vswhere is a utility included with Visual Studio Installer to locate installations.
    // We check for any product including PreRelease versions that provide C++ build tools.
    let output = Command::new("vswhere")
        .args([
            "-latest",
            "-products",
            "*",
            "-requires",
            "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
            "-property",
            "installationPath",
        ])
        .output();

    match output {
        Ok(out) => {
            if out.status.success() {
                let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
                if path.is_empty() {
                    Err("Visual Studio Build Tools not found. Please install them from the Visual Studio Installer (includes C++ build tools).".to_string())
                } else {
                    Ok(format!("Found Visual Studio Build Tools at: {}", path))
                }
            } else {
                Err("vswhere tool failed. Is Visual Studio Installer present?".to_string())
            }
        }
        Err(_) => Err(
            "Could not run 'vswhere'. Ensure Visual Studio Installer is installed.".to_string(),
        ),
    }
}

// --- Tauri Commands ---

/// Returns the current operating system ("windows", "macos", or "linux").
#[tauri::command]
fn get_platform() -> String {
    std::env::consts::OS.to_string()
}

/// Executes a shell command and returns the combined stdout and stderr.
/// This is a synchronous operation, blocking until the command completes.
#[tauri::command]
fn run_shell_command(command: String, args: Vec<String>) -> Result<String, String> {
    // System command execution is a potential security risk.
    // In a real app, inputs should be sanitized or commands should be pre-defined.
    let output = Command::new(&command)
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to execute command '{}': {}", command, e))?;

    // Combine stdout and stderr for comprehensive feedback to the frontend.
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    let combined_output = format!("{}\n{}", stdout, stderr).trim().to_string();

    if output.status.success() {
        Ok(combined_output)
    } else {
        Err(format!(
            "Command '{}' failed with exit code {:?}:\n{}",
            command,
            output.status.code(),
            combined_output
        ))
    }
}


/// Checks for a specific prerequisite required for BambooClaw.
#[tauri::command]
fn check_prerequisite(name: String) -> Result<String, String> {
    match name.as_str() {
        // Check for Rust compiler version
        "rustc" => run_shell_command("rustc".to_string(), vec!["--version".to_string()]),
        // Check for Cargo version
        "cargo" => run_shell_command("cargo".to_string(), vec!["--version".to_string()]),
        // Check if the 'bambooclaw' binary is in the system's PATH
        "bambooclaw" => {
            which("bambooclaw")
                // Per constraint, use explicit type annotation on the closure argument.
                .map(|p: PathBuf| format!("Found bambooclaw at: {}", p.to_string_lossy()))
                .map_err(|e| format!("'bambooclaw' not found in PATH: {}", e))
        }
        // Check for Visual Studio Build Tools (Windows only)
        "vstools" => {
            // This entire block is compiled only on Windows.
            #[cfg(target_os = "windows")]
            {
                check_visual_studio_build_tools()
            }
            // On non-Windows platforms, this check is not applicable.
            #[cfg(not(target_os = "windows"))]
            {
                Ok("Not applicable on this platform.".to_string())
            }
        }
        _ => Err(format!("Unknown prerequisite check: {}", name)),
    }
}

/// The payload for download progress events sent to the frontend.
#[derive(Clone, Serialize)]
struct ProgressPayload {
    percentage: f64,
    downloaded: u64,
    total: u64,
}

/// Downloads a file from a URL to a destination path, emitting progress events.
/// This is an async command to avoid blocking the UI thread during the download.
#[tauri::command]
async fn download_binary(window: Window, url: String, dest: String) -> Result<(), String> {
    // Create destination directory if it doesn't exist.
    let dest_path = std::path::Path::new(&dest);
    if let Some(parent) = dest_path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    // Start the download request.
    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("Request failed: {}", e))?;

    // Get total file size from headers, if available.
    let total_size = response
        .content_length()
        .ok_or_else(|| "Failed to get content length from server.".to_string())?;

    // Create the destination file.
    let mut file = tokio::fs::File::create(&dest)
        .await
        .map_err(|e| format!("Failed to create file: {}", e))?;
        
    // Stream the response body chunk by chunk.
    let mut stream = response.bytes_stream();
    let mut downloaded: u64 = 0;

    while let Some(item) = stream.next().await {
        let chunk = item.map_err(|e| format!("Error while downloading: {}", e))?;
        file.write_all(&chunk)
            .map_err(|e| format!("Error writing to file: {}", e))?;
        
        downloaded += chunk.len() as u64;
		
        // Emit a progress event to the frontend.
        let percentage = (downloaded as f64 / total_size as f64) * 100.0;
        window.emit("download-progress", &ProgressPayload { percentage, downloaded, total: total_size })
            .map_err(|e| e.to_string())?;
    }

    Ok(())
}

/// A shorthand command to run the 'bambooclaw' binary with specified arguments.
#[tauri::command]
fn run_bambooclaw(args: Vec<String>) -> Result<String, String> {
    run_shell_command("bambooclaw".to_string(), args)
}

/// Spawns the 'bambooclaw daemon' command as a detached background process.
#[tauri::command]
fn start_daemon() -> Result<(), String> {
    let mut command = Command::new("bambooclaw");
    command.arg("daemon");
    
    // For Unix-like systems, simply spawning is enough to detach.
    #[cfg(not(target_os = "windows"))]
    {
        command
            .stdout(Stdio::null()) // Prevent daemon from writing to app's stdout/stderr
            .stderr(Stdio::null());

        command.spawn()
            .map_err(|e| format!("Failed to spawn bambooclaw daemon: {}", e))?;
    }

    // For Windows, we need to add a creation flag to properly detach the process,
    // otherwise it will be killed when the parent (Tauri app) exits.
    #[cfg(target_os = "windows")]
    {
        // CREATE_NO_WINDOW prevents the process from creating a console window.
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        command.creation_flags(CREATE_NO_WINDOW);

        command.spawn()
            .map_err(|e| format!("Failed to spawn bambooclaw daemon on Windows: {}", e))?;
    }
    
    Ok(())
}

/// Finds and kills any running 'bambooclaw' daemon process.
#[tauri::command]
fn stop_daemon() -> Result<(), String> {
    // Initialize the sysinfo system handle.
    let mut sys = System::new_all();
    // Refresh the process list to get the current state.
    sys.refresh_processes();

    let mut process_killed = false;

    // Define potential process names. On Windows, it often includes the '.exe' suffix.
    let process_name = "bambooclaw";
    let process_name_exe = "bambooclaw.exe";

    // Iterate over all running processes.
    for process in sys.processes().values() {
        if process.name() == process_name || process.name() == process_name_exe {
            // Attempt to kill the process.
            if process.kill() {
                println!("Successfully sent kill signal to bambooclaw daemon (PID: {}).", process.pid());
                process_killed = true;
                // We assume there's only one daemon, so we can break after finding it.
                break;
            } else {
                return Err(format!("Failed to kill bambooclaw daemon (PID: {}). It might require higher privileges.", process.pid()));
            }
        }
    }

    if process_killed {
        Ok(())
    } else {
        Err("BambooClaw daemon process not found.".to_string())
    }
}

/// Reads the contents of the BambooClaw config file.
#[tauri::command]
fn read_config() -> Result<String, String> {
    let config_path = get_config_path()?;
    fs::read_to_string(config_path).map_err(|e| format!("Failed to read config file: {}", e))
}

/// Writes content to the BambooClaw config file, creating it and its directory if needed.
#[tauri::command]
fn write_config(content: String) -> Result<(), String> {
    let config_path = get_config_path()?;

    // Ensure the parent directory (~/.bambooclaw) exists.
    if let Some(parent_dir) = config_path.parent() {
        fs::create_dir_all(parent_dir)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }

    // Write the new content to the file.
    fs::write(config_path, content).map_err(|e| format!("Failed to write to config file: {}", e))
}