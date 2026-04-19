# fuzzly — 매칭 규칙 스펙 (Draft)

> **Status: DRAFT**
> 이 문서는 확정 명세가 아니다. 한글 IME 입력은 계속 새로운 엣지케이스가 발견되는 영역이므로, 현재 문서는 **지금 시점의 동작을 기록한 스냅샷**이다.
>
> 새 엣지케이스가 발견되면 기존 규칙이 수정되거나 예외가 추가될 수 있다. 특히 compound jongseong, IME 축약 상태, 공백과 composing 경계는 앞으로도 변경 가능성이 있다.

---

## 1. 가장 우선순위가 높은 대전제

이 문서는 세부 옵션보다 먼저, 아래 대전제를 만족시키기 위한 규칙을 정의한다.

### 1.1 타이핑할수록 결과는 늘어나면 안 된다

사용자가 한 글자를 더 입력했을 때 검색 결과가 갑자기 늘어나면 안 된다. 결과는 유지되거나 줄어들어야 한다.

- 기대: `"ㅁ"` → `"마"` → `"막"` 으로 갈수록 결과는 좁혀진다.
- 금지: `"막"`에서는 안 보이던 결과가 `"막ㅇ"`에서 새로 생긴다.

이 문서의 다른 규칙은 전부 이 성질을 깨지 않도록 설계된다.

### 1.2 IME 조합 중간상태도 유효한 검색어다

한글은 완성 글자가 되기 전에 여러 중간상태를 거친다. 이 중간상태도 검색에 써야 한다.

타겟이 `"막연하게"`일 때, 아래는 모두 유효한 쿼리다.

```text
ㅁ
마
막
막ㅇ
막여
막연
막엲
막엲ㄱ
막연하
막연학
막연하게
```

즉 이 라이브러리는 완성 글자 매칭만 하는 것이 아니라, IME journey 전체를 검색 가능한 상태로 본다.

### 1.3 사용자는 모음이나 받침 자체를 독립적으로 검색한다고 가정하지 않는다

이 문서의 기본 가정은 다음과 같다.

- 초성-only 입력은 "초성 검색 의도"로 해석한다.
- 모음이 들어간 한글 grapheme은 "그 음절 자체를 찾으려는 의도"로 본다.
- 받침은 독립 목표가 아니라, 현재 음절의 일부이거나 다음 음절 초성으로 넘어가려는 입력 중간상태일 수 있다.

그래서 모음과 받침은 초성과 다르게 취급한다.

### 1.4 finalized와 composing은 같은 엄격도로 취급하지 않는다

모음이 들어간 한글 grapheme이 이미 확정(finalized)되었으면 더 엄격하게 본다. 반대로 조합 중(composing)이면 IME journey를 살리기 위해 더 관대하게 본다.

대표 예시:

- `"으"` finalized → `"은"` 매치 안 됨
- `"으"` composing → `"은"` 매치 됨

### 1.5 초성매치는 "초성만 입력한 경우"보다 넓은 의도다

초성매치는 단순히 `"ㅁㅇㅎㄱ"`처럼 초성-only 쿼리만 허용하는 기능이 아니다. 사용자가 완전한 음절을 입력하지 않았더라도, 그 입력을 **초성 의도로 관대하게 해석해 복원하는 것 전체**가 초성매치다.

그래서 `allowChoseongMatch`가 켜져 있을 때는 다음이 함께 허용된다.

- `"ㅁㅇㅎㄱ"` → `"막연하게"` 같은 순수 초성-only 매치
- `"막엲ㄱ"` → `"막연하게"` 같은 IME 축약 복원형 초성매치

반면 `"막ㅇ"`, `"막엲"`, `"막연학"` 같은 composing journey는 초성매치와 겹치는 부분이 있어도 별도의 관대한 입력 규칙으로 계속 살리고 싶을 수 있다.

따라서 초성 의도를 어디까지 허용할지는 별도 옵션으로 분리된다.

---

## 2. 용어

| 용어                   | 의미                                                              |
| ---------------------- | ----------------------------------------------------------------- |
| **grapheme**           | 사용자가 문자 하나처럼 보는 단위. 예: `막`, `ㄱ`, `a`, `😊`       |
| **atom**               | 내부 매칭 최소 단위. 한글 자모, ASCII, 기타 문자 각각에 할당된 ID |
| **lead**               | 초성 atom                                                         |
| **vowel**              | 중성 atom                                                         |
| **tail**               | 종성 atom                                                         |
| **compound jongseong** | `ㄶ`, `ㄺ`, `ㅄ` 같이 tail이 두 자음인 종성                       |
| **anchor**             | 현재 쿼리 grapheme이 붙는 target grapheme                         |
| **spill**              | 쿼리 tail이 anchor를 넘어서 다음 target grapheme 초성으로 가는 것 |
| **anchor extras**      | anchor 내부에서 쿼리가 소비하지 못하고 남은 atom                  |
| **finalized**          | 조합이 끝난 grapheme                                              |
| **composing**          | 현재 조합 중으로 취급되는 grapheme                                |

---

## 3. 규칙 우선순위

아래 규칙은 위에서 아래 순서로 읽으면 된다. 앞 규칙이 더 상위 원칙이다.

### 3.1 모음이 들어간 finalized 한글 grapheme은 strict 하다

모음이 들어간 한글 grapheme이 finalized라면, target anchor와 **구조가 정확히 일치**해야 한다.

허용되지 않는 것:

- anchor 잉여 atom
- tail spill
- vowel의 다른 grapheme 소비

매치되는 예:

- `"으"` → `"으"`
- `"일"` → `"일"`
- `"은행"` → `"은행"`

매치되지 않는 예:

- `"으"` finalized → `"은"`
- `"일"` finalized → `"읽"`
- `"은"` finalized → `"으나"`
- `"은해"` finalized → `"은행"`

핵심 해석은 단순하다. 사용자가 모음까지 입력해서 음절을 확정했다면, 그 음절을 그 구조 그대로 찾으려는 의도로 본다.

### 3.2 모음이 들어간 composing 한글 grapheme은 journey를 위해 관대하다

모음이 들어간 한글 grapheme이 composing이면 다음이 허용된다.

- anchor 내부 lead + vowel 일치
- tail의 일부 또는 전체가 다음 target grapheme 초성으로 spill
- anchor extras 허용, 단 쿼리 tail prefix와 맞아야 함

매치되는 예:

- `"으"` composing → `"은"`
- `"은"` composing → `"으나"`
- `"읽"` composing → `"일기"`
- `"막연학"` → `"막연하게"`

매치되지 않는 예:

- `"염"` → `"연"`
  이유: anchor extras `ㄴ`이 쿼리 tail `ㅁ`과 맞지 않음 (§3.5)

### 3.3 vowel은 절대 spill하지 않는다

모음은 반드시 lead가 붙은 같은 anchor 내부에서만 소비된다. 모음을 다음 grapheme으로 넘겨서 매치시키는 일은 없다.

즉 허용되는 것은 tail spill뿐이다.

### 3.4 spill된 자음은 이후 grapheme들의 초성에만 붙는다

tail spill은 아무 데로나 갈 수 없다. spill된 자음은 **이후 target grapheme들 중 어떤 위치이든 초성 자리로만** 매치될 수 있다. 즉 종성으로는 갈 수 없고, 모음 자리로도 갈 수 없다.

매치되는 예:

- composing인 `"연"` → `"여름 냉면"`
  `연`의 tail `ㄴ`은 바로 다음 grapheme에만 붙는 것이 아니다. `름`과 공백을 건너뛰어, 더 뒤에 있는 grapheme `냉`의 초성으로 spill될 수도 있다.
- `allowChoseongMatch=true`이면 `"막엲ㄱ"` → `"막연하게"`도 매치된다.
  이 경우 `엲`의 compound jongseong은 IME가 축약한 초성 입력의 흔적으로 해석되고, 이어지는 `ㄱ`까지 포함해 초성매치 의도로 복원된다.

매치되지 않는 예:

- `"앍"` → `"알먹"`
  `ㄱ`이 이후 grapheme `먹`의 초성 `ㅁ`과 맞지 않음
- `"앍"` → `"알"`
  spill할 대상 grapheme이 없어서 tail `ㄱ`이 갈 곳이 없음
- `"간"` → `"가마"`
  `ㄴ`이 이후 grapheme `마`의 초성 `ㅁ`과 맞지 않음. `ㅁ`을 종성으로 받아줄 수 있는 자리는 없다.

### 3.5 anchor extras는 쿼리 tail prefix와 정확히 맞아야 한다

composing 한글 grapheme을 완화해서 볼 때도, anchor 내부에 남는 atom은 그냥 무시되지 않는다. 그것이 쿼리 tail의 앞부분과 정확히 맞을 때만 허용된다.

**단, 이 규칙은 쿼리 grapheme이 자체 tail을 가질 때만 적용된다.** 쿼리 grapheme에 tail이 없으면 anchor 잉여 atom은 자유롭게 허용된다. 예: `"으"` composing → `"은"`에서 anchor `은`의 잉여 `ㄴ`은 쿼리 tail이 없으므로 그냥 넘어간다.

매치되는 예:

- `"읽"` → `"일기"`
  anchor `일`의 잉여 `ㄹ`이 쿼리 tail prefix `ㄹ`과 일치
- `"앍"` → `"알고"`
  anchor `알`의 잉여 `ㄹ`이 쿼리 tail prefix `ㄹ`과 일치
- `"으"` composing → `"은"`
  쿼리 tail 없음 → anchor 잉여 `ㄴ` 무조건 허용

매치되지 않는 예:

- `"염"` → `"연"`
  anchor 잉여 `ㄴ` ≠ 쿼리 tail `ㅁ`
- `"염"` → `"막연하게 평범한 머그컵"`
  `연`을 anchor로 잡고 `ㅁ`을 spill하더라도, anchor 안에 쿼리와 대응되지 않는 잉여 atom `ㄴ`이 남아 실패
- `"갉각"` → `"각각"`
  compound 완화가 켜져도 anchor extras prefix가 맞지 않아 실패

### 3.6 초성매치는 별도의 정책으로 다룬다

초성매치는 모음 없이 자음만 입력한 경우만 뜻하지 않는다. 사용자의 입력을 완전한 음절 매치가 아니라 **초성 의도로 관대하게 해석하는 규칙 전체**를 뜻한다.

그 대표적인 경우가 초성-only 쿼리다. 초성-only 쿼리란 모음 없이 자음만 있는 쿼리다.

예:

- `"ㅁ"`
- `"ㅇㅎ"`
- `"ㅁㅇㅎㄱ"`

초성-only 쿼리에 대한 기본 동작은 다음과 같다.

- 각 자음은 target grapheme의 초성과 순서대로 매치된다.
- spillMode나 composingIndex의 영향을 받지 않는다.
- 다만 `allowChoseongMatch=false`면 finalized 초성-only는 거부된다.

여기서 말하는 `allowChoseongMatch`는 순수 초성-only 쿼리만 제어하는 것이 아니다. `"막엲ㄱ"`처럼 IME가 compound jongseong으로 축약해버린 입력을 원래의 초성 의도로 복원하는 동작도 함께 제어한다.

매치되는 예:

- `"ㅇㅎ"` → `"은행"`
- `"ㅁㅇㅎㄱ"` → `"막연하게"` (`allowChoseongMatch=true`)
- `"막엲ㄱ"` → `"막연하게"` (`allowChoseongMatch=true`)

매치되지 않는 예:

- `"ㅁㅇㅎㄱ"` → `"막연하게"` (`allowChoseongMatch=false`)
- `"막엲ㄱ"` → `"막연하게"` (`allowChoseongMatch=false`)
- `"ㅁㅇㅎㄱ"` + 마지막만 composing → 여전히 앞의 finalized 초성-only가 막혀 실패

### 3.7 compound jongseong은 IME 축약 복원 대상으로 본다

`allowChoseongMatch=true`일 때, finalized grapheme 안에 compound jongseong이 있으면 이 grapheme은 strict finalized가 아니라 **복원 가능한 중간상태**로 간주한다.

이 규칙은 현재 다음처럼 읽는 것이 맞다.

- compound jongseong이 있으면, 사용자가 연속 자모를 쳤다가 IME가 축약한 흔적으로 본다
- 그래서 해당 grapheme은 composing처럼 완화해서 본다
- 이 완화는 `composingIndex`나 `spillMode`와 무관하게 적용된다

매치되는 예:

- `"막엲ㄱ"` → `"막연하게"`
- `"막엲ㄱ"` + `composingIndex=null` → `"막연하게"`
- `"엲"` + `composingIndex=null` → `"연하"`
- `"앓ㄱ"` → `"알하고"`
- `"막엲고"` → `"막연하고"`

매치되지 않는 예:

- `"엲ㄱ"` → `"염가"`
  anchor extras prefix가 맞지 않음
- `"엲고ㄱ"` → `"연고기"`
  spill될 `ㅎ`이 다음 grapheme `고`의 초성 `ㄱ`과 맞지 않음
- `"막엲ㄱ"` → `"막연하게"` (`allowChoseongMatch=false`)
  compound 복원 자체가 비활성화됨

### 3.8 non-Hangul은 strict exact로 본다

ASCII, 이모지 등 non-Hangul은 기본적으로 exact atom match다.

매치되는 예:

- `"abc"` → `"abc"`
- `"a으"`에서 `a` 부분은 exact

매치되지 않는 예:

- `"ab"` → `"a b"` (`whitespace=literal`일 때)

---

## 4. 옵션에 따라 결과가 달라지는 규칙

이 섹션은 API 설명이 아니라, 옵션값에 따라 어떤 매치 결과가 나오는지만 정리한다.

### 4.1 `spillMode`

| 값                  | 해석                                                           |
| ------------------- | -------------------------------------------------------------- |
| `"always"`          | 모든 한글 grapheme을 composing처럼 본다                        |
| `"composing"`       | `composingIndex`가 가리키는 grapheme만 composing으로 본다      |
| `"composingOrLast"` | `composingIndex`가 없으면 마지막 grapheme만 composing으로 본다 |

대표 예시: 쿼리 `"은"`, 타겟 `"으나"`

| 설정                                                      | 결과       | 이유                                |
| --------------------------------------------------------- | ---------- | ----------------------------------- |
| `spillMode="always"`, `composingIndex=null`               | 매치 됨    | 모든 grapheme이 composing 취급      |
| `spillMode="composing"`, `composingIndex=null`            | 매치 안 됨 | 조합중인 grapheme이 없으므로 strict |
| `spillMode="composing"`, `composingIndex=0`               | 매치 됨    | 첫 grapheme만 composing             |
| `spillMode="composingOrLast"`, `composingIndex=undefined` | 매치 됨    | 마지막 grapheme 자동 composing      |
| `spillMode="composingOrLast"`, `composingIndex=null`      | 매치 안 됨 | 명시적으로 조합중 없음              |

### 4.2 `composingIndex`

`composingIndex`는 UTF-16 char index 기준의 현재 조합 위치다.

대표 예시: 쿼리 `"a으"`, 타겟 `"a은"`

| 설정                | 결과       | 이유                                     |
| ------------------- | ---------- | ---------------------------------------- |
| `composingIndex=1`  | 매치 됨    | `으`가 composing으로 해석됨              |
| `composingIndex=0`  | 매치 안 됨 | `a`만 composing, `으`는 finalized strict |
| `composingIndex=5`  | 매치 안 됨 | 범위 밖이면 조합중 없음 취급             |
| `composingIndex=-1` | 매치 안 됨 | 범위 밖이면 조합중 없음 취급             |

멀티 grapheme 예시: 쿼리 `"으해"`, 타겟 `"은행"`

| 설정                  | 결과       | 이유                                           |
| --------------------- | ---------- | ---------------------------------------------- |
| `composingIndex=null` | 매치 안 됨 | `으` finalized가 `은`과 strict 불일치          |
| `composingIndex=1`    | 매치 안 됨 | `해`만 composing이어도 첫 grapheme `으`가 막음 |
| `composingIndex=0`    | 매치 안 됨 | 둘째 grapheme `해`가 `행`과 strict 불일치      |

### 4.3 `allowChoseongMatch`

| 값      | 해석                                                       |
| ------- | ---------------------------------------------------------- |
| `true`  | 초성-only 검색 허용, compound jongseong 복원 허용          |
| `false` | finalized 초성-only 거부, compound jongseong 복원 비활성화 |

대표 예시: 타겟 `"막연하게"`

| 쿼리                        | `true`  | `false`    |
| --------------------------- | ------- | ---------- |
| `"ㅁㅇㅎㄱ"`                | 매치 됨 | 매치 안 됨 |
| `"막엲ㄱ"`                  | 매치 됨 | 매치 안 됨 |
| `"막엲"`                    | 매치 됨 | 매치 됨    |
| `"막연학"`                  | 매치 됨 | 매치 됨    |
| `"ㅁ"` + `composingIndex=0` | 매치 됨 | 매치 됨    |

여기서 중요한 점은 `false`가 모든 IME journey를 끄는 옵션이 아니라는 것이다. 끄는 것은 초성 검색 의도와 compound 복원이고, composing journey 자체는 유지한다.

### 4.4 `whitespace`

| 값          | 해석                            |
| ----------- | ------------------------------- |
| `"literal"` | 공백도 실제 문자로 본다         |
| `"ignore"`  | 쿼리의 공백만 제거하고 매치한다 |

대표 예시:

| 쿼리        | 타겟              | 설정      | 결과       |
| ----------- | ----------------- | --------- | ---------- |
| `"a b"`     | `"ab"`            | `literal` | 매치 안 됨 |
| `"a b"`     | `"ab"`            | `ignore`  | 매치 됨    |
| `"ab cd"`   | `"abcdef"`        | `ignore`  | 매치 됨    |
| `"한국 문"` | `"한국어 문자열"` | `ignore`  | 매치 됨    |
| `"ㅍ ㄱ"`   | `"파일 검색"`     | `ignore`  | 매치 됨    |

추가 규칙:

- `ignore`는 쿼리 공백만 제거한다. target 공백을 특별히 지워서 비교하는 것은 아니다.
- `ignore`에서도 `composingIndex`는 원본 문자열 좌표 기준으로 넘긴다.
- 공백 위치를 가리키는 `composingIndex`는 다음 non-space grapheme 또는 조합중 없음으로 해석될 수 있다.

### 4.5 `literal=true`

literal 모드는 퍼지 규칙을 타지 않는다. substring 매치만 본다.

즉 아래 옵션들은 literal 경로에서는 의미가 없다.

- `spillMode`
- `composingIndex`
- `allowChoseongMatch`
- `whitespace`

예시:

- literal `"안녕"` → `"안녕하세요"`: 매치 됨
- literal `"안 녕"` → `"안녕하세요"`: 매치 안 됨
- fuzzy `"ㅇㄴ"` → `"안녕하세요"`: 매치될 수 있음

---

## 5. 대표 시나리오

### 5.1 strict vs composing

타겟 `"은"`

| 쿼리   | 설정                      | 결과       |
| ------ | ------------------------- | ---------- |
| `"으"` | `composingIndex=null`     | 매치 안 됨 |
| `"으"` | `composingIndex=0`        | 매치 됨    |
| `"으"` | 기본값(`composingOrLast`) | 매치 됨    |

### 5.2 tail spill 허용/금지

| 쿼리             | 타겟     | 결과       | 설명                       |
| ---------------- | -------- | ---------- | -------------------------- |
| `"은"` finalized | `"으나"` | 매치 안 됨 | finalized tail spill 금지  |
| `"은"` composing | `"으나"` | 매치 됨    | composing tail spill 허용  |
| `"앍"`           | `"알고"` | 매치 됨    | `ㄱ`이 다음 초성으로 spill |
| `"앍"`           | `"알먹"` | 매치 안 됨 | spill이 다음 초성에 실패   |

### 5.3 compound jongseong 복원

| 쿼리       | 타겟         | 설정                       | 결과       |
| ---------- | ------------ | -------------------------- | ---------- |
| `"막엲ㄱ"` | `"막연하게"` | 기본값                     | 매치 됨    |
| `"막엲ㄱ"` | `"막연하게"` | `composingIndex=null`      | 매치 됨    |
| `"막엲ㄱ"` | `"막연하게"` | `allowChoseongMatch=false` | 매치 안 됨 |
| `"엲"`     | `"연하"`     | `composingIndex=null`      | 매치 됨    |

### 5.4 IME journey 전체 유지

타겟 `"텍스트"`에 대해, 실제 IME journey에서 얻은 상태들은 정확한 `composingIndex`를 넘기면 모두 매치되어야 한다.

반대로 같은 상태들에 `composingIndex=null`을 강제로 넣으면, 중간 어딘가에서 실패하는 단계가 반드시 생긴다. 이 차이가 바로 composing 정보의 존재 이유다.

### 5.5 삭제(backspace)

두 경로를 모두 허용한다.

- whole-char 삭제: `"텍스트"` → `"텍스"` → `"텍"`
- composition 유지 삭제: IME journey 역순 상태들

둘 다 올바른 composing 정보가 들어오면 매치되어야 한다.

---

## 6. 아직 불안정한 영역

이 섹션은 draft 문서에서 특히 자주 바뀔 가능성이 높은 부분이다.

### 6.1 compound jongseong의 실제 IME 발생 형태

- `"엲고"` 같은 문자열이 실제 IME에서 어떤 상태로 나타나는지 플랫폼마다 다를 수 있다.
- 현재 규칙은 테스트 기반으로 고정되어 있지만, 실제 브라우저/OS 로그를 더 수집하면 바뀔 수 있다.

### 6.2 공백과 composing 경계

- `whitespace="ignore"`에서 공백 위치의 `composingIndex`를 어떻게 해석할지 여전히 애매한 케이스가 있다.
- trailing 공백 뒤 trim 처리와 IME finalize 타이밍이 겹치면 caller 계약이 더 정교해질 수 있다.

### 6.3 초성 검색과 compound 복원의 결합

- 지금은 `allowChoseongMatch=false`가 compound 복원까지 함께 끈다.
- 이는 현재로서는 가장 일관적이지만, 앞으로 "초성-only는 금지하고 compound 복원만 허용" 같은 요구가 생기면 규칙이 분리될 수 있다.

### 6.4 non-Hangul normalization

- 현재는 한글 중심 규칙이고, 비한글은 대부분 exact에 가깝다.
- full-width/half-width, Unicode normalization, locale casing 정책은 나중에 달라질 수 있다.

---

## 7. non-goals

다음은 현재 이 문서의 범위 밖이다.

- 형태소/의미 기반 검색
- 일반 오타 보정
- 한글 외 스크립트에 대한 한글 수준의 조합형 퍼지 규칙
- 표준 랭킹 정책 확정

---

## 8. 유지 규칙

새 엣지케이스를 발견하면 다음 순서로 다룬다.

1. 먼저 이 문서의 대전제와 충돌하는지 본다.
2. 충돌하지 않으면 규칙 본문에 예시를 추가한다.
3. 충돌하면 기존 규칙을 수정하고, 이 문서 상단의 draft 성격에 맞게 변경 사실을 기록한다.

이 문서는 구현 설명서가 아니라 **매칭 정책 문서**다. 구현은 바뀔 수 있지만, 구현을 바꿀 때도 먼저 여기의 대전제와 예시를 기준으로 판단한다.
