// vite.config.js
import { defineConfig } from "file:///C:/Users/madhu/Documents/chrome%20extensions/YouTube%20Commander/node_modules/vite/dist/node/index.js";
import webExtension from "file:///C:/Users/madhu/Documents/chrome%20extensions/YouTube%20Commander/node_modules/vite-plugin-web-extension/dist/index.js";
import { viteStaticCopy } from "file:///C:/Users/madhu/Documents/chrome%20extensions/YouTube%20Commander/node_modules/vite-plugin-static-copy/dist/index.js";
var vite_config_default = defineConfig({
  plugins: [
    webExtension({
      manifest: "manifest.json",
      additionalInputs: ["scroll_to_top.html"]
    }),
    viteStaticCopy({
      targets: [
        {
          src: "assets/*",
          dest: "assets"
        }
      ]
    })
  ],
  root: "src",
  build: {
    outDir: "../dist",
    emptyOutDir: true
  }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxtYWRodVxcXFxEb2N1bWVudHNcXFxcY2hyb21lIGV4dGVuc2lvbnNcXFxcWW91VHViZSBDb21tYW5kZXJcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkM6XFxcXFVzZXJzXFxcXG1hZGh1XFxcXERvY3VtZW50c1xcXFxjaHJvbWUgZXh0ZW5zaW9uc1xcXFxZb3VUdWJlIENvbW1hbmRlclxcXFx2aXRlLmNvbmZpZy5qc1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vQzovVXNlcnMvbWFkaHUvRG9jdW1lbnRzL2Nocm9tZSUyMGV4dGVuc2lvbnMvWW91VHViZSUyMENvbW1hbmRlci92aXRlLmNvbmZpZy5qc1wiO2ltcG9ydCB7IGRlZmluZUNvbmZpZyB9IGZyb20gXCJ2aXRlXCI7XHJcbmltcG9ydCB3ZWJFeHRlbnNpb24gZnJvbSBcInZpdGUtcGx1Z2luLXdlYi1leHRlbnNpb25cIjtcclxuaW1wb3J0IHsgdml0ZVN0YXRpY0NvcHkgfSBmcm9tIFwidml0ZS1wbHVnaW4tc3RhdGljLWNvcHlcIjtcclxuXHJcbmV4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7XHJcbiAgcGx1Z2luczogW1xyXG4gICAgd2ViRXh0ZW5zaW9uKHtcclxuICAgICAgbWFuaWZlc3Q6IFwibWFuaWZlc3QuanNvblwiLFxyXG4gICAgICBhZGRpdGlvbmFsSW5wdXRzOiBbXCJzY3JvbGxfdG9fdG9wLmh0bWxcIl1cclxuICAgIH0pLFxyXG4gICAgdml0ZVN0YXRpY0NvcHkoe1xyXG4gICAgICB0YXJnZXRzOiBbXHJcbiAgICAgICAge1xyXG4gICAgICAgICAgc3JjOiBcImFzc2V0cy8qXCIsXHJcbiAgICAgICAgICBkZXN0OiBcImFzc2V0c1wiXHJcbiAgICAgICAgfVxyXG4gICAgICBdXHJcbiAgICB9KVxyXG4gIF0sXHJcbiAgcm9vdDogXCJzcmNcIixcclxuICBidWlsZDoge1xyXG4gICAgb3V0RGlyOiBcIi4uL2Rpc3RcIixcclxuICAgIGVtcHR5T3V0RGlyOiB0cnVlLFxyXG4gIH0sXHJcbn0pO1xyXG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQXNYLFNBQVMsb0JBQW9CO0FBQ25aLE9BQU8sa0JBQWtCO0FBQ3pCLFNBQVMsc0JBQXNCO0FBRS9CLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLFNBQVM7QUFBQSxJQUNQLGFBQWE7QUFBQSxNQUNYLFVBQVU7QUFBQSxNQUNWLGtCQUFrQixDQUFDLG9CQUFvQjtBQUFBLElBQ3pDLENBQUM7QUFBQSxJQUNELGVBQWU7QUFBQSxNQUNiLFNBQVM7QUFBQSxRQUNQO0FBQUEsVUFDRSxLQUFLO0FBQUEsVUFDTCxNQUFNO0FBQUEsUUFDUjtBQUFBLE1BQ0Y7QUFBQSxJQUNGLENBQUM7QUFBQSxFQUNIO0FBQUEsRUFDQSxNQUFNO0FBQUEsRUFDTixPQUFPO0FBQUEsSUFDTCxRQUFRO0FBQUEsSUFDUixhQUFhO0FBQUEsRUFDZjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
