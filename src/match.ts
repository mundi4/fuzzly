import { isConsonantLUT } from "./internal/atomRegistry";
import type { ResolvedScoring } from "./score";
import { resolveScoring } from "./score";
import type { Atoms, MatchResult, Query, QueryGrapheme, ScoringConfig, SpillMode, Target } from "./types";

/*
 * 매칭 모델
 * ---------
 * 쿼리 원자를 타겟 원자 스트림에 순서대로 매칭한다.
 *
 * 기본 제약: **vowel-sticks-to-lead** — 쿼리 grapheme의 모음은 그 grapheme의 초성이
 * 매치된 타겟 음절 안에서 바로 이어지는 위치에서만 소비된다.
 *
 * **spillMode 기반 finalized 구조 엄격성**:
 * - 조합중(composing) grapheme은 tail이 다음 음절로 spill 가능. 단, anchor의 lead+vowel 이후
 *   잉여 atoms가 있다면 그 atoms는 쿼리 tail atoms의 prefix와 정확히 일치해야 함
 *   (예: "읽"=[ㅇㅣㄹㄱ] vs anchor "일"=[ㅇㅣㄹ]은 잉여 ㄹ이 tail prefix ㄹ과 일치 → OK, ㄱ spill.
 *    "염"=[ㅇㅕㅁ] vs anchor "연"=[ㅇㅕㄴ]은 잉여 ㄴ이 tail ㅁ과 불일치 → reject)
 * - 확정(finalized) + 모음 포함 grapheme은 타겟 anchor grapheme과 atom 시퀀스가 정확히 일치해야 함
 *   (= tail spill 금지 AND anchor 잉여 atom 금지)
 * - **예외**: composing 바로 앞(`resolved === gi + 1`) 위치의 finalized grapheme이
 *   compound jongseong(ㄶ/ㄺ 등, tail atom 2개 이상)을 포함하면 조합중으로 승격된다.
 *   IME에서 `연`+`ㅎ`→`엲` 후 다음 키 입력으로 `엲`이 finalized된 중간상태를 수용
 *   (예: `막엲ㄱ` vs `막연하게` 매치). Single jongseong은 모든 위치에서 strict.
 *
 * Atoms = Uint8Array (정수 ID). 비교는 모두 정수 비교.
 * Target은 flat typed array 레이아웃 (atomsFlat, atomStarts, atomLens, vowelIdxs, tailIdxs).
 */

const DEFAULT_SPILL_MODE: SpillMode = "composingOrLast";

// resolveComposingGrapheme 반환 값 sentinel.
// -2 = 모든 grapheme 조합중 취급 (spillMode === "always")
// -1 = 아무것도 조합중 아님
// >=0 = 해당 인덱스의 grapheme만 조합중
const COMPOSING_ALL = -2;
const COMPOSING_NONE = -1;

/**
 * spillMode와 composingIndex(char index)로부터 "어느 grapheme이 조합중인지" 결정.
 *
 * @returns -2 (전부) / -1 (없음) / >=0 (특정 grapheme 인덱스)
 */
function resolveComposingGrapheme(
    query: Query,
    composingIndex: number | null | undefined,
    spillMode: SpillMode,
): number {
    if (spillMode === "always") return COMPOSING_ALL;

    const Q = query.graphemes.length;

    if (typeof composingIndex === "number") {
        if (composingIndex < 0 || composingIndex >= query.graphemeIndexes.length) {
            return COMPOSING_NONE;
        }
        const gi = query.graphemeIndexes[composingIndex];
        if (gi >= Q) return COMPOSING_NONE;
        return gi;
    }

    if (composingIndex === null) return COMPOSING_NONE;

    // undefined
    if (spillMode === "composingOrLast" && Q > 0) {
        return Q - 1;
    }
    return COMPOSING_NONE;
}

function isGraphemeComposing(resolved: number, gi: number, qg: QueryGrapheme): boolean {
    if (resolved === COMPOSING_ALL || resolved === gi) return true;
    // compound jongseong(ㄶ/ㄺ 등)이 finalized로 남는 건 "바로 다음 grapheme이 composing"일 때뿐.
    // IME가 더 이상 결합할 수 없어 자연히 finalized된 중간상태이므로 관대하게 처리.
    if (qg.hasCompoundTail && resolved === gi + 1) return true;
    return false;
}

function buildMatchResult(indices: number[], target: Target, queryGraphemes: QueryGrapheme[]): MatchResult {
    const startsAtZero = indices.length > 0 && indices[0] === 0;

    let runCount = indices.length > 0 ? 1 : 0;
    for (let i = 1; i < indices.length; i++) {
        if (indices[i] !== indices[i - 1] + 1 && indices[i] !== indices[i - 1]) {
            runCount++;
        }
    }

    let boundaryHits = 0;
    for (const idx of indices) {
        if (target.boundaryFlags[idx]) boundaryHits++;
    }

    let initialConsonantOnly = queryGraphemes.length > 0;
    for (const qg of queryGraphemes) {
        if (qg.vowelIndex !== -1) {
            initialConsonantOnly = false;
            break;
        }
    }

    return { indices, startsAtZero, runCount, boundaryHits, initialConsonantOnly };
}

/**
 * 탐욕적(greedy) 좌→우 매칭. 첫 번째로 유효한 정렬을 반환한다.
 *
 * **매칭 규칙 (spillMode 기반)**:
 * - **조합중(composing)** grapheme: lead+vowel은 anchor 음절 내부에서 매치, tail은 다음 음절로 spill 가능.
 *   단, anchor의 잉여 atoms는 쿼리 tail prefix와 일치해야 함 (예: "염" ≠ "연"의 잉여 ㄴ).
 * - **확정(finalized) + 모음 포함** grapheme: 타겟 anchor와 atom 시퀀스 정확히 일치 필요
 *   (tail spill 금지 + anchor 잉여 atom 금지). 예: "으"(finalized) ≠ "은", "일"(finalized) ≠ "읽"
 * - 초성-only grapheme / non-Hangul(ASCII, 이모지)은 spillMode 영향 없음
 *
 * @param query - `buildQuery`로 만든 쿼리
 * @param target - `preprocessTarget`으로 만든 타겟
 * @param composingIndex - 조합중인 char의 UTF-16 인덱스 (쿼리 문자열 기준).
 *   - `number`: 해당 위치의 grapheme이 조합중 (browser compositionupdate 시점의 selectionStart 등)
 *   - `null`: 명시적으로 "조합중 없음" — `composingOrLast`의 last 폴백을 막는다 (예: 쿼리 뒤 공백 뒤 trim)
 *   - `undefined`: caller가 모름 → spillMode의 기본 동작 적용
 * @param spillMode - finalized 엄격성 정책 (기본값 `"composingOrLast"`):
 *   - `"always"`: 모든 grapheme을 조합중 취급 (기존 관대 동작)
 *   - `"composing"`: composingIndex가 지정한 것만 관대, 없으면 전부 엄격
 *   - `"composingOrLast"`: composingIndex 지정되면 그것만, 없으면 마지막 grapheme 자동 조합중 가정
 * @returns 매치되면 `MatchResult`, 아니면 `null`
 */
export function match(
    query: Query,
    target: Target,
    composingIndex?: number | null,
    spillMode: SpillMode = DEFAULT_SPILL_MODE,
): MatchResult | null {
    const qGraphemes = query.graphemes;
    const T = target.graphemeCount;

    if (qGraphemes.length === 0) {
        return { indices: [], startsAtZero: false, runCount: 0, boundaryHits: 0, initialConsonantOnly: false };
    }
    if (qGraphemes.length > T) return null;

    const resolvedComposing = resolveComposingGrapheme(query, composingIndex, spillMode);

    const matches: number[] = [];
    let tgi = 0;

    for (let qi = 0; qi < qGraphemes.length; qi++) {
        const qg = qGraphemes[qi];
        const qAtoms = qg.atoms;
        const qVowelStart = qg.vowelIndex;
        const qTailStart = qg.tailIndex;
        const isComp = isGraphemeComposing(resolvedComposing, qi, qg);

        if (qVowelStart === -1) {
            // 중성 없음
            const isHangulCluster = isConsonantLUT[qAtoms[0]] === 1;

            if (isHangulCluster) {
                // 한글 자음: 각 atom이 이후 타겟 음절의 초성(첫 atom)과 매치
                for (let qai = 0; qai < qAtoms.length; qai++) {
                    const needle = qAtoms[qai];
                    let found = false;
                    while (tgi < T) {
                        if (target.atomsFlat[target.atomStarts[tgi]] === needle) {
                            matches.push(tgi);
                            tgi++;
                            found = true;
                            break;
                        }
                        tgi++;
                    }
                    if (!found) return null;
                }
            } else {
                // 비한글: atoms 전체가 동일해야 함
                let found = false;
                while (tgi < T) {
                    if (atomsEqual(qAtoms, target, tgi)) {
                        matches.push(tgi);
                        tgi++;
                        found = true;
                        break;
                    }
                    tgi++;
                }
                if (!found) return null;
            }
            continue;
        }

        if (!isComp) {
            // 중성 있음 + finalized: 구조 매치 (anchor atom 시퀀스 == 쿼리 grapheme atoms)
            let anchorTgi = -1;
            while (tgi < T) {
                if (atomsEqual(qAtoms, target, tgi)) {
                    anchorTgi = tgi;
                    break;
                }
                tgi++;
            }
            if (anchorTgi === -1) return null;
            matches.push(anchorTgi);
            tgi = anchorTgi + 1;
            continue;
        }

        // 중성 있음 + composing: lead+vowel은 같은 타겟 음절 안에서, tail은 spill 가능
        const qLeadVowelEnd = qTailStart === -1 ? qAtoms.length : qTailStart;

        let anchorTgi = -1;
        while (tgi < T) {
            if (target.vowelIdxs[tgi] === -1) {
                tgi++;
                continue;
            }
            const tStart = target.atomStarts[tgi];
            const tLen = target.atomLens[tgi];
            if (tLen < qLeadVowelEnd) {
                tgi++;
                continue;
            }
            let ok = true;
            for (let i = 0; i < qLeadVowelEnd; i++) {
                if (qAtoms[i] !== target.atomsFlat[tStart + i]) {
                    ok = false;
                    break;
                }
            }
            if (!ok) {
                tgi++;
                continue;
            }
            if (
                qTailStart !== -1 &&
                !checkAnchorExtrasPrefix(qAtoms, qTailStart, target, tStart, tLen, qLeadVowelEnd)
            ) {
                tgi++;
                continue;
            }
            anchorTgi = tgi;
            break;
        }

        if (anchorTgi === -1) return null;

        matches.push(anchorTgi);

        if (qTailStart === -1) {
            tgi = anchorTgi + 1;
            continue;
        }

        // 종성 처리 (spill 허용). 단, spill되어 다음 grapheme으로 넘어간 뒤에는
        // 초성(position 0)에만 매치 허용 — 종성으로 검색하는 사용자는 없다.
        let curTgi = anchorTgi;
        let tai = target.atomStarts[anchorTgi] + qLeadVowelEnd;
        let lastMatchedTgi = anchorTgi;

        for (let qai = qTailStart; qai < qAtoms.length; qai++) {
            const needle = qAtoms[qai];
            let found = false;

            while (curTgi < T) {
                const tStart = target.atomStarts[curTgi];
                let idx = -1;
                if (curTgi === anchorTgi) {
                    const tEnd = tStart + target.atomLens[curTgi];
                    for (let i = tai; i < tEnd; i++) {
                        if (target.atomsFlat[i] === needle) {
                            idx = i;
                            break;
                        }
                    }
                } else if (target.atomsFlat[tStart] === needle) {
                    idx = tStart;
                }
                if (idx !== -1) {
                    tai = idx + 1;
                    if (curTgi !== lastMatchedTgi) {
                        matches.push(curTgi);
                        lastMatchedTgi = curTgi;
                    }
                    found = true;
                    break;
                }
                curTgi++;
                tai = curTgi < T ? target.atomStarts[curTgi] : 0;
            }

            if (!found) return null;
        }

        tgi = curTgi + 1;
    }

    return buildMatchResult(matches, target, qGraphemes);
}

/**
 * 리터럴 substring 매칭 (대소문자 무시).
 */
export function matchLiteral(literal: string, target: Target): MatchResult | null {
    if (literal === "") {
        return { indices: [], startsAtZero: false, runCount: 0, boundaryHits: 0, initialConsonantOnly: false };
    }
    const text = literal.toLowerCase();
    const foundAt = target.normalizedInput.indexOf(text);
    if (foundAt < 0) return null;

    const indices: number[] = [];
    const graphemeIndexes = target.graphemeIndexes;
    for (let i = 0; i < text.length; i++) {
        const gi = graphemeIndexes[foundAt + i];
        if (indices[indices.length - 1] !== gi) {
            indices.push(gi);
        }
    }
    return buildMatchResult(indices, target, []);
}

// ---------------------------------------------------------------------------
// atomsEqual: 쿼리 grapheme의 atoms와 타겟 grapheme의 atoms 전체 비교
// ---------------------------------------------------------------------------
function atomsEqual(qAtoms: Atoms, target: Target, tgi: number): boolean {
    const tLen = target.atomLens[tgi];
    if (qAtoms.length !== tLen) return false;
    const tStart = target.atomStarts[tgi];
    for (let i = 0; i < tLen; i++) {
        if (qAtoms[i] !== target.atomsFlat[tStart + i]) return false;
    }
    return true;
}

// tail이 있는 composing grapheme의 anchor acceptance 보조 체크.
// anchor의 qLeadVowelEnd 이후 잉여 atoms는 쿼리 tail atoms의 prefix와 정확히 일치해야 함.
// 불일치 시 잉여 atom이 어떤 쿼리 atom에도 대응되지 않는 false positive가 발생하기 때문.
function checkAnchorExtrasPrefix(
    qAtoms: Atoms,
    qTailStart: number,
    target: Target,
    tStart: number,
    tLen: number,
    qLeadVowelEnd: number,
): boolean {
    const anchorExtras = tLen - qLeadVowelEnd;
    if (anchorExtras <= 0) return true;
    const qTailLen = qAtoms.length - qTailStart;
    if (anchorExtras > qTailLen) return false;
    for (let i = 0; i < anchorExtras; i++) {
        if (qAtoms[qTailStart + i] !== target.atomsFlat[tStart + qLeadVowelEnd + i]) return false;
    }
    return true;
}

// ---------------------------------------------------------------------------
// matchBest: DP 기반 최적 정렬 탐색
// ---------------------------------------------------------------------------

type Candidate = {
    startTgi: number;
    endTgi: number;
    indices: number[];
    // vowel+tail 쿼리에서 종성 atom이 anchor grapheme 밖으로 넘어간 경우에만 true.
    // "완전 그래핌 매치"(전 grapheme이 anchor 안에서 소비) 판별용.
    tailSpilled: boolean;
};

// composing grapheme용: 모음 있는 쿼리 grapheme의 모든 anchor 위치 수집 (tail spill 허용)
function findVowelCandidatesComposing(qg: QueryGrapheme, target: Target, minTgi: number): Candidate[] {
    const qAtoms = qg.atoms;
    const qTailStart = qg.tailIndex;
    const qLeadVowelEnd = qTailStart === -1 ? qAtoms.length : qTailStart;
    const candidates: Candidate[] = [];
    const T = target.graphemeCount;

    for (let tgi = minTgi; tgi < T; tgi++) {
        if (target.vowelIdxs[tgi] === -1) continue;
        const tStart = target.atomStarts[tgi];
        const tLen = target.atomLens[tgi];
        if (tLen < qLeadVowelEnd) continue;

        let ok = true;
        for (let i = 0; i < qLeadVowelEnd; i++) {
            if (qAtoms[i] !== target.atomsFlat[tStart + i]) {
                ok = false;
                break;
            }
        }
        if (!ok) continue;

        if (qTailStart === -1) {
            candidates.push({ startTgi: tgi, endTgi: tgi, indices: [tgi], tailSpilled: false });
            continue;
        }

        if (!checkAnchorExtrasPrefix(qAtoms, qTailStart, target, tStart, tLen, qLeadVowelEnd)) continue;

        const tailResult = matchTailFrom(qg, target, tgi, tStart + qLeadVowelEnd);
        if (tailResult) {
            candidates.push(tailResult);
        }
    }
    return candidates;
}

// 종성 atom들을 anchor부터 이후 음절로 매칭 시도 (composing grapheme 전용)
function matchTailFrom(
    qg: QueryGrapheme,
    target: Target,
    anchorTgi: number,
    searchStartFlat: number,
): Candidate | null {
    const qAtoms = qg.atoms;
    const qTailStart = qg.tailIndex;
    const indices = [anchorTgi];
    let curTgi = anchorTgi;
    let tai = searchStartFlat;
    let lastMatchedTgi = anchorTgi;
    const T = target.graphemeCount;

    for (let qai = qTailStart; qai < qAtoms.length; qai++) {
        const needle = qAtoms[qai];
        let found = false;

        while (curTgi < T) {
            const tStart = target.atomStarts[curTgi];
            let idx = -1;
            if (curTgi === anchorTgi) {
                const tEnd = tStart + target.atomLens[curTgi];
                for (let i = tai; i < tEnd; i++) {
                    if (target.atomsFlat[i] === needle) {
                        idx = i;
                        break;
                    }
                }
            } else if (target.atomsFlat[tStart] === needle) {
                idx = tStart;
            }
            if (idx !== -1) {
                tai = idx + 1;
                if (curTgi !== lastMatchedTgi) {
                    indices.push(curTgi);
                    lastMatchedTgi = curTgi;
                }
                found = true;
                break;
            }
            curTgi++;
            tai = curTgi < T ? target.atomStarts[curTgi] : 0;
        }

        if (!found) return null;
    }

    return {
        startTgi: anchorTgi,
        endTgi: lastMatchedTgi,
        indices,
        tailSpilled: lastMatchedTgi !== anchorTgi,
    };
}

// 초성 전용 한글 클러스터의 모든 시작 위치 수집
function findConsonantCandidates(qAtoms: Atoms, target: Target, minTgi: number): Candidate[] {
    const candidates: Candidate[] = [];
    const T = target.graphemeCount;

    for (let startTgi = minTgi; startTgi < T; startTgi++) {
        if (target.atomsFlat[target.atomStarts[startTgi]] !== qAtoms[0]) continue;

        if (qAtoms.length === 1) {
            candidates.push({ startTgi, endTgi: startTgi, indices: [startTgi], tailSpilled: false });
            continue;
        }

        const indices = [startTgi];
        let curTgi = startTgi + 1;
        let ok = true;
        for (let qai = 1; qai < qAtoms.length; qai++) {
            const needle = qAtoms[qai];
            let found = false;
            while (curTgi < T) {
                if (target.atomsFlat[target.atomStarts[curTgi]] === needle) {
                    indices.push(curTgi);
                    curTgi++;
                    found = true;
                    break;
                }
                curTgi++;
            }
            if (!found) {
                ok = false;
                break;
            }
        }
        if (ok) {
            candidates.push({ startTgi, endTgi: indices[indices.length - 1], indices, tailSpilled: false });
        }
    }
    return candidates;
}

// 비한글 grapheme 또는 finalized 한글 grapheme의 모든 정확 매치 위치 수집
function findExactCandidates(qAtoms: Atoms, target: Target, minTgi: number): Candidate[] {
    const candidates: Candidate[] = [];
    const T = target.graphemeCount;
    for (let tgi = minTgi; tgi < T; tgi++) {
        if (atomsEqual(qAtoms, target, tgi)) {
            candidates.push({ startTgi: tgi, endTgi: tgi, indices: [tgi], tailSpilled: false });
        }
    }
    return candidates;
}

function findCandidates(qg: QueryGrapheme, target: Target, minTgi: number, isComposing: boolean): Candidate[] {
    if (qg.vowelIndex !== -1) {
        if (isComposing) {
            return findVowelCandidatesComposing(qg, target, minTgi);
        }
        // finalized + 모음: 구조 매치 (anchor atom 시퀀스 == 쿼리 grapheme atoms)
        return findExactCandidates(qg.atoms, target, minTgi);
    }
    if (isConsonantLUT[qg.atoms[0]] === 1) {
        return findConsonantCandidates(qg.atoms, target, minTgi);
    }
    return findExactCandidates(qg.atoms, target, minTgi);
}

function isHangulChoseongOnly(qg: QueryGrapheme): boolean {
    if (qg.vowelIndex !== -1) return false;
    return isConsonantLUT[qg.atoms[0]] === 1;
}

// DP 상태 Pareto 엔트리
type FrontierEntry = {
    score: number;
    runLen: number;
    parentPci: number;
    parentFIdx: number;
};

type ConsPred = {
    score: number;
    runLen: number;
    pci: number;
    fIdx: number;
};

function insertPareto<T extends { score: number; runLen: number }>(arr: T[], ne: T): void {
    for (let i = arr.length - 1; i >= 0; i--) {
        const e = arr[i];
        if (e.score >= ne.score && e.runLen >= ne.runLen) {
            return;
        }
        if (ne.score >= e.score && ne.runLen >= e.runLen) {
            arr[i] = arr[arr.length - 1];
            arr.pop();
        }
    }
    arr.push(ne);
}

function candidatePositionScore(
    c: Candidate,
    target: Target,
    sc: ResolvedScoring,
    isChoseongOnly: boolean,
    applyTailSpillPenalty: boolean,
): number {
    const weaken = isChoseongOnly ? sc.choseongWeaken : 1;
    let s = 0;
    for (const tgi of c.indices) {
        if (tgi === 0) s += sc.positionZero * weaken;
        else if (target.boundaryFlags[tgi]) s += sc.boundary * weaken;
        s += sc.getBonus(tgi);
    }
    if (c.tailSpilled && applyTailSpillPenalty) s += sc.tailSpillPenalty;
    return s;
}

/**
 * DP 기반 최적 정렬 매칭 + 스코어링.
 *
 * 매칭 규칙은 `match`와 동일. `spillMode`/`composingIndex` 동작은 {@link match} 참조.
 *
 * @param query - `buildQuery`로 만든 쿼리
 * @param target - `preprocessTarget`으로 만든 타겟
 * @param scoring - 스코어 가중치 / grapheme 보너스. `tailSpillPenalty`는 `spillMode === "always"` 에서만 적용
 * @param composingIndex - 조합중인 char의 UTF-16 인덱스 (number/null/undefined 의미는 {@link match} 참조)
 * @param spillMode - finalized 엄격성 정책 (기본값 `"composingOrLast"`)
 * @returns 매치되면 `MatchResult` (with `score`), 아니면 `null`
 */
export function matchBest(
    query: Query,
    target: Target,
    scoring?: ScoringConfig,
    composingIndex?: number | null,
    spillMode: SpillMode = DEFAULT_SPILL_MODE,
): MatchResult | null {
    const qGraphemes = query.graphemes;
    const T = target.graphemeCount;
    const Q = qGraphemes.length;

    if (Q === 0) {
        return {
            indices: [],
            startsAtZero: false,
            runCount: 0,
            boundaryHits: 0,
            initialConsonantOnly: false,
            score: 0,
        };
    }
    if (Q > T) return null;

    const sc = resolveScoring(scoring, target);
    const resolvedComposing = resolveComposingGrapheme(query, composingIndex, spillMode);
    const applyTailSpillPenalty = spillMode === "always";

    // Phase 1: 후보 수집
    const allCandidates: Candidate[][] = [];
    for (let qi = 0; qi < Q; qi++) {
        const isComp = isGraphemeComposing(resolvedComposing, qi, qGraphemes[qi]);
        const candidates = findCandidates(qGraphemes[qi], target, 0, isComp);
        if (candidates.length === 0) return null;
        allCandidates.push(candidates);
    }

    // Phase 2: DP
    const consByTgi: (ConsPred[] | undefined)[] = new Array(T);
    const dpFrontier: FrontierEntry[][][] = [];

    const firstFrontier: FrontierEntry[][] = [];
    const firstIsChoseongOnly = isHangulChoseongOnly(qGraphemes[0]);
    for (let ci = 0; ci < allCandidates[0].length; ci++) {
        firstFrontier.push([
            {
                score: candidatePositionScore(
                    allCandidates[0][ci],
                    target,
                    sc,
                    firstIsChoseongOnly,
                    applyTailSpillPenalty,
                ),
                runLen: 1,
                parentPci: -1,
                parentFIdx: -1,
            },
        ]);
    }
    dpFrontier.push(firstFrontier);

    for (let qi = 1; qi < Q; qi++) {
        const currCandidates = allCandidates[qi];
        const prevCands = allCandidates[qi - 1];
        const prevFrontier = dpFrontier[qi - 1];
        const isChoseongOnly = isHangulChoseongOnly(qGraphemes[qi]);
        const currFrontier: FrontierEntry[][] = [];

        type GapPred = { endTgi: number; gapVal: number; pci: number; fIdx: number };
        const gapPreds: GapPred[] = [];
        for (let pci = 0; pci < prevCands.length; pci++) {
            const frontier = prevFrontier[pci];
            if (frontier.length === 0) continue;
            let maxScore = -Infinity;
            let maxFIdx = -1;
            for (let f = 0; f < frontier.length; f++) {
                if (frontier[f].score > maxScore) {
                    maxScore = frontier[f].score;
                    maxFIdx = f;
                }
            }
            if (maxScore > -Infinity) {
                const e = prevCands[pci].endTgi;
                gapPreds.push({
                    endTgi: e,
                    gapVal: maxScore - sc.gapPenalty * e,
                    pci,
                    fIdx: maxFIdx,
                });
            }
        }
        gapPreds.sort((a, b) => a.endTgi - b.endTgi);

        const consUsed: number[] = [];
        for (let pci = 0; pci < prevCands.length; pci++) {
            const frontier = prevFrontier[pci];
            if (frontier.length === 0) continue;
            const e = prevCands[pci].endTgi;
            let arr = consByTgi[e];
            if (!arr) {
                arr = [];
                consByTgi[e] = arr;
                consUsed.push(e);
            }
            for (let f = 0; f < frontier.length; f++) {
                const fe = frontier[f];
                insertPareto(arr, { score: fe.score, runLen: fe.runLen, pci, fIdx: f });
            }
        }

        let gapScanPos = -1;
        let gapBestVal = -Infinity;
        let gapBestPci = -1;
        let gapBestFIdx = -1;

        for (let ci = 0; ci < currCandidates.length; ci++) {
            const c = currCandidates[ci];
            const s = c.startTgi;
            const posScore = candidatePositionScore(c, target, sc, isChoseongOnly, applyTailSpillPenalty);
            const frontier: FrontierEntry[] = [];

            const gapThreshold = s - 2;
            while (gapScanPos + 1 < gapPreds.length && gapPreds[gapScanPos + 1].endTgi <= gapThreshold) {
                gapScanPos++;
                if (gapPreds[gapScanPos].gapVal > gapBestVal) {
                    gapBestVal = gapPreds[gapScanPos].gapVal;
                    gapBestPci = gapPreds[gapScanPos].pci;
                    gapBestFIdx = gapPreds[gapScanPos].fIdx;
                }
            }
            if (gapBestVal > -Infinity) {
                const gapTotal = gapBestVal + sc.gapPenalty * (s - 1);
                insertPareto(frontier, {
                    score: gapTotal + posScore,
                    runLen: 1,
                    parentPci: gapBestPci,
                    parentFIdx: gapBestFIdx,
                });
            }

            const consFrontier = consByTgi[s - 1];
            if (consFrontier) {
                for (let i = 0; i < consFrontier.length; i++) {
                    const e = consFrontier[i];
                    const newRunLen = e.runLen + 1;
                    insertPareto(frontier, {
                        score: e.score + sc.consecutive * newRunLen + posScore,
                        runLen: newRunLen,
                        parentPci: e.pci,
                        parentFIdx: e.fIdx,
                    });
                }
            }

            currFrontier.push(frontier);
        }

        dpFrontier.push(currFrontier);

        for (let k = 0; k < consUsed.length; k++) {
            consByTgi[consUsed[k]] = undefined;
        }
    }

    // Phase 3: 최적 종점
    let bestFinalScore = -Infinity;
    let bestFinalRunLen = -1;
    let bestFinalCi = -1;
    let bestFinalFIdx = -1;
    const lastFrontier = dpFrontier[Q - 1];
    for (let ci = 0; ci < lastFrontier.length; ci++) {
        const frontier = lastFrontier[ci];
        for (let f = 0; f < frontier.length; f++) {
            const e = frontier[f];
            if (e.score > bestFinalScore || (e.score === bestFinalScore && e.runLen > bestFinalRunLen)) {
                bestFinalScore = e.score;
                bestFinalRunLen = e.runLen;
                bestFinalCi = ci;
                bestFinalFIdx = f;
            }
        }
    }

    if (bestFinalCi === -1 || bestFinalScore === -Infinity) return null;

    // Phase 4: 백트래킹
    const chosenCi = new Array<number>(Q);
    const chosenFIdx = new Array<number>(Q);
    chosenCi[Q - 1] = bestFinalCi;
    chosenFIdx[Q - 1] = bestFinalFIdx;
    for (let qi = Q - 1; qi > 0; qi--) {
        const entry = dpFrontier[qi][chosenCi[qi]][chosenFIdx[qi]];
        chosenCi[qi - 1] = entry.parentPci;
        chosenFIdx[qi - 1] = entry.parentFIdx;
    }

    const allIndices: number[] = [];
    for (let qi = 0; qi < Q; qi++) {
        const candidate = allCandidates[qi][chosenCi[qi]];
        for (const idx of candidate.indices) {
            allIndices.push(idx);
        }
    }

    const indices: number[] = [];
    for (const idx of allIndices) {
        if (indices.length === 0 || indices[indices.length - 1] !== idx) {
            indices.push(idx);
        }
    }

    // Phase 5: 전역 보정
    let score = bestFinalScore;

    if (indices.length > 0 && indices[0] === 0) {
        let isPrefix = true;
        for (let i = 1; i < indices.length; i++) {
            if (indices[i] !== indices[i - 1] + 1 && indices[i] !== indices[i - 1]) {
                isPrefix = false;
                break;
            }
        }
        if (isPrefix) score += sc.prefixBonus;
    }

    if (indices.length === T && indices[0] === 0 && indices[indices.length - 1] === T - 1) {
        score += sc.exactBonus;
    }

    score += sc.targetLengthPenalty * Math.min(T, sc.lengthPenaltyCap);

    const result = buildMatchResult(indices, target, qGraphemes);
    result.score = score;
    return result;
}
