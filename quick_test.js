const ArtNuriCrawler = require('./crawler');

async function test() {
    const crawler = new ArtNuriCrawler();

    // Override fetchList to just prompt for the first page logic or manually fetch one
    // Actually, I can just use fetchDetail on a known item or fetch list with limit
    // But better to just modify the output of fetchList in a subclass or just use the class
    // Let's just monkey-patch the page limit for this test

    console.log('🧪 단일 항목 테스트 중...');

    // We'll hack the instance to verify fetchDetail logic
    // First, get one item from the list (we know page 1 exists)
    // We can't easily interrupt the loop in fetchList without changing code.
    // So I will just write a small script that mimics the fetch logic for one page.

    const axios = require('axios');
    const cheerio = require('cheerio');

    const url = 'https://artnuri.or.kr/crawler/info/search.do?key=2301170002&pageUnit=10&pageIndex=1&sc_limitAt=Y';
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);

    const firstItemEl = $('ul.card li').first();
    const title = firstItemEl.find('a.title').text().trim();
    const onclick = firstItemEl.find('a.title').attr('onclick');

    let docId, source, seNo;
    if (onclick) {
        const match = onclick.match(/goView\('([^']*)',\s*'([^']*)',\s*'([^']*)'\)/);
        if (match) {
            docId = match[1];
            source = match[2];
            seNo = match[3];
        }
    }

    const item = {
        docId,
        detailUrl: `https://artnuri.or.kr/crawler/info/view.do?docid=${docId}&key=2301170002&source=${encodeURIComponent(source)}&seNo=${seNo}`,
        title
    };

    console.log('Testing item:', item.title);

    // Now call fetchDetail
    const detail = await crawler.fetchDetail(item);
    console.log('\n✅ 변환된 제목:', detail.title);
    console.log('   (기대형식: [분야/지역] 제목)');
}

test();
