const axios = require('axios');
const cheerio = require('cheerio');

class ArtNuriCrawler {
    constructor() {
        this.baseUrl = 'https://artnuri.or.kr';
        // pageUnit=100 to fetch more items at once (currently ~60 ongoing programs)
        this.listUrl = 'https://artnuri.or.kr/crawler/info/search.do?key=2301170002&pageUnit=100';
    }

    async fetchList() {
        console.log('📡 아트누리 목록을 가져오는 중...');
        const allItems = [];
        let pageIndex = 1;
        const pageUnit = 10; // Items per page (site default)

        try {
            while (true) {
                const url = `${this.baseUrl}/crawler/info/search.do?key=2301170002&pageUnit=${pageUnit}&pageIndex=${pageIndex}&sc_limitAt=Y`;
                const { data } = await axios.get(url);
                const $ = cheerio.load(data);
                const pageItems = [];

                // Select all list items on this page
                $('ul.card li').each((i, el) => {
                    const $el = $(el);
                    const onclick = $el.find('a.title').attr('onclick');
                    let docId, source, seNo;

                    if (onclick) {
                        const match = onclick.match(/goView\('([^']*)',\s*'([^']*)',\s*'([^']*)'\)/);
                        if (match) {
                            docId = match[1];
                            source = match[2];
                            seNo = match[3];
                        }
                    }

                    if (docId) {
                        const detailUrl = `${this.baseUrl}/crawler/info/view.do?docid=${docId}&key=2301170002&source=${encodeURIComponent(source)}&seNo=${seNo}`;
                        pageItems.push({
                            docId: docId,
                            detailUrl: detailUrl,
                            title: $el.find('a.title').text().trim(),
                            deadline: $el.find('li.date').text().replace('마감일', '').trim()
                        });
                    }
                });

                if (pageItems.length === 0) {
                    // No more items, stop pagination
                    break;
                }

                allItems.push(...pageItems);
                console.log(`  - 페이지 ${pageIndex}: ${pageItems.length}개 발견 (누적: ${allItems.length}개)`);

                pageIndex++;

                // Safety limit to prevent infinite loops
                if (pageIndex > 200) {
                    console.log('⚠️ 최대 페이지 수 도달 (200페이지)');
                    break;
                }
            }

            console.log(`✅ 총 ${allItems.length}개의 지원사업을 발견했습니다.`);
            return allItems;
        } catch (error) {
            console.error('❌ 목록 가져오기 실패:', error.message);
            return allItems; // Return whatever we got
        }
    }

    async fetchDetail(item) {
        console.log(`🔍 상세 정보 수집 중: ${item.title}`);
        try {
            const { data } = await axios.get(item.detailUrl);
            const $ = cheerio.load(data);

            const detail = { ...item };

            // 1. Parse Period from top application box
            const periodText = $('.top.applic').text().trim();
            if (periodText) {
                // Example: 2025-12-01 ~ 2026-02-27
                const [startStr, endStr] = periodText.split('~').map(s => s.trim());
                detail.startDate = startStr;
                detail.endDate = endStr;
                detail.period = periodText;
            }

            // 2. Parse Info List (Host, Target, etc.)
            let applyUrl = null; // 신청사이트 바로가기 URL

            $('.info-txt > li').each((i, el) => {
                const label = $(el).find('strong').first().text().trim();

                // Extract 신청사이트 바로가기 link
                if (label.includes('온라인신청')) {
                    const siteLink = $(el).find('a.site-link').attr('href');
                    if (siteLink) applyUrl = siteLink;
                }

                const value = $(el).find('ul.view-list li').text().trim() ||
                    $(el).find('.organ').text().trim();

                if (label.includes('지원대상')) detail.target = value;
                else if (label.includes('분야')) detail.field = value;
                else if (label.includes('사업유형')) detail.type = value;
                else if (label.includes('지역')) detail.region = value;
            });

            // Format Title: [Genre/Region] Title
            // Example: [문학/전국] 2026년 공모...
            // If genre is '전체', omit it for better UX: [전국] 2026년...
            const genre = detail.field || '기타';
            const region = detail.region || '전국';

            if (genre === '전체') {
                detail.title = `[${region}] ${item.title}`;
            } else {
                detail.title = `[${genre}/${region}] ${item.title}`;
            }

            // 3. Description
            // Get text from .supt-content (avoiding hidden fields or file lists)
            const contentText = $('.supt-content').not('.file-wrap').text().trim();

            // Build apply link section
            let linkSection = '';
            if (applyUrl) {
                // If apply link exists, use it (user requested to remove detail link in this case)
                linkSection = `🔗 신청하러 가기: ${applyUrl}`;
            } else {
                // If no apply link, fallback to detail link
                linkSection = `🔗 공고 보러가기: ${item.detailUrl}`;
            }

            detail.description = `
[지원사업 정보] (ID: ${item.docId})
- 신청기간: ${detail.startDate || '?'} ~ ${detail.endDate || '?'}
- 지원대상: ${detail.target || '정보없음'}
- 분야: ${detail.field || '정보없음'}
- 지역: ${detail.region || '정보없음'}
- 사업유형: ${detail.type || '정보없음'}

[상세내용]
${contentText.substring(0, 400)}...

${linkSection}
            `.trim();

            return detail;

        } catch (error) {
            console.error(`❌ 상세 정보 실패 (${item.title}):`, error.message);
            return null;
        }
    }
}

module.exports = ArtNuriCrawler;
