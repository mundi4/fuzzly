import { type Target, type Query, type GraphemeIndices, type MatchOptions, DEFAULT_MATCH_OPTIONS } from "./types";

// 30분 후에 보면 잊어버릴 코드
// 조건이 복잡하고 지금 조건들이 현실을 제대로 커버하는지, 어떤 엣지케이스들을 간과했는지... 분석을 더 해봐야 함.
export function match(query: Query, target: Target, matchOptions: MatchOptions = DEFAULT_MATCH_OPTIONS): GraphemeIndices | null {
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

    // Fuzzy 쿼리 처리
    const queryGraphemes = query.graphemes;
    const tGraphemes = target.graphemes;

    if (queryGraphemes.length === 0) {
        return [];
    }

    if (queryGraphemes.length > tGraphemes.length) {
        return null;
    }

    let qi = 0; // query graphemes index
    let qai = 0; // query grapheme atoms index
    let tgi = 0; // target graphemes index

    const matches: number[] = [];

    TARGET_CHAR_LOOP:
    while (qi < queryGraphemes.length && tgi < tGraphemes.length) {
        const qGrapheme = queryGraphemes[qi];
        const qAtoms = qGrapheme.atoms;
        // console.log(qi, qai, tgi)
        const tAtoms = tGraphemes[tgi];

        // spillover
        if (qai !== 0) {
            if (qAtoms[qai] !== tAtoms[0]) {
                // target의 다음 글자로 이동
                tgi++;
                continue;
            }

            // 성공
            qai++;

            // 겹받침이었던 경우 qAtoms가 아직 남아있음
            if (qai < qAtoms.length) {
                // 현재 타겟 글자의 초성에는 이미 매치를 시켰으므로 다음 글자로 이동해야함.
                // 한 글자에 초성이 두개 있을 순 없고 겹받침은 당연히 초성자리에 올 수 없다. 이름부터 받침이니깐
                tgi++;
                continue;
            } else {
                // spillover 완료
                qai = 0;
                qi++;
                matches.push(tgi);
                tgi++;
                continue;
            }
        }

        // console.log(qAtoms)
        // 두 배열은 완전히 intern 상태이기 때문에 참조 비교가 가능.
        if (qAtoms === tAtoms) {
            // console.log("완전 매치", qi, tgi);
            qi++;
            matches.push(tgi);
            tgi++;
            continue;
        }

        if (qAtoms[0] !== tAtoms[0]) {
            // 첫 atom이 다르다면 더 볼 것도 없다. 다음 타겟 글자로 advance
            tgi++;
            continue;
        }

        if (qAtoms.length > 1) {
            for (qai = 1; qai < qAtoms.length; qai++) {
                if (qAtoms[qai] !== tAtoms[qai]) {
                    // const sIsVowel = qGrapheme.vowelIndex !== -1 && qai >= qGrapheme.vowelIndex && (qGrapheme.tailIndex === -1 || qai < qGrapheme.tailIndex);

                    if (qGrapheme.vowelIndex === -1 || qai < qGrapheme.vowelIndex) {
                        // qGrapheme에 모음이 없거나 아직 모음이 시작되기 전(사실 이건 불가능한 케이스)
                        // 즉 겹받침이 초성자리에 들어온 경우임. 예: 'ㄳ', 'ㄻ'
                        // 이 경우 qAtoms는 'ㄳ' => ['ㄱ','ㅅ'], 'ㄻ' => ['ㄹ','ㅁ'] 일 것임.
                        // 이건 무조건 spillover 허용해야함.
                        // ㄳ => '감사', '개선', '관악산' 등에 매치가 되어야 함.
                        matches.push(tgi);
                        tgi++;
                        continue TARGET_CHAR_LOOP;
                    } else if (qGrapheme.tailIndex === -1 || qai < qGrapheme.tailIndex) {
                        // 받침이 시작되지 않은 경우 => 즉, 모음인 경우
                        qai = 0;
                        tgi++;
                        continue TARGET_CHAR_LOOP;
                        // } else if (qGrapheme.tailIndex === -1 || qai < qGrapheme.tailIndex || !matchOptions.tailSpillover) {
                        //     // query의 atom이 모음인 경우 이 글자 실패
                        //     // tailSpillover가 false인 경우에도 이 글자 실패
                        //     qai = 0;
                        //     tgi++;
                        //     continue TARGET_CHAR_LOOP;
                    } else {
                        const allowTailSpillover = matchOptions.tailSpillover === "always" ||
                            (matchOptions.tailSpillover === "lastOnly" && qi === queryGraphemes.length - 1);
                        if (allowTailSpillover) {
                            matches.push(tgi);
                            tgi++;
                            continue TARGET_CHAR_LOOP;
                        }
                    }
                }
            }

            // query의 atoms는 모두 매치를 시켰지만 타겟 글자에 남은 atom이 있을 수 있다.
            if (qai < tAtoms.length) {
                // remainder 옵션에 따라 처리
                if (matchOptions.remainder === "strict") {
                    // 남은 atom이 있으면 실패
                    if (!matchOptions.tailSpillover) {
                        qai = 0;
                        tgi++;
                        continue TARGET_CHAR_LOOP;
                    }
                } else if (matchOptions.remainder === "allow") {
                    // 남은 atom 허용
                } else if (matchOptions.remainder === "tailSpilloverOnly") {
                    // tailSpillover가 활성화된 경우만 허용
                    const allowTailSpillover = matchOptions.tailSpillover === "always" ||
                        (matchOptions.tailSpillover === "lastOnly" && qi === queryGraphemes.length - 1);
                    if (!allowTailSpillover) {
                        qai = 0;
                        tgi++;
                        continue TARGET_CHAR_LOOP;
                    }
                }
            }
        }

        qai = 0;
        qi++;
        matches.push(tgi);
        tgi++;
    }

    if (qi < queryGraphemes.length) {
        return null;
    }

    return matches;
}