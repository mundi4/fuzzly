import { Atoms } from "../types";

// ㅘ → ㅗㅏ 식의 중성 분해
const VOWEL_SPLIT_MAP: Record<string, string> = {
    ㅘ: "ㅗㅏ",
    ㅙ: "ㅗㅐ",
    ㅚ: "ㅗㅣ",
    ㅝ: "ㅜㅓ",
    ㅞ: "ㅜㅔ",
    ㅟ: "ㅜㅣ",
    ㅢ: "ㅡㅣ"
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
    ㅄ: "ㅂㅅ"
};

//
// 완성형 한글 분해용 테이블 (내부 전용)
//
const LEAD_TABLE = [
    "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
    "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"
];

const VOWEL_TABLE = [
    "ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ",
    "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ"
];

const VOWEL_SET: Record<string, boolean> = {
    "ㅏ": true,
    "ㅐ": true,
    "ㅑ": true,
    "ㅒ": true,
    "ㅓ": true,
    "ㅔ": true,
    "ㅕ": true,
    "ㅖ": true,
    "ㅗ": true,
    "ㅘ": true,
    "ㅙ": true,
    "ㅚ": true,
    "ㅛ": true,
    "ㅜ": true,
    "ㅝ": true,
    "ㅞ": true,
    "ㅟ": true,
    "ㅠ": true,
    "ㅡ": true,
    "ㅢ": true,
    "ㅣ": true,
};

const TAIL_TABLE = [
    "",   // 종성 없음
    "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ",
    "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ",
    "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"
];

const NORMALIZE_LEAD = [
    "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
    "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"
];

const NORMALIZE_VOWEL = [
    "ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ",
    "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ"
];

const NORMALIZE_TAIL = [
    "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ",
    "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ",
    "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"
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
    if (code >= 0x11A8 && code <= 0x11C2) {
        return NORMALIZE_TAIL[code - 0x11A8];
    }

    return ch; // 이미 호환자모거나 일반 문자
}

export function isVowel(ch: string): boolean {
    return VOWEL_SET[ch] === true;
}

// intern cache
const internMap = new Map<string, string[]>();

//
// Main: 문자 하나 → atom sequence
//
export function decomposeToAtoms(ch: string): Atoms {
    const cached = internMap.get(ch);
    if (cached) return cached;

    const code = ch.charCodeAt(0);
    const out: string[] = [];

    // 1) 완성형 한글
    if (code >= 0xac00 && code <= 0xd7a3) {
        const base = code - 0xac00;
        const leadIndex = Math.floor(base / 588);
        const vowelIndex = Math.floor((base % 588) / 28);
        const tailIndex = base % 28;

        out.push(LEAD_TABLE[leadIndex]);

        for (const v of splitVowel(VOWEL_TABLE[vowelIndex])) {
            out.push(v);
        }

        if (tailIndex !== 0) {
            for (const t of splitTail(TAIL_TABLE[tailIndex])) {
                out.push(t);
            }
        }
    }

    // 2) 자모(초/중/종 + 호환자모)
    else if (
        (code >= 0x1100 && code <= 0x11ff) ||
        (code >= 0x3130 && code <= 0x318f)
    ) {
        const norm = normalizeCharToCompat(ch);
        const mid = splitVowel(norm);
        const broken = splitTail(mid);
        for (const s of broken) out.push(s);
    }

    // 3) 그 외
    else {
        out.push(ch);
    }

    internMap.set(ch, out);
    return out;
}
