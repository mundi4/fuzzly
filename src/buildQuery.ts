import segmenter from "./internal/segmenter";
import { computeAtomRoles, decomposeToAtoms } from "./internal/utils";
import type { Query, QueryGrapheme } from "./types";

function normalizeForMatch(input: string): string {
    return input.replace(/[A-Z]/g, (char) => char.toLowerCase());
}

export function buildQuery(input: string): Query {
    const cleaned = normalizeForMatch(input);

    if (cleaned === "") {
        return {
            input,
            graphemes: [],
            atoms: "",
        };
    }

    const graphemes: QueryGrapheme[] = [];

    for (const seg of segmenter.segment(cleaned)) {
        const rawGrapheme = seg.segment;
        const atoms = decomposeToAtoms(rawGrapheme);
        const { vowelIndex, tailIndex } = computeAtomRoles(atoms);

        graphemes.push({
            char: rawGrapheme,
            atoms,
            vowelIndex,
            tailIndex,
        });
    }

    let atoms = "";
    for (const g of graphemes) {
        atoms += g.atoms;
    }

    return {
        input,
        graphemes,
        atoms,
    };
}
