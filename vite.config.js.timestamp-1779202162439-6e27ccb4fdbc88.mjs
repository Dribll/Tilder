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
      ignored: ["**/src-tauri/**", "**/*.py", "**/*.rs", "**/*.java", "**/*.class", "**/*.exe", "**/*.dll", "**/target/**", "**/.git/**"]
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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJEOlxcXFxUaWxkZXIgLSBDb3B5XFxcXGRlc2t0b3AtYXBwXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCJEOlxcXFxUaWxkZXIgLSBDb3B5XFxcXGRlc2t0b3AtYXBwXFxcXHZpdGUuY29uZmlnLmpzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9EOi9UaWxkZXIlMjAtJTIwQ29weS9kZXNrdG9wLWFwcC92aXRlLmNvbmZpZy5qc1wiO2ltcG9ydCB7IGRlZmluZUNvbmZpZyB9IGZyb20gJ3ZpdGUnXG5pbXBvcnQgcmVhY3QgZnJvbSAnQHZpdGVqcy9wbHVnaW4tcmVhY3Qtc3djJ1xuXG5jb25zdCBob3N0ID0gcHJvY2Vzcy5lbnYuVEFVUklfREVWX0hPU1RcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgY2xlYXJTY3JlZW46IGZhbHNlLFxuICBiYXNlOiAnLi8nLFxuICBwbHVnaW5zOiBbcmVhY3QoKV0sXG4gIGVudlByZWZpeDogWydWSVRFXycsICdUQVVSSV9FTlZfKiddLFxuICBzZXJ2ZXI6IHtcbiAgICBwb3J0OiA1MTczLFxuICAgIHN0cmljdFBvcnQ6IHRydWUsXG4gICAgaG9zdDogaG9zdCB8fCBmYWxzZSxcbiAgICBobXI6IGhvc3RcbiAgICAgID8ge1xuICAgICAgICAgIHByb3RvY29sOiAnd3MnLFxuICAgICAgICAgIGhvc3QsXG4gICAgICAgICAgcG9ydDogMTQyMSxcbiAgICAgICAgfVxuICAgICAgOiB1bmRlZmluZWQsXG4gICAgd2F0Y2g6IHtcbiAgICAgIGlnbm9yZWQ6IFsnKiovc3JjLXRhdXJpLyoqJywgJyoqLyoucHknLCAnKiovKi5ycycsICcqKi8qLmphdmEnLCAnKiovKi5jbGFzcycsICcqKi8qLmV4ZScsICcqKi8qLmRsbCcsICcqKi90YXJnZXQvKionLCAnKiovLmdpdC8qKiddLFxuICAgIH0sXG4gICAgcHJveHk6IHtcbiAgICAgICcvYXBpJzogJ2h0dHA6Ly9sb2NhbGhvc3Q6MzIxMCcsXG4gICAgICAnL3NvY2tldC5pbyc6ICdodHRwOi8vbG9jYWxob3N0OjMyMTAnLFxuICAgIH0sXG4gIH0sXG4gIGJ1aWxkOiB7XG4gICAgdGFyZ2V0OiBwcm9jZXNzLmVudi5UQVVSSV9FTlZfUExBVEZPUk0gPT09ICd3aW5kb3dzJyA/ICdjaHJvbWUxMDUnIDogJ3NhZmFyaTEzJyxcbiAgICBtaW5pZnk6ICFwcm9jZXNzLmVudi5UQVVSSV9FTlZfREVCVUcgPyAnZXNidWlsZCcgOiBmYWxzZSxcbiAgICBzb3VyY2VtYXA6ICEhcHJvY2Vzcy5lbnYuVEFVUklfRU5WX0RFQlVHLFxuICB9LFxufSlcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBZ1IsU0FBUyxvQkFBb0I7QUFDN1MsT0FBTyxXQUFXO0FBRWxCLElBQU0sT0FBTyxRQUFRLElBQUk7QUFFekIsSUFBTyxzQkFBUSxhQUFhO0FBQUEsRUFDMUIsYUFBYTtBQUFBLEVBQ2IsTUFBTTtBQUFBLEVBQ04sU0FBUyxDQUFDLE1BQU0sQ0FBQztBQUFBLEVBQ2pCLFdBQVcsQ0FBQyxTQUFTLGFBQWE7QUFBQSxFQUNsQyxRQUFRO0FBQUEsSUFDTixNQUFNO0FBQUEsSUFDTixZQUFZO0FBQUEsSUFDWixNQUFNLFFBQVE7QUFBQSxJQUNkLEtBQUssT0FDRDtBQUFBLE1BQ0UsVUFBVTtBQUFBLE1BQ1Y7QUFBQSxNQUNBLE1BQU07QUFBQSxJQUNSLElBQ0E7QUFBQSxJQUNKLE9BQU87QUFBQSxNQUNMLFNBQVMsQ0FBQyxtQkFBbUIsV0FBVyxXQUFXLGFBQWEsY0FBYyxZQUFZLFlBQVksZ0JBQWdCLFlBQVk7QUFBQSxJQUNwSTtBQUFBLElBQ0EsT0FBTztBQUFBLE1BQ0wsUUFBUTtBQUFBLE1BQ1IsY0FBYztBQUFBLElBQ2hCO0FBQUEsRUFDRjtBQUFBLEVBQ0EsT0FBTztBQUFBLElBQ0wsUUFBUSxRQUFRLElBQUksdUJBQXVCLFlBQVksY0FBYztBQUFBLElBQ3JFLFFBQVEsQ0FBQyxRQUFRLElBQUksa0JBQWtCLFlBQVk7QUFBQSxJQUNuRCxXQUFXLENBQUMsQ0FBQyxRQUFRLElBQUk7QUFBQSxFQUMzQjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
