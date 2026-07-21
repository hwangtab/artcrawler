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

    // 카나리: 아트누리는 상시 190건 이상의 진행중/예정 공고가 있어 정상 상태에서
    // 0건은 나올 수 없다. crawler.fetchList()는 네트워크 오류도 catch해 빈 배열을
    // 반환하므로, 여기서 throw하지 않으면 사이트 구조 변경·장애가 "0건 수집 성공"으로
    // 조용히 넘어간다.
    if (list.length === 0) {
        throw new Error('아트누리 목록 0건 — 사이트 구조 변경 또는 네트워크 장애 의심');
    }

    const items = [];
    let skippedNoDate = 0, skippedRental = 0, failed = 0, ongoingCount = 0;
    const stateCounts = {};

    for (const entry of list) {
        const detail = await crawler.fetchDetail(entry);
        if (!detail) { failed++; continue; }
        if (!detail.startDate) { skippedNoDate++; continue; }

        // '미정'(상시 접수) 공고는 종료일이 없다 — 접수 시작일 하루짜리 일정으로 등록하고
        // 제목에 [상시]를 붙여 마감이 정해져 있지 않음을 알린다.
        const isOngoing = detail.state === '미정' && !detail.endDate;
        if (!detail.endDate && !isOngoing) { skippedNoDate++; continue; }

        let title = detail.title;
        let endDate = detail.endDate;
        let description = detail.description;
        if (isOngoing) {
            title = `[상시] ${title}`;
            endDate = detail.startDate;
            description = `※ 마감일 미정(상시/수시 접수)\n${description}`;
            ongoingCount++;
        }

        if (title.includes('대관')) {
            console.log(`  ⏩ 대관 정보 제외: ${title}`);
            skippedRental++;
            continue;
        }

        stateCounts[detail.state] = (stateCounts[detail.state] || 0) + 1;

        items.push({
            sourceKey: 'ARTNURI',
            docId: detail.docId,
            dedupeKey: detail.docId, // 기존 등록 이벤트의 `ID: CRL...` 형식과 호환
            title: title,
            startDate: detail.startDate,
            endDate: endDate,
            description: description,
        });
    }

    const stateSummary = Object.entries(stateCounts).map(([k, v]) => `${k} ${v}`).join(' / ') || '없음';
    console.log(`✅ [아트누리] 등록 대상 ${items.length}건 (${stateSummary}, 상시 ${ongoingCount}건 포함) (날짜없음 ${skippedNoDate} / 대관 ${skippedRental} / 실패 ${failed})`);
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
