#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::process::Command;

use futures_util::StreamExt;
use sysinfo::System;
use tauri::command;

fn config_dir() -> Result<PathBuf, String> {
    dirs::home_dir()
        .map(|h| h.join(".bambooclaw"))
        .ok_or_else(|| "Could not determine home directory".to_string())
}

#[command]
fn get_platform() -> String {
    if cfg!(target_os = "windows") { "windows".into() }
    else if cfg!(target_os = "macos") { "macos".into() }
    else { "linux".into() }
}

#[command]
fn run_shell_command(command_name: String, args: Vec<String>) -> Result<String, String> {
    let output = Command::new(&command_name).args(&args).output()
        .map_err(|e| format!("Failed to run {}: {}", command_name, e))?;
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    Ok(format!("{}{}", stdout, stderr))
}

#[command]
fn run_bambooclaw(args: Vec<String>) -> Result<String, String> {
    run_shell_command("bambooclaw".to_string(), args)
}

#[command]
fn check_prerequisite(name: String) -> Result<String, String> {
    match name.as_str() {
        "rustc" => run_shell_command("rustc".to_string(), vec!["--version".to_string()]),
        "cargo" => run_shell_command("cargo".to_string(), vec!["--version".to_string()]),
        "bambooclaw" => {
            match which::which("bambooclaw") {
                Ok(p) => Ok(format!("Found at: {}", p.display())),
                Err(_) => Err("bambooclaw not found in PATH".to_string()),
            }
        }
        "vs_build_tools" => check_vs_build_tools(),
        _ => Err(format!("Unknown prerequisite: {}", name)),
    }
}

#[cfg(target_os = "windows")]
fn check_vs_build_tools() -> Result<String, String> {
    let output = Command::new("cmd").args(["/C", "where", "cl.exe"]).output()
        .map_err(|e| format!("Failed to check VS Build Tools: {}", e))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else { Err("Visual Studio Build Tools not found".to_string()) }
}

#[cfg(not(target_os = "windows"))]
fn check_vs_build_tools() -> Result<String, String> {
    Ok("Not required on this platform".to_string())
}

#[command]
fn read_config() -> Result<String, String> {
    let path = config_dir()?.join("config.toml");
    fs::read_to_string(&path).map_err(|e| format!("Failed to read config: {}", e))
}

#[command]
fn write_config(content: String) -> Result<(), String> {
    let dir = config_dir()?;
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create config dir: {}", e))?;
    let path = dir.join("config.toml");
    let mut file = fs::File::create(&path).map_err(|e| format!("Failed to create config file: {}", e))?;
    file.write_all(content.as_bytes()).map_err(|e| format!("Failed to write config: {}", e))
}

#[command]
fn save_config(key: String, value: String) -> Result<(), String> {
    let dir = config_dir()?;
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create config dir: {}", e))?;
    let path = dir.join("config.toml");
    let mut existing = fs::read_to_string(&path).unwrap_or_default();
    // Simple append/replace logic for key=value pairs
    let line = format!("{}=\"{}\"", key, value);
    let key_prefix = format!("{}=", key);
    if existing.contains(&key_prefix) {
        let lines: Vec<&str> = existing.lines().collect();
        let updated: Vec<String> = lines.iter().map(|l| {
            if l.starts_with(&key_prefix) { line.clone() } else { l.to_string() }
        }).collect();
        existing = updated.join("\n");
    } else {
        if !existing.is_empty() && !existing.ends_with('\n') {
            existing.push('\n');
        }
        existing.push_str(&line);
    }
    let mut file = fs::File::create(&path).map_err(|e| format!("Failed to create config file: {}", e))?;
    file.write_all(existing.as_bytes()).map_err(|e| format!("Failed to write config: {}", e))
}

#[command]
fn start_daemon() -> Result<String, String> {
    let child = Command::new("bambooclaw").arg("daemon").spawn()
        .map_err(|e| format!("Failed to start daemon: {}", e))?;
    Ok(format!("Daemon started with PID {}", child.id()))
}

#[command]
fn stop_daemon() -> Result<String, String> {
    let mut sys = System::new_all();
    sys.refresh_all();
    let mut found = false;
    for (_pid, process) in sys.processes() {
        if process.name().to_string().contains("bambooclaw") {
            process.kill();
            found = true;
        }
    }
    if found { Ok("Daemon stopped".to_string()) } else { Err("No running bambooclaw process found".to_string()) }
}

#[command]
async fn download_binary(url: String, dest: String) -> Result<String, String> {
    let response = reqwest::get(&url).await
        .map_err(|e| format!("Download failed: {}", e))?;
    let _total_size = response.content_length().unwrap_or(0);
    let mut stream = response.bytes_stream();
    let mut file = std::fs::File::create(&dest)
        .map_err(|e| format!("Failed to create file: {}", e))?;
    let mut downloaded: u64 = 0;
    while let Some(item) = stream.next().await {
        let chunk = item.map_err(|e| format!("Stream error: {}", e))?;
        file.write_all(&chunk).map_err(|e| format!("Write error: {}", e))?;
        downloaded += chunk.len() as u64;
    }
    Ok(format!("Downloaded {} bytes to {}", downloaded, dest))
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_platform,
            run_shell_command,
            run_bambooclaw,
            check_prerequisite,
            read_config,
            write_config,
            save_config,
            start_daemon,
            stop_daemon,
            download_binary
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
