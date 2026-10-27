/**
 * 한/영 자판을 반대로 해석한 문자열을 만든다.
 *
 * 라틴 문자 구간은 두벌식 자모로 바꿔 IME와 동일하게 조합하고, 한글 구간은 자모로 풀어
 * QWERTY 키로 되돌린다. 그 밖의 문자(공백·숫자·기호)는 그대로 통과한다. 구간별로
 * 독립 처리하므로 `"제목 gksrmf"` 같은 혼합 입력도 각 구간이 제 방향으로 뒤집힌다.
 *
 * ```ts
 * swapLayout("gksrmf");        // "한글"
 * swapLayout("ㅗ디ㅣㅐ");        // "hello"
 * swapLayout("Ekfrl");         // "딸기"  (E = shift+e → ㄸ)
 * swapLayout("EKFRL", true);   // "달기"  (CapsLock 켜짐 → 케이스 반전 → ㄷ)
 * ```
 *
 * 되돌릴 게 없으면 입력을 그대로 반환하므로, 소비자는 `swapLayout(q) !== q`로
 * 시도할 가치가 있는지 판단할 수 있다. NFD로 분해된 한글(conjoining jamo)도 인식한다.
 *
 * **혼합 스크립트는 복원 대상이 아니다.** 이 함수는 기계적으로 모든 구간을 뒤집으므로
 * `"제목 gksrmf"` → `"wpahr 한글"`처럼 이미 올바른 부분까지 망가진다. 한영키를 깜빡하면
 * 쿼리 **전체**가 잘못되므로 실사용에서는 문제되지 않지만, 소비자는 한글과 라틴이 함께
 * 들어있는 입력에 대해서는 이 함수를 적용하지 않는 편이 낫다. 토큰마다 어느 해석이 맞는지
 * 고르려면 두 해석을 하나로 합치는 랭킹 레이어가 필요한데, 그건 라이브러리 밖이다
 * (design_notes.md Case 2).
 *
 * @param input 원본 입력. **case folding 전의 원문**이어야 한다 — shift 정보가 필요하다
 * @param capsLock CapsLock 상태를 안다면 전달한다 (브라우저에서는 keydown 이벤트의
 *   `getModifierState("CapsLock")`으로 읽을 수 있다). 생략하면 케이스 패턴에서 추론한다
 */
declare function swapLayout(input: string, capsLock?: boolean): string;

export { swapLayout };
