# 다중 소스 어댑터 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 아트누리 외에 KOCCA(한국콘텐츠진흥원) 공고를 소스 어댑터 구조로 수집해 예술지원사업 캘린더에 중복 없이 등록한다.

**Architecture:** `sources/` 디렉터리의 소스별 어댑터가 `fetchAll()`로 공통 스키마 배열을 반환하고, auto.js가 어댑터 배열을 순회하며 등록한다. 중복 방지는 2단계 — 이벤트 설명의 네임스페이스 ID 라인(1단계), 시작일 ±1일 범위의 제목 유사도 비교(2단계).

**Tech Stack:** Node.js 24 (CommonJS), axios, cheerio, googleapis, node:test (내장 테스트 러너)

**Spec:** `docs/superpowers/specs/2026-07-21-multi-source-adapters-design.md`

## Global Constraints

- 기존 파일 호환: `crawler.js`·`index.js`·`cleanup.js`는 수정하지 않는다 (index.js 등이 crawler.js를 require).
- 아트누리 ID 라인은 기존 형식 `ID: CRL3569` 유지 (이미 등록된 캘린더 이벤트와 호환). 신규 소스만 `ID: KOCCA:xxx` 네임스페이스.
- 대상 캘린더: auto.js의 `CALENDAR_ID` (55003b5c...@group.calendar.google.com), 변경 없음.
- launchd 설정(`com.hwangtab.artcrawler.plist`) 변경 없음 — 진입점 auto.js 동일.
- 모든 어댑터는 단독 실행 가능해야 한다: `node sources/<name>.js` → 수집 결과 출력.
- 유사도 임계값: bigram Jaccard ≥ 0.75, 포함관계 판정은 정규화 후 10자 이상일 때만.
- KOCCA 수집 카테고리: 1(자유공모)·2(지정공모)·3(모집공고). 4(종료된사업) 제외.
- 테스트는 node:test 내장 러너 (`npm test` = `node --test test/`). 새 의존성 추가 금지.

## 파일 구조

| 파일 | 책임 |
| :--- | :--- |
| `lib/titleSimilarity.js` (신규) | 제목 정규화 + 유사도 판정 (순수 함수) |
| `sources/artnuri.js` (신규) | crawler.js 래핑 → 공통 스키마. 날짜없음·대관 필터 |
| `sources/kocca.js` (신규) | KOCCA 목록 파싱, 키워드 필터, 공통 스키마 |
| `calendar.js` (수정) | `findDuplicate()` 추가 (기존 `findEvent()`는 유지) |
| `auto.js` (수정) | SOURCES 배열 순회, 소스별 통계 |
| `test/*.test.js` (신규) | 순수 함수·파싱·중복판정 테스트 |
| `package.json` (수정) | test 스크립트 |

공통 스키마 (어댑터 → auto.js):

```js
{
  sourceKey: 'ARTNURI' | 'KOCCA',
  docId: string,          // 소스 내 고유 ID
  dedupeKey: string,      // 설명 ID 라인에 들어가는 문자열 (ARTNURI는 docId 그대로, KOCCA는 'KOCCA:'+docId)
  title: string,          // 캘린더 제목 완성본
  startDate: 'YYYY-MM-DD',
  endDate: 'YYYY-MM-DD',
  description: string,    // `(ID: ${dedupeKey})` 라인 포함 완성본
}
```

---

### Task 0: 기존 미커밋 작업 커밋 (주 1회 자동 실행)

이전 세션에서 만든 주간 자동 실행 작업이 워킹 트리에 미커밋 상태다. 이번 계획의 커밋들이 깨끗한 diff를 갖도록 먼저 커밋한다.

**Files:**
- 커밋만: `auto.js`, `calendar.js`, `crawler.js`, `com.hwangtab.artcrawler.plist`, `README.md`, `.gitignore`, `package-lock.json`

**Interfaces:**
- Consumes: 없음
- Produces: 이후 모든 Task가 이 커밋 위에서 작업

- [ ] **Step 1: 변경 내용 확인**

Run: `git status --short && git diff --stat`
Expected: auto.js(신규), calendar.js, crawler.js, com.hwangtab.artcrawler.plist(신규), README.md, .gitignore, package-lock.json 변경 확인. 이외 파일이 있으면 멈추고 보고.

- [ ] **Step 2: 커밋**

```bash
git add auto.js calendar.js crawler.js com.hwangtab.artcrawler.plist README.md .gitignore package-lock.json
git commit -m "feat: 주 1회 자동 실행(launchd) 및 마감 공고 수집 중단

- auto.js: 비대화형 실행기 (캘린더 고정, 30분 워치독)
- calendar.js: authorize({interactive:false}) 옵션
- crawler.js: 마감 구간 도달 시 수집 중단 (2000건→182건), 상태·마감일 파싱 수정
- com.hwangtab.artcrawler.plist: 매주 월요일 09:00 launchd 스케줄

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 1: 제목 유사도 유틸 (lib/titleSimilarity.js)

**Files:**
- Create: `lib/titleSimilarity.js`
- Create: `test/titleSimilarity.test.js`
- Modify: `package.json` (test 스크립트)

**Interfaces:**
- Consumes: 없음 (순수 함수)
- Produces: `normalizeTitle(title: string): string`, `isSimilarTitle(a: string, b: string): boolean` — Task 2의 calendar.js가 require

- [ ] **Step 1: 실패하는 테스트 작성**

`test/titleSimilarity.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { normalizeTitle, isSimilarTitle } = require('../lib/titleSimilarity');

test('프리픽스·공백·기호를 제거해 정규화한다', () => {
    assert.strictEqual(
        normalizeTitle('[음악/서울] 2026년 서리풀 뮤직 페스티벌!'),
        '2026년서리풀뮤직페스티벌'
    );
});

test('프리픽스만 다른 같은 공고는 유사 판정한다', () => {
    assert.ok(isSimilarTitle(
        '[KOCCA] 2026년 대중음악 공연환경 개선 지원사업 공고',
        '[음악/전국] 2026년 대중음악 공연환경 개선 지원사업 공고'
    ));
});

test('전혀 다른 공고는 유사 판정하지 않는다', () => {
    assert.ok(!isSimilarTitle(
        '[KOCCA] 2026 스웨덴 게임 컨퍼런스 참가기업 모집',
        '[음악/전국] 2026년 청년예술인 창작지원 공모'
    ));
});

test('한쪽이 다른 쪽에 포함되면 유사 판정한다 (10자 이상)', () => {
    assert.ok(isSimilarTitle(
        '2026년 아르코예술행정아카데미',
        '[문화일반/전국] 2026년 아르코예술행정아카데미 참여자 모집'
    ));
});

test('짧은 문자열의 포함관계는 유사 판정하지 않는다', () => {
    assert.ok(!isSimilarTitle('공모전', '2026년 업사이클 디자인 공모전'));
});

test('빈 제목은 유사 판정하지 않는다', () => {
    assert.ok(!isSimilarTitle('', '2026년 공모'));
});
```

- [ ] **Step 2: package.json에 test 스크립트 추가 후 실패 확인**

`package.json`의 `"scripts"`를 다음으로 교체:

```json
"scripts": {
    "test": "node --test test/"
},
```

Run: `npm test`
Expected: FAIL — `Cannot find module '../lib/titleSimilarity'`

- [ ] **Step 3: 구현**

`lib/titleSimilarity.js`:

```js
/**
 * 소스 간 중복(같은 공고가 다른 소스로 들어오는 경우) 판별용 제목 유사도.
 * 시작일 ±1일 범위의 이벤트끼리만 비교되므로, 회차만 다른 공고(2차/3차)는
 * 접수기간이 달라 애초에 비교 대상에 오르지 않는다.
 */

const SIMILARITY_THRESHOLD = 0.75; // bigram Jaccard 임계값
const MIN_CONTAIN_LENGTH = 10;     // 포함관계 판정 최소 길이 (짧은 제목 오탐 방지)

function normalizeTitle(title) {
    return String(title || '')
        .replace(/\[[^\]]*\]/g, '')       // [장르/지역], [KOCCA] 등 프리픽스 제거
        .toLowerCase()
        .replace(/[^0-9a-z가-힣]/g, '');  // 공백·기호 제거
}

function bigrams(s) {
    const set = new Set();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
}

function jaccard(a, b) {
    if (a.size === 0 || b.size === 0) return 0;
    let inter = 0;
    for (const x of a) if (b.has(x)) inter++;
    return inter / (a.size + b.size - inter);
}

function isSimilarTitle(a, b) {
    const na = normalizeTitle(a);
    const nb = normalizeTitle(b);
    if (!na || !nb) return false;
    const shorter = na.length <= nb.length ? na : nb;
    const longer = na.length <= nb.length ? nb : na;
    if (shorter.length >= MIN_CONTAIN_LENGTH && longer.includes(shorter)) return true;
    return jaccard(bigrams(na), bigrams(nb)) >= SIMILARITY_THRESHOLD;
}

module.exports = { normalizeTitle, isSimilarTitle };
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — 6 tests, 0 failures

- [ ] **Step 5: 커밋**

```bash
git add lib/titleSimilarity.js test/titleSimilarity.test.js package.json
git commit -m "feat: 소스 간 중복 판별용 제목 유사도 유틸

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: calendar.js에 findDuplicate 추가

**Files:**
- Modify: `calendar.js` (상단 require + 클래스 메서드 1개 추가. `findEvent`는 index.js 호환을 위해 그대로 둔다)
- Create: `test/findDuplicate.test.js`

**Interfaces:**
- Consumes: `isSimilarTitle(a, b)` (Task 1)
- Produces: `CalendarService.findDuplicate(calendarId, {dedupeKey, title, startDate}) → Promise<{reason: 'id'|'similar', event} | null>` — Task 5의 auto.js가 호출

- [ ] **Step 1: 실패하는 테스트 작성**

`test/findDuplicate.test.js` (구글 API는 `svc.calendar` 스텁으로 대체):

```js
const { test } = require('node:test');
const assert = require('node:assert');
const CalendarService = require('../calendar');

function stubService(events) {
    const svc = new CalendarService();
    svc.calendar = { events: { list: async () => ({ data: { items: events } }) } };
    return svc;
}

test('ID 라인이 일치하면 reason=id', async () => {
    const svc = stubService([
        { summary: '다른 제목', description: '[지원사업 정보] (ID: KOCCA:ABC123)\n- 접수기간: ...' },
    ]);
    const dup = await svc.findDuplicate('cal', {
        dedupeKey: 'KOCCA:ABC123', title: '아무거나', startDate: '2026-08-01',
    });
    assert.strictEqual(dup.reason, 'id');
});

test('ID는 다르지만 제목이 유사하면 reason=similar', async () => {
    const svc = stubService([
        { summary: '[음악/전국] 2026년 대중음악 공연환경 개선 지원사업 공고', description: '(ID: CRL9999)' },
    ]);
    const dup = await svc.findDuplicate('cal', {
        dedupeKey: 'KOCCA:XYZ', title: '[KOCCA] 2026년 대중음악 공연환경 개선 지원사업 공고', startDate: '2026-08-01',
    });
    assert.strictEqual(dup.reason, 'similar');
});

test('ID·제목 모두 다르면 null', async () => {
    const svc = stubService([
        { summary: '[문학/서울] 창작시 공모전', description: '(ID: CRL1111)' },
    ]);
    const dup = await svc.findDuplicate('cal', {
        dedupeKey: 'KOCCA:XYZ', title: '[KOCCA] 대중음악 공연환경 개선 지원', startDate: '2026-08-01',
    });
    assert.strictEqual(dup, null);
});

test('API 오류 시 null (등록을 막지 않는다)', async () => {
    const svc = new CalendarService();
    svc.calendar = { events: { list: async () => { throw new Error('boom'); } } };
    const dup = await svc.findDuplicate('cal', {
        dedupeKey: 'X', title: 'T', startDate: '2026-08-01',
    });
    assert.strictEqual(dup, null);
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test`
Expected: FAIL — `svc.findDuplicate is not a function` (Task 1 테스트는 계속 PASS)

- [ ] **Step 3: 구현**

`calendar.js` 상단(기존 require 아래)에 추가:

```js
const { isSimilarTitle } = require('./lib/titleSimilarity');
```

`findEvent` 메서드 아래에 추가:

```js
    /**
     * 2단계 중복 판정 (설계: docs/superpowers/specs/2026-07-21-multi-source-adapters-design.md)
     * 1) 설명의 `ID: <dedupeKey>` 라인 일치 → 같은 소스에서 이미 등록됨
     * 2) 시작일 ±1일 이벤트와 제목 유사 → 다른 소스로 이미 등록됨 (안전망)
     */
    async findDuplicate(calendarId, { dedupeKey, title, startDate }) {
        const timeMin = new Date(startDate);
        timeMin.setDate(timeMin.getDate() - 1);
        const timeMax = new Date(startDate);
        timeMax.setDate(timeMax.getDate() + 2);

        try {
            const res = await this.calendar.events.list({
                calendarId,
                timeMin: timeMin.toISOString(),
                timeMax: timeMax.toISOString(),
                singleEvents: true,
                maxResults: 250,
            });
            const events = res.data.items || [];

            const idHit = events.find(e =>
                e.description && e.description.includes(`ID: ${dedupeKey}`)
            );
            if (idHit) return { reason: 'id', event: idHit };

            const similar = events.find(e => e.summary && isSimilarTitle(title, e.summary));
            if (similar) return { reason: 'similar', event: similar };

            return null;
        } catch (error) {
            console.warn('⚠️ 중복 검색 중 오류 (무시하고 진행):', error.message);
            return null;
        }
    }
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — 10 tests, 0 failures

- [ ] **Step 5: 커밋**

```bash
git add calendar.js test/findDuplicate.test.js
git commit -m "feat: 2단계 중복 판정 findDuplicate (ID 네임스페이스 + 제목 유사도)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: KOCCA 어댑터 (sources/kocca.js)

**Files:**
- Create: `sources/kocca.js`
- Create: `test/kocca.test.js`

**Interfaces:**
- Consumes: 없음
- Produces: `module.exports = { sourceKey: 'KOCCA', fetchAll, parseListHtml, parsePeriod, passesFilter }` — `fetchAll(): Promise<Item[]>` (공통 스키마), Task 5의 auto.js가 사용

- [ ] **Step 1: 실패하는 테스트 작성**

`test/kocca.test.js` (실제 KOCCA 목록 구조를 본뜬 HTML 픽스처):

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { parseListHtml, parsePeriod, passesFilter } = require('../sources/kocca');

const FIXTURE = `
<table><tbody>
<tr>
  <td>모집공모</td>
  <td><a href="/kocca/pims/view.do?intcNo=326D00091012&menuNo=204104">2026년 대중음악 공연환경 개선 지원사업 공고</a></td>
  <td>26.07.09</td><td>26.07.13 ~ 26.07.31</td><td>1234</td>
</tr>
<tr>
  <td>모집공모</td>
  <td><a href="/kocca/pims/view.do?intcNo=326D00099999&menuNo=204104">2026 스웨덴 게임 컨퍼런스 참가기업 모집공고</a></td>
  <td>26.07.10</td><td>26.07.10 ~ 26.07.27</td><td>2597</td>
</tr>
<tr><td>안내</td><td>링크 없는 행</td><td></td><td></td><td></td></tr>
</tbody></table>`;

test('목록 HTML에서 intcNo·제목·접수기간을 파싱한다', () => {
    const rows = parseListHtml(FIXTURE);
    assert.strictEqual(rows.length, 2);
    assert.strictEqual(rows[0].docId, '326D00091012');
    assert.strictEqual(rows[0].title, '2026년 대중음악 공연환경 개선 지원사업 공고');
    assert.deepStrictEqual(rows[0].period, { startDate: '2026-07-13', endDate: '2026-07-31' });
});

test('YY.MM.DD ~ YY.MM.DD 접수기간을 ISO로 변환한다', () => {
    assert.deepStrictEqual(
        parsePeriod('26.07.15 26.07.13 ~ 26.07.31 1234'),  // 공고일이 앞에 섞여도 ~ 패턴만 매칭
        { startDate: '2026-07-13', endDate: '2026-07-31' }
    );
});

test('접수기간이 없으면 null', () => {
    assert.strictEqual(parsePeriod('상시 접수'), null);
});

test('문화예술 키워드가 있으면 통과, 없으면 제외', () => {
    assert.ok(passesFilter('2026년 대중음악 공연환경 개선 지원사업 공고'));
    assert.ok(!passesFilter('2026 스웨덴 게임 컨퍼런스 참가기업 모집공고'));
    assert.ok(!passesFilter('2026 콘텐츠IP 마켓 참가기업 모집'));
});

test('대관 공고는 키워드가 있어도 제외', () => {
    assert.ok(!passesFilter('예술극장 공연장 대관 공고'));
});
```

- [ ] **Step 2: 실패 확인**

Run: `npm test`
Expected: FAIL — `Cannot find module '../sources/kocca'`

- [ ] **Step 3: 구현**

`sources/kocca.js`:

```js
/**
 * 한국콘텐츠진흥원(KOCCA) 지원사업 공고 어댑터.
 * 목록: kocca.kr/kocca/pims/list.do (정적 HTML, 접수기간이 목록에 표시됨)
 * 장르 메타데이터가 없어 제목 키워드로 문화예술 공고만 남긴다.
 *
 * 단독 실행: node sources/kocca.js  → 수집 결과 출력 (필터 품질 확인용)
 */
const axios = require('axios');
const cheerio = require('cheerio');

const BASE = 'https://www.kocca.kr';
const LIST_PATH = '/kocca/pims/list.do?menuNo=204104';
const CATEGORIES = ['1', '2', '3']; // 자유공모, 지정공모, 모집공고 (4=종료된사업 제외)
const MAX_PAGES_PER_CATEGORY = 10;  // 안전 상한 (마감 구간 도달 시 조기 종료)
const HEADERS = { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' };

// 문화예술 관련 공고만 남기는 제목 키워드. 놓친 공고는 로그의 '키워드 불일치' 목록을
// 보고 여기에 추가한다.
const INCLUDE_KEYWORDS = [
    '음악', '대중음악', '공연', '예술', '전시', '미술', '문학', '무용', '연극',
    '뮤지컬', '국악', '클래식', '인디', '밴드', '콘서트', '페스티벌', '뮤지션', '버스킹',
];

function parsePeriod(text) {
    const m = String(text).match(/(\d{2})\.(\d{2})\.(\d{2})\s*~\s*(\d{2})\.(\d{2})\.(\d{2})/);
    if (!m) return null;
    return {
        startDate: `20${m[1]}-${m[2]}-${m[3]}`,
        endDate: `20${m[4]}-${m[5]}-${m[6]}`,
    };
}

function passesFilter(title) {
    if (title.includes('대관')) return false; // 아트누리와 동일한 제외 규칙
    return INCLUDE_KEYWORDS.some(k => title.includes(k));
}

function parseListHtml(html) {
    const $ = cheerio.load(html);
    const rows = [];
    $('table tbody tr').each((i, el) => {
        const $el = $(el);
        const a = $el.find('a').first();
        const idMatch = (a.attr('href') || '').match(/intcNo=([A-Za-z0-9]+)/);
        if (!idMatch) return;
        rows.push({
            docId: idMatch[1],
            title: a.text().trim(),
            period: parsePeriod($el.text()),
        });
    });
    return rows;
}

async function fetchAll() {
    console.log('📡 [KOCCA] 지원사업 공고를 가져오는 중...');
    const today = new Date().toISOString().split('T')[0];
    const seen = new Set(); // 카테고리 간 같은 공고 중복 방지
    const items = [];
    let filtered = 0;

    for (const cat of CATEGORIES) {
        for (let page = 1; page <= MAX_PAGES_PER_CATEGORY; page++) {
            const url = `${BASE}${LIST_PATH}&category=${cat}&pageIndex=${page}`;
            const { data } = await axios.get(url, { headers: HEADERS, timeout: 15000 });
            const rows = parseListHtml(data);
            if (rows.length === 0) break;

            let anyActive = false;
            for (const row of rows) {
                if (!row.period) continue;              // 접수기간 없는 행 (상시 등)
                if (row.period.endDate < today) continue; // 이미 마감
                anyActive = true;
                if (seen.has(row.docId)) continue;
                seen.add(row.docId);

                if (!passesFilter(row.title)) {
                    filtered++;
                    console.log(`  ⏩ 키워드 불일치 제외: ${row.title}`);
                    continue;
                }

                const detailUrl = `${BASE}/kocca/pims/view.do?intcNo=${row.docId}&menuNo=204104`;
                items.push({
                    sourceKey: 'KOCCA',
                    docId: row.docId,
                    dedupeKey: `KOCCA:${row.docId}`,
                    title: `[KOCCA] ${row.title}`,
                    startDate: row.period.startDate,
                    endDate: row.period.endDate,
                    description: [
                        `[지원사업 정보] (ID: KOCCA:${row.docId})`,
                        '- 출처: 한국콘텐츠진흥원(KOCCA)',
                        `- 접수기간: ${row.period.startDate} ~ ${row.period.endDate}`,
                        '',
                        `🔗 공고 보러가기: ${detailUrl}`,
                    ].join('\n'),
                });
            }
            if (!anyActive) break; // 이 페이지 전체가 마감 → 다음 카테고리로
        }
    }

    console.log(`✅ [KOCCA] 문화예술 공고 ${items.length}건 수집 (키워드 제외 ${filtered}건)`);
    return items;
}

module.exports = { sourceKey: 'KOCCA', fetchAll, parseListHtml, parsePeriod, passesFilter };

if (require.main === module) {
    fetchAll()
        .then(items => {
            console.log('\n=== 수집 결과 ===');
            items.forEach(i => console.log(`${i.startDate} ~ ${i.endDate}  ${i.title}`));
        })
        .catch(e => { console.error('실패:', e.message); process.exit(1); });
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npm test`
Expected: PASS — 15 tests, 0 failures

- [ ] **Step 5: 실사이트 단독 실행으로 필터 품질 확인**

Run: `node sources/kocca.js`
Expected: 수집 N건(대략 0~15건 예상)과 키워드 제외 목록 출력. **키워드 불일치 목록을 눈으로 훑어 문화예술 공고가 잘못 제외되고 있지 않은지 확인.** 잘못 제외된 공고가 있으면 INCLUDE_KEYWORDS에 키워드를 추가하고 npm test 재실행.

- [ ] **Step 6: 커밋**

```bash
git add sources/kocca.js test/kocca.test.js
git commit -m "feat: KOCCA 지원사업 공고 어댑터 (문화예술 키워드 필터)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: 아트누리 어댑터 (sources/artnuri.js)

**Files:**
- Create: `sources/artnuri.js` (crawler.js는 수정하지 않는다)

**Interfaces:**
- Consumes: `ArtNuriCrawler.fetchList()`, `ArtNuriCrawler.fetchDetail(item)` (기존 crawler.js)
- Produces: `module.exports = { sourceKey: 'ARTNURI', fetchAll }` — `fetchAll(): Promise<Item[]>` (공통 스키마), Task 5의 auto.js가 사용

네트워크 의존 래퍼라 단위 테스트 대신 단독 실행으로 검증한다 (파싱 로직은 crawler.js에 있고 이미 운영 검증됨).

- [ ] **Step 1: 구현**

`sources/artnuri.js`:

```js
/**
 * 아트누리(artnuri.or.kr) 어댑터. 기존 crawler.js를 얇게 래핑해 공통 스키마로 변환한다.
 * 날짜없음·대관 필터를 여기서 적용한다 (auto.js는 필터를 모른다).
 *
 * 단독 실행: node sources/artnuri.js  → 수집 요약 출력 (전체 크롤이라 2~3분 소요)
 */
const ArtNuriCrawler = require('../crawler');

async function fetchAll() {
    console.log('📡 [아트누리] 지원사업 공고를 가져오는 중...');
    const crawler = new ArtNuriCrawler();
    const list = await crawler.fetchList();

    const items = [];
    let skippedNoDate = 0, skippedRental = 0, failed = 0;

    for (const entry of list) {
        const detail = await crawler.fetchDetail(entry);
        if (!detail) { failed++; continue; }
        if (!detail.startDate || !detail.endDate) { skippedNoDate++; continue; }
        if (detail.title.includes('대관')) {
            console.log(`  ⏩ 대관 정보 제외: ${detail.title}`);
            skippedRental++;
            continue;
        }
        items.push({
            sourceKey: 'ARTNURI',
            docId: detail.docId,
            dedupeKey: detail.docId, // 기존 등록 이벤트의 `ID: CRL...` 형식과 호환
            title: detail.title,
            startDate: detail.startDate,
            endDate: detail.endDate,
            description: detail.description,
        });
    }

    console.log(`✅ [아트누리] 등록 대상 ${items.length}건 (날짜없음 ${skippedNoDate} / 대관 ${skippedRental} / 실패 ${failed})`);
    return items;
}

module.exports = { sourceKey: 'ARTNURI', fetchAll };

if (require.main === module) {
    fetchAll()
        .then(items => {
            console.log('\n=== 수집 결과 (앞 10건) ===');
            items.slice(0, 10).forEach(i => console.log(`${i.startDate} ~ ${i.endDate}  ${i.title}`));
        })
        .catch(e => { console.error('실패:', e.message); process.exit(1); });
}
```

- [ ] **Step 2: 기존 테스트 회귀 확인**

Run: `npm test`
Expected: PASS — 15 tests (이 Task는 테스트 추가 없음, 회귀만 확인)

- [ ] **Step 3: 실사이트 단독 실행 확인**

Run: `node sources/artnuri.js 2>&1 | tail -15`
Expected: `✅ [아트누리] 등록 대상 ~130건` 수준(대관 ~49건 제외 후) + 앞 10건 목록. 2~3분 소요.

- [ ] **Step 4: 커밋**

```bash
git add sources/artnuri.js
git commit -m "feat: 아트누리 어댑터 (crawler.js 래핑, 공통 스키마)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: auto.js를 SOURCES 순회로 전환

**Files:**
- Modify: `auto.js` (main 함수와 요약 출력 부분 교체. 상수·워치독·인증·process.chdir은 유지)

**Interfaces:**
- Consumes: `sources/artnuri.js`·`sources/kocca.js`의 `{sourceKey, fetchAll}` (Task 3·4), `calendarService.findDuplicate(calendarId, item)` (Task 2), `calendarService.createEvent(calendarId, {title, description, startDate, endDate})` (기존)
- Produces: 없음 (최종 소비자)

- [ ] **Step 1: auto.js 수정**

상단 require 교체 — 기존:

```js
const ArtNuriCrawler = require('./crawler');
const CalendarService = require('./calendar');
```

를 다음으로:

```js
const CalendarService = require('./calendar');

// 수집 소스 어댑터 목록. 새 소스는 sources/에 어댑터를 만들어 여기에 추가한다.
const SOURCES = [
    require('./sources/artnuri'),
    require('./sources/kocca'),
];
```

`main()` 함수 전체를 다음으로 교체 (인증 부분은 동일):

```js
async function main() {
    console.log('='.repeat(60));
    console.log(`🎨 자동 실행 시작: ${now()}`);
    console.log('='.repeat(60));

    const calendarService = new CalendarService();

    // 1. 인증 (실패 시 즉시 종료 — 로그인 창을 띄우지 않는다)
    await calendarService.authorize({ interactive: false });

    // 2. 소스별 수집·등록 (한 소스가 실패해도 나머지는 진행)
    const summary = [];
    for (const source of SOURCES) {
        const stat = {
            source: source.sourceKey,
            added: 0, duplicated: 0, similar: 0, failed: 0, total: 0,
            fetchFailed: false,
        };
        summary.push(stat);

        let items;
        try {
            items = await source.fetchAll();
        } catch (error) {
            console.error(`❌ [${source.sourceKey}] 수집 실패: ${error.message}`);
            stat.fetchFailed = true;
            continue;
        }
        stat.total = items.length;

        for (const [i, item] of items.entries()) {
            const tag = `[${source.sourceKey} ${i + 1}/${items.length}]`;

            const dup = await calendarService.findDuplicate(CALENDAR_ID, item);
            if (dup) {
                if (dup.reason === 'id') {
                    console.log(`⏩ ${tag} 이미 등록된 일정: ${item.title}`);
                    stat.duplicated++;
                } else {
                    console.log(`⏩ ${tag} 유사 공고 존재 ("${dup.event.summary}"): ${item.title}`);
                    stat.similar++;
                }
                continue;
            }

            console.log(`Processing ${tag}: ${item.title} (${item.startDate} ~ ${item.endDate})`);
            const created = await calendarService.createEvent(CALENDAR_ID, item);
            if (created) stat.added++;
            else stat.failed++;
        }
    }

    return summary;
}
```

말미의 `main().then(...)` 블록을 다음으로 교체 (워치독 clearTimeout 구조는 유지):

```js
main()
    .then((summary) => {
        clearTimeout(watchdog);
        console.log('\n' + '-'.repeat(60));
        console.log(`🎉 완료: ${now()}`);
        summary.forEach(s => {
            if (s.fetchFailed) {
                console.log(`   ${s.source}: ❌ 수집 실패`);
            } else {
                console.log(`   ${s.source}: 신규 ${s.added} / 중복 ${s.duplicated} / 유사 ${s.similar} / 실패 ${s.failed} (수집 ${s.total})`);
            }
        });
        console.log('-'.repeat(60) + '\n');
        const allFailed = summary.length > 0 && summary.every(s => s.fetchFailed);
        process.exit(allFailed ? 1 : 0);
    })
    .catch((error) => {
        clearTimeout(watchdog);
        console.error('\n' + '-'.repeat(60));
        console.error(`💥 실행 실패: ${now()}`);
        console.error(`   ${error.message}`);
        console.error('-'.repeat(60) + '\n');
        process.exit(1);
    });
```

- [ ] **Step 2: 테스트 회귀 확인**

Run: `npm test`
Expected: PASS — 15 tests

- [ ] **Step 3: 실제 실행 (1차 — 신규 등록 확인)**

Run: `node auto.js 2>&1 | tail -8`
Expected: 소스별 요약 2줄. ARTNURI는 대부분 중복(이전 실행에서 등록됨), KOCCA는 신규 0건 이상. 실패 0. exit 0.

- [ ] **Step 4: 재실행 (2차 — 중복 방지 회귀 확인)**

Run: `node auto.js 2>&1 | tail -8`
Expected: **두 소스 모두 신규 0건**, 1차에서 등록된 KOCCA 건수만큼 중복으로 잡힘. 이게 실패하면 dedupeKey/설명 ID 라인 불일치를 의심.

- [ ] **Step 5: 커밋**

```bash
git add auto.js
git commit -m "feat: auto.js 다중 소스 순회 전환 (소스별 통계, 2단계 중복 방지)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: README 갱신

**Files:**
- Modify: `README.md` (주요 기능 절과 자동 실행 절 사이에 소스 구조 설명 추가)

**Interfaces:**
- Consumes: 없음
- Produces: 없음

- [ ] **Step 1: README의 "주요 기능" 절에서 자동 수집 설명 갱신**

`README.md`의 다음 줄:

```markdown
- **자동 수집**: 진행중인 모든 예술 지원사업 공고를 크롤링합니다.
```

을 다음으로 교체:

```markdown
- **자동 수집**: 아트누리(진행중·예정 공고 전체)와 KOCCA(문화예술 관련 공고)를 수집합니다.
```

- [ ] **Step 2: "⏰ 주 1회 자동 실행" 절의 "설정 바꾸기" 표에 행 추가**

기존 표:

```markdown
| 항목 | 위치 |
| :--- | :--- |
| 실행 요일·시각 | `com.hwangtab.artcrawler.plist`의 `StartCalendarInterval` (`Weekday` 1=월요일) |
| 등록할 캘린더 | `auto.js`의 `CALENDAR_ID` (또는 환경변수 `CALENDAR_ID`) |
| 수집 범위 | `crawler.js`의 `COLLECT_STATES` (기본: `진행중`, `예정`) |
```

을 다음으로 교체:

```markdown
| 항목 | 위치 |
| :--- | :--- |
| 실행 요일·시각 | `com.hwangtab.artcrawler.plist`의 `StartCalendarInterval` (`Weekday` 1=월요일) |
| 등록할 캘린더 | `auto.js`의 `CALENDAR_ID` (또는 환경변수 `CALENDAR_ID`) |
| 수집 범위 (아트누리) | `crawler.js`의 `COLLECT_STATES` (기본: `진행중`, `예정`) |
| 장르 키워드 (KOCCA) | `sources/kocca.js`의 `INCLUDE_KEYWORDS` |
| 수집 소스 추가 | `sources/`에 어댑터 작성 후 `auto.js`의 `SOURCES`에 추가 |
```

- [ ] **Step 3: 커밋**

```bash
git add README.md
git commit -m "docs: 다중 소스 수집 구조 반영

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```
