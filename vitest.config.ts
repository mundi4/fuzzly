import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
    plugins: [react()],
    test: {
        globals: true,
        environment: "jsdom",
        setupFiles: [],
        include: ["test/**/*.test.{ts,tsx}"],
        typecheck: {
            tsconfig: "./tsconfig.test.json",
        },
    },
});
