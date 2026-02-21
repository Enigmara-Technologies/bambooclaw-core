// src-tauri/src/main.rs

// This attribute hides the console window on Windows in release builds,
// providing a more native application experience.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// --- Crate Imports ---

// Standard library for file system operations, I/O, paths, and command execution.
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::process::Command;

// For asynchronous stream processing, used here for efficient file downloads.
use futures_util::StreamExt;
// For inspecting and managing system processes (e.g., stopping daemons).
use sysinfo::System;
// Tauri's command macro to expose Rust functions to the JavaScript frontend.
use tauri::command;

// --- Helper Functions ---

/// Returns the platform-agnostic application configuration directory path.
/// This function resolves to `~/.bambooclaw` on Linux/macOS and
/// `C:\Users\Username\.bambooclaw` on Windows. This centralizes all
/// application data, including configuration files and potentially cached binaries.
fn config_dir() -> Result<PathBuf, String> {
    dirs::home_dir()
        .map(|home| home.join(".bambooclaw"))
        .ok_or_else(|| "Fatal Error: Could not determine the user's home directory.".to_string())
}

/// A generic helper to find and terminate a running process by its exact name.
/// This is used to reliably stop the Core and Lite daemons.
///
/// # Arguments
/// * `process_name` - The exact name of the process executable (e.g., "bambooclaw-core").
fn stop_process_by_name(process_name: &str) -> Result<(), String> {
    let mut sys = System::new_all();
    sys.refresh_all(); // Update the process list to the latest state.

    let mut process_found = false;
    for process in sys.processes().values() {
        // We use an exact match on the process name for precision and safety,
        // preventing accidental termination of similarly named processes.
        if process.name() == process_name {
            process_found = true;
            // Attempt to send the termination signal.
            if !process.kill() {
                // This can happen due to permissions or if the process terminated
                // between the `refresh_all` call and this `kill` call.
                return Err(format!(
                    "Found process '{}', but failed to terminate it. It may have already stopped or you lack permissions.",
                    process_name
                ));
            }
        }
    }

    if process_found {
        Ok(())
    } else {
        Err(format!("No running process named '{}' was found.", process_name))
    }
}

// --- Tauri Commands (Invokable from Frontend) ---

/// Returns the identifier of the current operating system.
/// This is used by the frontend to display platform-specific UI or instructions.
/// Possible values: "windows", "macos", "linux".
#[command]
fn get_platform() -> String {
    if cfg!(target_os = "windows") {
        "windows".into()
    } else if cfg!(target_os = "macos") {
        "macos".into()
    } else {
        // This bucket includes all other Unix-like systems, primarily Linux distributions.
        "linux".into()
    }
}

/// Executes a shell command and returns its combined stdout and stderr as a single string.
/// This is a powerful utility for interacting with command-line tools.
/// WARNING: Use with caution. Do not pass unsanitized user input as `command_name` or `args`.
///
/// # Arguments
/// * `command_name` - The executable to run (e.g., "git", "node").
/// * `args` - A vector of string arguments for the command.
#[command]
fn run_shell_command(command_name: String, args: Vec<String>) -> Result<String, String> {
    let output = Command::new(&command_name)
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to execute command '{}': {}", command_name, e))?;

    // Combine stdout and stderr to provide comprehensive feedback to the frontend.
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);

    Ok(format!("{}{}", stdout, stderr))
}

/// Executes a command using the BambooClaw Core agent's executable (`bambooclaw-core`).
///
/// # Arguments
/// * `args` - A vector of arguments to pass to the `bambooclaw-core` executable.
#[command]
fn run_bambooclaw_core(args: Vec<String>) -> Result<String, String> {
    run_shell_command("bambooclaw-core".to_string(), args)
}

/// Executes a command using the BambooClaw Lite agent's executable (`bambooclaw-lite`).
///
/// # Arguments
/// * `args` - A vector of arguments to pass to the `bambooclaw-lite` executable.
#[command]
fn run_bambooclaw_lite(args: Vec<String>) -> Result<String, String> {
    run_shell_command("bambooclaw-lite".to_string(), args)
}

/// Checks if a required prerequisite tool is installed and available in the system's PATH.
///
/// # Arguments
/// * `name` - The name of the prerequisite. Supported: "rustc", "cargo", "go",
///   "bambooclaw_core", "bambooclaw_lite", "vs_build_tools".
#[command]
fn check_prerequisite(name: String) -> Result<String, String> {
    match name.as_str() {
        "rustc" => run_shell_command("rustc".to_string(), vec!["--version".to_string()]),
        "cargo" => run_shell_command("cargo".to_string(), vec!["--version".to_string()]),
        "go" => run_shell_command("go".to_string(), vec!["version".to_string()]),
        "bambooclaw_core" => which::which("bambooclaw-core")
            .map(|p| format!("Found BambooClaw Core at: {}", p.display()))
            .map_err(|_| "BambooClaw Core (bambooclaw-core) not found in system PATH.".to_string()),
        "bambooclaw_lite" => which::which("bambooclaw-lite")
            .map(|p| format!("Found BambooClaw Lite at: {}", p.display()))
            .map_err(|_| "BambooClaw Lite (bambooclaw-lite) not found in system PATH.".to_string()),
        "vs_build_tools" => check_vs_build_tools(),
        _ => Err(format!("Unknown prerequisite check: '{}'", name)),
    }
}

/// Platform-specific check for Visual Studio Build Tools on Windows, a dependency
/// for compiling many Rust crates that have C/C++ dependencies.
#[cfg(target_os = "windows")]
fn check_vs_build_tools() -> Result<String, String> {
    // `cl.exe` is the Microsoft C/C++ compiler, a reliable indicator of a valid build environment.
    let output = Command::new("cmd")
        .args(["/C", "where", "cl.exe"])
        .output()
        .map_err(|e| format!("Failed to run system command 'where cl.exe': {}", e))?;

    if output.status.success() {
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(format!("Visual Studio Build Tools found: {}", path))
    } else {
        Err("Visual Studio Build Tools (cl.exe) not found in system PATH.".to_string())
    }
}

/// Stub function for non-Windows platforms where VS Build Tools are not required.
#[cfg(not(target_os = "windows"))]
fn check_vs_build_tools() -> Result<String, String> {
    Ok("Not applicable on this platform.".to_string())
}

/// Reads the contents of the main application configuration file (`~/.bambooclaw/config.toml`).
#[command]
fn read_config() -> Result<String, String> {
    let path = config_dir()?.join("config.toml");
    fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read configuration from '{}': {}", path.display(), e))
}

/// Writes content to the main configuration file, creating parent directories if they don't exist.
#[command]
fn write_config(content: String) -> Result<(), String> {
    let dir = config_dir()?;
    fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create config directory at '{}': {}", dir.display(), e))?;

    let path = dir.join("config.toml");
    fs::write(&path, content)
        .map_err(|e| format!("Failed to write configuration to '{}': {}", path.display(), e))
}

/// Starts the BambooClaw Core agent as a detached background process (daemon).
#[command]
fn start_core_daemon() -> Result<(), String> {
    Command::new("bambooclaw-core")
        .arg("daemon") // Assumes the CLI supports a 'daemon' subcommand.
        .spawn() // Spawns the process and immediately detaches.
        .map_err(|e| format!("Failed to start BambooClaw Core daemon. Is 'bambooclaw-core' in your PATH? Error: {}", e))?;
    Ok(())
}

/// Stops any running BambooClaw Core agent process.
#[command]
fn stop_core_daemon() -> Result<(), String> {
    stop_process_by_name("bambooclaw-core")
}

/// Starts the BambooClaw Lite agent as a detached background process (daemon).
#[command]
fn start_lite_daemon() -> Result<(), String> {
    Command::new("bambooclaw-lite")
        .arg("daemon")
        .spawn()
        .map_err(|e| format!("Failed to start BambooClaw Lite daemon. Is 'bambooclaw-lite' in your PATH? Error: {}", e))?;
    Ok(())
}

/// Stops any running BambooClaw Lite agent process.
#[command]
fn stop_lite_daemon() -> Result<(), String> {
    stop_process_by_name("bambooclaw-lite")
}

/// Downloads a file from a URL and saves it to a specified destination on the filesystem.
/// The download is streamed to handle large files without consuming excessive memory.
///
/// # Arguments
/// * `url` - The URL of the file to download.
/// * `dest` - The local file path (including filename) to save the file.
#[command]
async fn download_binary(url: String, dest: PathBuf) -> Result<(), String> {
    // Ensure the destination directory exists before trying to write the file.
    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent).map_err(|e| {
            format!("Failed to create parent directory '{}': {}", parent.display(), e)
        })?;
    }

    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("Network request to URL '{}' failed: {}", url, e))?;

    // Check for non-successful HTTP status codes (e.g., 404 Not Found, 500 Server Error).
    if !response.status().is_success() {
        return Err(format!(
            "Download failed with HTTP status: {} {}",
            response.status().as_u16(),
            response.status().canonical_reason().unwrap_or("Unknown Status")
        ));
    }

    let mut file = fs::File::create(&dest)
        .map_err(|e| format!("Failed to create destination file '{}': {}", dest.display(), e))?;

    let mut stream = response.bytes_stream();
    while let Some(item) = stream.next().await {
        let chunk = item.map_err(|e| format!("Error while streaming download data: {}", e))?;
        file.write_all(&chunk)
            .map_err(|e| format!("Error writing chunk to file '{}': {}", dest.display(), e))?;
    }

    Ok(())
}

// --- Main Application Entry Point ---
fn main() {
    tauri::Builder::default()
        // Register all the functions that the frontend can invoke.
        .invoke_handler(tauri::generate_handler![
            // Platform & System Utilities
            get_platform,
            run_shell_command,
            check_prerequisite,
            download_binary,
            // Configuration Management
            read_config,
            write_config,
            // BambooClaw Core Agent Commands
            run_bambooclaw_core,
            start_core_daemon,
            stop_core_daemon,
            // BambooClaw Lite Agent Commands
            run_bambooclaw_lite,
            start_lite_daemon,
            stop_lite_daemon
        ])
        .run(tauri::generate_context!())
        .expect("Error while running BambooClaw Companion App");
}