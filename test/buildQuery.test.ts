import { describe, expect, it } from "vitest";
import { buildQuery } from "../src/index";

describe("buildQuery - 유닛 테스트", () => {
    describe("기본 기능", () => {
        it("간단한 한글", () => {
            const query = buildQuery("안");
            expect(query).not.toBeNull();
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

    describe("엣지 케이스", () => {
        it("빈 문자열", () => {
            const query = buildQuery("");
            expect(query.input).toBe("");
            expect(query.graphemes.length).toBe(0);
        });

        it("공백만", () => {
            const query = buildQuery("   ");
            expect(query).not.toBeNull();
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

        it("따옴표가 포함된 쿼리 (일반 문자로 처리)", () => {
            const query = buildQuery('"안녕"');
            expect(query).not.toBeNull();
            expect(query.graphemes.length).toBeGreaterThan(0);
        });
    });

    describe("대소문자 (항상 소문자 정규화)", () => {
        it("대문자 입력은 소문자로 정규화", () => {
            const query = buildQuery("ABC");
            expect(query).not.toBeNull();
            expect(query.graphemes[0].atoms).toBe("a");
        });

        it("혼합 대소문자도 소문자로 정규화", () => {
            const query = buildQuery("AbC");
            expect(query.graphemes[0].atoms).toBe("a");
            expect(query.graphemes[1].atoms).toBe("b");
            expect(query.graphemes[2].atoms).toBe("c");
        });

        it("input 필드는 원본 유지", () => {
            const query = buildQuery("ABC");
            expect(query.input).toBe("ABC");
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
        it("query.input이 정규화됨", () => {
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

        it("매우 긴 영문", () => {
            const longQuery = "abcdefghijklmnopqrstuvwxyz".repeat(4);
            const query = buildQuery(longQuery);
            expect(query).not.toBeNull();
            expect(query.graphemes.length).toBe(104);
        });
    });
});
