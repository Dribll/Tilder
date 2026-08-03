/// Windows Jump List implementation for Tilder desktop
/// Adds "New Window" task and recent files/workspaces to the taskbar right-click menu.

#[cfg(target_os = "windows")]
mod windows_impl {
    use std::env;
    use windows::core::GUID;
    use windows::core::{Interface, HSTRING, PCWSTR, PROPVARIANT};
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoTaskMemAlloc, CLSCTX_INPROC_SERVER,
        COINIT_APARTMENTTHREADED,
    };
    use windows::Win32::UI::Shell::Common::{IObjectArray, IObjectCollection};
    use windows::Win32::UI::Shell::PropertiesSystem::{IPropertyStore, PROPERTYKEY};
    use windows::Win32::UI::Shell::{
        DestinationList, EnumerableObjectCollection, ICustomDestinationList, IShellLinkW, ShellLink,
    };

    // PKEY_Title: {F29F85E0-4FF9-1068-AB91-08002B27B3D9}, pid=2
    const PKEY_TITLE: PROPERTYKEY = PROPERTYKEY {
        fmtid: GUID::from_u128(0xF29F85E0_4FF9_1068_AB91_08002B27B3D9),
        pid: 2,
    };

    // A memory-layout-compatible struct for VT_LPWSTR PROPVARIANT.
    // PROPVARIANT layout: vt(2) + reserved*3(6) + union(16 on x64) = 24 bytes.
    // We use a [u64; 2] blob for the union to ensure 16-byte size.
    #[repr(C, align(8))]
    union PvUnion {
        pwsz: *mut u16,
        blob: [u64; 2],
    }

    #[repr(C)]
    struct PvLpwstr {
        vt: u16,
        res1: u16,
        res2: u16,
        res3: u16,
        value: PvUnion,
    }

    pub fn update_jump_list(
        files: Vec<String>,
        workspaces: Vec<String>,
    ) -> windows::core::Result<()> {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);

            let dest_list: ICustomDestinationList =
                CoCreateInstance(&DestinationList, None, CLSCTX_INPROC_SERVER)?;

            let app_id = HSTRING::from("com.tilder.desktop");
            let _ = windows::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID(
                PCWSTR::from_raw(app_id.as_ptr()),
            );
            let _ = dest_list.SetAppID(PCWSTR::from_raw(app_id.as_ptr()));

            let mut min_slots: u32 = 0;
            let _removed: IObjectArray = dest_list.BeginList(&mut min_slots)?;

            // --- Tasks: New Window ---
            let tasks: IObjectCollection =
                CoCreateInstance(&EnumerableObjectCollection, None, CLSCTX_INPROC_SERVER)?;
            if let Ok(link) = create_shell_link("New Window", "--new-window") {
                let _ = tasks.AddObject(&link);
            }
            let tasks_arr: IObjectArray = tasks.cast()?;
            dest_list.AddUserTasks(&tasks_arr)?;

            // --- Recent Workspaces ---
            if !workspaces.is_empty() {
                let col: IObjectCollection =
                    CoCreateInstance(&EnumerableObjectCollection, None, CLSCTX_INPROC_SERVER)?;
                for ws in workspaces.iter().take(10) {
                    if let Ok(link) =
                        create_shell_link(&filename(ws), &format!("--workspace \"{}\"", ws))
                    {
                        let _ = col.AddObject(&link);
                    }
                }
                let arr: IObjectArray = col.cast()?;
                dest_list.AppendCategory(&HSTRING::from("Recent Folders & Workspaces"), &arr)?;
            }

            // --- Recent Files ---
            if !files.is_empty() {
                let col: IObjectCollection =
                    CoCreateInstance(&EnumerableObjectCollection, None, CLSCTX_INPROC_SERVER)?;
                for f in files.iter().take(10) {
                    if let Ok(link) = create_shell_link(&filename(f), &format!("--file \"{}\"", f))
                    {
                        let _ = col.AddObject(&link);
                    }
                }
                let arr: IObjectArray = col.cast()?;
                dest_list.AppendCategory(&HSTRING::from("Recent"), &arr)?;
            }

            dest_list.CommitList()?;
            Ok(())
        }
    }

    unsafe fn make_lpwstr_propvariant(title: &str) -> PROPVARIANT {
        // Verify size compatibility at compile time.
        const _: () = assert!(
            std::mem::size_of::<PvLpwstr>() == std::mem::size_of::<PROPVARIANT>(),
            "PvLpwstr size does not match PROPVARIANT size"
        );

        let wide: Vec<u16> = title.encode_utf16().chain(std::iter::once(0)).collect();
        let bytes_len = wide.len() * 2;
        let ptr = CoTaskMemAlloc(bytes_len);
        if !ptr.is_null() {
            std::ptr::copy_nonoverlapping(wide.as_ptr(), ptr as *mut u16, wide.len());
        }

        let raw = PvLpwstr {
            vt: 31, // VT_LPWSTR
            res1: 0,
            res2: 0,
            res3: 0,
            value: PvUnion {
                pwsz: ptr as *mut u16,
            },
        };
        std::mem::transmute::<PvLpwstr, PROPVARIANT>(raw)
    }

    unsafe fn create_shell_link(title: &str, args: &str) -> windows::core::Result<IShellLinkW> {
        let exe_path = env::current_exe().unwrap_or_default();
        let exe_str = exe_path.to_string_lossy().to_string();

        let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)?;

        let path_h = HSTRING::from(&exe_str);
        link.SetPath(PCWSTR::from_raw(path_h.as_ptr()))?;

        let args_h = HSTRING::from(args);
        link.SetArguments(PCWSTR::from_raw(args_h.as_ptr()))?;

        // Set title via IPropertyStore so Jump List shows the correct label.
        let store: IPropertyStore = link.cast()?;
        let pv = make_lpwstr_propvariant(title);

        store.SetValue(&PKEY_TITLE, &pv)?;
        store.Commit()?;

        // pv goes out of scope here; its Drop will call PropVariantClear on a VT_LPWSTR
        // which calls CoTaskMemFree on the CoTaskMemAlloc'd pointer. That is 100% safe,
        // has no allocator mismatch, and causes no heap corruption!

        Ok(link)
    }

    fn filename(path: &str) -> String {
        std::path::Path::new(path)
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string()
    }
}

#[tauri::command]
pub fn desktop_update_jump_list(files: Vec<String>, workspaces: Vec<String>) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        if let Err(e) = windows_impl::update_jump_list(files, workspaces) {
            return Err(e.to_string());
        }
    }
    Ok(())
}
