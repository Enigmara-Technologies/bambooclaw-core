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
    run_shell_command_sync(&command_name, &args)
}

// 3b. Async version — runs on a background thread so the UI stays responsive
#[tauri::command]
async fn run_shell_command_async(command_name: String, args: Vec<String>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        run_shell_command_sync(&command_name, &args)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?
}

fn run_shell_command_sync(command_name: &str, args: &[String]) -> Result<String, String> {
    let mut cmd = std::process::Command::new(command_name);
    cmd.args(args);

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
                run_shell_command(vswhere.to_string(), vec!["-latest".to_string(), "-property".to_string(), "installationPath".to_string()])
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

// 8. Start the BambooClaw background daemon (in-process thread)
// The agentic loop runs in the JS frontend; this command only toggles
// a lightweight keep-alive thread so the backend knows the daemon is "on".
#[tauri::command]
fn start_daemon(state: tauri::State<DaemonState>) -> Result<String, String> {
    let mut child_guard = state.0.lock().unwrap();
    if child_guard.is_some() {
        return Ok("Daemon is already running".to_string());
    }

    // Spawn a no-op placeholder child (sleep) so we have a PID to track.
    // The real agent logic lives in the webview JS agentic loop.
    #[cfg(target_os = "windows")]
    let child = {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        std::process::Command::new("cmd")
            .args(["/C", "timeout /t 2147483 /nobreak >nul"])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map_err(|e| format!("Failed to start daemon thread: {}", e))?
    };

    #[cfg(not(target_os = "windows"))]
    let child = std::process::Command::new("sleep")
        .arg("infinity")
        .spawn()
        .map_err(|e| format!("Failed to start daemon thread: {}", e))?;

    *child_guard = Some(child);
    Ok("Daemon started".to_string())
}

// 9. Stop the background daemon (only kills the managed child process)
#[tauri::command]
fn stop_daemon(state: tauri::State<DaemonState>) -> Result<String, String> {
    let mut child_guard = state.0.lock().unwrap();

    if let Some(mut child) = child_guard.take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    
    Ok("Daemon stopped".to_string())
}

// 10. Emergency Flush — kill all agent-related processes and clean temp files
#[tauri::command]
fn emergency_flush(state: tauri::State<DaemonState>) -> Result<String, String> {
    // First, stop the managed daemon child process
    let mut child_guard = state.0.lock().unwrap();
    if let Some(mut child) = child_guard.take() {
        let _ = child.kill();
        let _ = child.wait();
    }

    // Kill rogue agent scripts only — NOT bambooclaw.exe (that is this app!)
    #[cfg(target_os = "windows")]
    {
        let _ = run_shell_command("taskkill".to_string(), vec!["/F".to_string(), "/IM".to_string(), "python.exe".to_string()]);
        // Clean tmp directory
        let tmp = Path::new("C:\\tmp");
        if tmp.exists() {
            let _ = std::fs::remove_dir_all(tmp);
            let _ = std::fs::create_dir_all(tmp);
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = run_shell_command("pkill".to_string(), vec!["-f".to_string(), "python".to_string()]);
        // Clean /tmp/bambooclaw if it exists
        let tmp = Path::new("/tmp/bambooclaw");
        if tmp.exists() {
            let _ = std::fs::remove_dir_all(tmp);
            let _ = std::fs::create_dir_all(tmp);
        }
    }

    Ok("Emergency flush complete: processes killed, temp files cleaned".to_string())
}

fn main() {
    tauri::Builder::default()
        .manage(DaemonState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            get_platform,
            get_home_dir,
            run_shell_command,
            run_shell_command_async,
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
