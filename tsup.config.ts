import { defineConfig } from "tsup";

// `clean: true`를 쓰지 않는 이유: tsup은 배열 config를 병렬로 빌드하는데,
// dts 빌드의 내부 clean 플러그인이 outDir의 모든 *.d.ts를 지우므로
// 한 config의 dts clean이 다른 config가 이미 써둔 d.ts를 삭제하는 race가 있다.
// 대신 package.json의 `prebuild` 스크립트가 dist/를 통째로 비운다.
export default defineConfig([
    // core entries: esm + cjs + iife (browser <script> 태그용 global `fuzzly`)
    {
        entry: {
            index: "src/index.ts",
            score: "src/score.ts",
        },
        format: ["esm", "cjs", "iife"],
        globalName: "fuzzly",
        dts: true,
        sourcemap: true,
    },
    // react entry: esm + cjs만. iife 제외 — react를 번들에 인라인하지 않기 위함 (issue #29).
    {
        entry: {
            "react/index": "src/react/index.ts",
        },
        format: ["esm", "cjs"],
        external: ["react"],
        dts: true,
        sourcemap: true,
    },
]);
