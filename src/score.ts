import { SPACE_CHAR_CODE } from "./internal/atomRegistry";
import type { MatchResult, ScoringConfig, Target } from "./types";

/**
 * `matchBest` DP 스코어링의 기본 가중치 상수.
 * `ScoringConfig.weights`로 개별 오버라이드 가능.
 *
 * 스코어는 모든 축의 가산 합으로 계산된다 (배율·후보정·discrete jump 없음).
 *
 * 핵심 invariant: `ANCHOR_FILL` 항만 보면 완전 grapheme 매치가 초성/부분 매치보다 유리하다.
 * 각 target anchor에 떨어진 atom 수의 제곱에 곱해지므로
 * 한 anchor에 atom이 몰릴수록 비선형 보상을 받는다 (예: 3 atoms 한 anchor=9, spill 2+1=5).
 * 다만 실제 총점은 다른 보너스/페널티 축과의 합으로 결정된다.
 */
export const SCORING = {
    /**
     * 각 target anchor에 떨어진 atom 수의 제곱에 곱해지는 가중치.
     * 한 anchor에 atom이 많이 몰릴수록 (완전 매치) 비선형으로 보상.
     * 분산된 spill 매치는 anchorFill 기여만 놓고 보면 Σ(atoms²)가 작아져 불리하다.
     */
    ANCHOR_FILL: 50,
    /** 첫 매치가 target index 0에서 시작할 때 보너스 */
    POSITION_ZERO: 30,
    /** 단어 경계 매치당 보너스 */
    BOUNDARY: 20,
    /**
     * 각 maximal consecutive run에 대해 (runLen - 1)² 을 곱해 가산되는 가중치.
     * 제곱이라 긴 run을 비선형 우대 (L=4 → 9, L=3 → 4, L=2 → 1).
     * anchorFill의 Σ(atoms²) 철학과 대칭.
     */
    CONSECUTIVE: 20,
    /** gap 거리(tgi)당 페널티 */
    GAP_PENALTY: -3,
    /** target 길이(grapheme)당 페널티 */
    TARGET_LENGTH_PENALTY: -1,
} as const;

export type ResolvedScoring = {
    anchorFill: number;
    positionZero: number;
    boundary: number;
    consecutive: number;
    gapPenalty: number;
    targetLengthPenalty: number;
    getBonus: (graphemeIndex: number) => number;
};

const NO_BONUS = () => 0;

// config === undefined일 때 매번 새 객체를 만들지 않도록 캐시.
// matchBest가 수천 회/키스트로크 호출되므로 기본 설정 시 객체 할당 제거.
const DEFAULT_RESOLVED: ResolvedScoring = {
    anchorFill: SCORING.ANCHOR_FILL,
    positionZero: SCORING.POSITION_ZERO,
    boundary: SCORING.BOUNDARY,
    consecutive: SCORING.CONSECUTIVE,
    gapPenalty: SCORING.GAP_PENALTY,
    targetLengthPenalty: SCORING.TARGET_LENGTH_PENALTY,
    getBonus: NO_BONUS,
};

// config 객체 → ResolvedScoring 캐시. matchBest가 수천 회/키스트로크 호출되므로
// 같은 config 참조를 반복 resolve하며 객체·클로저를 재생성하지 않는다.
// graphemeBonus가 함수형이면 resolved가 target에 의존하므로 캐시하지 않는다
// (searcher 계층은 entry당 ScoringConfig를 캐시하므로 배열형 bonus가 일반 경로).
// **계약**: ScoringConfig 는 불변으로 취급 — 제자리 수정은 반영되지 않는다 (types.ts JSDoc 참조).
const resolvedCache = new WeakMap<ScoringConfig, ResolvedScoring>();

export function resolveScoring(config: ScoringConfig | undefined, _target: Target): ResolvedScoring {
    if (config == null) return DEFAULT_RESOLVED;

    const w = config.weights;
    const gb = config.graphemeBonus;

    if (w == null && gb == null) return DEFAULT_RESOLVED;

    const cacheable = typeof gb !== "function";
    if (cacheable) {
        const hit = resolvedCache.get(config);
        if (hit !== undefined) return hit;
    }

    let getBonus: (gi: number) => number;
    if (gb == null) {
        getBonus = NO_BONUS;
    } else if (typeof gb === "function") {
        getBonus = (gi) => gb(gi, _target);
    } else {
        getBonus = (gi) => (gi < gb.length ? Number(gb[gi] ?? 0) : 0);
    }
    const resolved: ResolvedScoring = {
        anchorFill: w?.anchorFill ?? SCORING.ANCHOR_FILL,
        positionZero: w?.positionZero ?? SCORING.POSITION_ZERO,
        boundary: w?.boundary ?? SCORING.BOUNDARY,
        consecutive: w?.consecutive ?? SCORING.CONSECUTIVE,
        gapPenalty: w?.gapPenalty ?? SCORING.GAP_PENALTY,
        targetLengthPenalty: w?.targetLengthPenalty ?? SCORING.TARGET_LENGTH_PENALTY,
        getBonus,
    };
    if (cacheable) resolvedCache.set(config, resolved);
    return resolved;
}

/**
 * 타겟의 UTF-16 문자 범위 [start, end)를 grapheme 인덱스로 변환하여
 * `ScoringConfig.graphemeBonus`에 사용할 수 있는 배열을 생성한다.
 * 여러 범위가 겹치면 bonus가 누적된다.
 *
 * 반환 배열의 길이는 `target.graphemeCount`와 같고,
 * 범위에 속하지 않는 grapheme의 값은 0이다.
 *
 * `whitespace: "transparent"` 타겟에서는 range 양 끝의 공백(U+0020)을 수축시킨 뒤
 * grapheme으로 매핑한다 — 공백 위치가 **다음** grapheme으로 매핑되므로 수축 없이는
 * 공백에 걸친 range의 bonus가 다음 단어 첫 grapheme으로 번진다. 수축 결과가 빈 range면 skip.
 *
 * @param target - `preprocessTarget`으로 생성한 타겟
 * @param ranges - 각 원소의 start/end는 원문 UTF-16 offset (end exclusive), bonus는 가산할 점수
 * @returns `graphemeBonus`로 바로 사용 가능한 number 배열
 *
 * @example
 * ```ts
 * const target = preprocessTarget("프로젝트 설정 파일");
 * // "설정" 부분(char offset 5~7)에 100점 가중치
 * const bonuses = createGraphemeBonuses(target, [{ start: 5, end: 7, bonus: 100 }]);
 * matchBest(query, target, { graphemeBonus: bonuses });
 * ```
 */
export function createGraphemeBonuses(
    target: Target,
    ranges: { start: number; end: number; bonus: number }[],
): number[] {
    const bonuses = new Array<number>(target.graphemeCount).fill(0);
    const gIdx = target.graphemeIndexes;
    const charIdx = target.charIndexes;
    const transparent = target.whitespace === "transparent";
    const normalized = target.normalizedInput;
    // transparent 타겟에서 위치 p가 **스킵된** 공백인지 판별. U+0020이라도 방출된
    // cluster의 base일 수 있으므로(공백+결합문자 cluster) 문자만으로는 부족하다 —
    // 스킵된 공백은 다음/마지막 grapheme으로 매핑되어 그 grapheme의 시작 위치와
    // 불일치하고, cluster base는 자기 grapheme의 시작 위치와 정확히 일치한다.
    const isSkippedSpace = (p: number): boolean =>
        normalized.charCodeAt(p) === SPACE_CHAR_CODE && charIdx[gIdx[p]] !== p;
    for (const range of ranges) {
        const { bonus } = range;
        let start = range.start;
        let last = Math.min(range.end - 1, gIdx.length - 1); // inclusive 끝
        if (transparent) {
            // 스킵된 공백은 grapheme을 소비하지 않고 다음 grapheme으로 매핑되므로, 공백에
            // 걸친 끝을 그대로 매핑하면 bonus가 다음 단어 첫 grapheme으로 번진다. 양 끝을
            // 스킵된 공백이 아닌 위치까지 수축시킨다. keep 모드 동작은 불변.
            while (start <= last && isSkippedSpace(start)) start++;
            while (last >= start && isSkippedSpace(last)) last--;
        }
        if (start > last) continue;
        const startGi = gIdx[start];
        const endGi = gIdx[last];
        if (startGi == null || endGi == null) continue;
        for (let gi = startGi; gi <= endGi; gi++) {
            bonuses[gi] += bonus;
        }
    }
    return bonuses;
}

/**
 * `MatchResult` 메타데이터만으로 간이 스코어를 계산한다.
 * `SearcherOptions.score`에 전달하거나 직접 호출할 수 있다.
 *
 * **주의**: DP 스코어(`result.score`)를 무시하는 메타데이터 전용 간이 휴리스틱이다
 * (DP score 도입 이전의 유물). 일반적으로는 `score` 옵션을 생략하고 내장 DP 스코어를
 * 쓰는 것이 낫고, 이 함수는 메타데이터 기반 커스텀 랭킹의 출발점 예시로만 유효하다.
 */
export function defaultScore(result: MatchResult): number {
    let s = 0;
    if (result.startsAtZero) s += 1000;
    s += result.boundaryHits * 100;
    s -= result.runCount * 5;
    return s;
}
