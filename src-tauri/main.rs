#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::sync::Mutex;
use std::process::Child;
use std::path::Path;

// State manager to keep track of the running background daemon
struct DaemonState(Mutex<Option<Child>>);

// 1. Get the current OS (Windows, macOS, Linux)
#[tauri::command]
fn get_platform() -> String {
    std::env::consts::OS.to_string()
}

// 2. Get the user's home directory safely across operating systems
#[tauri::command]
fn get_home_dir() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    {
        std::env::var("USERPROFILE").map_err(|e| e.to_string())
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::env::var("HOME").map_err(|e| e.to_string())
    }
}

// 3. Execute any shell command and return stdout or stderr (HEADLESS)
#[tauri::command]
fn run_shell_command(command_name: String, args: Vec<String>) -> Result<String, String> {
    let mut cmd = std::process::Command::new(&command_name);
    cmd.args(&args);

    // This block specifically hides the CMD window on Windows
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let output = cmd.output()
        .map_err(|e| format!("Failed to execute process '{}': {}", command_name, e))?;
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    
    if output.status.success() {
        Ok(stdout.to_string())
    } else {
        Err(format!("Command failed: {}\n{}", output.status, stderr))
    }
}

// 4. Verify system prerequisites during the boot wizard
#[tauri::command]
fn check_prerequisite(name: String) -> Result<String, String> {
    match name.as_str() {
        "rustc" => run_shell_command("rustc".to_string(), vec!["--version".to_string()]),
        "vs_build_tools" => {
            #[cfg(target_os = "windows")]
            {
                let vswhere = "C:\\Program Files (x86)\\Microsoft Visual Studio\\Installer\\vswhere.exe";
                run_shell_command(vswhere.to_string(), vec!["-latest".to_string(), "-property".to_string(), "installationPath"])
            }
            #[cfg(not(target_os = "windows"))]
            {
                Ok("Not required on this OS".to_string())
            }
        },
        _ => Err(format!("Unknown prerequisite: {}", name))
    }
}

// 5. Read the config.toml file
#[tauri::command]
fn read_config() -> Result<String, String> {
    let home = get_home_dir()?;
    let path = Path::new(&home).join(".bambooclaw").join("config.toml");
    std::fs::read_to_string(path).map_err(|e| e.to_string())
}

// 6. Save the config.toml file
#[tauri::command]
fn write_config(content: String) -> Result<String, String> {
    let home = get_home_dir()?;
    let dir = Path::new(&home).join(".bambooclaw");
    
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    
    let path = dir.join("config.toml");
    std::fs::write(path, content).map_err(|e| e.to_string())?;
    Ok("Config written".to_string())
}

// 7. Download a binary
#[tauri::command]
fn download_binary(url: String, dest: String) -> Result<String, String> {
    run_shell_command("curl".to_string(), vec!["-sL".to_string(), "-o".to_string(), dest, url])
}

// 8. Start the BambooClaw background daemon (HEADLESS)
#[tauri::command]
fn start_daemon(state: tauri::State<DaemonState>) -> Result<String, String> {
    let home = get_home_dir()?;
    
    #[cfg(target_os = "windows")]
    let bin_name = "bambooclaw.exe";
    #[cfg(not(target_os = "windows"))]
    let bin_name = "bambooclaw";
    
    let bin_path = Path::new(&home).join(".bambooclaw").join(bin_name);
    
    let mut child_guard = state.0.lock().unwrap();
    if child_guard.is_some() {
        return Ok("Daemon is already running".to_string());
    }
    
    let mut cmd = std::process::Command::new(bin_path);

    // Prevent the background agent from spawning its own window
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    
    let child = cmd.spawn()
        .map_err(|e| format!("Failed to start daemon: {}", e))?;
        
    *child_guard = Some(child);
    Ok("Daemon started".to_string())
}

// 9. Stop the background daemon
#[tauri::command]
fn stop_daemon(state: tauri::State<DaemonState>) -> Result<String, String> {
    let mut child_guard = state.0.lock().unwrap();
    
    #[cfg(target_os = "windows")]
    let _ = run_shell_command("taskkill".to_string(), vec!["/F".to_string(), "/IM".to_string(), "bambooclaw.exe".to_string()]);
    #[cfg(not(target_os = "windows"))]
    let _ = run_shell_command("pkill".to_string(), vec!["-f".to_string(), "bambooclaw".to_string()]);

    if let Some(mut child) = child_guard.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    
    Ok("Daemon stopped".to_string())
}

// 10. Emergency Kill Switch (Clears hung processes and temp files)
#[tauri::command]
fn emergency_flush(state: tauri::State<DaemonState>) -> Result<String, String> {
    // Drop the active daemon handle if it exists
    {
        let mut child_guard = state.0.lock().unwrap();
        if let Some(mut child) = child_guard.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
    
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        
        // Force kill the daemon, python, and shell processes that might be holding pipes hostage
        let processes_to_kill = ["bambooclaw.exe", "python.exe", "pythonw.exe", "cmd.exe", "powershell.exe"];
        for proc in processes_to_kill.iter() {
            let _ = std::process::Command::new("taskkill")
                .args(&["/F", "/T", "/IM", proc])
                .creation_flags(CREATE_NO_WINDOW)
                .output();
        }

        // Nuke the temp directory created by the agent
        let _ = std::fs::remove_dir_all("C:\\tmp");
        let _ = std::fs::create_dir_all("C:\\tmp");
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        let processes_to_kill = ["bambooclaw", "python", "python3"];
        for proc in processes_to_kill.iter() {
            let _ = std::process::Command::new("pkill")
                .args(&["-9", "-f", proc])
                .output();
        }
        
        // Clean temp files generated by agent
        let _ = std::process::Command::new("sh")
            .args(&["-c", "rm -rf /tmp/bc_* /tmp/*.py /tmp/*.png /tmp/*.csv /tmp/*.xlsx"])
            .output();
    }
    
    Ok("System flushed successfully".to_string())
}

fn main() {
    tauri::Builder::default()
        .manage(DaemonState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            get_platform,
            get_home_dir,
            run_shell_command,
            check_prerequisite,
            read_config,
            write_config,
            download_binary,
            start_daemon,
            stop_daemon,
            emergency_flush
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}