// Atom ID Registry
// 모든 atom ID 할당이 순수함수 (글로벌 가변 상태 없음).
//
// 규칙:
// - 1-19: 자음 (ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ)
// - 20-33: 기본모음 (ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅛㅜㅠㅡㅣ) — 분해 후 14종
// - 34-128: ASCII printable (0x20-0x7E → ID 34+offset)
// - 그 외: UTF-16 code unit 값 그대로 (codepoint-as-ID)
//   · BMP 단일 codepoint: 1 atom (예: 漢 U+6F22 → ID 0x6F22)
//   · non-BMP·multi-codepoint cluster: decomposeToAtoms가 code unit별로 N atom emit
//     (예: 😀 → [0xD83D, 0xDE00], 👨‍👩‍👧 → 8 atoms)
//
// 결과: Target/Query가 self-contained. 세션·인스턴스·앱 간 portable.
// snapshot/restore API 불필요.
//
// LUT(isVowelLUT 등)는 Uint8Array(256) 유지. 동적 영역(>128) ID는 LUT 인덱싱 시
// OOB read → undefined → `=== 1` false. 의도된 동작.
//
// 충돌 주의 (실 사용에선 발생 안 함):
// - 제어문자 U+0000-U+001F: ID 0-31 → 자모 영역(1-33)과 충돌
// - U+007F (DEL): ID 127 → fixed ASCII '}' 와 충돌
// - U+0080 (PADDING): ID 128 → fixed ASCII '~' 와 충돌
// command palette 텍스트엔 등장하지 않음. caller가 control char 입력 줄 시 동작 미정의.

const CONSONANTS = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ"; // 19
const VOWELS = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅛㅜㅠㅡㅣ"; // 14 basic (compound는 분해됨)

const FIRST_CONSONANT_ID = 1;
const FIRST_VOWEL_ID = 20;
const FIRST_ASCII_ID = 34; // ASCII 0x20(' ') → 34
const ASCII_START = 0x20;
const ASCII_END = 0x7e;

// ID → char (역변환, 디버그/toString용). fixed 영역만 채워두고
// 그 외 ID는 atomIdToChar에서 String.fromCodePoint(id)로 fallback.
const idToCharTable: string[] = [];

// 고정 ID 테이블 초기화
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

// --- 공개 함수 (모두 순수함수) ---

/**
 * UTF-16 code unit 하나(또는 BMP 단일 char)를 atom ID로 변환.
 * 자모/ASCII는 고정 ID, 그 외는 code unit 값 그대로.
 *
 * Multi-code-unit 클러스터는 caller가 code unit별로 호출해야 한다 (decomposeToAtoms 참고).
 */
export function atomCharToId(ch: string): number {
    const code = ch.charCodeAt(0);

    // compat jamo (0x3131-0x3163)
    if (code >= 0x3131 && code <= 0x3163) {
        const id = compatJamoToId[code - 0x3131];
        if (id !== 0) return id;
        // 복합 자모 (ㄳ 등) — 분해 후엔 안 나오지만 fall through 허용 (ID = code)
    }

    // ASCII printable
    if (code >= ASCII_START && code <= ASCII_END) {
        return FIRST_ASCII_ID + (code - ASCII_START);
    }

    // 그 외: codepoint(=code unit) 그대로 ID
    return code;
}

/**
 * ID → 원래 문자. fixed 영역은 테이블, 그 외는 `String.fromCodePoint(id)`.
 *
 * 주의: surrogate pair half(0xD800-0xDFFF)에 해당하는 ID는 lone surrogate 1자
 * 문자열을 반환한다. multi-atom 클러스터의 atomsStr 재구성은 atom별 결과를
 * concat하면 자연스럽게 원본 cluster 문자열이 복원된다.
 */
export function atomIdToChar(id: number): string {
    return idToCharTable[id] ?? String.fromCodePoint(id);
}

// boundary 판별용 상수 ID
export const SPACE_ID = atomCharToId(" ");
/**
 * U+0020 code unit 값 — 타겟 transparent 모드가 투명화하는 유일한 문자.
 * atom 축의 {@link SPACE_ID}와 짝: 어느 한쪽 정의만 바꾸면 쿼리/타겟 공백 대칭이 깨진다.
 */
export const SPACE_CHAR_CODE = 0x20;
export const UNDERSCORE_ID = atomCharToId("_");
export const DASH_ID = atomCharToId("-");
export const DOT_ID = atomCharToId(".");
