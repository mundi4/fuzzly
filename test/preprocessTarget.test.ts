import { describe, expect, it } from "vitest";
import { preprocessTarget } from "../src/index";

describe("preprocessTarget - 유닛 테스트", () => {
    describe("기본 기능", () => {
        it("한글 한 글자", () => {
            const target = preprocessTarget("안", { caseSensitive: true });
            expect(target.normalizedInput).toBe("안");
            expect(target.graphemes.length).toBe(1);
        });

        it("한글 여러 글자", () => {
            const target = preprocessTarget("안녕하세요", { caseSensitive: true });
            expect(target.normalizedInput).toBe("안녕하세요");
            expect(target.graphemes.length).toBe(5);
        });

        it("영문", () => {
            const target = preprocessTarget("abc", { caseSensitive: true });
            expect(target.graphemes.length).toBe(3);
        });

        it("숫자", () => {
            const target = preprocessTarget("123", { caseSensitive: true });
            expect(target.graphemes.length).toBe(3);
        });

        it("이모지", () => {
            const target = preprocessTarget("😊", { caseSensitive: true });
            expect(target.graphemes.length).toBeGreaterThan(0);
        });

        it("한글 + 영문 + 숫자 혼합", () => {
            const target = preprocessTarget("안a1", { caseSensitive: true });
            expect(target.graphemes.length).toBe(3);
        });
    });

    describe("엣지 케이스", () => {
        it("빈 문자열", () => {
            const target = preprocessTarget("", { caseSensitive: true });
            expect(target.normalizedInput).toBe("");
            expect(target.graphemes.length).toBe(0);
        });

        it("공백만", () => {
            const target = preprocessTarget("   ", { caseSensitive: true });
            expect(target.graphemes.length).toBeGreaterThan(0);
        });

        it("탭", () => {
            const target = preprocessTarget("\t", { caseSensitive: true });
            expect(target.graphemes.length).toBeGreaterThan(0);
        });

        it("줄바꿈", () => {
            const target = preprocessTarget("\n", { caseSensitive: true });
            expect(target.graphemes.length).toBeGreaterThan(0);
        });

        it("공백이 있는 텍스트", () => {
            const target = preprocessTarget("안 녕 하", { caseSensitive: true });
            expect(target.graphemes.length).toBeGreaterThan(3); // 공백 포함
        });

        it("이모지 여러 개", () => {
            const target = preprocessTarget("😊👍🎉", { caseSensitive: true });
            expect(target.graphemes.length).toBeGreaterThan(0);
        });

        it("복합 이모지 (스킨톤)", () => {
            const target = preprocessTarget("👋🏻", { caseSensitive: true });
            expect(target.graphemes.length).toBeGreaterThan(0);
        });

        it("ZWJ 이모지", () => {
            const target = preprocessTarget("👨‍👩‍👧‍👦", { caseSensitive: true });
            expect(target.graphemes.length).toBeGreaterThan(0);
        });
    });

    describe("caseSensitive 옵션", () => {
        it("true - 대소문자 구분", () => {
            const target = preprocessTarget("ABC", { caseSensitive: true });
            expect(target.normalizedInput).toBe("ABC");
        });

        it("false - 대소문자 무시", () => {
            const target = preprocessTarget("ABC", { caseSensitive: false });
            expect(target.normalizedInput).toBe("abc");
        });

        it("혼합 대소문자 - true", () => {
            const target = preprocessTarget("AbC", { caseSensitive: true });
            expect(target.normalizedInput).toBe("AbC");
        });

        it("혼합 대소문자 - false", () => {
            const target = preprocessTarget("AbC", { caseSensitive: false });
            expect(target.normalizedInput).toBe("abc");
        });

        it("한글은 caseSensitive 영향 없음", () => {
            const target1 = preprocessTarget("안", { caseSensitive: true });
            const target2 = preprocessTarget("안", { caseSensitive: false });
            expect(target1.normalizedInput).toBe(target2.normalizedInput);
        });

        it("혼합 텍스트 - caseSensitive true", () => {
            const target = preprocessTarget("An녕", { caseSensitive: true });
            expect(target.normalizedInput).toBe("An녕");
        });

        it("혼합 텍스트 - caseSensitive false", () => {
            const target = preprocessTarget("An녕", { caseSensitive: false });
            expect(target.normalizedInput).toBe("an녕");
        });
    });

    describe("Index 정확성", () => {
        it("charIndexes 길이", () => {
            const target = preprocessTarget("한글", { caseSensitive: true });
            expect(target.charIndexes.length).toBe(target.graphemes.length);
        });

        it("charIndexes 증가", () => {
            const target = preprocessTarget("한글", { caseSensitive: true });
            for (let i = 1; i < target.charIndexes.length; i++) {
                expect(target.charIndexes[i]).toBeGreaterThanOrEqual(target.charIndexes[i - 1]);
            }
        });

        it("graphemeIndexes 범위", () => {
            const target = preprocessTarget("한글", { caseSensitive: true });
            for (const idx of target.graphemeIndexes) {
                expect(idx).toBeGreaterThanOrEqual(0);
                expect(idx).toBeLessThan(target.graphemes.length);
            }
        });

        it("graphemeIndexes 길이", () => {
            const input = "한글";
            const target = preprocessTarget(input, { caseSensitive: true });
            expect(target.graphemeIndexes.length).toBeGreaterThanOrEqual(input.length);
        });

        it("charIndexes 범위", () => {
            const input = "한글";
            const target = preprocessTarget(input, { caseSensitive: true });
            for (const idx of target.charIndexes) {
                expect(idx).toBeGreaterThanOrEqual(0);
                expect(idx).toBeLessThanOrEqual(input.length);
            }
        });

        it("멀티바이트 문자의 charIndexes", () => {
            const target = preprocessTarget("a한b", { caseSensitive: true });
            // a: 0, 한: 1, b: 3
            expect(target.charIndexes[0]).toBe(0);
            expect(target.charIndexes[2]).toBeGreaterThan(target.charIndexes[1]);
        });
    });

    describe("Graphemes 구조", () => {
        it("각 grapheme은 문자열", () => {
            const target = preprocessTarget("한글", { caseSensitive: true });
            for (const grapheme of target.graphemes) {
                expect(typeof grapheme).toBe("string");
            }
        });

        it("한글 grapheme은 문자열", () => {
            const target = preprocessTarget("한", { caseSensitive: true });
            expect(typeof target.graphemes[0]).toBe("string");
            expect(target.graphemes[0].length).toBe(3);
        });

        it("영문/숫자 grapheme", () => {
            const target = preprocessTarget("a1", { caseSensitive: true });
            expect(target.graphemes[0].length).toBeGreaterThan(0);
            expect(target.graphemes[1].length).toBeGreaterThan(0);
        });
    });

    describe("유니코드 엣지 케이스", () => {
        it("제로 윈드 스페이스", () => {
            const target = preprocessTarget("안\u200B녕", { caseSensitive: true });
            expect(target.graphemes.length).toBeGreaterThan(0);
        });

        it("논-브레이킹 스페이스", () => {
            const target = preprocessTarget("안\u00A0녕", { caseSensitive: true });
            expect(target.graphemes.length).toBeGreaterThan(0);
        });

        it("다양한 공백 종류", () => {
            const variants = [
                "안 녕", // 일반 공백
                "안\t녕", // 탭
                "안\u00A0녕", // 논-브레이킹 스페이스
                "안\n녕", // 줄바꿈
            ];

            for (const text of variants) {
                const target = preprocessTarget(text, { caseSensitive: true });
                expect(target.graphemes.length).toBeGreaterThan(0);
            }
        });

        it("스킨톤 이모지", () => {
            const target = preprocessTarget("👋🏻👋🏼", { caseSensitive: true });
            expect(target.graphemes.length).toBeGreaterThan(0);
        });
    });

    describe("성능 관련", () => {
        it("매우 긴 텍스트", () => {
            const longText = "안녕하세요 ".repeat(200);
            const target = preprocessTarget(longText, { caseSensitive: true });
            expect(target.graphemes.length).toBeGreaterThan(0);
            expect(target.normalizedInput.length).toBe(longText.length);
        });

        it("매우 긴 영문", () => {
            const longText = "abcdefghijklmnopqrstuvwxyz".repeat(20);
            const target = preprocessTarget(longText, { caseSensitive: false });
            expect(target.normalizedInput).toBe(longText.toLowerCase());
        });

        it("혼합 긴 텍스트", () => {
            const longText = "안a1 ".repeat(100).trim();
            const target = preprocessTarget(longText, { caseSensitive: true });
            expect(target.graphemes.length).toBeGreaterThan(0);
        });
    });

    describe("Target 구조 검증", () => {
        it("input 필드", () => {
            const target = preprocessTarget("안", { caseSensitive: true });
            expect(typeof target.normalizedInput).toBe("string");
        });

        it("graphemes 배열", () => {
            const target = preprocessTarget("안", { caseSensitive: true });
            expect(Array.isArray(target.graphemes)).toBe(true);
        });

        it("graphemeIndexes 배열", () => {
            const target = preprocessTarget("안", { caseSensitive: true });
            expect(Array.isArray(target.graphemeIndexes)).toBe(true);
        });

        it("charIndexes 배열", () => {
            const target = preprocessTarget("안", { caseSensitive: true });
            expect(Array.isArray(target.charIndexes)).toBe(true);
        });

        it("모든 필드 존재", () => {
            const target = preprocessTarget("안", { caseSensitive: true });
            expect(target).toHaveProperty("input");
            expect(target).toHaveProperty("graphemes");
            expect(target).toHaveProperty("graphemeIndexes");
            expect(target).toHaveProperty("charIndexes");
        });
    });

    describe("Readonly 검증", () => {
        it("grapheme atoms는 readonly", () => {
            const target = preprocessTarget("한", { caseSensitive: true });
            const atoms = target.graphemes[0];
            expect(typeof atoms).toBe("string");
        });
    });
});
