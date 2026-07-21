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
    '음악', '공연', '예술', '전시', '미술', '문학', '무용', '연극',
    '뮤지컬', '국악', '클래식', '인디', '밴드', '콘서트', '페스티벌', '뮤지션', '버스킹',
    '오케스트라', '교향악단', '합창', '단원', '레지던시', '창작공간', '입주작가', '창작지원',
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
    let totalRowsSeen = 0; // 카나리: 파싱이 아예 깨졌는지(행 0건) 판별용 누적 카운터

    for (const cat of CATEGORIES) {
        for (let page = 1; page <= MAX_PAGES_PER_CATEGORY; page++) {
            const url = `${BASE}${LIST_PATH}&category=${cat}&pageIndex=${page}`;
            const { data } = await axios.get(url, { headers: HEADERS, timeout: 15000 });
            const rows = parseListHtml(data);
            if (rows.length === 0) break;
            totalRowsSeen += rows.length;

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

    // 카나리: KOCCA는 필터·마감 조건으로 정상적으로 0건일 수 있다(활성 문화예술 공고가
    // 실제로 없는 주). 하지만 전 카테고리를 통틀어 목록 행(row)을 단 한 건도 못 봤다면
    // 필터가 아니라 파싱 자체가 깨진 것이므로 이 경우만 구조적 실패로 throw한다.
    if (totalRowsSeen === 0) {
        throw new Error('KOCCA 목록 행 0건 — 사이트 구조 변경 또는 네트워크 장애 의심');
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
