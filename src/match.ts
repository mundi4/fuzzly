import { isConsonantLUT } from "./internal/atomRegistry";
import type { ResolvedScoring } from "./score";
import { resolveScoring } from "./score";
import type { Atoms, MatchResult, Query, QueryGrapheme, ScoringConfig, Target } from "./types";

/*
 * 매칭 모델
 * ---------
 * "spillover" 개념은 없다. 쿼리 원자를 타겟 원자 스트림에 순서대로 매칭시키는 게 전부다.
 * 유일한 제약은 **vowel-sticks-to-lead**: 쿼리 한 글자의 모음(중성)은 그 글자의 초성이
 * 매치된 타겟 음절 안에서 바로 이어지는 위치에서만 소비될 수 있다.
 *
 * Atoms = Uint8Array (정수 ID). 비교는 모두 정수 비교.
 * Target은 flat typed array 레이아웃 (atomsFlat, atomStarts, atomLens, vowelIdxs, tailIdxs).
 */

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
 */
export function match(query: Query, target: Target): MatchResult | null {
    const qGraphemes = query.graphemes;
    const T = target.graphemeCount;

    if (qGraphemes.length === 0) {
        return { indices: [], startsAtZero: false, runCount: 0, boundaryHits: 0, initialConsonantOnly: false };
    }
    if (qGraphemes.length > T) return null;

    const matches: number[] = [];
    let tgi = 0;

    for (let qi = 0; qi < qGraphemes.length; qi++) {
        const qg = qGraphemes[qi];
        const qAtoms = qg.atoms;
        const qVowelStart = qg.vowelIndex;
        const qTailStart = qg.tailIndex;

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

        // 중성 있음: lead + vowel은 같은 타겟 음절 안에서 처리
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
            anchorTgi = tgi;
            break;
        }

        if (anchorTgi === -1) return null;

        matches.push(anchorTgi);

        if (qTailStart === -1) {
            tgi = anchorTgi + 1;
            continue;
        }

        // 종성 처리
        let curTgi = anchorTgi;
        let tai = target.atomStarts[anchorTgi] + qLeadVowelEnd;
        let lastMatchedTgi = anchorTgi;

        for (let qai = qTailStart; qai < qAtoms.length; qai++) {
            const needle = qAtoms[qai];
            let found = false;

            while (curTgi < T) {
                const tStart = target.atomStarts[curTgi];
                const tEnd = tStart + target.atomLens[curTgi];
                let idx = -1;
                for (let i = tai; i < tEnd; i++) {
                    if (target.atomsFlat[i] === needle) {
                        idx = i;
                        break;
                    }
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

// ---------------------------------------------------------------------------
// matchBest: DP 기반 최적 정렬 탐색
// ---------------------------------------------------------------------------

type Candidate = {
    startTgi: number;
    endTgi: number;
    indices: number[];
};

// 모음 있는 쿼리 grapheme의 모든 anchor 위치 수집
function findVowelCandidates(qg: QueryGrapheme, target: Target, minTgi: number): Candidate[] {
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
            candidates.push({ startTgi: tgi, endTgi: tgi, indices: [tgi] });
            continue;
        }

        const tailResult = matchTailFrom(qg, target, tgi, tStart + qLeadVowelEnd);
        if (tailResult) {
            candidates.push(tailResult);
        }
    }
    return candidates;
}

// 종성 atom들을 anchor부터 이후 음절로 매칭 시도
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
            const tEnd = tStart + target.atomLens[curTgi];
            let idx = -1;
            for (let i = tai; i < tEnd; i++) {
                if (target.atomsFlat[i] === needle) {
                    idx = i;
                    break;
                }
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

    return { startTgi: anchorTgi, endTgi: lastMatchedTgi, indices };
}

// 초성 전용 한글 클러스터의 모든 시작 위치 수집
function findConsonantCandidates(qAtoms: Atoms, target: Target, minTgi: number): Candidate[] {
    const candidates: Candidate[] = [];
    const T = target.graphemeCount;

    for (let startTgi = minTgi; startTgi < T; startTgi++) {
        if (target.atomsFlat[target.atomStarts[startTgi]] !== qAtoms[0]) continue;

        if (qAtoms.length === 1) {
            candidates.push({ startTgi, endTgi: startTgi, indices: [startTgi] });
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
            candidates.push({ startTgi, endTgi: indices[indices.length - 1], indices });
        }
    }
    return candidates;
}

// 비한글 grapheme의 모든 정확 매치 위치 수집
function findExactCandidates(qAtoms: Atoms, target: Target, minTgi: number): Candidate[] {
    const candidates: Candidate[] = [];
    const T = target.graphemeCount;
    for (let tgi = minTgi; tgi < T; tgi++) {
        if (atomsEqual(qAtoms, target, tgi)) {
            candidates.push({ startTgi: tgi, endTgi: tgi, indices: [tgi] });
        }
    }
    return candidates;
}

function findCandidates(qg: QueryGrapheme, target: Target, minTgi: number): Candidate[] {
    if (qg.vowelIndex !== -1) {
        return findVowelCandidates(qg, target, minTgi);
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

function candidatePositionScore(c: Candidate, target: Target, sc: ResolvedScoring, isChoseongOnly: boolean): number {
    const weaken = isChoseongOnly ? sc.choseongWeaken : 1;
    let s = 0;
    for (const tgi of c.indices) {
        if (tgi === 0) s += sc.positionZero * weaken;
        else if (target.boundaryFlags[tgi]) s += sc.boundary * weaken;
        s += sc.getBonus(tgi);
    }
    return s;
}

/**
 * DP 기반 최적 정렬 매칭.
 */
export function matchBest(query: Query, target: Target, scoring?: ScoringConfig): MatchResult | null {
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

    // Phase 1: 후보 수집
    const allCandidates: Candidate[][] = [];
    for (let qi = 0; qi < Q; qi++) {
        const candidates = findCandidates(qGraphemes[qi], target, 0);
        if (candidates.length === 0) return null;
        allCandidates.push(candidates);
    }

    // Phase 2: DP
    // consMap 대체: tgi-indexed 배열 (Map 할당/GC 제거)
    const consByTgi: (ConsPred[] | undefined)[] = new Array(T);
    const dpFrontier: FrontierEntry[][][] = [];

    const firstFrontier: FrontierEntry[][] = [];
    const firstIsChoseongOnly = isHangulChoseongOnly(qGraphemes[0]);
    for (let ci = 0; ci < allCandidates[0].length; ci++) {
        firstFrontier.push([
            {
                score: candidatePositionScore(allCandidates[0][ci], target, sc, firstIsChoseongOnly),
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

        // consMap: tgi → ConsPred[] (Map 대신 flat 배열로 GC 부담 제거)
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
            const posScore = candidatePositionScore(c, target, sc, isChoseongOnly);
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

        // consByTgi cleanup: 사용된 슬롯만 초기화 (전체 순회 회피)
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

    // Phase 4: 백트래��
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
