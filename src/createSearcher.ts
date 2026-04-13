import { buildMatchRanges } from "./buildMatchRanges";
import { buildQuery } from "./buildQuery";
import { match } from "./match";
import { preprocessTarget } from "./preprocessTarget";
import type { MatchOptions, MatchRange, Target } from "./types";

/**
 * createSearcher 옵션. 검색 파이프라인 전반의 동작을 한 번에 설정한다.
 * 개별 함수(buildQuery/preprocessTarget/match)를 직접 호출할 때와 달리,
 * 여기서 준 설정이 query/target/match 세 단계 모두에 일관되게 전파된다.
 */
export type SearcherOptions = {
    caseSensitive?: boolean;
};

export type SearchResult = {
    /** items 배열에서의 원본 문자열 */
    item: string;
    /** items 배열에서의 원본 인덱스 */
    index: number;
    /** target.input 기준 UTF-16 char 범위들 (하이라이트용) */
    ranges: MatchRange[];
};

export interface Searcher {
    /**
     * 사용자 입력 문자열로 한 번 검색한다. 매치된 항목만 입력 순서대로 반환.
     * 정렬/점수는 제공하지 않는다 — 필요하면 호출자가 직접 처리.
     */
    search(queryInput: string): SearchResult[];
}

/**
 * items를 한 번 전처리해 두고, 이후 search(query)를 계속 호출할 수 있는 Searcher를 만든다.
 *
 * 커맨드 팔레트처럼 타겟 목록은 고정이고 사용자 쿼리만 키 입력마다 바뀌는 상황에서
 * `preprocessTarget`을 매번 다시 부르는 비용을 피하려는 게 이 API의 존재 이유다.
 *
 * 고급 사용처 (가변 items, 점수화, 여러 서브쿼리 결합 등)는 여전히
 * buildQuery/preprocessTarget/match/buildMatchRanges를 직접 쓰면 된다.
 */
export function createSearcher(items: readonly string[], options: SearcherOptions = {}): Searcher {
    const caseSensitive = options.caseSensitive ?? false;

    const targets: Target[] = items.map((item) => preprocessTarget(item, { caseSensitive }));

    const matchOptions: MatchOptions = { caseSensitive };

    return {
        search(queryInput: string): SearchResult[] {
            const query = buildQuery(queryInput, { caseSensitive });
            const results: SearchResult[] = [];

            for (let i = 0; i < targets.length; i++) {
                const hits = match(query, targets[i], matchOptions);
                if (hits === null) continue;

                const ranges = buildMatchRanges([hits], targets[i]);
                results.push({
                    item: items[i],
                    index: i,
                    ranges,
                });
            }

            return results;
        },
    };
}
