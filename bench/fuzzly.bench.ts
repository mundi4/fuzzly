import { bench, describe } from "vitest";
import type { Target } from "../src";
import { buildQuery, createSearcher, matchBest, preprocessTarget } from "../src";

/**
 * 성능 기준선 벤치마크 (`npm run bench`).
 *
 * 회귀 감시 대상:
 * 1. pathological 반복 문자 타겟 — DP 전이가 O(C²)로 퇴행하면 여기서 폭발
 * 2. 10k 아이템 cold 키스트로크 — 첫 타(세션 재사용 불가) 스캔 비용
 * 3. forward journey / backspace — 세션 재사용·히스토리 스택 경로
 * 4. preprocessTarget 대량 호출 — segmenter fast path
 *
 * 데이터셋은 고정 시드 LCG로 결정적 생성.
 */

function makeRng(seed: number) {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 2 ** 32;
    };
}

function makeItems(count: number, seed = 42): string[] {
    const rnd = makeRng(seed);
    const syllable = () => String.fromCharCode(0xac00 + Math.floor(rnd() * 11172));
    const ascii = () => String.fromCharCode(97 + Math.floor(rnd() * 26));
    return Array.from({ length: count }, () => {
        const len = 8 + Math.floor(rnd() * 20);
        let out = "";
        for (let i = 0; i < len; i++) {
            const r = rnd();
            out += r < 0.15 ? " " : r < 0.35 ? ascii() : syllable();
        }
        return out;
    });
}

describe("matchBest — pathological 반복 문자 (O(C²) 회귀 감시)", () => {
    const t500 = preprocessTarget("ㄱ".repeat(500));
    const t2000 = preprocessTarget("ㄱ".repeat(2000));
    const q = buildQuery("ㄱㄱㄱㄱㄱ");

    bench("repeat-ㄱ T=500 / Q=5", () => {
        matchBest(q, t500);
    });

    bench("repeat-ㄱ T=2000 / Q=5", () => {
        matchBest(q, t2000);
    });
});

// Target 은 미리 빌드해 hydrate — searcher 생성 비용에서 preprocess 를 제외하고
// 스캔(매칭) 비용만 측정한다. 세션 히스토리 오염을 피하려고 iteration 마다 fresh searcher 를
// 쓴다. cold/세션 벤치가 반드시 같은 코퍼스를 재도록 셋업은 모듈 스코프에서 1회만 만든다.
const ITEMS_10K = makeItems(10_000);
const TARGETS_10K = new Map(ITEMS_10K.map((s) => [s, preprocessTarget(s)]));
const hydrate = { target: (s: string) => TARGETS_10K.get(s) as Target };

describe("createSearcher 10k — cold 키스트로크", () => {
    const items = ITEMS_10K;

    bench("cold 'ㅅ' (limit 20)", () => {
        createSearcher(items, hydrate).search("ㅅ", { limit: 20 });
    });

    bench("cold '파일' split (limit 20)", () => {
        createSearcher(items, { ...hydrate, whitespace: "split" }).search("파일", { limit: 20 });
    });
});

describe("createSearcher 10k — 세션 경로", () => {
    const items = ITEMS_10K;

    bench("forward journey ㅍ→파→파이→파일 (세션 재사용)", () => {
        const s = createSearcher(items, hydrate);
        for (const q of ["ㅍ", "파", "파이", "파일"]) s.search(q, { limit: 20 });
    });

    bench("backspace 파일→파이→파 (조상 스냅샷 복원)", () => {
        const s = createSearcher(items, hydrate);
        for (const q of ["ㅍ", "파", "파이", "파일", "파이", "파"]) s.search(q, { limit: 20 });
    });
});

describe("preprocessTarget — 대량 인덱싱", () => {
    const items = makeItems(10_000, 7);

    bench("10k 아이템", () => {
        for (const it of items) preprocessTarget(it);
    });
});
