import type { FuzzyStrokes } from "./types";
import { decomposeToStrokes } from "./internal/utils";
import segmenter from "./internal/segmenter";

// export interface FuzzyStrokes {
//     input: string;
//     strokes: Array<readonly string[]>;
//     charIndexes: number[];
// }

export function extractStrokes(input: string): FuzzyStrokes {
    const strokes: Array<readonly string[]> = [];
    const clusterIndexes: number[] = [];
    const charIndexes: number[] = [];

    let graphemeIndex = 0;

    for (const seg of segmenter.segment(input)) {
        const cluster = seg.segment;
        const startIndex = seg.index;

        // graphemeIndex -> utf16 start index
        charIndexes[graphemeIndex] = startIndex;

        if (cluster.length === 1) {
            const arr = decomposeToStrokes(cluster);
            strokes.push(arr);
            clusterIndexes[startIndex] = graphemeIndex;
        } else {
            strokes.push([cluster]);
            for (let i = 0; i < cluster.length; i++) {
                clusterIndexes[startIndex + i] = graphemeIndex;
            }
        }

        graphemeIndex++;
    }

    return {
        input,
        strokes,
        clusterIndexes,
        charIndexes,
    };
}
