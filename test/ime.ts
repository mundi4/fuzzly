// 테스트 전용 한글 IME 합성 시뮬레이터.
//
// 사용자가 어떤 최종 쿼리 문자열을 "쳐서" 만들어내기까지 매 키스트로크마다
// 화면에 보이는 중간 상태(= buildQuery에 들어가는 문자열)를 순서대로 뱉어낸다.
// journey 테스트에 사용된다.
//
// 모델링 범위
//   - 초성/중성/종성 합성 (compound vowel/tail 포함)
//   - 종성이 있는 음절 + 모음 → 종성의 마지막 atom이 다음 음절 초성으로 분리
//   - 종성 compound (ㄼ 등) 분해 후 마지막만 분리
//   - standalone 자음 + 자음 → compound 겹자음 (ㄹ+ㄱ=ㄺ 등)
//   - 한글 아닌 원자(ASCII, emoji 등)는 그대로 finalize하고 append
//
// 모델링 제외/단순화
//   - compound 겹자음(ㄺ 등) 뒤에 vowel이 오면 쪼개서 마지막 자음+vowel로 새 음절을
//     시작 (Windows IME 동작)
//   - lone vowel(ㅏ 등) 뒤에 뭐가 오면 무조건 finalize하고 새로 시작

import { atomIdToChar } from "../src/internal/atomRegistry";
import segmenter from "../src/internal/segmenter";
import { decomposeToAtoms } from "../src/internal/utils";

// 참고: 아래 테이블은 src/internal/utils.ts의 LEAD/VOWEL/TAIL_TABLE과 1:1로 대응.
// 그대로 복사하지 않고 인덱스 조회용 문자열로 간결하게 둔다.
const LEAD_CHARS = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const VOWEL_CHARS = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
// TAIL: index 0 = 종성 없음. 아래는 index 1..27에 해당.
const TAIL_CHARS = "ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ";

const COMPOUND_VOWEL: Record<string, string> = {
    ㅗㅏ: "ㅘ",
    ㅗㅐ: "ㅙ",
    ㅗㅣ: "ㅚ",
    ㅜㅓ: "ㅝ",
    ㅜㅔ: "ㅞ",
    ㅜㅣ: "ㅟ",
    ㅡㅣ: "ㅢ",
};

const COMPOUND_TAIL: Record<string, string> = {
    ㄱㅅ: "ㄳ",
    ㄴㅈ: "ㄵ",
    ㄴㅎ: "ㄶ",
    ㄹㄱ: "ㄺ",
    ㄹㅁ: "ㄻ",
    ㄹㅂ: "ㄼ",
    ㄹㅅ: "ㄽ",
    ㄹㅌ: "ㄾ",
    ㄹㅍ: "ㄿ",
    ㄹㅎ: "ㅀ",
    ㅂㅅ: "ㅄ",
};

// 겹자음 compound (ㄹ+ㄱ=ㄺ 등)은 종성 compound와 같은 글자를 쓴다.
const COMPOUND_LONE: Record<string, string> = { ...COMPOUND_TAIL };

// compound → parts (역방향) — 종성 쪼개기 및 compound lone jamo 쪼개기에 쓴다.
const COMPOUND_TAIL_PARTS: Record<string, [string, string]> = {};
for (const [pair, comp] of Object.entries(COMPOUND_TAIL)) {
    COMPOUND_TAIL_PARTS[comp] = [pair[0], pair[1]];
}

function isConsonantAtom(a: string): boolean {
    const c = a.charCodeAt(0);
    return c >= 0x3131 && c <= 0x314e;
}

function isVowelAtom(a: string): boolean {
    const c = a.charCodeAt(0);
    return c >= 0x314f && c <= 0x3163;
}

function isValidTail(a: string): boolean {
    return TAIL_CHARS.includes(a);
}

function isValidLead(a: string): boolean {
    return LEAD_CHARS.includes(a);
}

function buildSyllable(lead: string, vowel: string, tail: string): string {
    const L = LEAD_CHARS.indexOf(lead);
    const V = VOWEL_CHARS.indexOf(vowel);
    const T = tail === "" ? 0 : TAIL_CHARS.indexOf(tail) + 1;
    if (L < 0 || V < 0 || T < 0) {
        throw new Error(`buildSyllable: 유효하지 않은 음절 ${lead}/${vowel}/${tail}`);
    }
    return String.fromCharCode(0xac00 + L * 588 + V * 28 + T);
}

type Composing =
    | null
    | { kind: "jamo"; value: string }
    | { kind: "syllable"; lead: string; vowel: string; tail: string };

function renderComposing(c: Composing): string {
    if (c === null) return "";
    if (c.kind === "jamo") return c.value;
    return buildSyllable(c.lead, c.vowel, c.tail);
}

type StepResult = { finalized: string; composing: Composing };

function step(finalized: string, composing: Composing, atom: string): StepResult {
    // 한글 원자가 아니면 composing finalize + append
    if (!isConsonantAtom(atom) && !isVowelAtom(atom)) {
        return {
            finalized: finalized + renderComposing(composing) + atom,
            composing: null,
        };
    }

    if (composing === null) {
        return { finalized, composing: { kind: "jamo", value: atom } };
    }

    if (composing.kind === "jamo") {
        const current = composing.value;
        const currentIsConsonant = isConsonantAtom(current);

        if (isVowelAtom(atom)) {
            if (currentIsConsonant && isValidLead(current)) {
                return {
                    finalized,
                    composing: { kind: "syllable", lead: current, vowel: atom, tail: "" },
                };
            }
            // current가 compound 겹자음인 경우: 마지막 자음이 떨어져나가 새 lead 됨.
            if (currentIsConsonant && COMPOUND_TAIL_PARTS[current]) {
                const [c1, c2] = COMPOUND_TAIL_PARTS[current];
                return {
                    finalized: finalized + c1,
                    composing: { kind: "syllable", lead: c2, vowel: atom, tail: "" },
                };
            }
            // current가 lone vowel이거나 lead로 불가능한 자음: finalize하고 새 vowel 시작.
            return {
                finalized: finalized + current,
                composing: { kind: "jamo", value: atom },
            };
        }

        // 자음이 들어옴
        if (currentIsConsonant) {
            const compound = COMPOUND_LONE[current + atom];
            if (compound) {
                return { finalized, composing: { kind: "jamo", value: compound } };
            }
            return {
                finalized: finalized + current,
                composing: { kind: "jamo", value: atom },
            };
        }

        // current가 lone vowel, 자음 들어옴: finalize vowel, 새 자음 시작
        return {
            finalized: finalized + current,
            composing: { kind: "jamo", value: atom },
        };
    }

    // composing이 syllable
    const { lead, vowel, tail } = composing;

    if (isVowelAtom(atom)) {
        if (tail === "") {
            const compound = COMPOUND_VOWEL[vowel + atom];
            if (compound) {
                return {
                    finalized,
                    composing: { kind: "syllable", lead, vowel: compound, tail: "" },
                };
            }
            // compound 안 되는 vowel 연속: 음절 finalize하고 새 vowel 시작
            return {
                finalized: finalized + renderComposing(composing),
                composing: { kind: "jamo", value: atom },
            };
        }

        // 종성 있는 음절 + vowel: 종성의 마지막 atom이 분리돼 새 lead로.
        // compound 종성이면 앞부분만 남기고 마지막을 분리.
        let newLead: string;
        let leftoverTail: string;
        const parts = COMPOUND_TAIL_PARTS[tail];
        if (parts) {
            leftoverTail = parts[0];
            newLead = parts[1];
        } else {
            leftoverTail = "";
            newLead = tail;
        }
        const finalizedSyllable = buildSyllable(lead, vowel, leftoverTail);
        return {
            finalized: finalized + finalizedSyllable,
            composing: { kind: "syllable", lead: newLead, vowel: atom, tail: "" },
        };
    }

    // 자음 들어옴
    if (tail === "") {
        if (isValidTail(atom)) {
            return {
                finalized,
                composing: { kind: "syllable", lead, vowel, tail: atom },
            };
        }
        // 종성으로 불가능한 자음 (ㄸ/ㅃ/ㅉ 등): 음절 finalize, 새 자음 시작
        return {
            finalized: finalized + renderComposing(composing),
            composing: { kind: "jamo", value: atom },
        };
    }

    // 종성 있는 음절 + 자음: compound 종성 시도
    const compoundTail = COMPOUND_TAIL[tail + atom];
    if (compoundTail) {
        return {
            finalized,
            composing: { kind: "syllable", lead, vowel, tail: compoundTail },
        };
    }
    return {
        finalized: finalized + renderComposing(composing),
        composing: { kind: "jamo", value: atom },
    };
}

/**
 * 키스트로크(원자) 배열을 받아, 각 키 입력 직후의 화면 상태를 순서대로 반환한다.
 */
export function typingStates(keystrokes: string[]): string[] {
    const states: string[] = [];
    let finalized = "";
    let composing: Composing = null;
    for (const atom of keystrokes) {
        ({ finalized, composing } = step(finalized, composing, atom));
        states.push(finalized + renderComposing(composing));
    }
    return states;
}

/**
 * 최종 쿼리 문자열을 받아 그걸 만들어낸 키스트로크(원자) 시퀀스를 복원한다.
 * 한글 음절은 atoms로 분해되고, 비한글 grapheme cluster는 통째로 한 키스트로크로 취급.
 */
export function queryToKeystrokes(finalQuery: string): string[] {
    const atoms: string[] = [];
    for (const seg of segmenter.segment(finalQuery)) {
        const cluster = seg.segment;
        if (cluster.length === 1) {
            const decomposed = decomposeToAtoms(cluster);
            for (let i = 0; i < decomposed.length; i++) {
                atoms.push(atomIdToChar(decomposed[i]));
            }
        } else {
            atoms.push(cluster);
        }
    }
    return atoms;
}

/**
 * 최종 쿼리 문자열로부터 "이 문자열을 만들기까지 매 키스트로크마다 보이는 상태" 시퀀스를
 * 계산한다. journeyFrom(q)의 마지막 원소는 q와 같아야 한다.
 */
export function journeyFrom(finalQuery: string): string[] {
    return typingStates(queryToKeystrokes(finalQuery));
}
