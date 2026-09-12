use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // 单实例（发布门槛）：第二实例启动时聚焦已有主窗口后自行退出，
        // 避免两个实例各起一份 watcher、共用同名 .rt-tmp/.rt-bak 互相干扰
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
                let _ = win.unminimize();
                let _ = win.set_focus();
            }
        }))
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|_app| {
            // macOS：Finder/Dock 启动不继承 .zshrc 的 PATH，git/claude/codex 会找不到；
            // 官方 fix-path-env 恢复登录 shell 的 PATH（其他平台为安全 no-op）
            if let Err(e) = fix_path_env::fix() {
                eprintln!("fix_path_env failed: {e}");
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
