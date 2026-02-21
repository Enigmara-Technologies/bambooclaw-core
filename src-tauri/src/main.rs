// src-tauri/src/main.rs

#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use std::{
    collections::HashMap,
    env,
    io::{self, Cursor, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    str,
    sync::{Arc, Mutex},
};

use anyhow::{anyhow, Result};
use futures_util::StreamExt;
use tauri::{AppHandle, Manager, Wry};
use tokio::{
    fs,
    io::AsyncWriteExt,
    process::{Child, Command as TokioCommand},
};

// Define a global state to keep track of the daemon process ID
// This is a simple approach. For more robust daemon management, consider a dedicated service.
lazy_static::lazy_static! {
    static ref DAEMON_PROCESS: Arc<Mutex<Option<Child>>> = Arc::new(Mutex::new(None));
}

/// Helper function to get the base configuration directory for BambooClaw.
/// This will be ~/.bambooclaw/ on Linux/macOS or C:\Users\<user>\.bambooclaw\ on Windows.
fn get_bambooclaw_config_dir() -> Result<PathBuf> {
    let home_dir = dirs::home_dir().ok_or_else(|| anyhow!("Could not find home directory"))?;
    Ok(home_dir.join(".bambooclaw"))
}

/// Helper function to get the path to the BambooClaw config.toml.
fn get_bambooclaw_config_path() -> Result<PathBuf> {
    Ok(get_bambooclaw_config_dir()?.join("config.toml"))
}

#[tauri::command]
async fn check_prerequisite(app: AppHandle, name: String) -> Result<String, String> {
    match name.as_str() {
        "rustc" => {
            let output = run_shell_command_sync("rustc".into(), vec!["--version".into()])?;
            Ok(output)
        }
        "cargo" => {
            let output = run_shell_command_sync("cargo".into(), vec!["--version".into()])?;
            Ok(output)
        }
        "visual_studio_build_tools" => {
            if cfg!(target_os = "windows") {
                // Check common VS installation paths or environment variables
                let mut found = false;
                for arch in ["Hostx64", "Hostx86"].iter() {
                    let vs_path = PathBuf::from(format!(
                        r"C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools\VC\Tools\MSVC\*\bin\{}\cl.exe",
                        arch
                    )); // Adjust 2019 to 2022 if preferred

                    if glob::glob(vs_path.to_str().unwrap_or_default())
                        .map_err(|e| e.to_string())?
                        .next()
                        .is_some()
                    {
                        found = true;
                        break;
                    }
                }

                if found {
                    Ok("Visual Studio Build Tools found.".into())
                } else {
                    Err("Visual Studio Build Tools not found. Required for Rust on Windows."
                        .into())
                }
            } else {
                Ok("Visual Studio Build Tools not applicable for this OS.".into())
            }
        }
        "bambooclaw_in_path" => {
            let path_var = env::var("PATH").map_err(|e| e.to_string())?;
            let binary_name = if cfg!(target_os = "windows") {
                "bambooclaw.exe"
            } else {
                "bambooclaw"
            };

            for path_entry in path_var.split(if cfg!(target_os = "windows") { ';' } else { ':' }) {
                let full_path = PathBuf::from(path_entry).join(binary_name);
                if full_path.exists() {
                    return Ok(format!("'{}' found in PATH: {}", binary_name, full_path.display()));
                }
            }
            Err(format!("'{}' not found in system PATH.", binary_name))
        }
        _ => Err(format!("Unknown prerequisite: {}", name)),
    }
}

/// Executes a shell command and returns its combined stdout/stderr.
///
/// This function is synchronous and uses `std::process::Command`.
fn run_shell_command_sync(command: String, args: Vec<String>) -> Result<String, String> {
    let output = Command::new(&command)
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to execute command '{} {}': {}", command, args.join(" "), e))?;

    if output.status.success() {
        String::from_utf8(output.stdout)
            .map_err(|e| format!("Failed to parse stdout as UTF-8: {}", e))
    } else {
        String::from_utf8(output.stderr)
            .map_err(|e| format!("Failed to parse stderr as UTF-8: {}", e))
            .and_then(|err| Err(format!("Command failed with exit code {}: {}", output.status, err)))
    }
}

#[tauri::command]
async fn run_shell_command(command: String, args: Vec<String>) -> Result<String, String> {
    tokio::task::spawn_blocking(move || run_shell_command_sync(command, args))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
async fn download_binary(
    app: AppHandle,
    url: String,
    dest: String,
) -> Result<(), String> {
    let client = reqwest::Client::new();
    let res = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to send request: {}", e))?;

    let total_size = res.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;
    let mut stream = res.bytes_stream();

    let dest_path = PathBuf::from(&dest);
    let parent_dir = dest_path
        .parent()
        .ok_or_else(|| String::from("Invalid destination path"))?;
    fs::create_dir_all(parent_dir)
        .await
        .map_err(|e| format!("Failed to create parent directory: {}", e))?;

    let mut file = fs::File::create(&dest_path)
        .await
        .map_err(|e| format!("Failed to create file at {}: {}", dest, e))?;

    println!("Starting download from {} to {}", url, dest);

    while let Some(item) = stream.next().await {
        let chunk = item.map_err(|e| format!("Error while downloading: {}", e))?;
        file.write_all(&chunk)
            .await
            .map_err(|e| format!("Error writing to file: {}", e))?;
        downloaded += chunk.len() as u64;

        let percentage = if total_size > 0 {
            (downloaded as f64 / total_size as f64 * 100.0) as u32
        } else {
            0
        };

        // Emit progress event
        app.emit_all(
            "download_progress",
            HashMap::from([
                ("url", url.as_str()),
                ("dest", dest.as_str()),
                ("progress", &percentage.to_string()),
                ("downloaded", &downloaded.to_string()),
                ("total", &total_size.to_string()),
            ]),
        )
        .map_err(|e| format!("Failed to emit download_progress event: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
async fn run_bambooclaw(app: AppHandle, args: Vec<String>) -> Result<String, String> {
    let bambooclaw_bin = if cfg!(target_os = "windows") {
        "bambooclaw.exe"
    } else {
        "bambooclaw"
    };

    println!("Running bambooclaw with args: {:?}", args);

    let output = TokioCommand::new(bambooclaw_bin)
        .args(&args)
        .output()
        .await
        .map_err(|e| format!("Failed to execute bambooclaw: {}", e))?;

    if output.status.success() {
        String::from_utf8(output.stdout)
            .map_err(|e| format!("Failed to parse bambooclaw stdout as UTF-8: {}", e))
    } else {
        let stderr = String::from_utf8(output.stderr)
            .map_err(|e| format!("Failed to parse bambooclaw stderr as UTF-8: {}", e))?;
        Err(format!(
            "Bambooclaw command failed with exit code {}: {}",
            output.status, stderr
        ))
    }
}

#[tauri::command]
async fn start_daemon(app: AppHandle) -> Result<(), String> {
    let bambooclaw_bin = if cfg!(target_os = "windows") {
        "bambooclaw.exe"
    } else {
        "bambooclaw"
    };

    let mut daemon_guard = DAEMON_PROCESS.lock().map_err(|e| e.to_string())?;

    if daemon_guard.is_some() {
        return Err("Bambooclaw daemon is already running.".into());
    }

    println!("Starting bambooclaw daemon...");

    // Spawn the daemon as a detached process
    let child = TokioCommand::new(bambooclaw_bin)
        .arg("daemon")
        .stdin(Stdio::null()) // Detach stdin
        .stdout(Stdio::null()) // Detach stdout
        .stderr(Stdio::null()) // Detach stderr
        .spawn()
        .map_err(|e| format!("Failed to spawn bambooclaw daemon: {}", e))?;

    *daemon_guard = Some(child);

    // Optionally, log the PID
    if let Some(pid) = daemon_guard.as_ref().and_then(|c| c.id()) {
        println!("Bambooclaw daemon started with PID: {}", pid);
    }

    Ok(())
}

#[tauri::command]
async fn stop_daemon(app: AppHandle) -> Result<(), String> {
    let mut daemon_guard = DAEMON_PROCESS.lock().map_err(|e| e.to_string())?;

    if let Some(mut child) = daemon_guard.take() {
        // First, try to gracefully terminate
        if let Err(e) = child.kill().await {
            eprintln!("Failed to kill bambooclaw daemon (PID: {:?}): {}", child.id(), e);
            return Err(format!("Failed to kill bambooclaw daemon: {}", e));
        }
        println!("Bambooclaw daemon (PID: {:?}) stopped.", child.id());
        Ok(())
    } else {
        // If not tracked by our state, try to find and kill it manually
        // This is OS-specific and more complex. For simplicity, we'll
        // assume `DAEMON_PROCESS` is the primary way of tracking.
        // A more robust solution would involve PID files or inter-process communication.
        println!("No bambooclaw daemon process tracked by the installer. Attempting to find and kill processes named 'bambooclaw daemon'...");
        #[cfg(target_os = "windows")]
        {
            let output = TokioCommand::new("taskkill")
                .args(&["/F", "/IM", "bambooclaw.exe"])
                .output()
                .await
                .map_err(|e| format!("Failed to run taskkill: {}", e))?;
            if output.status.success() {
                Ok("bambooclaw.exe processes terminated.".into())
            } else {
                Err(format!("taskkill failed: {}", String::from_utf8_lossy(&output.stderr)))
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            let output = TokioCommand::new("pkill")
                .arg("-f")
                .arg("bambooclaw daemon") // Match process containing "bambooclaw daemon"
                .output()
                .await
                 .map_err(|e| format!("Failed to run pkill: {}", e))?;
            if output.status.success() {
                Ok("bambooclaw daemon processes terminated.".into())
            } else {
                Err(format!("pkill failed (maybe no process found?): {}", String::from_utf8_lossy(&output.stderr)))
            }
        }
    }
}

#[tauri::command]
async fn read_config(app: AppHandle) -> Result<String, String> {
    let config_path = get_bambooclaw_config_path().map_err(|e| e.to_string())?;

    if !config_path.exists() {
        // Create an empty config file if it doesn't exist.
        // It's better to create a default one for the user.
        let parent_dir = config_path.parent().ok_or_else(|| "Invalid config path".to_string())?;
        fs::create_dir_all(parent_dir).await.map_err(|e| format!("Failed to create config directory: {}", e))?;
        fs::write(&config_path, "# Default BambooClaw configuration\n").await.map_err(|e| format!("Failed to create default config file: {}", e))?;
    }

    fs::read_to_string(&config_path)
        .await
        .map_err(|e| format!("Failed to read config file {}: {}", config_path.display(), e))
}

#[tauri::command]
async fn write_config(app: AppHandle, content: String) -> Result<(), String> {
    let config_path = get_bambooclaw_config_path().map_err(|e| e.to_string())?;

    let parent_dir = config_path.parent().ok_or_else(|| "Invalid config path".to_string())?;
    fs::create_dir_all(parent_dir)
        .await
        .map_err(|e| format!("Failed to create config directory: {}", e))?;

    fs::write(&config_path, content)
        .await
        .map_err(|e| format!("Failed to write config file {}: {}", config_path.display(), e))
}

#[tauri::command]
fn get_platform() -> String {
    if cfg!(target_os = "windows") {
        "windows".into()
    } else if cfg!(target_os = "macos") {
        "macos".into()
    } else if cfg!(target_os = "linux") {
        "linux".into()
    } else {
        "unknown".into()
    }
}

fn main() {
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