import { MatchRange } from "./types";

export function compressMatchIndexes(indexes: number[]): MatchRange[] {
    if (indexes.length === 0) return [];

    const result: MatchRange[] = [];

    let start = indexes[0];
    let prev = start;

    for (let i = 1; i < indexes.length; i++) {
        const cur = indexes[i];

        if (cur === prev + 1) {
            prev = cur;
            continue;
        }

        // 끝남
        result.push({ start, end: prev + 1 });

        start = cur;
        prev = cur;
    }

    // 마지막 range
    result.push({ start, end: prev + 1 });

    return result;
}

