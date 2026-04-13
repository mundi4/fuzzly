import { describe, expect, it } from "vitest";
import { journeyFrom, queryToKeystrokes, typingStates } from "./ime";

// IME 합성 시뮬레이터 검증. 이 helper는 match의 journey 테스트에서 쿼리 문자열을
// "실제 타이핑 중간 상태들"로 풀어주는 데 쓰이므로 동작이 완전히 맞아야 한다.

describe("IME composer — typingStates", () => {
    describe("기본 음절 합성", () => {
        it("가 = ㄱ+ㅏ", () => {
            expect(typingStates(["ㄱ", "ㅏ"])).toEqual(["ㄱ", "가"]);
        });

        it("각 = ㄱㅏㄱ", () => {
            expect(typingStates(["ㄱ", "ㅏ", "ㄱ"])).toEqual(["ㄱ", "가", "각"]);
        });

        it("값 = ㄱㅏㅂㅅ — compound tail", () => {
            expect(typingStates(["ㄱ", "ㅏ", "ㅂ", "ㅅ"])).toEqual(["ㄱ", "가", "갑", "값"]);
        });

        it("과 = ㄱㅗㅏ — compound vowel", () => {
            expect(typingStates(["ㄱ", "ㅗ", "ㅏ"])).toEqual(["ㄱ", "고", "과"]);
        });

        it("관 = ㄱㅗㅏㄴ", () => {
            expect(typingStates(["ㄱ", "ㅗ", "ㅏ", "ㄴ"])).toEqual(["ㄱ", "고", "과", "관"]);
        });

        it("의 = ㅇㅡㅣ — compound vowel ㅢ", () => {
            expect(typingStates(["ㅇ", "ㅡ", "ㅣ"])).toEqual(["ㅇ", "으", "의"]);
        });

        it("회 = ㅎㅗㅣ — compound vowel ㅚ", () => {
            expect(typingStates(["ㅎ", "ㅗ", "ㅣ"])).toEqual(["ㅎ", "호", "회"]);
        });
    });

    describe("종성 → 다음 음절 초성 분리", () => {
        it("가사 = ㄱㅏㅅㅏ — 단일 종성 떼어내기", () => {
            expect(typingStates(["ㄱ", "ㅏ", "ㅅ", "ㅏ"])).toEqual(["ㄱ", "가", "갓", "가사"]);
        });

        it("갑사 = ㄱㅏㅂㅅㅏ — compound 종성 뒷부분만 분리", () => {
            expect(typingStates(["ㄱ", "ㅏ", "ㅂ", "ㅅ", "ㅏ"])).toEqual(["ㄱ", "가", "갑", "값", "갑사"]);
        });

        it("저나 = ㅈㅓㄴㅏ — 전의 ㄴ이 분리", () => {
            expect(typingStates(["ㅈ", "ㅓ", "ㄴ", "ㅏ"])).toEqual(["ㅈ", "저", "전", "저나"]);
        });
    });

    describe("겹받침 불가 → finalize", () => {
        it("전ㄹ = ㅈㅓㄴㄹ — ㄴㄹ compound 불가", () => {
            expect(typingStates(["ㅈ", "ㅓ", "ㄴ", "ㄹ"])).toEqual(["ㅈ", "저", "전", "전ㄹ"]);
        });

        it("전랴 = ㅈㅓㄴㄹㅑ", () => {
            expect(typingStates(["ㅈ", "ㅓ", "ㄴ", "ㄹ", "ㅑ"])).toEqual(["ㅈ", "저", "전", "전ㄹ", "전랴"]);
        });
    });

    describe("Standalone 자음 + 자음 → compound jamo", () => {
        it("ㄺ = ㄹ+ㄱ", () => {
            expect(typingStates(["ㄹ", "ㄱ"])).toEqual(["ㄹ", "ㄺ"]);
        });

        it("ㄼ = ㄹ+ㅂ", () => {
            expect(typingStates(["ㄹ", "ㅂ"])).toEqual(["ㄹ", "ㄼ"]);
        });

        it("ㅀ = ㄹ+ㅎ", () => {
            expect(typingStates(["ㄹ", "ㅎ"])).toEqual(["ㄹ", "ㅀ"]);
        });

        it("ㅈㄺ — 앞 자음 finalize 후 compound 시작", () => {
            expect(typingStates(["ㅈ", "ㄹ", "ㄱ"])).toEqual(["ㅈ", "ㅈㄹ", "ㅈㄺ"]);
        });

        it("compound 불가 자음 쌍 (ㅈㄹ): 앞 finalize, 새 시작", () => {
            expect(typingStates(["ㅈ", "ㄹ"])).toEqual(["ㅈ", "ㅈㄹ"]);
        });
    });

    describe("음절 종성 → compound 종성 확장", () => {
        it("삶 = ㅅㅏㄹㅁ — ㄻ compound", () => {
            expect(typingStates(["ㅅ", "ㅏ", "ㄹ", "ㅁ"])).toEqual(["ㅅ", "사", "살", "삶"]);
        });

        it("읽 = ㅇㅣㄹㄱ — ㄺ compound", () => {
            expect(typingStates(["ㅇ", "ㅣ", "ㄹ", "ㄱ"])).toEqual(["ㅇ", "이", "일", "읽"]);
        });
    });

    describe("비한글 원자", () => {
        it("ASCII append", () => {
            expect(typingStates(["a", "b", "c"])).toEqual(["a", "ab", "abc"]);
        });

        it("한글 + ASCII", () => {
            expect(typingStates(["ㄱ", "ㅏ", "!"])).toEqual(["ㄱ", "가", "가!"]);
        });

        it("한글 composing 도중 ASCII → finalize", () => {
            expect(typingStates(["ㄱ", "ㅏ", "ㅂ", "x"])).toEqual(["ㄱ", "가", "갑", "갑x"]);
        });
    });

    describe("실제 시나리오", () => {
        it("감사합니다", () => {
            // ㅎ은 사의 종성으로 붙었다가 (감샇) 다음 ㅏ에서 분리된다.
            // ㄷ도 마찬가지로 니의 종성으로 붙었다가 (감사합닏) 분리된다.
            expect(typingStates(["ㄱ", "ㅏ", "ㅁ", "ㅅ", "ㅏ", "ㅎ", "ㅏ", "ㅂ", "ㄴ", "ㅣ", "ㄷ", "ㅏ"])).toEqual([
                "ㄱ",
                "가",
                "감",
                "감ㅅ",
                "감사",
                "감샇",
                "감사하",
                "감사합",
                "감사합ㄴ",
                "감사합니",
                "감사합닏",
                "감사합니다",
            ]);
        });

        it("전략기획부 완전 합성", () => {
            const states = typingStates([
                "ㅈ",
                "ㅓ",
                "ㄴ",
                "ㄹ",
                "ㅑ",
                "ㄱ",
                "ㄱ",
                "ㅣ",
                "ㅎ",
                "ㅗ",
                "ㅣ",
                "ㄱ",
                "ㅂ",
                "ㅜ",
            ]);
            expect(states).toEqual([
                "ㅈ",
                "저",
                "전",
                "전ㄹ",
                "전랴",
                "전략",
                "전략ㄱ",
                "전략기",
                "전략깋",
                "전략기호",
                "전략기회",
                "전략기획",
                "전략기획ㅂ",
                "전략기획부",
            ]);
        });

        it("전략기획부 초성 약식 (ㅈㄺㅎㅂ)", () => {
            expect(typingStates(["ㅈ", "ㄹ", "ㄱ", "ㅎ", "ㅂ"])).toEqual([
                "ㅈ",
                "ㅈㄹ",
                "ㅈㄺ",
                "ㅈㄺㅎ",
                "ㅈㄺㅎㅂ",
            ]);
        });

        it("저략 (ㅈㅓㄹㅑㄱ)", () => {
            expect(typingStates(["ㅈ", "ㅓ", "ㄹ", "ㅑ", "ㄱ"])).toEqual(["ㅈ", "저", "절", "저랴", "저략"]);
        });

        it("ㅈ랴깋ㅂ 시퀀스 (ㅈㄹㅑㄱㅣㅎㅂ)", () => {
            expect(typingStates(["ㅈ", "ㄹ", "ㅑ", "ㄱ", "ㅣ", "ㅎ", "ㅂ"])).toEqual([
                "ㅈ",
                "ㅈㄹ",
                "ㅈ랴",
                "ㅈ략",
                "ㅈ랴기",
                "ㅈ랴깋",
                "ㅈ랴깋ㅂ",
            ]);
        });
    });
});

describe("queryToKeystrokes", () => {
    it("한글 음절 → atoms", () => {
        expect(queryToKeystrokes("가")).toEqual(["ㄱ", "ㅏ"]);
        expect(queryToKeystrokes("값")).toEqual(["ㄱ", "ㅏ", "ㅂ", "ㅅ"]);
        expect(queryToKeystrokes("관")).toEqual(["ㄱ", "ㅗ", "ㅏ", "ㄴ"]);
        expect(queryToKeystrokes("회")).toEqual(["ㅎ", "ㅗ", "ㅣ"]);
    });

    it("여러 음절", () => {
        expect(queryToKeystrokes("전략")).toEqual(["ㅈ", "ㅓ", "ㄴ", "ㄹ", "ㅑ", "ㄱ"]);
    });

    it("standalone compound jamo", () => {
        expect(queryToKeystrokes("ㄺ")).toEqual(["ㄹ", "ㄱ"]);
    });

    it("ASCII는 원자 그대로", () => {
        expect(queryToKeystrokes("abc")).toEqual(["a", "b", "c"]);
    });
});

describe("journeyFrom (end-to-end)", () => {
    it("journey의 마지막 원소는 입력과 같다", () => {
        const inputs = [
            "가",
            "값",
            "감사합니다",
            "전략기획부",
            "ㅈㄺㅎㅂ",
            "ㅈㄼ",
            "저략",
            "ㅈ랴깋ㅂ",
            "abc",
        ];
        for (const q of inputs) {
            const j = journeyFrom(q);
            expect(j[j.length - 1], `journey of "${q}"`).toBe(q);
        }
    });

    it("journey의 원소 개수 = 키스트로크 개수", () => {
        expect(journeyFrom("전략기획부")).toHaveLength(14);
        expect(journeyFrom("ㅈㄺㅎㅂ")).toHaveLength(5);
    });
});
