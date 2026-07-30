import { swapLayout } from "../src/layout";

describe("swapLayout", () => {
    describe("영타 → 한글", () => {
        it("한영키를 안 누른 입력을 복원한다", () => {
            expect(swapLayout("gksrmf")).toBe("한글");
            expect(swapLayout("dkssud")).toBe("안녕");
            expect(swapLayout("tkfkd")).toBe("사랑");
            expect(swapLayout("rjator")).toBe("검색");
        });

        it("IME journey를 그대로 재현한다 (조합 중간 상태 포함)", () => {
            const journey = ["g", "gk", "gks", "gksr", "gksrm", "gksrmf"];
            expect(journey.map((q) => swapLayout(q))).toEqual(["ㅎ", "하", "한", "한ㄱ", "한그", "한글"]);
        });

        it("겹모음을 조합한다", () => {
            expect(swapLayout("ghkrwkd")).toBe("확장"); // ㅗ+ㅏ = ㅘ
            expect(swapLayout("dmlrl")).toBe("의기"); // ㅡ+ㅣ = ㅢ
            expect(swapLayout("hk")).toBe("ㅘ"); // 초성 없이도 겹모음이 된다
        });

        it("겹받침을 조합한다", () => {
            expect(swapLayout("ekfr")).toBe("닭"); // ㄹ+ㄱ = ㄺ
            expect(swapLayout("qkfq")).toBe("밟"); // ㄹ+ㅂ = ㄼ
            expect(swapLayout("rkqt")).toBe("값"); // ㅂ+ㅅ = ㅄ
        });

        it("도깨비불 — 받침이 다음 음절 초성으로 넘어간다", () => {
            expect(swapLayout("gks")).toBe("한");
            expect(swapLayout("gkskk")).toBe("하나ㅏ");
            expect(swapLayout("dkspt")).toBe("아넷");
        });

        it("조합되지 않는 자모는 그대로 남는다 — 잘못된 해석의 신호", () => {
            expect(swapLayout("great")).toBe("ㅎㄱㄷㅁㅅ");
            expect(swapLayout("hello")).toBe("ㅗ디ㅣㅐ");
        });
    });

    describe("한글 → 영타", () => {
        it("한글 자판으로 친 영어를 복원한다", () => {
            expect(swapLayout("ㅗ디ㅣㅐ")).toBe("hello");
            expect(swapLayout("재깅")).toBe("world");
        });

        it("겹모음·겹받침을 키 2번으로 되돌린다", () => {
            expect(swapLayout("확장")).toBe("ghkrwkd");
            expect(swapLayout("닭")).toBe("ekfr");
        });

        it("쌍자모는 shift 키(대문자)로 되돌린다", () => {
            expect(swapLayout("딸기")).toBe("Ekfrl");
            expect(swapLayout("쓰기")).toBe("Tmrl");
        });
    });

    describe("CapsLock", () => {
        // 두벌식에서 shift가 다른 자모를 내는 건 q w e r t o p 7개뿐이다.
        it("모른다고 하면 케이스 패턴에서 추론한다", () => {
            // qwertop 밖의 소문자(k, s, m, f)가 있다 → CapsLock 꺼짐 확정
            expect(swapLayout("gksrmf")).toBe("한글");
            // qwertop 밖의 대문자(G, K, S, M, F)가 있다 → CapsLock 켜짐 확정
            expect(swapLayout("GKSRMF")).toBe("한글");
            // 혼합이어도 확정된다 — E는 qwertop이라 H1을 반박하지 않고, k/f/l이 H2를 반박
            expect(swapLayout("Ekfrl")).toBe("딸기");
        });

        it("명시하면 추론을 덮어쓴다", () => {
            expect(swapLayout("Ekfrl", false)).toBe("딸기"); // shift+e → ㄸ
            expect(swapLayout("EKFRL", true)).toBe("달기"); // CapsLock → 케이스 반전 → ㄷ
            expect(swapLayout("gksrmf", true)).toBe("한끌"); // 반전 → R = ㄲ
            expect(swapLayout("gksmf", true)).toBe("하늘"); // qwertop 밖(G/K/S/M/F)은 반전해도 같은 자모
        });

        it("qwertop 글자로만 이루어진 짧은 입력은 두 해석이 다 살아남는다 — H1(꺼짐)으로 둔다", () => {
            expect(swapLayout("e")).toBe("ㄷ");
            expect(swapLayout("e", true)).toBe("ㄸ");
            expect(swapLayout("to")).toBe("새");
            expect(swapLayout("to", true)).toBe("썌"); // T=ㅆ, O=ㅒ
        });

        it("ASCII 영문자만 증거로 삼는다", () => {
            // 그리스·키릴 대문자, ß(toUpperCase가 "SS")는 두벌식 키가 아니므로 판정에 끼어들면 안 된다
            expect(swapLayout("Ω gksrmf")).toBe("Ω 한글");
            expect(swapLayout("Д gksrmf")).toBe("Д 한글");
            expect(swapLayout("ß gksrmf")).toBe("ß 한글");
        });

        it("두 가설이 모두 반박되면 as-typed로 해석한다", () => {
            // G(대문자·qwertop 밖)가 H1을, k/s/m/f(소문자·qwertop 밖)가 H2를 반박
            expect(swapLayout("Gksrmf")).toBe("한글");
        });
    });

    describe("NFD (conjoining jamo)", () => {
        it("분해형 한글도 인식한다", () => {
            expect(swapLayout("한글".normalize("NFD"))).toBe("gksrmf");
            expect(swapLayout("확장".normalize("NFD"))).toBe("ghkrwkd");
            expect(swapLayout("값".normalize("NFD"))).toBe("rkqt"); // 겹받침 ᆹ
            expect(swapLayout("딸기".normalize("NFD"))).toBe("Ekfrl"); // 쌍자음 ᄄ
        });

        it("NFC와 같은 결과를 낸다", () => {
            for (const word of ["한글", "미리보기", "왼쪽", "훑다", "귀찮다"]) {
                expect(swapLayout(word.normalize("NFD"))).toBe(swapLayout(word));
            }
        });

        it("떨어진 conjoining jamo도 키로 되돌린다", () => {
            expect(swapLayout("ᄀ")).toBe("r"); // ᄀ 초성
            expect(swapLayout("ᅡ")).toBe("k"); // ᅡ 중성
            expect(swapLayout("ᆨ")).toBe("r"); // ᆨ 종성
        });

        it("매핑에 없는 옛한글 자모는 통과시킨다", () => {
            expect(swapLayout("ᅟ")).toBe("ᅟ"); // 초성 채움 문자
        });
    });

    describe("구간 처리", () => {
        it("라틴 구간과 한글 구간이 각자 제 방향으로 뒤집힌다", () => {
            // 기계적 동작 — 이미 올바른 `제목`까지 뒤집힌다. 혼합 스크립트는 복원 대상이 아니다.
            expect(swapLayout("제목 gksrmf")).toBe("wpahr 한글");
        });

        it("공백·숫자·기호는 그대로 통과한다", () => {
            expect(swapLayout("123 !@#")).toBe("123 !@#");
            expect(swapLayout("rjator 2")).toBe("검색 2");
        });

        it("되돌릴 게 없으면 입력을 그대로 반환한다", () => {
            expect(swapLayout("")).toBe("");
            expect(swapLayout("漢字")).toBe("漢字");
            expect(swapLayout("42")).toBe("42");
        });
    });

    describe("round-trip", () => {
        const KOREAN = [
            "한글",
            "안녕",
            "사랑",
            "설정",
            "저장",
            "검색",
            "터미널",
            "미리보기",
            "확장",
            "명령 팔레트",
            "붙여넣기",
            "잘라내기",
            "실행 취소",
            "찾아 바꾸기",
            "글꼴 크기",
            "깃 커밋",
            "브랜치 전환",
            "원격 저장소",
            "비밀번호 변경",
            "띄어쓰기",
            "빠른 실행",
            "밖으로",
            "있음",
            "닭",
            "값",
            "훑다",
            "의사",
            "왼쪽",
            "웬일",
            "귀찮다",
        ];

        it.each(KOREAN)("한글 → 영타 → 한글: %s", (word) => {
            expect(swapLayout(swapLayout(word))).toBe(word);
        });

        const ENGLISH = [
            "hello",
            "world",
            "search",
            "settings",
            "commit",
            "branch",
            "preview",
            "abcdefghijklm",
            "nopqrstuvwxyz",
        ];

        it.each(ENGLISH)("영타 → 한글 → 영타: %s", (word) => {
            expect(swapLayout(swapLayout(word))).toBe(word);
        });
    });
});
