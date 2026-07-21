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
