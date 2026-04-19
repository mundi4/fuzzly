// Atom ID Registry
// 각 원자 문자(자모, ASCII 등)에 고정 정수 ID를 부여한다.
// hot loop에서 문자열 비교 대신 정수 비교를 가능하게 하는 기반 모듈.

// --- 고정 ID 할당 ---
// 0: padding/sentinel (사용 안 함)
// 1-19: 자음 (ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ)
// 20-33: 기본모음 (ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅛㅜㅠㅡㅣ) — 분해 후 14종만
// 34-128: ASCII printable (0x20-0x7E → ID 34+offset)
// 129-65535: 동적 할당 (CJK, 기타) — Uint16Array 컨테이너
//
// LUT들(isVowelLUT 등)은 Uint8Array(256) 크기 그대로 유지한다.
// 동적 ID(≥129)는 jamo/vowel/consonant가 아니므로 OOB read가
// undefined로 들어와 `=== 1` 비교가 자연스럽게 false가 된다.

const CONSONANTS = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ"; // 19
const VOWELS = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅛㅜㅠㅡㅣ"; // 14 basic (compound는 분해됨)

const FIRST_CONSONANT_ID = 1;
const FIRST_VOWEL_ID = 20;
const FIRST_ASCII_ID = 34; // ASCII 0x20(' ') → 34
const ASCII_START = 0x20;
const ASCII_END = 0x7e;
const DYNAMIC_START = FIRST_ASCII_ID + (ASCII_END - ASCII_START + 1); // 34 + 95 = 129

// char → ID (고정 범위는 직접 계산, 나머지는 Map)
const dynamicMap = new Map<string, number>();
let nextDynamicId = DYNAMIC_START;

// ID → char (역변환, 디버그/toString용). 동적 ID는 sparse로 확장됨.
const idToCharTable: string[] = [];

// 고정 ID 테이블 초���화
for (let i = 0; i < CONSONANTS.length; i++) {
    const id = FIRST_CONSONANT_ID + i;
    idToCharTable[id] = CONSONANTS[i];
}
for (let i = 0; i < VOWELS.length; i++) {
    const id = FIRST_VOWEL_ID + i;
    idToCharTable[id] = VOWELS[i];
}
for (let code = ASCII_START; code <= ASCII_END; code++) {
    const id = FIRST_ASCII_ID + (code - ASCII_START);
    idToCharTable[id] = String.fromCharCode(code);
}

// --- LUT ---

/** isVowelLUT[id] === 1 이면 모음 atom */
export const isVowelLUT = new Uint8Array(256);
for (let i = FIRST_VOWEL_ID; i < FIRST_VOWEL_ID + VOWELS.length; i++) {
    isVowelLUT[i] = 1;
}

/** isHangulJamoLUT[id] === 1 이면 한글 호환자모 (자음 또는 모음) */
export const isHangulJamoLUT = new Uint8Array(256);
for (let i = FIRST_CONSONANT_ID; i < FIRST_CONSONANT_ID + CONSONANTS.length; i++) {
    isHangulJamoLUT[i] = 1;
}
for (let i = FIRST_VOWEL_ID; i < FIRST_VOWEL_ID + VOWELS.length; i++) {
    isHangulJamoLUT[i] = 1;
}

// 자음 ID만 마킹하는 LUT (초성-only 판별용)
export const isConsonantLUT = new Uint8Array(256);
for (let i = FIRST_CONSONANT_ID; i < FIRST_CONSONANT_ID + CONSONANTS.length; i++) {
    isConsonantLUT[i] = 1;
}

// --- 자모 char → ID 빠른 경로용 맵 (compat jamo 범위 0x3131-0x3163) ---
// compat jamo 범위: ㄱ=0x3131, ..., ㅎ=0x314E (자음 30자), ㅏ=0x314F, ..., ㅣ=0x3163 (모음 21자)
// 그 중 우리가 ID를 할당한 것만 맵핑
const compatJamoToId = new Uint8Array(0x3163 - 0x3131 + 1);
for (let i = 0; i < CONSONANTS.length; i++) {
    compatJamoToId[CONSONANTS.charCodeAt(i) - 0x3131] = FIRST_CONSONANT_ID + i;
}
for (let i = 0; i < VOWELS.length; i++) {
    compatJamoToId[VOWELS.charCodeAt(i) - 0x3131] = FIRST_VOWEL_ID + i;
}

// --- 공개 함수 ---

/** 원자 문자 하나를 정수 ID로 변환. 고정 범위(자모, ASCII)는 O(1), 나머지는 Map lookup. */
export function atomCharToId(ch: string): number {
    const code = ch.charCodeAt(0);

    // compat jamo (0x3131-0x3163)
    if (code >= 0x3131 && code <= 0x3163) {
        const id = compatJamoToId[code - 0x3131];
        if (id !== 0) return id;
        // 복합 자모 (ㄳ 등) — 분해 후에는 나오지 않지만 안전장치
    }

    // ASCII printable
    if (code >= ASCII_START && code <= ASCII_END) {
        return FIRST_ASCII_ID + (code - ASCII_START);
    }

    // 동적 할당 (CJK, emoji single-codepoint, etc.)
    let id = dynamicMap.get(ch);
    if (id !== undefined) return id;

    id = nextDynamicId++;
    if (id > 65535) {
        throw new RangeError(`Atom ID overflow (>65535): too many unique non-jamo/non-ASCII atom characters`);
    }
    dynamicMap.set(ch, id);
    idToCharTable[id] = ch;
    return id;
}

/** ID → 원래 문자. 디버그/toString용. */
export function atomIdToChar(id: number): string {
    return idToCharTable[id] ?? `<${id}>`;
}

/**
 * 현재 세션에서 동적 atom ID가 할당되었는지 확인한다.
 *
 * 한글 자모(ID 1-33)와 ASCII(ID 34-128)는 고정 ID이므로
 * 한글+영문 전용 텍스트에서는 항상 `false`를 반환한다.
 * CJK, emoji 등 비한글·비ASCII 문자가 포함된 경우에만 `true`.
 *
 * `true`이면 `Target`을 IDB 등에 직렬화할 때
 * `snapshotDynamicAtoms()`도 함께 저장해야 다음 세션에서 복원 가능하다.
 *
 * @example
 * ```ts
 * const targets = items.map(preprocessTarget);
 * const atomSnapshot = hasDynamicAtoms() ? snapshotDynamicAtoms() : [];
 * await idb.put("cache", { version: 1, targets, atomSnapshot });
 * ```
 */
export function hasDynamicAtoms(): boolean {
    return dynamicMap.size > 0;
}

/**
 * 동적 atom 매핑의 스냅샷을 반환한다. `[문자, ID]` 튜플 배열.
 *
 * IDB에 `Target`과 함께 저장해두면, 다음 세션에서
 * `restoreDynamicAtoms()`로 복원한 뒤 저장된 `Target`의
 * typed array(atomsFlat 등)를 `preprocessTarget` 없이 바로 사용할 수 있다.
 *
 * 동적 할당이 없으면 빈 배열 반환 — `hasDynamicAtoms()`로 미리 확인 가능.
 *
 * @returns `[char, atomId]` 튜플 배열. IDB에 직접 저장 가능한 형태.
 */
export function snapshotDynamicAtoms(): Array<[string, number]> {
    return Array.from(dynamicMap.entries());
}

/**
 * 이전 세션에서 저장한 동적 atom 매핑을 복원한다.
 *
 * IDB에서 `Target`을 로드하기 **전에** 호출해야 한다.
 * 복원 후에는 저장된 `Target.atomsFlat`의 atom ID가
 * 현재 세션의 registry와 일치하므로 `match`/`matchBest`에 바로 전달 가능.
 *
 * 이미 같은 문자에 같은 ID가 할당되어 있으면 무시한다 (멱등).
 *
 * @param snapshot - `snapshotDynamicAtoms()`가 반환한 `[char, atomId]` 배열
 *
 * @example
 * ```ts
 * const cached = await idb.get("cache");
 * if (cached) {
 *     restoreDynamicAtoms(cached.atomSnapshot);
 *     // cached.targets를 바로 match/matchBest에 사용 가능
 * }
 * ```
 */
export function restoreDynamicAtoms(snapshot: Array<[string, number]>): void {
    for (const [ch, id] of snapshot) {
        if (dynamicMap.has(ch)) continue;
        dynamicMap.set(ch, id);
        idToCharTable[id] = ch;
        if (id >= nextDynamicId) {
            nextDynamicId = id + 1;
        }
    }
}

// boundary 판별용 상수 ID
export const SPACE_ID = atomCharToId(" ");
export const UNDERSCORE_ID = atomCharToId("_");
export const DASH_ID = atomCharToId("-");
export const DOT_ID = atomCharToId(".");
