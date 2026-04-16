import segmenter from "./internal/segmenter";
import { computeAtomRoles, decomposeToAtoms } from "./internal/utils";
import type { Target, TargetGrapheme } from "./types";

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
