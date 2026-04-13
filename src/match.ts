import { DEFAULT_MATCH_OPTIONS, type GraphemeIndices, type MatchOptions, type Query, type Target } from "./types";

/*
 * 매칭 모델
 * ---------
 * "spillover" 개념은 없다. 쿼리 원자를 타겟 원자 스트림에 순서대로 매칭시키는 게 전부다.
 * 유일한 제약은 **vowel-sticks-to-lead**: 쿼리 한 글자의 모음(중성)은 그 글자의 초성이
 * 매치된 타겟 음절 안에서 바로 이어지는 위치에서만 소비될 수 있다. 즉 초성 매치 위치에
 * "anchor"를 박고 중성을 같은 음절 내부에서만 끝내야 한다.
 *
 * 자음(초성/종성)은 자유롭게 건너뛰며 다음 타겟 음절로 넘어갈 수 있다. 초성에 이어지는
 * 모음이 없는 경우(겹자음 단독 입력 or non-hangul)는 anchor가 없고 그냥 다음 매칭 atom을
 * 찾으면 끝난다.
 *
 * 타겟 원자는 초성(lead)/중성(vowel)/종성(tail) 위치 정보가 preprocessTarget에서 이미
 * 계산돼 있고, 쿼리의 초성(+중성) phase는 타겟 한 음절 안에서 atom-by-atom 비교로 해결된다.
 * 쿼리 종성 phase는 anchor 음절의 종성부터 시작해서 이후 음절들의 자음 자리로 자유롭게
 * 넘어갈 수 있다.
 */
export function match(
    query: Query,
    target: Target,
    _matchOptions: MatchOptions = DEFAULT_MATCH_OPTIONS,
): GraphemeIndices | null {
    // Literal 쿼리 처리
    if (query.literal !== null) {
        const text = query.literal;
        if (text === "") {
            return [];
        }

        const foundAt = target.normalizedInput.indexOf(text);
        if (foundAt >= 0) {
            const indexes: number[] = [];
            const graphemeIndexes = target.graphemeIndexes;
            for (let i = 0; i < text.length; i++) {
                const graphemeIndex = graphemeIndexes[foundAt + i];
                if (indexes[indexes.length - 1] !== graphemeIndex) {
                    indexes.push(graphemeIndex);
                }
            }
            return indexes;
        }

        return null;
    }

    const qGraphemes = query.graphemes;
    const tGraphemes = target.graphemes;

    if (qGraphemes.length === 0) return [];
    if (qGraphemes.length > tGraphemes.length) return null;

    const matches: number[] = [];
    let tgi = 0;

    for (let qi = 0; qi < qGraphemes.length; qi++) {
        const qg = qGraphemes[qi];
        const qAtoms = qg.atoms;
        const qVowelStart = qg.vowelIndex;
        const qTailStart = qg.tailIndex;

        if (qVowelStart === -1) {
            // 중성 없음. 두 종류로 갈린다:
            //  (1) 한글 자음 원자(ㄱ, ㄳ 등): atoms의 각 char가 compat 자모이고,
            //      각각이 이후 타겟 음절의 LEAD 자리와 매치돼야 한다.
            //  (2) 비한글 grapheme(ASCII, 이모지 등): atoms 전체가 하나의 불가분
            //      단위이므로 타겟 grapheme의 atoms와 통째로 같아야 한다.
            const firstCode = qAtoms.charCodeAt(0);
            const isHangulCluster = firstCode >= 0x3131 && firstCode <= 0x3163;

            if (isHangulCluster) {
                for (let qai = 0; qai < qAtoms.length; qai++) {
                    const needle = qAtoms[qai];
                    let found = false;
                    while (tgi < tGraphemes.length) {
                        if (tGraphemes[tgi].atoms[0] === needle) {
                            matches.push(tgi);
                            tgi++;
                            found = true;
                            break;
                        }
                        tgi++;
                    }
                    if (!found) return null;
                }
            } else {
                let found = false;
                while (tgi < tGraphemes.length) {
                    if (tGraphemes[tgi].atoms === qAtoms) {
                        matches.push(tgi);
                        tgi++;
                        found = true;
                        break;
                    }
                    tgi++;
                }
                if (!found) return null;
            }
            continue;
        }

        // 중성 있음: lead + vowel은 같은 타겟 음절 안에서 처리해야 한다.
        const qLeadVowelEnd = qTailStart === -1 ? qAtoms.length : qTailStart;

        // anchor 탐색: tGraphemes[tgi..] 중에서 qg의 lead+vowel atoms와 prefix-match
        // 되는 첫 음절을 찾는다.
        let anchorTgi = -1;
        while (tgi < tGraphemes.length) {
            const tg = tGraphemes[tgi];
            if (tg.vowelIndex === -1) {
                // 타겟 자모가 한글 음절이 아님(공백, 비한글, 단독 자모 등) → 건너뜀
                tgi++;
                continue;
            }
            const tAtoms = tg.atoms;
            if (tAtoms.length < qLeadVowelEnd) {
                tgi++;
                continue;
            }
            let ok = true;
            for (let i = 0; i < qLeadVowelEnd; i++) {
                if (qAtoms[i] !== tAtoms[i]) {
                    ok = false;
                    break;
                }
            }
            if (!ok) {
                tgi++;
                continue;
            }
            anchorTgi = tgi;
            break;
        }

        if (anchorTgi === -1) return null;

        matches.push(anchorTgi);

        if (qTailStart === -1) {
            tgi = anchorTgi + 1;
            continue;
        }

        // 종성 처리: anchor의 종성부터 시작해 이후 음절의 자음 자리까지 건너뛰며 매칭.
        // 자음은 vowel atom과 절대 같지 않으므로 vowel을 무심코 건너뛸 위험은 없다.
        let curTgi = anchorTgi;
        let tai = qLeadVowelEnd;
        let lastMatchedTgi = anchorTgi;

        for (let qai = qTailStart; qai < qAtoms.length; qai++) {
            const needle = qAtoms[qai];
            let found = false;

            while (curTgi < tGraphemes.length) {
                const tAtoms = tGraphemes[curTgi].atoms;
                let idx = -1;
                for (let i = tai; i < tAtoms.length; i++) {
                    if (tAtoms[i] === needle) {
                        idx = i;
                        break;
                    }
                }
                if (idx !== -1) {
                    tai = idx + 1;
                    if (curTgi !== lastMatchedTgi) {
                        matches.push(curTgi);
                        lastMatchedTgi = curTgi;
                    }
                    found = true;
                    break;
                }
                curTgi++;
                tai = 0;
            }

            if (!found) return null;
        }

        tgi = curTgi + 1;
    }

    return matches;
}
