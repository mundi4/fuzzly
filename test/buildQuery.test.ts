import { describe, it, expect } from "vitest";
import { buildQuery } from "../src/index";

describe("buildQuery - 유닛 테스트", () => {
    describe("기본 기능", () => {
        it("간단한 한글", () => {
            const query = buildQuery("안");
            expect(query).not.toBeNull();
            expect(query.literal).toBe(null);
            expect(query.graphemes.length).toBe(1);
        });

        it("여러 한글", () => {
            const query = buildQuery("안녕");
            expect(query).not.toBeNull();
            expect(query.graphemes.length).toBe(2);
        });

        it("영문", () => {
            const query = buildQuery("abc");
            expect(query).not.toBeNull();
            expect(query.graphemes.length).toBe(3);
        });

        it("숫자", () => {
            const query = buildQuery("123");
            expect(query).not.toBeNull();
            expect(query.graphemes.length).toBe(3);
        });

        it("이모지", () => {
            const query = buildQuery("😊");
            expect(query).not.toBeNull();
            expect(query.graphemes.length).toBe(1);
        });

        it("한글 + 영문 + 숫자 혼합", () => {
            const query = buildQuery("안a1");
            expect(query).not.toBeNull();
            expect(query.graphemes.length).toBe(3);
        });
    });

    describe("리터럴 쿼리", () => {
        it("기본 리터럴", () => {
            const query = buildQuery('"안녕"');
            expect(query.literal).toBe("안녕");
            expect(query.input).toBe('"안녕"');
            expect(query.graphemes.length).toBe(0);
        });

        it("리터럴 - 공백 포함", () => {
            const query = buildQuery('"안 녕 하"');
            expect(query.literal).toBe("안 녕 하");
            expect(query.input).toBe('"안 녕 하"');
        });

        it("리터럴 - 이모지", () => {
            const query = buildQuery('"😊👍"');
            expect(query.literal).toBe("😊👍");
            expect(query.input).toBe('"😊👍"');
        });

        it("리터럴 - 특수문자", () => {
            const query = buildQuery('"!@#$%"');
            expect(query.literal).toBe("!@#$%");
            expect(query.input).toBe('"!@#$%"');
        });

        it("리터럴 - 한글 영문 숫자 혼합", () => {
            const query = buildQuery('"안a1"');
            expect(query.literal).toBe("안a1");
            expect(query.input).toBe('"안a1"');
        });
    });

    describe("리터럴 실패 케이스", () => {
        it("따옴표 한 개만", () => {
            const query = buildQuery('"안녕');
            expect(query.literal).toBe(null);
        });

        it("따옴표 뒤에만", () => {
            const query = buildQuery('안녕"');
            expect(query.literal).toBe(null);
        });

        it("중간에 따옴표", () => {
            const query = buildQuery('안"녕');
            expect(query.literal).toBe(null);
        });

        it("빈 리터럴 쌍", () => {
            const query = buildQuery('""');
            expect(query.literal).toBe("");
            expect(query.input).toBe('""');
        });
    });

    describe("엣지 케이스", () => {
        it("빈 문자열", () => {
            const query = buildQuery("");
            expect(query.input).toBe("");
            expect(query.literal).toBe(null);
            expect(query.graphemes.length).toBe(0);
        });

        it("공백만", () => {
            const query = buildQuery("   ");
            expect(query).not.toBeNull();
            expect(query.literal).toBe(null);
        });

        it("탭", () => {
            const query = buildQuery("\t");
            expect(query).not.toBeNull();
        });

        it("줄바꿈", () => {
            const query = buildQuery("\n");
            expect(query).not.toBeNull();
        });

        it("공백이 있는 쿼리", () => {
            const query = buildQuery("안 녕");
            expect(query).not.toBeNull();
            expect(query.graphemes.length).toBeGreaterThan(0);
        });
    });

    describe("BuildQueryOptions - caseSensitive", () => {
        it("기본값 (false)", () => {
            const query1 = buildQuery("ABC");
            const query2 = buildQuery("abc");
            expect(query1).not.toBeNull();
            expect(query2).not.toBeNull();
        });

        it("caseSensitive: true", () => {
            const query = buildQuery("ABC", { caseSensitive: true });
            expect(query).not.toBeNull();
            expect(query.input).toBe("ABC");
        });

        it("caseSensitive: false", () => {
            const query = buildQuery("ABC", { caseSensitive: false });
            expect(query).not.toBeNull();
            expect(query.input).toBe("ABC");
        });

        it("혼합 대소문자 - caseSensitive true", () => {
            const query = buildQuery("AbC", { caseSensitive: true });
            expect(query.input).toBe("AbC");
        });

        it("혼합 대소문자 - caseSensitive false", () => {
            const query = buildQuery("AbC", { caseSensitive: false });
            expect(query.input).toBe("AbC");
        });
    });

    describe("복합 자모", () => {
        it("겹모음", () => {
            const query = buildQuery("ㅘㅙㅚ");
            expect(query).not.toBeNull();
            expect(query.graphemes.length).toBe(3);
        });

        it("겹자음", () => {
            const query = buildQuery("ㄲㄸ");
            expect(query).not.toBeNull();
        });

        it("종성이 있는 한글", () => {
            const query = buildQuery("각");
            expect(query).not.toBeNull();
            expect(query.graphemes[0].tailIndex).toBeGreaterThanOrEqual(0);
        });

        it("종성이 없는 한글", () => {
            const query = buildQuery("가");
            expect(query).not.toBeNull();
            expect(query.graphemes[0].tailIndex).toBe(-1);
        });
    });

    describe("쿼리 구조 검증", () => {
        it("query.text가 정규화됨", () => {
            const query = buildQuery("안녕");
            expect(query.input).toBeDefined();
            expect(typeof query.input).toBe("string");
        });

        it("query.graphemes 배열", () => {
            const query = buildQuery("안녕");
            expect(Array.isArray(query.graphemes)).toBe(true);
        });

        it("각 grapheme의 필드", () => {
            const query = buildQuery("안");
            expect(query.graphemes[0]).toHaveProperty("char");
            expect(query.graphemes[0]).toHaveProperty("atoms");
            expect(query.graphemes[0]).toHaveProperty("vowelIndex");
            expect(query.graphemes[0]).toHaveProperty("tailIndex");
            expect(query.graphemes[0]).toHaveProperty("allowTailSpillover");
        });

        it("atoms는 문자열", () => {
            const query = buildQuery("안");
            expect(typeof query.graphemes[0].atoms).toBe("string");
            expect(query.graphemes[0].atoms.length).toBe(3);
        });
    });

    describe("유니코드 엣지 케이스", () => {
        it("이모지 + 스킨톤", () => {
            const query = buildQuery("👋🏻");
            expect(query).not.toBeNull();
        });

        it("ZWJ (Zero Width Joiner)", () => {
            const query = buildQuery("👨‍👩‍👧‍👦");
            expect(query).not.toBeNull();
        });

        it("제로 윈드 스페이스", () => {
            const query = buildQuery("안\u200B녕");
            expect(query).not.toBeNull();
        });

        it("논-브레이킹 스페이스", () => {
            const query = buildQuery("안\u00A0녕");
            expect(query).not.toBeNull();
        });
    });

    describe("성능 관련", () => {
        it("매우 긴 쿼리", () => {
            const longQuery = "안".repeat(100);
            const query = buildQuery(longQuery);
            expect(query).not.toBeNull();
            expect(query.graphemes.length).toBe(100);
        });

        it("매우 긴 리터럴", () => {
            const longText = "안".repeat(100);
            const query = buildQuery(`"${longText}"`);
            expect(query.literal).toBe("안".repeat(100));
            expect(query.input.length).toBe(100 + `""`.length);
        });

        it("매우 긴 영문", () => {
            const longQuery = "abcdefghijklmnopqrstuvwxyz".repeat(4);
            const query = buildQuery(longQuery);
            expect(query).not.toBeNull();
            expect(query.graphemes.length).toBe(104);
        });
    });
});
