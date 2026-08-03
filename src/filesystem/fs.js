import * as browser from "browserFS"
import * as tauri from "tauriFS"
import { isDesktopRuntime } from "../core/runtime.js"

const isTauri = isDesktopRuntime()

export const FS = isTauri ? tauri : browser
