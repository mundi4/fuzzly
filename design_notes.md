# fuzzly 설계 노트 — monotonic 원칙 감사

> **Status**: 초안 / 논의 진행 중 / 미구현
>
> 이 문서는 fuzzly의 monotonic narrowing 철학을 잣대 삼아 기존·신규 feature를 감사한 기록이다. 현재는 분석 단계이며 실제 코드 변경은 아직 없다. 나중에 이어서 결정 사항들을 확정하고 구현할 예정.

## 배경

fuzzly의 핵심 UX 계약:

> "키를 추가할 때마다 결과셋은 단조 감소한다 (monotonic narrowing). 이미 보고 있던 결과 중 일부가 사라지는 것만 허용되고, 다른 종류로 바뀌는 것은 원칙 위배."

이 계약으로 다음 두 기능을 재검토했다:

- **리터럴 기능 (`"..."` wrapping)**: 부분적으로 위배. 수정 필요.
- **imeSwap (한/영 자동 변환)**: 조건부 활성화 형태는 위배. 다른 형태는 허용 가능.

더불어 향후 feature 제안을 1차 필터링할 수 있는 **일반화된 원칙**을 도출했다.

---

## 공통 실패 모드: "조건부 reinterpretation"

두 feature(`literal`의 `"..."` 감지, `imeSwap auto fallback`)는 같은 병의 다른 증상이다.

**공통 패턴**:
- step N: 해석 A로 평가 → 결과 R_N
- step N+1: 조건이 바뀌어 해석 B로 전환 → 결과 R_{N+1}
- R_{N+1}은 R_N의 subset이 아닐 수 있음 (disjoint 가능)

이건 fuzzly의 핵심 철학과 정면 충돌:
> "키를 추가할 때마다 **이미 보고 있던 결과 중 일부가 사라지는** 것만 허용. **다른 종류로 바뀌는** 건 원칙 위배."

조건부 reinterpretation은 **autocomplete 영역**이지 monotonic narrowing 영역이 아니다.
- Autocomplete: "사용자 의도 추측" → interpretation 갈아치워도 OK
- Monotonic search: "사용자가 친 것에 부합하는 집합 좁히기" → interpretation 고정

---

## 핵심 refinement — Implicit vs Explicit modality

"literal 제거"라고 뭉쳐 말하기 쉽지만, 실은 **두 개의 별개 문제**다:

1. **`"..."` wrapping으로 쿼리 문자열에서 암묵적으로 모드 감지** — 위배. 사용자가 모드 전환을 인지할 수 없음.
2. **Literal이라는 검색 모드 자체가 존재** — 위배 아님. UI 토글 버튼은 **명시적 상태 전환**이라 결과 변화가 드라마틱해도 사용자가 원인을 이해.

올바른 결론:

- `"..."` 감지는 **제거**
- literal **모드**는 **API 옵션으로 유지 가능**
- 모드 전환은 쿼리 문자열 **외부**에서 일어나야 함 (search 호출 시 옵션 전달)

### 비유: VSCode 검색창

- 검색 텍스트 입력: monotonic narrow
- Regex/CaseSensitive/WholeWord 토글 버튼: 누르는 순간 결과가 드라마틱하게 바뀜 → **허용**
- 이유: 버튼은 쿼리 **외부** affordance라 사용자가 인지

fuzzly의 `"..."` 감지는 "검색창 내부에 `/regex/` delimiter를 넣어서 감지하는 나쁜 UI" 패턴.

---

## Case 1: 리터럴 기능

### 현재 동작

`src/buildQuery.ts`는 쿼리 문자열이 `"..."`로 감싸진 형태면 substring 매칭(literal) 모드로 해석하고, 그렇지 않으면 fuzzy 매칭으로 해석한다. 추가로 non-literal 쿼리에서는 모든 `"` 문자를 스트립한다.

### 반례 — 타겟 `"a_b_c"` (흔한 변수명·파일명 패턴)

| step | 키스트로크 | `buildQuery` 해석 | `a_b_c` 매치 |
|---|---|---|---|
| 1 | `"` | not literal, strip → 빈 쿼리 | O (전부 매치) |
| 2 | `"a` | fuzzy `a` | O |
| 3 | `"ab` | fuzzy `ab` | O |
| 4 | `"ab"` | **literal `ab`** (substring) | **X** (연속 `ab` 없음) |
| 5 | `"ab"c` | not literal, strip → fuzzy `abc` | **O** |

**4→5** 전환에서 `a_b_c`가 결과에 **다시 등장**. 결과셋 확장. **monotonic 위배 확정**.

### 왜 이 전환만 문제인가

- literal substring ⊂ fuzzy match (strict subset) → `"ab` → `"ab"` 전환은 항상 narrowing
- literal `ab` ⊄ fuzzy `abc` → `"ab"` → `"ab"c` 전환은 narrowing 보장 없음

이미 타이핑된 `ab`의 해석이 substring → scatter로 **재해석**된다. 이게 fuzzly 철학과 정면 충돌.

### literal을 always-on parallel union으로 만들면?

`fuzzy(q) ∪ literal(q)` = `fuzzy(q)` — literal ⊂ fuzzy이므로 literal이 아무것도 기여하지 못한다.
→ **parallel 형태로는 무의미.** literal은 explicit mode로만 가치가 있다.

### 제거 vs 재설계 — 올바른 분할

- **`"..."` 감지**: 제거 (implicit reinterpretation 패턴)
- **`"` 스트립**: 제거 (`"`는 일반 문자가 되어 "`"`를 검색하고 싶다"는 기존 code comment 이슈도 해소)
- **literal 모드 자체**: explicit API 옵션으로 유지 가능

### 제안된 API 형태

사용자 요청: *"리터럴 모드가 가능하려면 쿼리문자열로부터 리터럴을 체크해서 활성할지 결정할 게 아니라 api를 호출할 때 옵션으로 받아야함. 구현예: 입력상자에서 특정 키를 누르든지 버튼 토글하면 리터럴 모드를 켜서 그 on/off 상태를 넘겨줘야함."*

```ts
interface Searcher {
    search(query: string, options?: { mode?: "fuzzy" | "literal" }): SearchResult[];
}

// 사용 예
const searcher = createSearcher(items);
searcher.search("안녕");                              // fuzzy (기본)
searcher.search("안녕", { mode: "literal" });         // UI 토글 켜졌을 때
searcher.search("안녕");                              // 토글 해제, fuzzy 복귀
```

**선택 근거**:
- Target 캐시가 모드 변경에도 살아남음 (Searcher 재생성 불필요)
- UI state와 1:1 매핑
- 4함수 로우레벨 API에는 영향 없음

**거부한 형태**:
- `createSearcher(items, { mode })` — 생성 때만 고정. 모드 바꿀 때마다 재생성해야 해서 target 캐시 재계산. 비쌈.
- `search(q)` + `searchLiteral(q)` 별도 메서드 — UI 토글 바인딩이 어색. 분기가 consumer 쪽으로 밀림.

### 내부 변경 스케치 (구현 시)

- `src/buildQuery.ts`:
  - `"..."` 감지 제거
  - `"` 스트립 제거
  - 항상 fuzzy `Query`만 생성
- `src/types.ts`:
  - `Query.literal: string | null` 필드 **제거** → `Query` shape 단순화, nullable 하나 해소
- `src/match.ts`:
  - literal 분기 제거 — 이 파일은 순수 fuzzy만 처리
  - literal은 별도 함수로 분리: `matchLiteral(target, text): GraphemeIndices | null`
- `src/createSearcher.ts`:
  - `search(query, options?)` 시그니처 확장
  - `options.mode === "literal"`이면 `matchLiteral` 경로로 분기
- 테스트:
  - `buildQuery.test.ts`: literal describe 제거
  - `match.test.ts`: literal describe → `matchLiteral` 테스트로 이동
  - `integration.test.ts`, `createSearcher.test.ts`: explicit mode 토글 케이스 추가

---

## Case 2: imeSwap (한/영 자동 변환)

### 배경

"사용자가 한영키 안 누르고 `gksrmf` 쳐놓고 `한글`을 찾거나, `ㅗ디ㅣㅐ` 쳐놓고 `hello`를 찾는" 시나리오 지원 여부.

### 세 가지 구현 방식

#### (1) auto fallback — "literal 0건일 때만 swap 시도"

타겟: `["good", "great", "한국", "한번"]`

| step | 키 | 평가 | 결과 |
|---|---|---|---|
| 1 | `g` | fuzzy `g` → `{good, great}`. 0건 아님, fallback 스킵 | `{good, great}` |
| 2 | `gk` | fuzzy `gk` → `{}`. 0건이므로 swap `ㅎㅏ` → `{한국}` | `{한국, 한번}` |

**1→2 전환**: `{good, great}` → `{한국, 한번}`, **disjoint**. 키 하나 추가했는데 이전 결과가 전부 사라지고 다른 것들로 교체. 리터럴 반례와 **동형**.

→ **거부**. autocomplete 영역이지 monotonic search 영역이 아님.

#### (2) always-on parallel union — "항상 literal과 swap 둘 다 평가하고 union"

| step | q | fuzzy(q) | swap(q) | fuzzy(swap(q)) | union |
|---|---|---|---|---|---|
| 1 | `g` | `{good, great}` | `ㅎ` | `{한국, 한번}` | `{good, great, 한국, 한번}` |
| 2 | `gk` | `{}` | `ㅎㅏ` | `{한국}` | `{한국}` |

`{한국}` ⊂ `{good, great, 한국, 한번}`. **Monotonic 유지**.

**왜 안 깨지는가**: `swap`은 char-by-char 함수이므로 `q`에 한 글자 추가 = `swap(q)`에 한 원자 추가 → `fuzzy(swap(q_{n+1})) ⊆ fuzzy(swap(q_n))`. 두 monotonic narrowing 함수의 union도 monotonic narrowing. 매 step에서 두 해석을 둘 다 평가하므로 step 간 해석 교체가 없음.

**트레이드오프**: step 1부터 `{한국, 한번}`이 딸려 나오는 **노이즈**. 다만 이건 "짧은 쿼리 = 많은 결과"라는 fuzzly 기존 특성과 같은 종류라 철학 위배는 아님.

→ **opt-in 형태로 허용 가능**.

#### (3) explicit mode toggle — "한/영 변환 버튼 토글"

리터럴 모드와 같은 패턴. 사용자가 UI 버튼으로 명시적으로 한/영 변환 모드를 켜면 search 호출 시 옵션으로 전달.

→ **허용**. 가장 자연스러운 형태일 수 있음. 실제로 일부 한글 도구(Karabiner 한영 변환, IntelliJ 한/영 자동변환)가 이렇게 동작.

### 결론

- (1) 거부
- (2) / (3) 허용, 어느 쪽을 구현할지 추후 결정
- 내 권장은 "일단 안 함, 수요가 생기면 (3)부터"

---

## 일반화된 원칙 — Feature 감사 기준

```
Monotonic narrowing은 "단일 모드 내에서" 적용된다.
모드 전환은 다음 조건을 모두 만족하면 정당하다:
  (a) 쿼리 문자열 내용과 독립적으로 trigger됨
  (b) 쿼리 문자열 외부의 명시적 user action (버튼/키/API 옵션) 으로 trigger됨
  (c) 사용자가 현재 모드를 UI 상으로 인지할 수 있음
```

`"..."` 감지 = (a)(b) 둘 다 위반 → 제거
UI 토글 버튼 = 셋 다 충족 → 허용

### Feature 심사 1차 필터

fuzzly에 새 feature 제안이 들어오면 다음 순서로 심사:

1. **쿼리 문자열에서 모드를 감지하는가?**
   - 예 → **거부** (implicit reinterpretation)

2. **모든 키스트로크에서 같은 방식(동일 모드)으로 평가되는가?**
   - 아니오 (조건부 활성화, auto fallback 등) → **거부** (autocomplete 영역)
   - 예외: 사용자가 명시적 action으로 모드를 바꿨을 때는 OK

3. **always-on parallel union 형태로 짤 수 있는가?**
   - 가능하고 기여가 있음 → 채택 후보 (트레이드오프는 노이즈)
   - 가능하지만 기여 없음 → 불필요 (ex: literal은 fuzzy의 strict subset이라 parallel로 짤 이유 없음 → explicit mode로만 존재)
   - 불가능 → explicit mode toggle만 가능

4. **parallel / 모드 형태가 각각 독립적으로 monotonic하게 narrow하는가?**
   - 각 해석이 monotonic이고 union도 monotonic인지 case-by-case 검증

### 이 원칙이 해결하는 것들

- **리터럴**: `"..."` 감지 제거. literal 모드는 explicit API 옵션으로만 유지.
- **imeSwap**: auto fallback 거부. parallel union / explicit toggle 허용.
- **향후 오타 교정(typo correction)**: 보통 조건부 활성화 → 거부. parallel로 짜면 노이즈 심함 → 아마 거부.
- **향후 동의어 확장** (한↔영 번역 매칭 등): parallel로 짜면 monotonic 유지되지만 스코프 의문.

### 이 원칙이 건드리지 않는 것들

- `tailSpillover`, `remainder` 옵션: 매칭 알고리즘 내부의 단일 해석을 변조할 뿐 쿼리를 재해석하지 않음. 모두 OK.
- `caseSensitive`: 쿼리/타겟 생성 시점에 고정, 런타임 재해석 없음. OK.
- `whitespace` (이미 API 개편에서 타입 제거): 해당 없음.

---

## 미결정 사항 (나중에 이어서)

1. **리터럴**: `"..."` 감지 제거 + explicit `mode` 옵션으로 유지 vs 완전 제거
2. **API 형태**: `search(q, { mode })` 확정 여부
3. **imeSwap**: 구현 안 함 / parallel union opt-in / explicit mode toggle 중 택일
4. **원칙 문서화**: `CLAUDE.md`에 "Implicit modality 금지" 섹션을 정식 추가할지
