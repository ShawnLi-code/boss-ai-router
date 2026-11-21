use std::io::{Read, Write};
use std::net::{SocketAddr, TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{Manager, RunEvent};

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

struct ServerProcess(Arc<Mutex<Option<Child>>>);

fn check_our_server(port: u16) -> bool {
    let addr: SocketAddr = format!("127.0.0.1:{port}").parse().unwrap();
    let Ok(mut stream) = TcpStream::connect_timeout(&addr, Duration::from_millis(180)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(400)));
    let req = format!("GET /api/state HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n");
    if stream.write_all(req.as_bytes()).is_err() {
        return false;
    }
    let mut buf = [0u8; 512];
    let n = stream.read(&mut buf).unwrap_or(0);
    let head = String::from_utf8_lossy(&buf[..n]);
    head.contains("200 OK") && head.contains("tracks")
}

fn find_free_port(preferred: u16) -> u16 {
    if TcpListener::bind(("127.0.0.1", preferred)).is_ok() {
        return preferred;
    }
    TcpListener::bind("127.0.0.1:0")
        .and_then(|l| l.local_addr())
        .map(|a| a.port())
        .unwrap_or(preferred)
}

fn resolve_server_entry(app: &tauri::AppHandle) -> Option<(PathBuf, PathBuf, bool)> {
    let candidates = [
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().map(|p| p.to_path_buf()),
        std::env::current_dir().ok(),
        std::env::current_exe().ok().and_then(|p| p.parent().map(|d| d.to_path_buf())),
    ];
    for base_opt in candidates.into_iter().flatten() {
        let script = base_opt.join("src").join("server.mjs");
        if script.exists() {
            return Some((base_opt, script, false));
        }
    }

    if let Ok(res_dir) = app.path().resource_dir() {
        let direct = res_dir.join("src").join("server.mjs");
        if direct.exists() {
            return Some((res_dir, direct, true));
        }
        let up = res_dir.join("_up_").join("src").join("server.mjs");
        if up.exists() {
            return Some((res_dir.join("_up_"), up, true));
        }
    }
    None
}

fn spawn_node_server(app: &tauri::AppHandle) -> Result<(u16, Option<Child>), String> {
    if check_our_server(3789) {
        return Ok((3789, None));
    }

    let port = find_free_port(3789);
    let (work_dir, script_path, is_packaged) = resolve_server_entry(app)
        .ok_or_else(|| "找不到 src/server.mjs 服务端入口文件".to_string())?;

    let mut cmd = Command::new("node");
    cmd.arg(&script_path)
        .current_dir(&work_dir)
        .env("BOSS_ROUTER_PORT", port.to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    if let Ok(exe_path) = std::env::current_exe() {
        cmd.env("BOSS_ROUTER_EXE_PATH", exe_path);
    }

    if is_packaged {
        if let Ok(data_base) = app.path().app_local_data_dir() {
            cmd.env("BOSS_ROUTER_DATA_DIR", data_base.join("data"));
        }
    }

    #[cfg(target_os = "windows")]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("启动 Node 引擎失败（请确认已安装 Node.js >= 22.5）：{e}"))?;

    let deadline = Instant::now() + Duration::from_secs(6);
    while Instant::now() < deadline {
        if check_our_server(port) {
            return Ok((port, Some(child)));
        }
        if let Ok(Some(status)) = child.try_wait() {
            return Err(format!("本地服务提前退出：{status}"));
        }
        std::thread::sleep(Duration::from_millis(120));
    }

    let _ = child.kill();
    Err("等待本地服务就绪超时".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let shared_child = Arc::new(Mutex::new(None));
    let app = tauri::Builder::default()
        .manage(ServerProcess(shared_child.clone()))
        .setup(move |app| {
            let handle = app.handle().clone();
            let child_slot = shared_child.clone();
            std::thread::spawn(move || {
                match spawn_node_server(&handle) {
                    Ok((port, maybe_child)) => {
                        if let Some(child) = maybe_child {
                            if let Ok(mut guard) = child_slot.lock() {
                                *guard = Some(child);
                            }
                        }
                        if let Some(win) = handle.get_webview_window("main") {
                            let target: tauri::Url = format!("http://127.0.0.1:{port}/").parse().unwrap();
                            let _ = win.navigate(target);
                        }
                        // Monitor for exit code 42 (self-update restart signal)
                        loop {
                            std::thread::sleep(Duration::from_millis(450));
                            let mut exited_for_update = false;
                            if let Ok(mut guard) = child_slot.lock() {
                                if let Some(ref mut ch) = *guard {
                                    if let Ok(Some(st)) = ch.try_wait() {
                                        if st.code() == Some(42) {
                                            exited_for_update = true;
                                            *guard = None;
                                        } else {
                                            *guard = None;
                                            break;
                                        }
                                    }
                                } else {
                                    break;
                                }
                            }
                            if exited_for_update {
                                handle.exit(0);
                                break;
                            }
                        }
                    }
                    Err(err_msg) => {
                        if let Some(win) = handle.get_webview_window("main") {
                            let js = format!(
                                "document.getElementById('status').textContent = {};",
                                format!("{:?}", err_msg)
                            );
                            let _ = win.eval(&js);
                        }
                    }
                }
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let RunEvent::Exit = event {
            if let Ok(mut guard) = app_handle.state::<ServerProcess>().0.lock() {
                if let Some(mut child) = guard.take() {
                    let _ = child.kill();
                    let _ = child.wait();
                }
            }
        }
    });
}
