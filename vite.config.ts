import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));
const r = (...segments: string[]) => fileURLToPath(new URL(segments.join("/"), import.meta.url));

export default defineConfig({
    root: r("demo"),
    resolve: {
        alias: {
            fuzzly: r("src/index.ts"),
        },
    },
    server: {
        fs: {
            allow: [root],
        },
    },
    build: {
        outDir: r("demo/dist"),
        emptyOutDir: true,
        rollupOptions: {
            input: {
                playground: r("demo/index.html"),
                inspector: r("demo/ime-inspector.html"),
            },
        },
    },
});
