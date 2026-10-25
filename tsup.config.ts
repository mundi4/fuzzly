import { defineConfig } from "tsup";

// dts 빌드는 config 하나에만 둔다. tsup은 배열 config를 병렬로 빌드하는데, dts가 켜진
// config가 여럿이면 dts worker가 동시에 돌고 Windows + Node 24에서 node 프로세스가 간헐적으로
// 네이티브 크래시(segfault / 0xC0000374)한다 — `prepare` 경유 git 의존성 설치가 깨진다.
//
// `clean: true`를 쓰지 않는 이유: dts 빌드의 내부 clean 플러그인이 outDir의 모든 *.d.ts를
// 지우므로 다른 config와 clean이 경합할 수 있다. 대신 package.json의 `prebuild` 스크립트가
// dist/를 통째로 비운다.
export default defineConfig([
    // 모든 entry: esm + cjs + dts
    {
        entry: {
            index: "src/index.ts",
            score: "src/score.ts",
            layout: "src/layout.ts",
            "react/index": "src/react/index.ts",
        },
        format: ["esm", "cjs"],
        external: ["react"],
        dts: true,
        sourcemap: true,
    },
    // iife (browser <script> 태그용 global `fuzzly`): core entry만.
    // layout 제외 — globalName 이 "fuzzly" 하나뿐이라 layout.global.js 를 index.global.js 와
    // 같이 로드하면 전역을 덮어쓴다. react 제외 — react를 번들에 인라인하지 않기 위함 (issue #29).
    {
        entry: {
            index: "src/index.ts",
            score: "src/score.ts",
        },
        format: ["iife"],
        globalName: "fuzzly",
        sourcemap: true,
    },
]);
