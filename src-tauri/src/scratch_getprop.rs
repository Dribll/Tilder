#![cfg(target_os = "windows")]

use windows::{
    Win32::{
        Foundation::HWND,
        UI::WindowsAndMessaging::GetPropW,
    },
    core::PCWSTR,
};
use std::os::windows::ffi::OsStrExt;

pub fn test() {
    let hwnd = HWND(0);
    let mut name: Vec<u16> = std::ffi::OsStr::new("OleDropTargetInterface").encode_wide().chain(std::iter::once(0)).collect();
    let ptr = unsafe { GetPropW(hwnd, PCWSTR::from_raw(name.as_ptr())) };
    println!("{:?}", ptr);
}
