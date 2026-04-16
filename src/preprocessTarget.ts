import segmenter from "./internal/segmenter";
import { computeAtomRoles, decomposeToAtoms } from "./internal/utils";
import type { Target, TargetGrapheme } from "./types";

/**
 * 검색 대상 문자열을 grapheme 단위로 분해하고 인덱스/경계 메타데이터를 계산한다.
 * 결과 Target 객체는 한 번 생성해두고 여러 쿼리에 대해 재사용하는 것이 의도된 패턴.
 *
 * @param input - 검색 대상 원문 문자열
 * @returns 전처리된 Target 객체 (`match`, `matchBest`의 두 번째 인자로 사용)
 */
export function preprocessTarget(input: string): Target {
    const graphemes: TargetGrapheme[] = [];
    const graphemeIndexes: number[] = [];
    const charIndexes: number[] = [];

    let graphemeIndex = 0;
    const normalizedInput = input.toLowerCase();

    for (const seg of segmenter.segment(normalizedInput)) {
        const cluster = seg.segment;
        const startIndex = seg.index;

        charIndexes[graphemeIndex] = startIndex;

        let atoms: string;
        if (cluster.length === 1) {
            atoms = decomposeToAtoms(cluster);
            graphemeIndexes[startIndex] = graphemeIndex;
        } else {
            atoms = cluster;
            for (let i = 0; i < cluster.length; i++) {
                graphemeIndexes[startIndex + i] = graphemeIndex;
            }
        }

        const { vowelIndex, tailIndex } = computeAtomRoles(atoms);
        graphemes.push({ atoms, vowelIndex, tailIndex });

        graphemeIndex++;
    }

    const boundaryFlags: boolean[] = [];
    for (let i = 0; i < graphemes.length; i++) {
        if (i === 0) {
            boundaryFlags[i] = true;
        } else {
            const prev = graphemes[i - 1].atoms;
            boundaryFlags[i] = prev === " " || prev === "_" || prev === "-" || prev === ".";
        }
    }

    return {
        input,
        normalizedInput,
        graphemes,
        graphemeIndexes,
        charIndexes,
        boundaryFlags,
    };
}
