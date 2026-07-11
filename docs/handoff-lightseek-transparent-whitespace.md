# 핸드오프: lightseek의 transparent whitespace 채택

> 대상: lightseek 작업 세션. 이 문서만으로 작업 가능하도록 자체 완결로 작성됨.
> fuzzly 쪽 구현은 완료·검토 통과 후 `main`에 머지됨 (커밋 `5bcbc55`).

## 1. fuzzly에 무엇이 생겼나 (1분 요약)

쿼리 축(`buildQuery`, 기본 `whitespace: "ignore"`)은 공백을 제거하는데 타겟 축은 공백이
grapheme 인덱스를 소비해서, 공백 낀 near-exact 타겟은 연속 매치 run이 공백마다 끊겼다.
연속 보너스가 run 길이 **제곱**이라 손해가 제곱으로 커져, "정확히 친 제목"(공백 있음)이
공백 없는 경쟁 항목에게 순위를 내주는 역전이 있었다 (lightseek 실데이터에서 10079 vs 10609).

이를 해소하는 타겟 축 옵션이 추가됐다:

```ts
preprocessTarget(input, { whitespace: "transparent" })  // 기본값은 "keep" (기존 동작)
```

- **U+0020만** grapheme으로 방출하지 않는다 (탭/NBSP/`_`/`-`/`.`는 그대로) — 쿼리
  `"ignore"`가 제거하는 것과 정확히 대칭.
- 공백을 가로지르는 매치가 연속 run으로 스코어링되고, 공백 다음 글자는 단어 경계
  보너스(+20)를 받는다.
- 하이라이트 좌표는 원문 기준 유지: 매치가 공백을 가로지르면 내부 공백 포함 단일 range,
  공백 앞에서 끝나면 공백 미포함.
- 검증된 수치 (기본 가중치, 쿼리 `"수당지급규정"`): `"수당 지급 규정"` keep 2086 →
  transparent 2534, `"수당지급규정집"` 2493 불변 → 역전 해소.

## 2. 의존성

- `main`에 머지 완료: `"fuzzly": "github:mundi4/fuzzly"` 재설치로 반영
  (prepare 스크립트가 설치 시 dist를 빌드한다).
- `PREPROCESS_VERSION`이 **2 → 3**으로 bump됨 (`Target.whitespace` 필드 추가).
- `Target`에 자기서술 필드 `whitespace: "keep" | "transparent"`가 생겼다 (직렬화 가능).
  **주의**: 같은 버전 3 안에서 두 모드가 공존하므로 버전만으로 모드 구분이 안 된다 —
  IDB meta에는 `(PREPROCESS_VERSION, 사용 모드)` 쌍을 기록하고 둘 중 하나라도 불일치하면
  재인덱싱할 것.

## 3. 작업 순서 — ⚠️ 3.1을 건너뛰고 전환부터 하지 말 것

### 3.1 실데이터 역전 검증 + join 구분자 결정 (선행 필수)

`buildItemIndex`의 `joined`가 **세그먼트를 공백으로 join하고 있다면 transparent가 세그먼트
경계 자체를 지운다** — 문제였던 "조상 세그먼트 + 잎 조립" 경쟁 매치도 똑같이 연속 run
제곱 보너스를 받게 되어 역전이 안 풀리거나 새 역전이 생길 수 있다.

1. 브랜치 fuzzly를 설치하고, 문제의 실데이터 쌍(10079 vs 10609가 나온 쿼리 + 두 항목의
   joined 문자열)을 `preprocessTarget(joined, { whitespace: "transparent" })` + 기존 scoring
   config로 직접 매치해 순위가 뒤집히는지 확인한다.
2. 구분자가 공백이라 역전이 안 풀리면(또는 예방 차원에서) 구분자를 **`_` / `-` / `.` 중
   하나**로 교체한다 — 이들은 투명화되지 않으면서 다음 grapheme에 boundary 보너스를
   유발한다(공백과 동급 경계 신호 유지 + 인덱스 소비로 세그먼트 간 연속 run 차단).
   피해야 할 것: `/`(boundary 유발 세트에 없어 경계 보너스 소실), `\n`(atom ID 10 = `ㅅ`과
   충돌 — fuzzly AGENTS.md의 필드 concat 금지 사유), 탭(마찬가지로 codepoint atom).
   구분자를 바꾸면 그 자체로도 재인덱싱 사유다.

### 3.2 buildItemIndex 전환

```ts
preprocessTarget(joined, { whitespace: "transparent" })
```

lightseek는 prebuilt Target을 IDB에 저장했다가 searcher에 `target` supplier로 공급하는
구조이므로 위 직접 호출 경로가 맞다. (참고: searcher가 `key`로 내부 전처리하는 구조였다면
`SearcherOptions.targetWhitespace: "transparent"`가 대응 옵션 — `target` supplier 공급 시에는
이 옵션이 관여하지 않는다.)

### 3.3 IDB 재인덱싱

- meta 레코드에 `(PREPROCESS_VERSION, mode, 구분자)` 기록, 로드 시 불일치 → 전체 재전처리.
- v2로 저장된 Target을 그대로 hydrate해도 fuzzly는 깨지지 않고 keep으로 취급하지만
  (모든 분기가 `whitespace === "transparent"` 비교), 좌표계·모드가 의도와 다르므로
  반드시 재인덱싱을 강제할 것.

### 3.4 회귀 확인

- 역전 케이스: 공백 있는 near-exact 제목이 1위로 복귀하는지.
- 하이라이트 UI: 공백을 가로지르는 매치가 **내부 공백 포함 단일 range**로 오는지 렌더
  확인 (기존에 range가 공백에서 끊기던 것과 시각적으로 달라짐 — 의도된 동작).
- 키스트로크 시퀀스(prefix 성장 + 백스페이스)에서 결과 일관성 (fuzzly 쪽 세션 재사용은
  쿼리 축이라 영향 없음이 검증됐지만, lightseek 통합 경로 한 번 확인).

## 4. 계약/함정 (fuzzly 쪽에서 확정된 사항)

| 항목 | 내용 |
| --- | --- |
| 쿼리 모드 | `whitespace: "ignore"`(현행) 또는 `"split"`과 조합. **`"preserve"` 쿼리(공백 포함)는 transparent 타겟에 구조적으로 매치 불가** (dev 모드 warn-once) |
| literal 경로 | 원문 raw substring 그대로 — 공백 포함 literal도 매치된다. 공백 위치의 하이라이트는 이웃 grapheme 기준 (수용된 edge) |
| 길이 페널티 | `targetLengthPenalty × T`의 T(graphemeCount)가 **공백을 세지 않는다** — 공백 많은 타겟의 상대 점수가 오르는 방향. near-exact에서는 단어 경계당 +20이 추가로 붙어 공백 있는 제목이 공백 없는 동일 내용보다 약간 높게 나온다 (의도된 시맨틱) |
| `createGraphemeBonuses` | transparent 좌표 처리 반영 완료 — range 양 끝의 스킵 공백을 수축해 bonus가 다음 단어로 번지지 않는다 |
| 입력 제한 | 65535 UTF-16 코드유닛, **공백 포함 원문 길이 기준** (기존과 동일) |
| keep 하위호환 | 옵션 미지정 출력은 기존과 동일 (+ `whitespace: "keep"` 필드) — 전환 전 코드는 무영향 |

## 5. 문의

fuzzly 쪽 상세는 저장소의 AGENTS.md "whitespace 모드" 절과
`test/transparentWhitespace.test.ts`(34개 케이스)가 canonical 레퍼런스다.
