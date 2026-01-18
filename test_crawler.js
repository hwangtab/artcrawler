const ArtNuriCrawler = require('./crawler');

async function test() {
    console.log('🧪 크롤러 테스트를 시작합니다...');
    const crawler = new ArtNuriCrawler();

    // Test 1: List
    console.log('\n[1/2] 목록 가져오기 테스트');
    const list = await crawler.fetchList();
    if (list.length === 0) {
        console.error('❌ 목록을 가져오지 못했습니다.');
        return;
    }
    console.log(`✅ 목록 가져오기 성공: ${list.length}개 항목 발견`);
    console.log('첫 번째 항목:', list[0]);

    // Test 2: Detail
    console.log('\n[2/2] 상세 정보 가져오기 테스트 (첫 번째 항목)');
    try {
        const { data } = await require('axios').get(list[0].detailUrl);
        require('fs').writeFileSync('debug_detail.html', data);
        console.log('📄 디버깅용 HTML 저장됨: debug_detail.html');

        const detail = await crawler.fetchDetail(list[0]);

        if (!detail) {
            console.error('❌ 상세 정보를 가져오지 못했습니다.');
            return;
        }
        console.log('✅ 상세 정보 가져오기 성공');
        console.log('제목:', detail.title);
        console.log('기간:', detail.startDate, '~', detail.endDate);
        console.log('설명:', detail.description);
    } catch (e) { console.error(e); }
}

test();
