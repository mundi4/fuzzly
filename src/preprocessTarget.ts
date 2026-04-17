import { DASH_ID, DOT_ID, SPACE_ID, UNDERSCORE_ID } from "./internal/atomRegistry";
import segmenter from "./internal/segmenter";
import { computeAtomRoles, decomposeToAtoms } from "./internal/utils";
import type { Atoms, Target } from "./types";

/**
 * 검색 대상 문자열을 grapheme 단위로 분해하고 flat typed array 레이아웃으로 저장한다.
 * 결과 Target 객체는 한 번 생성해두고 여러 쿼리에 대해 재사용하는 것이 의도된 패턴.
 *
 * 반환된 `Target`은 모든 필드가 `string | number | TypedArray`이므로
 * `structuredClone` / IndexedDB에 직접 저장할 수 있다.
 * 비한글·비ASCII 문자가 포함된 경우 동적 atom ID가 할당되므로,
 * 직렬화 시 `snapshotDynamicAtoms()`를 함께 저장하고
 * 복원 시 `restoreDynamicAtoms()`를 먼저 호출해야 한다.
 *
 * **제약**: 입력이 65535 UTF-16 코드유닛을 초과하면 `RangeError`.
 * 커맨드팔레트 용도에서는 도달할 수 없는 한계.
 *
 * @param input - 검색 대상 원문 문자열
 * @returns 전처리된 Target 객체 (`match`, `matchBest`의 두 번째 인자로 사용)
 */
export function preprocessTarget(input: string): Target {
    if (input.length > 0xffff) {
        throw new RangeError(
            `preprocessTarget: input length ${input.length} exceeds Uint16Array limit (65535)`,
        );
    }

    const normalizedInput = input.toLowerCase();

    // Pass 1: temp JS arrays에 수집
    const tmpAtomArrays: Atoms[] = [];
    const tmpCharIndexes: number[] = [];
    const tmpGraphemeIndexes: number[] = []; // sparse — normalizedInput 길이만큼
    let graphemeIndex = 0;

    for (const seg of segmenter.segment(normalizedInput)) {
        const cluster = seg.segment;
        const startIndex = seg.index;

        tmpCharIndexes[graphemeIndex] = startIndex;

        // decomposeToAtoms는 모든 grapheme cluster를 처리:
        // - BMP 1-char: 한글 분해 or 단일 atom ID
        // - non-BMP (surrogate pair) or multi-codepoint: cluster 전체에 동적 ID 할당
        const atoms = decomposeToAtoms(cluster);

        // graphemeIndexes: cluster 내 모든 UTF-16 위치를 같은 grapheme index로 매핑
        for (let i = 0; i < cluster.length; i++) {
            tmpGraphemeIndexes[startIndex + i] = graphemeIndex;
        }

        tmpAtomArrays[graphemeIndex] = atoms;
        graphemeIndex++;
    }

    const graphemeCount = graphemeIndex;

    // Pass 2: flat typed arrays 구축
    let totalAtoms = 0;
    for (let i = 0; i < graphemeCount; i++) {
        totalAtoms += tmpAtomArrays[i].length;
    }

    const atomsFlat = new Uint8Array(totalAtoms);
    const atomStarts = new Uint32Array(graphemeCount);
    const atomLens = new Uint8Array(graphemeCount);
    const vowelIdxs = new Int8Array(graphemeCount);
    const tailIdxs = new Int8Array(graphemeCount);
    const boundaryFlags = new Uint8Array(graphemeCount);

    let atomOffset = 0;
    for (let i = 0; i < graphemeCount; i++) {
        const atoms = tmpAtomArrays[i];
        atomStarts[i] = atomOffset;
        atomLens[i] = atoms.length;
        atomsFlat.set(atoms, atomOffset);

        const { vowelIndex, tailIndex } = computeAtomRoles(atoms);
        vowelIdxs[i] = vowelIndex;
        tailIdxs[i] = tailIndex;

        // boundary 판별: 첫 grapheme이거나 이전이 공백/밑줄/대시/점
        if (i === 0) {
            boundaryFlags[i] = 1;
        } else {
            const prev = tmpAtomArrays[i - 1];
            if (prev.length === 1) {
                const pid = prev[0];
                if (pid === SPACE_ID || pid === UNDERSCORE_ID || pid === DASH_ID || pid === DOT_ID) {
                    boundaryFlags[i] = 1;
                }
            }
        }

        atomOffset += atoms.length;
    }

    // charIndexes → Uint16Array
    const charIndexes = new Uint16Array(graphemeCount);
    for (let i = 0; i < graphemeCount; i++) {
        charIndexes[i] = tmpCharIndexes[i];
    }

    // graphemeIndexes → Uint16Array (sparse array → dense)
    const graphemeIndexes = new Uint16Array(normalizedInput.length);
    for (let i = 0; i < normalizedInput.length; i++) {
        graphemeIndexes[i] = tmpGraphemeIndexes[i] ?? 0;
    }

    return {
        input,
        normalizedInput,
        graphemeCount,
        atomsFlat,
        atomStarts,
        atomLens,
        vowelIdxs,
        tailIdxs,
        boundaryFlags,
        graphemeIndexes,
        charIndexes,
    };
}
