import type { Atoms } from "../types";
import { atomCharToId, isVowelLUT } from "./atomRegistry";

// ㅘ → ㅗㅏ 식의 중성 분해
const VOWEL_SPLIT_MAP: Record<string, string> = {
    ㅘ: "ㅗㅏ",
    ㅙ: "ㅗㅐ",
    ㅚ: "ㅗㅣ",
    ㅝ: "ㅜㅓ",
    ㅞ: "ㅜㅔ",
    ㅟ: "ㅜㅣ",
    ㅢ: "ㅡㅣ",
};

// ㄳ → ㄱㅅ 등의 종성 분해
const TAIL_SPLIT_MAP: Record<string, string> = {
    ㄳ: "ㄱㅅ",
    ㄵ: "ㄴㅈ",
    ㄶ: "ㄴㅎ",
    ㄺ: "ㄹㄱ",
    ㄻ: "ㄹㅁ",
    ㄼ: "ㄹㅂ",
    ㄽ: "ㄹㅅ",
    ㄾ: "ㄹㅌ",
    ㄿ: "ㄹㅍ",
    ㅀ: "ㄹㅎ",
    ㅄ: "ㅂㅅ",
};

//
// 완성형 한글 분해용 테이블 (내부 전용)
//
const LEAD_TABLE = [
    "ㄱ",
    "ㄲ",
    "ㄴ",
    "ㄷ",
    "ㄸ",
    "ㄹ",
    "ㅁ",
    "ㅂ",
    "ㅃ",
    "ㅅ",
    "ㅆ",
    "ㅇ",
    "ㅈ",
    "ㅉ",
    "ㅊ",
    "ㅋ",
    "ㅌ",
    "ㅍ",
    "ㅎ",
];

const VOWEL_TABLE = [
    "ㅏ",
    "ㅐ",
    "ㅑ",
    "ㅒ",
    "ㅓ",
    "ㅔ",
    "ㅕ",
    "ㅖ",
    "ㅗ",
    "ㅘ",
    "ㅙ",
    "ㅚ",
    "ㅛ",
    "ㅜ",
    "ㅝ",
    "ㅞ",
    "ㅟ",
    "ㅠ",
    "ㅡ",
    "ㅢ",
    "ㅣ",
];

const TAIL_TABLE = [
    "", // 종성 없음
    "ㄱ",
    "ㄲ",
    "ㄳ",
    "ㄴ",
    "ㄵ",
    "ㄶ",
    "ㄷ",
    "ㄹ",
    "ㄺ",
    "ㄻ",
    "ㄼ",
    "ㄽ",
    "ㄾ",
    "ㄿ",
    "ㅀ",
    "ㅁ",
    "ㅂ",
    "ㅄ",
    "ㅅ",
    "ㅆ",
    "ㅇ",
    "ㅈ",
    "ㅊ",
    "ㅋ",
    "ㅌ",
    "ㅍ",
    "ㅎ",
];

const NORMALIZE_LEAD = [
    "ㄱ",
    "ㄲ",
    "ㄴ",
    "ㄷ",
    "ㄸ",
    "ㄹ",
    "ㅁ",
    "ㅂ",
    "ㅃ",
    "ㅅ",
    "ㅆ",
    "ㅇ",
    "ㅈ",
    "ㅉ",
    "ㅊ",
    "ㅋ",
    "ㅌ",
    "ㅍ",
    "ㅎ",
];

const NORMALIZE_VOWEL = [
    "ㅏ",
    "ㅐ",
    "ㅑ",
    "ㅒ",
    "ㅓ",
    "ㅔ",
    "ㅕ",
    "ㅖ",
    "ㅗ",
    "ㅘ",
    "ㅙ",
    "ㅚ",
    "ㅛ",
    "ㅜ",
    "ㅝ",
    "ㅞ",
    "ㅟ",
    "ㅠ",
    "ㅡ",
    "ㅢ",
    "ㅣ",
];

const NORMALIZE_TAIL = [
    "ㄱ",
    "ㄲ",
    "ㄳ",
    "ㄴ",
    "ㄵ",
    "ㄶ",
    "ㄷ",
    "ㄹ",
    "ㄺ",
    "ㄻ",
    "ㄼ",
    "ㄽ",
    "ㄾ",
    "ㄿ",
    "ㅀ",
    "ㅁ",
    "ㅂ",
    "ㅄ",
    "ㅅ",
    "ㅆ",
    "ㅇ",
    "ㅈ",
    "ㅊ",
    "ㅋ",
    "ㅌ",
    "ㅍ",
    "ㅎ",
];

//
// Split helpers
//

function splitVowel(v: string): string {
    return VOWEL_SPLIT_MAP[v] ?? v;
}

function splitTail(t: string): string {
    return TAIL_SPLIT_MAP[t] ?? t;
}

export function normalizeCharToCompat(ch: string): string {
    const code = ch.charCodeAt(0);

    // Lead consonant (초성)
    if (code >= 0x1100 && code <= 0x1112) {
        return NORMALIZE_LEAD[code - 0x1100];
    }

    // Vowel (중성)
    if (code >= 0x1161 && code <= 0x1175) {
        return NORMALIZE_VOWEL[code - 0x1161];
    }

    // Tail consonant (종성)
    if (code >= 0x11a8 && code <= 0x11c2) {
        return NORMALIZE_TAIL[code - 0x11a8];
    }

    return ch; // 이미 호환자모거나 일반 문자
}

// dev/prod 판정 — globalThis 경유로 접근해 @types/node 없이도 타입체크된다 (브라우저 소비자 tsc 호환).
export const isProd = (() => {
    try {
        const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
        return g.process?.env?.NODE_ENV === "production";
    } catch {
        return false;
    }
})();

/**
 * 길이 보존 + 문맥 무관 case folding — 쿼리와 타겟이 반드시 **같은 함수**를 써야
 * atom ID가 일치한다.
 *
 * `toLowerCase()` 전체 적용이 기본이지만 두 가지를 정규화한다:
 * - **길이 보존**: 소문자화로 UTF-16 길이가 변하는 문자(예: İ U+0130 → i̇ 2 code units)는
 *   원문을 유지해 offset 좌표계(charIndexes/하이라이트)가 밀리지 않게 한다.
 * - **문맥 무관**: `toLowerCase()`의 Final_Sigma 규칙(단어 끝 Σ → ς, 그 외 → σ)은 같은
 *   문자가 쿼리/타겟의 위치에 따라 다르게 폴딩되게 만든다 (쿼리 "ΠΑΣ"의 ς ≠ 타겟
 *   "παστα"의 σ → 매치 실패 + journey 비단조). ς(U+03C2)를 σ(U+03C3)로 통일한다.
 */
export function foldCase(input: string): string {
    let lowered = input.toLowerCase();
    if (lowered.length !== input.length) {
        // Unicode 소문자 매핑은 축소되지 않으므로(1→N만 존재) 길이가 변했다면 어떤 문자가
        // 확장된 것 — code point 단위로 재시도하고 확장되는 문자만 원문 유지.
        lowered = "";
        for (const cp of input) {
            const l = cp.toLowerCase();
            lowered += l.length === cp.length ? l : cp;
        }
    }
    // Final_Sigma 문맥 제거 (위치 무관 동일 폴딩 보장)
    if (lowered.indexOf("ς") >= 0) lowered = lowered.replace(/ς/g, "σ");
    return lowered;
}

// atoms Uint16Array에서 중성/종성 시작 인덱스 계산.
export function computeAtomRoles(atoms: Atoms): { vowelIndex: number; tailIndex: number } {
    let vowelIndex = -1;
    let tailIndex = -1;
    for (let i = 0; i < atoms.length; i++) {
        const v = isVowelLUT[atoms[i]] === 1;
        if (vowelIndex === -1) {
            if (v) vowelIndex = i;
        } else {
            if (!v) {
                tailIndex = i;
                break;
            }
        }
    }
    return { vowelIndex, tailIndex };
}

// intern cache
const atomsCache = new Map<string, Atoms>();

// 임시 빌드 버퍼 (최대 6 atoms: lead + 2 vowel + 2 tail + margin)
// Uint16: 동적 atom ID가 최대 65535까지 허용되므로 와이드 컨테이너 필요.
const buildBuf = new Uint16Array(8);

//
// Main: 문자 하나 → atom ID sequence (Uint16Array, interned)
//
export function decomposeToAtoms(ch: string): Atoms {
    const cached = atomsCache.get(ch);
    if (cached) return cached;

    const code = ch.charCodeAt(0);
    let len = 0;

    // 1) 완성형 한글
    if (code >= 0xac00 && code <= 0xd7a3) {
        const base = code - 0xac00;
        const leadIndex = Math.floor(base / 588);
        const vowelIndex = Math.floor((base % 588) / 28);
        const tailIndex = base % 28;

        buildBuf[len++] = atomCharToId(LEAD_TABLE[leadIndex]);

        const splitV = splitVowel(VOWEL_TABLE[vowelIndex]);
        for (let i = 0; i < splitV.length; i++) {
            buildBuf[len++] = atomCharToId(splitV[i]);
        }

        if (tailIndex !== 0) {
            const splitT = splitTail(TAIL_TABLE[tailIndex]);
            for (let i = 0; i < splitT.length; i++) {
                buildBuf[len++] = atomCharToId(splitT[i]);
            }
        }
    }

    // 2) 자모(초/중/종 + 호환자모)
    else if ((code >= 0x1100 && code <= 0x11ff) || (code >= 0x3130 && code <= 0x318f)) {
        const norm = normalizeCharToCompat(ch);
        const mid = splitVowel(norm);
        const broken = splitTail(mid);
        for (let i = 0; i < broken.length; i++) {
            buildBuf[len++] = atomCharToId(broken[i]);
        }
    }

    // 3) 그 외 (ASCII single, BMP CJK/이모지, non-BMP, multi-codepoint cluster)
    // 각 UTF-16 code unit을 atom으로 emit:
    //   · ASCII printable: 고정 ID 34-128
    //   · 그 외 BMP code unit: codepoint 그대로 ID
    //   · surrogate pair: high/low 각각 atom (2개)
    //   · ZWJ cluster: code unit별 atom (5-8개 가능)
    else {
        // buildBuf(8 capacity)는 Korean 분해 한도. cluster가 그보다 길면 직접 alloc.
        if (ch.length <= buildBuf.length) {
            for (let i = 0; i < ch.length; i++) {
                buildBuf[len++] = atomCharToId(ch[i]);
            }
            const ret = new Uint16Array(len);
            ret.set(buildBuf.subarray(0, len));
            atomsCache.set(ch, ret);
            return ret;
        }

        const ret = new Uint16Array(ch.length);
        for (let i = 0; i < ch.length; i++) {
            ret[i] = atomCharToId(ch[i]);
        }
        atomsCache.set(ch, ret);
        return ret;
    }

    const ret = new Uint16Array(len);
    ret.set(buildBuf.subarray(0, len));

    atomsCache.set(ch, ret);
    return ret;
}
