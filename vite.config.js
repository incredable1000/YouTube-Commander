import { defineConfig } from 'vite';
import webExtension from 'vite-plugin-web-extension';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig(({ mode }) => ({
    plugins: [
        webExtension({
            manifest: 'manifest.json',
            additionalInputs: ['scroll_to_top.html'],
        }),
        viteStaticCopy({
            targets: [
                {
                    src: 'assets/*',
                    dest: 'assets',
                },
            ],
        }),
    ],
    root: 'src',
    build: {
        outDir: `../build_${mode}`,
        emptyOutDir: true,
    },
}));
