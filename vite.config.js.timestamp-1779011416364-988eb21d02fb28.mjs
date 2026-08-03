// vite.config.js
import { defineConfig } from "file:///D:/Tilder%20-%20Copy/desktop-app/node_modules/vite/dist/node/index.js";
import react from "file:///D:/Tilder%20-%20Copy/desktop-app/node_modules/@vitejs/plugin-react-swc/index.mjs";
var host = process.env.TAURI_DEV_HOST;
var vite_config_default = defineConfig({
  clearScreen: false,
  base: "./",
  plugins: [react()],
  envPrefix: ["VITE_", "TAURI_ENV_*"],
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host ? {
      protocol: "ws",
      host,
      port: 1421
    } : void 0,
    watch: {
      ignored: ["**/src-tauri/**"]
    },
    proxy: {
      "/api": "http://localhost:3210",
      "/socket.io": "http://localhost:3210"
    }
  },
  build: {
    target: process.env.TAURI_ENV_PLATFORM === "windows" ? "chrome105" : "safari13",
    minify: !process.env.TAURI_ENV_DEBUG ? "esbuild" : false,
    sourcemap: !!process.env.TAURI_ENV_DEBUG
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJEOlxcXFxUaWxkZXIgLSBDb3B5XFxcXGRlc2t0b3AtYXBwXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJEOlxcXFxUaWxkZXIgLSBDb3B5XFxcXGRlc2t0b3AtYXBwXFxcXHZpdGUuY29uZmlnLmpzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9EOi9UaWxkZXIlMjAtJTIwQ29weS9kZXNrdG9wLWFwcC92aXRlLmNvbmZpZy5qc1wiO2ltcG9ydCB7IGRlZmluZUNvbmZpZyB9IGZyb20gJ3ZpdGUnXG5pbXBvcnQgcmVhY3QgZnJvbSAnQHZpdGVqcy9wbHVnaW4tcmVhY3Qtc3djJ1xuXG5jb25zdCBob3N0ID0gcHJvY2Vzcy5lbnYuVEFVUklfREVWX0hPU1RcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgY2xlYXJTY3JlZW46IGZhbHNlLFxuICBiYXNlOiAnLi8nLFxuICBwbHVnaW5zOiBbcmVhY3QoKV0sXG4gIGVudlByZWZpeDogWydWSVRFXycsICdUQVVSSV9FTlZfKiddLFxuICBzZXJ2ZXI6IHtcbiAgICBwb3J0OiA1MTczLFxuICAgIHN0cmljdFBvcnQ6IHRydWUsXG4gICAgaG9zdDogaG9zdCB8fCBmYWxzZSxcbiAgICBobXI6IGhvc3RcbiAgICAgID8ge1xuICAgICAgICAgIHByb3RvY29sOiAnd3MnLFxuICAgICAgICAgIGhvc3QsXG4gICAgICAgICAgcG9ydDogMTQyMSxcbiAgICAgICAgfVxuICAgICAgOiB1bmRlZmluZWQsXG4gICAgd2F0Y2g6IHtcbiAgICAgIGlnbm9yZWQ6IFsnKiovc3JjLXRhdXJpLyoqJ10sXG4gICAgfSxcbiAgICBwcm94eToge1xuICAgICAgJy9hcGknOiAnaHR0cDovL2xvY2FsaG9zdDozMjEwJyxcbiAgICAgICcvc29ja2V0LmlvJzogJ2h0dHA6Ly9sb2NhbGhvc3Q6MzIxMCcsXG4gICAgfSxcbiAgfSxcbiAgYnVpbGQ6IHtcbiAgICB0YXJnZXQ6IHByb2Nlc3MuZW52LlRBVVJJX0VOVl9QTEFURk9STSA9PT0gJ3dpbmRvd3MnID8gJ2Nocm9tZTEwNScgOiAnc2FmYXJpMTMnLFxuICAgIG1pbmlmeTogIXByb2Nlc3MuZW52LlRBVVJJX0VOVl9ERUJVRyA/ICdlc2J1aWxkJyA6IGZhbHNlLFxuICAgIHNvdXJjZW1hcDogISFwcm9jZXNzLmVudi5UQVVSSV9FTlZfREVCVUcsXG4gIH0sXG59KVxuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFnUixTQUFTLG9CQUFvQjtBQUM3UyxPQUFPLFdBQVc7QUFFbEIsSUFBTSxPQUFPLFFBQVEsSUFBSTtBQUV6QixJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixhQUFhO0FBQUEsRUFDYixNQUFNO0FBQUEsRUFDTixTQUFTLENBQUMsTUFBTSxDQUFDO0FBQUEsRUFDakIsV0FBVyxDQUFDLFNBQVMsYUFBYTtBQUFBLEVBQ2xDLFFBQVE7QUFBQSxJQUNOLE1BQU07QUFBQSxJQUNOLFlBQVk7QUFBQSxJQUNaLE1BQU0sUUFBUTtBQUFBLElBQ2QsS0FBSyxPQUNEO0FBQUEsTUFDRSxVQUFVO0FBQUEsTUFDVjtBQUFBLE1BQ0EsTUFBTTtBQUFBLElBQ1IsSUFDQTtBQUFBLElBQ0osT0FBTztBQUFBLE1BQ0wsU0FBUyxDQUFDLGlCQUFpQjtBQUFBLElBQzdCO0FBQUEsSUFDQSxPQUFPO0FBQUEsTUFDTCxRQUFRO0FBQUEsTUFDUixjQUFjO0FBQUEsSUFDaEI7QUFBQSxFQUNGO0FBQUEsRUFDQSxPQUFPO0FBQUEsSUFDTCxRQUFRLFFBQVEsSUFBSSx1QkFBdUIsWUFBWSxjQUFjO0FBQUEsSUFDckUsUUFBUSxDQUFDLFFBQVEsSUFBSSxrQkFBa0IsWUFBWTtBQUFBLElBQ25ELFdBQVcsQ0FBQyxDQUFDLFFBQVEsSUFBSTtBQUFBLEVBQzNCO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
