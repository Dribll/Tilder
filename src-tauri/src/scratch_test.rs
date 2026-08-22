#![cfg(target_os = "windows")]

use std::{
    ffi::c_void,
    sync::{atomic::{AtomicU32, Ordering}, Arc},
};
use windows::{
    Win32::{
        Foundation::{HWND, POINTL, S_OK, E_NOINTERFACE},
        System::Ole::{DROPEFFECT, IDropTarget, IDropTarget_Vtbl},
    },
    core::{GUID, HRESULT},
};

#[repr(C)]
pub struct RawDropTargetVtbl {
    pub QueryInterface: unsafe extern "system" fn(this: *mut RawDropTarget, iid: *const GUID, ppv: *mut *mut c_void) -> HRESULT,
    pub AddRef: unsafe extern "system" fn(this: *mut RawDropTarget) -> u32,
    pub Release: unsafe extern "system" fn(this: *mut RawDropTarget) -> u32,
    pub DragEnter: unsafe extern "system" fn(this: *mut RawDropTarget, pDataObj: *mut c_void, grfKeyState: u32, pt: POINTL, pdwEffect: *mut DROPEFFECT) -> HRESULT,
    pub DragOver: unsafe extern "system" fn(this: *mut RawDropTarget, grfKeyState: u32, pt: POINTL, pdwEffect: *mut DROPEFFECT) -> HRESULT,
    pub DragLeave: unsafe extern "system" fn(this: *mut RawDropTarget) -> HRESULT,
    pub Drop: unsafe extern "system" fn(this: *mut RawDropTarget, pDataObj: *mut c_void, grfKeyState: u32, pt: POINTL, pdwEffect: *mut DROPEFFECT) -> HRESULT,
}

#[repr(C)]
pub struct RawDropTarget {
    pub lpVtbl: *const RawDropTargetVtbl,
    pub ref_count: AtomicU32,
}

pub fn test() {
    let raw = Box::new(RawDropTarget {
        lpVtbl: std::ptr::null(),
        ref_count: AtomicU32::new(1),
    });
    
    let ptr = Box::into_raw(raw);
    let _idroptarget: IDropTarget = unsafe { std::mem::transmute(ptr) };
}
