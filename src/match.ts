import { isConsonantLUT } from "./internal/atomRegistry";
import type { ResolvedScoring } from "./score";
import { resolveScoring } from "./score";
import type { Atoms, MatchResult, Query, QueryGrapheme, ScoringConfig, Target } from "./types";

/*
 * 매칭 모델
 * ---------
 * 쿼리 원자를 타겟 원자 스트림에 순서대로 매칭한다.
 *
 * 기본 제약: **vowel-sticks-to-lead** — 쿼리 grapheme의 모음은 그 grapheme의 초성이
 * 매치된 타겟 음절 안에서 바로 이어지는 위치에서만 소비된다.
 *
 * **기본 동작 (strict=false)**: 모든 한글 grapheme을 관대하게 매칭.
 * - lead+vowel은 anchor 음절 내부에서 매치
 * - tail은 anchor 또는 다음 음절로 spill 가능
 * - anchor 내부에 남는 atoms(잉여)는 쿼리 tail prefix와 정확히 일치해야 함
 *   (예: 쿼리 "읽"=[ㅇㅣㄹㄱ] vs anchor "일"=[ㅇㅣㄹ] → 잉여 ㄹ이 tail prefix ㄹ과 일치 → OK, ㄱ spill.
 *    쿼리 "염"=[ㅇㅕㅁ] vs anchor "연"=[ㅇㅕㄴ] → 잉여 ㄴ이 tail ㅁ과 불일치 → reject)
 *
 * **strict 모드 (strict=true)**: 모음이 포함된 쿼리 grapheme은 target anchor와
 * atom 시퀀스가 정확히 일치해야 함 (tail spill 금지 + anchor 잉여 atom 금지).
 * 초성-only grapheme과 non-Hangul은 영향 없음.
 *
 * Spill 자음은 이후 target grapheme들 중 **초성 위치에만** 매치 가능 — 종성 자리로는 갈 수 없다.
 *
 * Atoms = Uint16Array (정수 ID). 비교는 모두 정수 비교.
 * Target은 flat typed array 레이아웃 (atomsFlat, atomStarts, atomLens, vowelIdxs, tailIdxs).
 */

function buildMatchResult(indices: number[], target: Target): MatchResult {
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

    return { indices, startsAtZero, runCount, boundaryHits };
}

/**
 * 리터럴 substring 매칭 (대소문자 무시).
 */
export function matchLiteral(literal: string, target: Target): MatchResult | null {
    if (literal === "") {
        return { indices: [], startsAtZero: false, runCount: 0, boundaryHits: 0 };
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
    return buildMatchResult(indices, target);
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

// tail이 있는 lenient grapheme의 anchor acceptance 보조 체크.
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
    /**
     * anchor별 소비된 atom 수 (indices와 같은 길이).
     * anchorFill 스코어 = sum(filledAtoms[i] / target.atomLens[indices[i]]).
     */
    filledAtoms: number[];
    // candidate 내부에서 타겟 tgi 연속으로 매치된 prefix 길이 (1 이상).
    // indices = [10, 11, 12] 이면 3, [10, 12] 이면 1. DP 전이의 runLen과
    // 이어붙여 consecutive bonus 산출에 사용.
    internalRunLen: number;
};

// indices가 startTgi부터 전부 연속이면 indices.length, 아니면 1 반환.
// 전원 연속일 때만 DP의 runLen 누적과 동등한 의미로 consecutive bonus 산정이 가능하므로
// 부분 연속(중간 gap)은 안전하게 bonus 비활성(=1)으로 간주한다.
function computeInternalRunLen(indices: number[]): number {
    for (let i = 1; i < indices.length; i++) {
        if (indices[i] !== indices[i - 1] + 1) return 1;
    }
    return indices.length;
}

// 모음 있는 쿼리 grapheme의 lenient anchor 수집 (tail spill 허용)
function findVowelCandidatesLenient(qg: QueryGrapheme, target: Target, minTgi: number): Candidate[] {
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
            candidates.push({
                startTgi: tgi,
                endTgi: tgi,
                indices: [tgi],
                filledAtoms: [qLeadVowelEnd],
                internalRunLen: 1,
            });
            continue;
        }

        if (!checkAnchorExtrasPrefix(qAtoms, qTailStart, target, tStart, tLen, qLeadVowelEnd)) continue;

        const tailResult = matchTailFrom(qg, target, tgi, tStart + qLeadVowelEnd);
        if (tailResult) candidates.push(tailResult);
    }
    return candidates;
}

// 종성 atom들을 anchor부터 이후 음절로 매칭 시도 (lenient 전용)
function matchTailFrom(
    qg: QueryGrapheme,
    target: Target,
    anchorTgi: number,
    searchStartFlat: number,
): Candidate | null {
    const qAtoms = qg.atoms;
    const qTailStart = qg.tailIndex;
    const qLeadVowelEnd = qTailStart;
    const indices = [anchorTgi];
    const filledAtoms: number[] = [];
    let curTgi = anchorTgi;
    let tai = searchStartFlat;
    let lastMatchedTgi = anchorTgi;
    const T = target.graphemeCount;

    // anchor 내부에서 소비된 atoms = qLeadVowelEnd + (anchor extras prefix로 매칭된 tail atoms 수)
    const anchorTStart = target.atomStarts[anchorTgi];
    const anchorTEnd = anchorTStart + target.atomLens[anchorTgi];
    let anchorFilled = qLeadVowelEnd;

    for (let qai = qTailStart; qai < qAtoms.length; qai++) {
        const needle = qAtoms[qai];
        let found = false;

        while (curTgi < T) {
            const tStart = target.atomStarts[curTgi];
            let idx = -1;
            if (curTgi === anchorTgi) {
                for (let i = tai; i < anchorTEnd; i++) {
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
                if (curTgi === anchorTgi) {
                    anchorFilled++;
                } else if (curTgi !== lastMatchedTgi) {
                    indices.push(curTgi);
                    filledAtoms.push(1);
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

    // anchor fill은 indices[0]에 해당
    filledAtoms.unshift(anchorFilled);

    return {
        startTgi: anchorTgi,
        endTgi: lastMatchedTgi,
        indices,
        filledAtoms,
        internalRunLen: computeInternalRunLen(indices),
    };
}

// 초성 전용 한글 클러스터의 모든 시작 위치 수집
function findConsonantCandidates(qAtoms: Atoms, target: Target, minTgi: number): Candidate[] {
    const candidates: Candidate[] = [];
    const T = target.graphemeCount;

    for (let startTgi = minTgi; startTgi < T; startTgi++) {
        if (target.atomsFlat[target.atomStarts[startTgi]] !== qAtoms[0]) continue;

        if (qAtoms.length === 1) {
            candidates.push({
                startTgi,
                endTgi: startTgi,
                indices: [startTgi],
                filledAtoms: [1],
                internalRunLen: 1,
            });
            continue;
        }

        const indices = [startTgi];
        const filledAtoms = [1];
        let curTgi = startTgi + 1;
        let ok = true;
        for (let qai = 1; qai < qAtoms.length; qai++) {
            const needle = qAtoms[qai];
            let found = false;
            while (curTgi < T) {
                if (target.atomsFlat[target.atomStarts[curTgi]] === needle) {
                    indices.push(curTgi);
                    filledAtoms.push(1);
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
            candidates.push({
                startTgi,
                endTgi: indices[indices.length - 1],
                indices,
                filledAtoms,
                internalRunLen: computeInternalRunLen(indices),
            });
        }
    }
    return candidates;
}

// 비한글 grapheme 또는 strict 한글 grapheme의 모든 정확 매치 위치 수집
function findExactCandidates(qAtoms: Atoms, target: Target, minTgi: number): Candidate[] {
    const candidates: Candidate[] = [];
    const T = target.graphemeCount;
    for (let tgi = minTgi; tgi < T; tgi++) {
        if (atomsEqual(qAtoms, target, tgi)) {
            candidates.push({
                startTgi: tgi,
                endTgi: tgi,
                indices: [tgi],
                filledAtoms: [qAtoms.length],
                internalRunLen: 1,
            });
        }
    }
    return candidates;
}

function findCandidates(qg: QueryGrapheme, target: Target, minTgi: number, strict: boolean): Candidate[] {
    if (qg.vowelIndex !== -1) {
        if (strict) {
            // 모음 포함 + strict: 구조 매치 (anchor atom 시퀀스 == 쿼리 grapheme atoms)
            return findExactCandidates(qg.atoms, target, minTgi);
        }
        return findVowelCandidatesLenient(qg, target, minTgi);
    }
    if (isConsonantLUT[qg.atoms[0]] === 1) {
        return findConsonantCandidates(qg.atoms, target, minTgi);
    }
    return findExactCandidates(qg.atoms, target, minTgi);
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

// candidate 내부 tgi 연속 실행에 대한 consecutive 보너스 (선형).
// n atom 이 연속이면 (n-1) 쌍 × cons.
function intraRunBonus(internalRunLen: number, consecutive: number): number {
    if (internalRunLen <= 1) return 0;
    return consecutive * (internalRunLen - 1);
}

function candidatePositionScore(c: Candidate, target: Target, sc: ResolvedScoring): number {
    let s = 0;
    for (let i = 0; i < c.indices.length; i++) {
        const tgi = c.indices[i];
        if (tgi === 0) s += sc.positionZero;
        if (target.boundaryFlags[tgi]) s += sc.boundary;
        s += sc.getBonus(tgi);
        const anchorLen = target.atomLens[tgi];
        if (anchorLen > 0) {
            s += sc.anchorFill * (c.filledAtoms[i] / anchorLen);
        }
    }
    return s;
}

/**
 * DP 기반 최적 정렬 매칭 + 스코어링.
 *
 * **매칭 규칙**:
 * - 기본(`strict=false`): 모든 한글 grapheme을 관대하게 매칭 (lead+vowel 매치 후 tail spill 가능,
 *   anchor extras는 쿼리 tail prefix와 일치 필요).
 * - `strict=true`: 모음 포함 쿼리 grapheme은 target anchor와 atom 시퀀스가 정확히 일치해야 함.
 *   초성-only grapheme과 non-Hangul은 영향 없음.
 *
 * 초성-only 쿼리, tail spill, IME 축약 입력 등은 별도 규칙 없이 scoring으로 품질 차이를 반영한다
 * (anchor에 얇게 들어간 매치는 `anchorFill` 비율이 낮아 자연스럽게 후순위).
 *
 * @param query - `buildQuery`로 만든 쿼리
 * @param target - `preprocessTarget`으로 만든 타겟
 * @param scoring - 스코어 가중치 / grapheme 보너스
 * @param strict - 엄격 매칭 모드 (기본 `false`)
 * @returns 매치되면 `MatchResult` (with `score`), 아니면 `null`
 */
export function matchBest(
    query: Query,
    target: Target,
    scoring?: ScoringConfig,
    strict: boolean = false,
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
            score: 0,
        };
    }
    if (Q > T) return null;

    const sc = resolveScoring(scoring, target);

    // Phase 1: 후보 수집
    const allCandidates: Candidate[][] = [];
    for (let qi = 0; qi < Q; qi++) {
        const candidates = findCandidates(qGraphemes[qi], target, 0, strict);
        if (candidates.length === 0) return null;
        allCandidates.push(candidates);
    }

    // Phase 2: DP
    const consByTgi: (ConsPred[] | undefined)[] = new Array(T);
    const dpFrontier: FrontierEntry[][][] = [];

    const firstFrontier: FrontierEntry[][] = [];
    for (let ci = 0; ci < allCandidates[0].length; ci++) {
        const c = allCandidates[0][ci];
        const posScore = candidatePositionScore(c, target, sc);
        const m = c.internalRunLen;
        firstFrontier.push([
            {
                score: posScore + intraRunBonus(m, sc.consecutive),
                runLen: m,
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
            const posScore = candidatePositionScore(c, target, sc);
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
            const m = c.internalRunLen;
            const intraBonus = intraRunBonus(m, sc.consecutive);
            if (gapBestVal > -Infinity) {
                const gapTotal = gapBestVal + sc.gapPenalty * (s - 1);
                insertPareto(frontier, {
                    score: gapTotal + posScore + intraBonus,
                    runLen: m,
                    parentPci: gapBestPci,
                    parentFIdx: gapBestFIdx,
                });
            }

            const consFrontier = consByTgi[s - 1];
            if (consFrontier) {
                // 선형 consecutive: prev candidate의 마지막 tgi와 curr.startTgi가 인접이면
                // bridge pair 1개 + curr 내부 pairs(m-1)개 = cons * m (bridge 1 + intraBonus m-1).
                // prev 끝과 curr 시작 사이 인접 쌍 1개 × cons.
                const bridgeBonus = sc.consecutive;
                for (let i = 0; i < consFrontier.length; i++) {
                    const e = consFrontier[i];
                    const newRunLen = e.runLen + m;
                    insertPareto(frontier, {
                        score: e.score + bridgeBonus + intraBonus + posScore,
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

    // Phase 5: target 길이 페널티 (선형, cap 없음)
    let score = bestFinalScore;
    score += sc.targetLengthPenalty * T;

    const result = buildMatchResult(indices, target);
    result.score = score;
    return result;
}
