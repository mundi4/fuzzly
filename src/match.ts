import { SCORING } from "./score";
import type { MatchResult, Query, QueryGrapheme, Target, TargetGrapheme } from "./types";

/*
 * 매칭 모델
 * ---------
 * "spillover" 개념은 없다. 쿼리 원자를 타겟 원자 스트림에 순서대로 매칭시키는 게 전부다.
 * 유일한 제약은 **vowel-sticks-to-lead**: 쿼리 한 글자의 모음(중성)은 그 글자의 초성이
 * 매치된 타겟 음절 안에서 바로 이어지는 위치에서만 소비될 수 있다. 즉 초성 매치 위치에
 * "anchor"를 박고 중성을 같은 음절 내부에서만 끝내야 한다.
 *
 * 자음(초성/종성)은 자유롭게 건너뛰며 다음 타겟 음절로 넘어갈 수 있다. 초성에 이어지는
 * 모음이 없는 경우(겹자음 단독 입력 or non-hangul)는 anchor가 없고 그냥 다음 매칭 atom을
 * 찾으면 끝난다.
 *
 * 타겟 원자는 초성(lead)/중성(vowel)/종성(tail) 위치 정보가 preprocessTarget에서 이미
 * 계산돼 있고, 쿼리의 초성(+중성) phase는 타겟 한 음절 안에서 atom-by-atom 비교로 해결된다.
 * 쿼리 종성 phase는 anchor 음절의 종성부터 시작해서 이후 음절들의 자음 자리로 자유롭게
 * 넘어갈 수 있다.
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

export function match(query: Query, target: Target): MatchResult | null {
    const qGraphemes = query.graphemes;
    const tGraphemes = target.graphemes;

    if (qGraphemes.length === 0) {
        return { indices: [], startsAtZero: false, runCount: 0, boundaryHits: 0, initialConsonantOnly: false };
    }
    if (qGraphemes.length > tGraphemes.length) return null;

    const matches: number[] = [];
    let tgi = 0;

    for (let qi = 0; qi < qGraphemes.length; qi++) {
        const qg = qGraphemes[qi];
        const qAtoms = qg.atoms;
        const qVowelStart = qg.vowelIndex;
        const qTailStart = qg.tailIndex;

        if (qVowelStart === -1) {
            // 중성 없음. 두 종류로 갈린다:
            //  (1) 한글 자음 원자(ㄱ, ㄳ 등): atoms의 각 char가 compat 자모이고,
            //      각각이 이후 타겟 음절의 LEAD 자리와 매치돼야 한다.
            //  (2) 비한글 grapheme(ASCII, 이모지 등): atoms 전체가 하나의 불가분
            //      단위이므로 타겟 grapheme의 atoms와 통째로 같아야 한다.
            const firstCode = qAtoms.charCodeAt(0);
            const isHangulCluster = firstCode >= 0x3131 && firstCode <= 0x3163;

            if (isHangulCluster) {
                for (let qai = 0; qai < qAtoms.length; qai++) {
                    const needle = qAtoms[qai];
                    let found = false;
                    while (tgi < tGraphemes.length) {
                        if (tGraphemes[tgi].atoms[0] === needle) {
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
                let found = false;
                while (tgi < tGraphemes.length) {
                    if (tGraphemes[tgi].atoms === qAtoms) {
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

        // 중성 있음: lead + vowel은 같은 타겟 음절 안에서 처리해야 한다.
        const qLeadVowelEnd = qTailStart === -1 ? qAtoms.length : qTailStart;

        // anchor 탐색: tGraphemes[tgi..] 중에서 qg의 lead+vowel atoms와 prefix-match
        // 되는 첫 음절을 찾는다.
        let anchorTgi = -1;
        while (tgi < tGraphemes.length) {
            const tg = tGraphemes[tgi];
            if (tg.vowelIndex === -1) {
                // 타겟 자모가 한글 음절이 아님(공백, 비한글, 단독 자모 등) → 건너뜀
                tgi++;
                continue;
            }
            const tAtoms = tg.atoms;
            if (tAtoms.length < qLeadVowelEnd) {
                tgi++;
                continue;
            }
            let ok = true;
            for (let i = 0; i < qLeadVowelEnd; i++) {
                if (qAtoms[i] !== tAtoms[i]) {
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

        // 종성 처리: anchor의 종성부터 시작해 이후 음절의 자음 자리까지 건너뛰며 매칭.
        // 자음은 vowel atom과 절대 같지 않으므로 vowel을 무심코 건너뛸 위험은 없다.
        let curTgi = anchorTgi;
        let tai = qLeadVowelEnd;
        let lastMatchedTgi = anchorTgi;

        for (let qai = qTailStart; qai < qAtoms.length; qai++) {
            const needle = qAtoms[qai];
            let found = false;

            while (curTgi < tGraphemes.length) {
                const tAtoms = tGraphemes[curTgi].atoms;
                let idx = -1;
                for (let i = tai; i < tAtoms.length; i++) {
                    if (tAtoms[i] === needle) {
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
                tai = 0;
            }

            if (!found) return null;
        }

        tgi = curTgi + 1;
    }

    return buildMatchResult(matches, target, qGraphemes);
}

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
// matchBest: DP 기반 최적 정렬 탐색
// ---------------------------------------------------------------------------

type Candidate = {
    startTgi: number; // 이 쿼리 grapheme이 소비하는 첫 타겟 grapheme
    endTgi: number; // 마지막으로 소비하는 타겟 grapheme (inclusive)
    indices: number[]; // 소비한 모든 타겟 grapheme 인덱스
};

// 모음 있는 쿼리 grapheme의 모든 anchor 위치 수집
function findVowelCandidates(qg: QueryGrapheme, tGraphemes: TargetGrapheme[], minTgi: number): Candidate[] {
    const qAtoms = qg.atoms;
    const qTailStart = qg.tailIndex;
    const qLeadVowelEnd = qTailStart === -1 ? qAtoms.length : qTailStart;
    const candidates: Candidate[] = [];

    for (let tgi = minTgi; tgi < tGraphemes.length; tgi++) {
        const tg = tGraphemes[tgi];
        if (tg.vowelIndex === -1) continue;
        const tAtoms = tg.atoms;
        if (tAtoms.length < qLeadVowelEnd) continue;

        let ok = true;
        for (let i = 0; i < qLeadVowelEnd; i++) {
            if (qAtoms[i] !== tAtoms[i]) {
                ok = false;
                break;
            }
        }
        if (!ok) continue;

        // anchor 발견
        if (qTailStart === -1) {
            candidates.push({ startTgi: tgi, endTgi: tgi, indices: [tgi] });
            continue;
        }

        // 종성 매칭: anchor의 종성부터 시작, 이후 음절로 확장 가능
        const tailResult = matchTailFrom(qg, tGraphemes, tgi, qLeadVowelEnd);
        if (tailResult) {
            candidates.push(tailResult);
        }
    }
    return candidates;
}

// 종성 atom들을 anchor부터 이후 음절로 매칭 시도
function matchTailFrom(
    qg: QueryGrapheme,
    tGraphemes: TargetGrapheme[],
    anchorTgi: number,
    searchStartAtomIdx: number,
): Candidate | null {
    const qAtoms = qg.atoms;
    const qTailStart = qg.tailIndex;
    const indices = [anchorTgi];
    let curTgi = anchorTgi;
    let tai = searchStartAtomIdx;
    let lastMatchedTgi = anchorTgi;

    for (let qai = qTailStart; qai < qAtoms.length; qai++) {
        const needle = qAtoms[qai];
        let found = false;

        while (curTgi < tGraphemes.length) {
            const tAtoms = tGraphemes[curTgi].atoms;
            let idx = -1;
            for (let i = tai; i < tAtoms.length; i++) {
                if (tAtoms[i] === needle) {
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
            tai = 0;
        }

        if (!found) return null;
    }

    return { startTgi: anchorTgi, endTgi: lastMatchedTgi, indices };
}

// 초성 전용 한글 클러스터의 모든 시작 위치 수집
function findConsonantCandidates(qAtoms: string, tGraphemes: TargetGrapheme[], minTgi: number): Candidate[] {
    const candidates: Candidate[] = [];

    for (let startTgi = minTgi; startTgi < tGraphemes.length; startTgi++) {
        if (tGraphemes[startTgi].atoms[0] !== qAtoms[0]) continue;

        if (qAtoms.length === 1) {
            candidates.push({ startTgi, endTgi: startTgi, indices: [startTgi] });
            continue;
        }

        // 여러 atom: 각각 이후 타겟 음절의 lead와 순서대로 매치
        const indices = [startTgi];
        let curTgi = startTgi + 1;
        let ok = true;
        for (let qai = 1; qai < qAtoms.length; qai++) {
            const needle = qAtoms[qai];
            let found = false;
            while (curTgi < tGraphemes.length) {
                if (tGraphemes[curTgi].atoms[0] === needle) {
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
function findExactCandidates(qAtoms: string, tGraphemes: TargetGrapheme[], minTgi: number): Candidate[] {
    const candidates: Candidate[] = [];
    for (let tgi = minTgi; tgi < tGraphemes.length; tgi++) {
        if (tGraphemes[tgi].atoms === qAtoms) {
            candidates.push({ startTgi: tgi, endTgi: tgi, indices: [tgi] });
        }
    }
    return candidates;
}

// 쿼리 grapheme 종류에 따라 후보 수집 디스패치
function findCandidates(qg: QueryGrapheme, tGraphemes: TargetGrapheme[], minTgi: number): Candidate[] {
    if (qg.vowelIndex !== -1) {
        return findVowelCandidates(qg, tGraphemes, minTgi);
    }
    const firstCode = qg.atoms.charCodeAt(0);
    const isHangulCluster = firstCode >= 0x3131 && firstCode <= 0x3163;
    if (isHangulCluster) {
        return findConsonantCandidates(qg.atoms, tGraphemes, minTgi);
    }
    return findExactCandidates(qg.atoms, tGraphemes, minTgi);
}

// 후보의 위치 점수 (경계 보너스, 위치 0 보너스)
function candidatePositionScore(c: Candidate, target: Target): number {
    let s = 0;
    for (const tgi of c.indices) {
        if (tgi === 0) s += SCORING.POSITION_ZERO;
        else if (target.boundaryFlags[tgi]) s += SCORING.BOUNDARY;
    }
    return s;
}

export function matchBest(query: Query, target: Target): MatchResult | null {
    const qGraphemes = query.graphemes;
    const tGraphemes = target.graphemes;
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
    if (Q > tGraphemes.length) return null;

    // Phase 1: 각 쿼리 grapheme에 대해 모든 유효 후보 수집
    const allCandidates: Candidate[][] = [];
    for (let qi = 0; qi < Q; qi++) {
        const candidates = findCandidates(qGraphemes[qi], tGraphemes, 0);
        if (candidates.length === 0) return null;
        allCandidates.push(candidates);
    }

    // Phase 2: DP — dp[qi][ci] = qi번째 쿼리 grapheme에 ci번째 후보를 사용할 때 최대 스코어
    // 전이 최적화: 중첩 루프 대신 prefix-max sweep으로 O(Q×C) 전이
    const dpScores: number[][] = [];
    const dpParents: number[][] = [];

    // qi = 0 초기화
    const firstScores: number[] = [];
    const firstParents: number[] = [];
    for (let ci = 0; ci < allCandidates[0].length; ci++) {
        firstScores.push(candidatePositionScore(allCandidates[0][ci], target));
        firstParents.push(-1);
    }
    dpScores.push(firstScores);
    dpParents.push(firstParents);

    for (let qi = 1; qi < Q; qi++) {
        const currCandidates = allCandidates[qi];
        const prevCands = allCandidates[qi - 1];
        const prevScoresArr = dpScores[qi - 1];
        const currScores: number[] = [];
        const currParent: number[] = [];

        // 전처리: 유효한 predecessor를 endTgi 순으로 수집
        const preds: { endTgi: number; score: number; gapVal: number; pci: number }[] = [];
        for (let pci = 0; pci < prevCands.length; pci++) {
            const s = prevScoresArr[pci];
            if (s === -Infinity) continue;
            const e = prevCands[pci].endTgi;
            preds.push({ endTgi: e, score: s, gapVal: s - SCORING.GAP_PENALTY * e, pci });
        }
        preds.sort((a, b) => a.endTgi - b.endTgi);

        // consecutive lookup: endTgi → 해당 endTgi에서 최대 (score + CONSECUTIVE, pci)
        const consMap = new Map<number, { total: number; pci: number }>();
        for (const p of preds) {
            const total = p.score + SCORING.CONSECUTIVE;
            const existing = consMap.get(p.endTgi);
            if (!existing || total > existing.total) {
                consMap.set(p.endTgi, { total, pci: p.pci });
            }
        }

        // gap sweep: currCandidates는 startTgi 순이므로 pointer 한 방향 전진
        let gapScanPos = -1;
        let gapBestVal = -Infinity;
        let gapBestPci = -1;

        for (let ci = 0; ci < currCandidates.length; ci++) {
            const s = currCandidates[ci].startTgi;
            let bestScore = -Infinity;
            let bestPredIdx = -1;

            // gap: endTgi <= s-2인 predecessor의 누적 최대 gapVal
            const gapThreshold = s - 2;
            while (gapScanPos + 1 < preds.length && preds[gapScanPos + 1].endTgi <= gapThreshold) {
                gapScanPos++;
                if (preds[gapScanPos].gapVal > gapBestVal) {
                    gapBestVal = preds[gapScanPos].gapVal;
                    gapBestPci = preds[gapScanPos].pci;
                }
            }
            if (gapBestVal > -Infinity) {
                const gapTotal = gapBestVal + SCORING.GAP_PENALTY * (s - 1);
                bestScore = gapTotal;
                bestPredIdx = gapBestPci;
            }

            // consecutive: endTgi === s-1
            const consEntry = consMap.get(s - 1);
            if (consEntry && consEntry.total > bestScore) {
                bestScore = consEntry.total;
                bestPredIdx = consEntry.pci;
            }

            if (bestPredIdx === -1) {
                currScores.push(-Infinity);
                currParent.push(-1);
            } else {
                currScores.push(bestScore + candidatePositionScore(currCandidates[ci], target));
                currParent.push(bestPredIdx);
            }
        }

        dpScores.push(currScores);
        dpParents.push(currParent);
    }

    // Phase 3: 최적 종점 찾기
    const lastScores = dpScores[Q - 1];
    let bestFinalScore = -Infinity;
    let bestFinalIdx = -1;
    for (let ci = 0; ci < lastScores.length; ci++) {
        if (lastScores[ci] > bestFinalScore) {
            bestFinalScore = lastScores[ci];
            bestFinalIdx = ci;
        }
    }

    if (bestFinalIdx === -1 || bestFinalScore === -Infinity) return null;

    // Phase 4: 백트래킹 — 최적 경로 복원
    const chosen: number[] = new Array(Q);
    chosen[Q - 1] = bestFinalIdx;
    for (let qi = Q - 2; qi >= 0; qi--) {
        chosen[qi] = dpParents[qi + 1][chosen[qi + 1]];
    }

    // 모든 매칭 인덱스 수집
    const allIndices: number[] = [];
    for (let qi = 0; qi < Q; qi++) {
        const candidate = allCandidates[qi][chosen[qi]];
        for (const idx of candidate.indices) {
            allIndices.push(idx);
        }
    }

    // dedup (종성 확장으로 인접 후보가 같은 인덱스 포함할 수 있음)
    const indices: number[] = [];
    for (const idx of allIndices) {
        if (indices.length === 0 || indices[indices.length - 1] !== idx) {
            indices.push(idx);
        }
    }

    // Phase 5: 전역 보정으로 최종 스코어 계산
    let score = bestFinalScore;

    // prefix 보너스: 위치 0부터 연속 매치
    if (indices.length > 0 && indices[0] === 0) {
        let isPrefix = true;
        for (let i = 1; i < indices.length; i++) {
            if (indices[i] !== indices[i - 1] + 1 && indices[i] !== indices[i - 1]) {
                isPrefix = false;
                break;
            }
        }
        if (isPrefix) score += SCORING.PREFIX_BONUS;
    }

    // exact 보너스: 타겟의 모든 grapheme을 빠짐없이 커버 (0..len-1 연속)
    if (
        indices.length === tGraphemes.length &&
        indices[0] === 0 &&
        indices[indices.length - 1] === tGraphemes.length - 1
    ) {
        score += SCORING.EXACT_BONUS;
    }

    // 초성 전용 페널티
    let initialConsonantOnly = Q > 0;
    for (const qg of qGraphemes) {
        if (qg.vowelIndex !== -1) {
            initialConsonantOnly = false;
            break;
        }
    }
    if (initialConsonantOnly) score += SCORING.INITIAL_CONSONANT_PENALTY;

    // 타겟 길이 페널티 (짧은 타겟 선호)
    score += SCORING.TARGET_LENGTH_PENALTY * tGraphemes.length;

    const result = buildMatchResult(indices, target, qGraphemes);
    result.score = score;
    return result;
}
