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
    * candidatePositionScore에서 각 anchor는 `anchorFill × filledAtoms[i]^2`만큼 기여한다.
    * graphemeBonus도 같은 `filledAtoms[i]`를 per-atom 승수로 사용한다.
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

// DP 상태: 각 (qi, ci)에서 도달 가능한 최고 스코어와 backtrack용 부모 candidate index.
// 선형 consecutive에서는 미래 기여가 endTgi에만 의존하므로 (score, runLen) Pareto가 불필요 —
// (qi, ci)당 단일 best score만 추적하면 충분하다.
type DPState = {
    score: number;
    parentPci: number;
};

// candidate 내부 tgi 연속 실행에 대한 consecutive 보너스 (선형).
// n atom 이 연속이면 (n-1) 쌍 × cons.
function intraRunBonus(internalRunLen: number, consecutive: number): number {
    if (internalRunLen <= 1) return 0;
    return consecutive * (internalRunLen - 1);
}

function candidatePositionScore(c: Candidate, target: Target, sc: ResolvedScoring): number {
    // anchorFill: 각 target anchor에 떨어진 atom 수의 제곱 합 × 가중치.
    // 제곱이라 같은 anchor에 atom이 몰릴수록 비선형 보상 — 완전 매치(한 anchor에 full) >
    // 분산 매치(여러 anchor에 1개씩 spill). 예: 3 atoms가 한 anchor = 9, spill로 2+1 = 5.
    let s = 0;
    for (let i = 0; i < c.indices.length; i++) {
        const tgi = c.indices[i];
        const filled = c.filledAtoms[i];
        s += sc.anchorFill * filled * filled;
        if (tgi === 0) s += sc.positionZero;
        if (target.boundaryFlags[tgi]) s += sc.boundary;
        // graphemeBonus는 해당 grapheme에서 매치된 atom 수만큼 누적 (per-atom).
        s += sc.getBonus(tgi) * filled;
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
 * (anchor에 atom이 얇게 분산된 매치는 `anchorFill`의 Σ(atoms²) 기여가 작고,
 * graphemeBonus도 per-atom 기준으로 덜 누적되어 자연스럽게 후순위).
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

    // Phase 2: DP — 각 (qi, ci)당 최고 스코어 하나만 추적.
    // 선형 consecutive: bridge 보너스가 고정 cons이므로 미래 기여는 endTgi에만 의존하고
    // prev의 score가 높으면 무조건 유리. (score, runLen) Pareto가 단일 best로 붕괴된다.
    const dp: DPState[][] = [];

    const firstStates: DPState[] = [];
    for (let ci = 0; ci < allCandidates[0].length; ci++) {
        const c = allCandidates[0][ci];
        const posScore = candidatePositionScore(c, target, sc);
        firstStates.push({
            score: posScore + intraRunBonus(c.internalRunLen, sc.consecutive),
            parentPci: -1,
        });
    }
    dp.push(firstStates);

    // 재사용 버퍼: prev endTgi → 그 위치에서 끝나는 prev candidate들 중 최고 스코어와 pci.
    // qi마다 reset.
    type ConsBest = { score: number; pci: number };
    const bestByEnd: (ConsBest | undefined)[] = new Array(T);

    for (let qi = 1; qi < Q; qi++) {
        const currCandidates = allCandidates[qi];
        const prevCands = allCandidates[qi - 1];
        const prevStates = dp[qi - 1];
        const currStates: DPState[] = [];

        // gap path: gapVal = score - gapPenalty*endTgi. startTgi가 단조증가하므로
        // gapPreds를 endTgi 오름차순으로 정렬해두고 prefix-max를 monotonic scan.
        type GapPred = { endTgi: number; gapVal: number; pci: number };
        const gapPreds: GapPred[] = [];
        const consUsed: number[] = [];
        for (let pci = 0; pci < prevCands.length; pci++) {
            const prevScore = prevStates[pci].score;
            if (prevScore === -Infinity) continue;
            const e = prevCands[pci].endTgi;
            // cons 전용: prev endTgi에서 끝나는 best score 추적
            const cur = bestByEnd[e];
            if (cur === undefined) {
                bestByEnd[e] = { score: prevScore, pci };
                consUsed.push(e);
            } else if (prevScore > cur.score) {
                cur.score = prevScore;
                cur.pci = pci;
            }
            gapPreds.push({ endTgi: e, gapVal: prevScore - sc.gapPenalty * e, pci });
        }
        gapPreds.sort((a, b) => a.endTgi - b.endTgi);

        let gapScanPos = -1;
        let gapBestVal = -Infinity;
        let gapBestPci = -1;

        for (let ci = 0; ci < currCandidates.length; ci++) {
            const c = currCandidates[ci];
            const s = c.startTgi;
            const posScore = candidatePositionScore(c, target, sc);
            const intraBonus = intraRunBonus(c.internalRunLen, sc.consecutive);

            // gap path: prev.endTgi <= s-2 인 prev들 중 gapVal 최대값
            const gapThreshold = s - 2;
            while (gapScanPos + 1 < gapPreds.length && gapPreds[gapScanPos + 1].endTgi <= gapThreshold) {
                gapScanPos++;
                if (gapPreds[gapScanPos].gapVal > gapBestVal) {
                    gapBestVal = gapPreds[gapScanPos].gapVal;
                    gapBestPci = gapPreds[gapScanPos].pci;
                }
            }

            let bestScore = -Infinity;
            let bestPci = -1;

            if (gapBestVal > -Infinity) {
                const cand = gapBestVal + sc.gapPenalty * (s - 1) + posScore + intraBonus;
                if (cand > bestScore) {
                    bestScore = cand;
                    bestPci = gapBestPci;
                }
            }

            // cons path: prev.endTgi == s-1 인 prev들 중 best score + bridgeBonus
            const consPred = bestByEnd[s - 1];
            if (consPred !== undefined) {
                const cand = consPred.score + sc.consecutive + intraBonus + posScore;
                if (cand > bestScore) {
                    bestScore = cand;
                    bestPci = consPred.pci;
                }
            }

            currStates.push({ score: bestScore, parentPci: bestPci });
        }

        dp.push(currStates);

        // bestByEnd 재사용 위해 사용한 슬롯만 비움
        for (let k = 0; k < consUsed.length; k++) {
            bestByEnd[consUsed[k]] = undefined;
        }
    }

    // Phase 3: 최적 종점
    let bestFinalScore = -Infinity;
    let bestFinalCi = -1;
    const lastStates = dp[Q - 1];
    for (let ci = 0; ci < lastStates.length; ci++) {
        const s = lastStates[ci].score;
        if (s > bestFinalScore) {
            bestFinalScore = s;
            bestFinalCi = ci;
        }
    }

    if (bestFinalCi === -1 || bestFinalScore === -Infinity) return null;

    // Phase 4: 백트래킹
    const chosenCi = new Array<number>(Q);
    chosenCi[Q - 1] = bestFinalCi;
    for (let qi = Q - 1; qi > 0; qi--) {
        chosenCi[qi - 1] = dp[qi][chosenCi[qi]].parentPci;
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
