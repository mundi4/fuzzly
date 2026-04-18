import { atomIdToChar, SPACE_ID } from "./internal/atomRegistry";
import segmenter from "./internal/segmenter";
import { computeAtomRoles, decomposeToAtoms } from "./internal/utils";
import type { Query, QueryGrapheme, WhitespaceMode } from "./types";

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
 * `opts.whitespace = "ignore"`로 지정하면 쿼리에서 공백(ASCII 0x20) grapheme을 제거한다.
 * 이 경우에도 `charIndexes`/`graphemeIndexes`는 **원본 input의 UTF-16 좌표를 유지**하므로
 * caller가 raw char offset 기준의 `composingIndex`를 그대로 전달할 수 있다.
 *
 * **제약**: 입력이 65535 UTF-16 코드유닛을 초과하면 `RangeError`.
 *
 * @param input - 사용자의 검색 입력 (한글 초성, 부분 조합, 영문 등 모두 허용)
 * @param opts - 빌드 옵션. `whitespace` 기본값은 `"literal"` (공백을 일반 atom으로 유지)
 * @returns 분해된 Query 객체
 */
export function buildQuery(input: string, opts?: { whitespace?: WhitespaceMode }): Query {
    if (input.length > 0xffff) {
        throw new RangeError(`buildQuery: input length ${input.length} exceeds Uint16Array limit (65535)`);
    }

    const whitespace: WhitespaceMode = opts?.whitespace ?? "literal";
    const cleaned = normalizeForMatch(input);

    if (cleaned === "") {
        return {
            input,
            graphemes: [],
            atoms: "",
            charIndexes: new Uint16Array(0),
            graphemeIndexes: new Uint16Array(0),
            whitespace,
        };
    }

    const graphemes: QueryGrapheme[] = [];
    const tmpCharIndexes: number[] = [];
    const tmpGraphemeIndexes: number[] = new Array(cleaned.length);
    let graphemeIndex = 0;

    for (const seg of segmenter.segment(cleaned)) {
        const rawGrapheme = seg.segment;
        const startIndex = seg.index;
        const atoms = decomposeToAtoms(rawGrapheme);

        // ignore 모드: 공백 grapheme(atom === SPACE_ID 단일) drop
        // graphemeIndexes는 여기선 "다음" grapheme 인덱스로 채워야 하므로
        // 일단 비워두고 루프 끝에서 backfill
        if (whitespace === "ignore" && atoms.length === 1 && atoms[0] === SPACE_ID) {
            continue;
        }

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
    if (whitespace === "ignore") {
        // 공백 char 위치는 "다음 non-space grapheme 인덱스"로 매핑.
        // 끝에서부터 역순으로 backfill: undefined면 뒤 값을 복사, 끝 이후는 graphemeCount.
        let nextIdx = graphemeCount;
        for (let i = cleaned.length - 1; i >= 0; i--) {
            const v = tmpGraphemeIndexes[i];
            if (v === undefined) {
                graphemeIndexes[i] = nextIdx;
            } else {
                graphemeIndexes[i] = v;
                nextIdx = v;
            }
        }
    } else {
        for (let i = 0; i < cleaned.length; i++) {
            graphemeIndexes[i] = tmpGraphemeIndexes[i] ?? 0;
        }
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
        whitespace,
    };
}
