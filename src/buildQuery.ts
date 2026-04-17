import { atomIdToChar } from "./internal/atomRegistry";
import segmenter from "./internal/segmenter";
import { computeAtomRoles, decomposeToAtoms } from "./internal/utils";
import type { Query, QueryGrapheme } from "./types";

function normalizeForMatch(input: string): string {
    return input.replace(/[A-Z]/g, (char) => char.toLowerCase());
}

/**
 * 사용자 입력 문자열을 grapheme 단위로 분해하여 Query 객체를 생성한다.
 * 대문자는 소문자로 정규화된다.
 *
 * 반환 `Query`는 `charIndexes` / `graphemeIndexes` 매핑을 포함하며,
 * `match`/`matchBest`/`Searcher.search`에 전달하는 `composingIndex`(UTF-16 char index)를
 * 내부에서 grapheme 인덱스로 변환하는 데 사용된다.
 *
 * **제약**: 입력이 65535 UTF-16 코드유닛을 초과하면 `RangeError`.
 *
 * @param input - 사용자의 검색 입력 (한글 초성, 부분 조합, 영문 등 모두 허용)
 * @returns 분해된 Query 객체
 */
export function buildQuery(input: string): Query {
    if (input.length > 0xffff) {
        throw new RangeError(`buildQuery: input length ${input.length} exceeds Uint16Array limit (65535)`);
    }

    const cleaned = normalizeForMatch(input);

    if (cleaned === "") {
        return {
            input,
            graphemes: [],
            atoms: "",
            charIndexes: new Uint16Array(0),
            graphemeIndexes: new Uint16Array(0),
        };
    }

    const graphemes: QueryGrapheme[] = [];
    const tmpCharIndexes: number[] = [];
    const tmpGraphemeIndexes: number[] = [];
    let graphemeIndex = 0;

    for (const seg of segmenter.segment(cleaned)) {
        const rawGrapheme = seg.segment;
        const startIndex = seg.index;
        const atoms = decomposeToAtoms(rawGrapheme);
        const { vowelIndex, tailIndex } = computeAtomRoles(atoms);

        tmpCharIndexes[graphemeIndex] = startIndex;
        for (let i = 0; i < rawGrapheme.length; i++) {
            tmpGraphemeIndexes[startIndex + i] = graphemeIndex;
        }

        graphemes.push({
            char: rawGrapheme,
            atoms,
            vowelIndex,
            tailIndex,
        });
        graphemeIndex++;
    }

    const graphemeCount = graphemeIndex;

    const charIndexes = new Uint16Array(graphemeCount);
    for (let i = 0; i < graphemeCount; i++) {
        charIndexes[i] = tmpCharIndexes[i];
    }

    const graphemeIndexes = new Uint16Array(cleaned.length);
    for (let i = 0; i < cleaned.length; i++) {
        graphemeIndexes[i] = tmpGraphemeIndexes[i] ?? 0;
    }

    // session prefix check용 문자열 (createSearcher에서 사용)
    let atomsStr = "";
    for (const g of graphemes) {
        for (let i = 0; i < g.atoms.length; i++) {
            atomsStr += atomIdToChar(g.atoms[i]);
        }
    }

    return {
        input,
        graphemes,
        atoms: atomsStr,
        charIndexes,
        graphemeIndexes,
    };
}
