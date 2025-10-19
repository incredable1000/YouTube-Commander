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
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcuanMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJDOlxcXFxVc2Vyc1xcXFxtYWRodVxcXFxEb2N1bWVudHNcXFxcY2hyb21lIGV4dGVuc2lvbnNcXFxcWW91VHViZSBDb21tYW5kZXJcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkM6XFxcXFVzZXJzXFxcXG1hZGh1XFxcXERvY3VtZW50c1xcXFxjaHJvbWUgZXh0ZW5zaW9uc1xcXFxZb3VUdWJlIENvbW1hbmRlclxcXFx2aXRlLmNvbmZpZy5qc1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vQzovVXNlcnMvbWFkaHUvRG9jdW1lbnRzL2Nocm9tZSUyMGV4dGVuc2lvbnMvWW91VHViZSUyMENvbW1hbmRlci92aXRlLmNvbmZpZy5qc1wiO2ltcG9ydCB7IGRlZmluZUNvbmZpZyB9IGZyb20gXCJ2aXRlXCI7XG5pbXBvcnQgd2ViRXh0ZW5zaW9uIGZyb20gXCJ2aXRlLXBsdWdpbi13ZWItZXh0ZW5zaW9uXCI7XG5pbXBvcnQgeyB2aXRlU3RhdGljQ29weSB9IGZyb20gXCJ2aXRlLXBsdWdpbi1zdGF0aWMtY29weVwiO1xuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xuICBwbHVnaW5zOiBbXG4gICAgd2ViRXh0ZW5zaW9uKHtcbiAgICAgIG1hbmlmZXN0OiBcIm1hbmlmZXN0Lmpzb25cIixcbiAgICAgIGFkZGl0aW9uYWxJbnB1dHM6IFtcInNjcm9sbF90b190b3AuaHRtbFwiXVxuICAgIH0pLFxuICAgIHZpdGVTdGF0aWNDb3B5KHtcbiAgICAgIHRhcmdldHM6IFtcbiAgICAgICAge1xuICAgICAgICAgIHNyYzogXCJhc3NldHMvKlwiLFxuICAgICAgICAgIGRlc3Q6IFwiYXNzZXRzXCJcbiAgICAgICAgfVxuICAgICAgXVxuICAgIH0pXG4gIF0sXG4gIHJvb3Q6IFwic3JjXCIsXG4gIGJ1aWxkOiB7XG4gICAgb3V0RGlyOiBcIi4uL2Rpc3RcIixcbiAgICBlbXB0eU91dERpcjogdHJ1ZSxcbiAgfSxcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIjtBQUFzWCxTQUFTLG9CQUFvQjtBQUNuWixPQUFPLGtCQUFrQjtBQUN6QixTQUFTLHNCQUFzQjtBQUUvQixJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixTQUFTO0FBQUEsSUFDUCxhQUFhO0FBQUEsTUFDWCxVQUFVO0FBQUEsTUFDVixrQkFBa0IsQ0FBQyxvQkFBb0I7QUFBQSxJQUN6QyxDQUFDO0FBQUEsSUFDRCxlQUFlO0FBQUEsTUFDYixTQUFTO0FBQUEsUUFDUDtBQUFBLFVBQ0UsS0FBSztBQUFBLFVBQ0wsTUFBTTtBQUFBLFFBQ1I7QUFBQSxNQUNGO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDSDtBQUFBLEVBQ0EsTUFBTTtBQUFBLEVBQ04sT0FBTztBQUFBLElBQ0wsUUFBUTtBQUFBLElBQ1IsYUFBYTtBQUFBLEVBQ2Y7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
