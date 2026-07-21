const axios = require('axios');
const cheerio = require('cheerio');

class ArtNuriCrawler {
    constructor() {
        this.baseUrl = 'https://artnuri.or.kr';
    }

    async fetchList() {
        console.log('📡 아트누리 목록을 가져오는 중...');
        const allItems = [];
        const pageUnit = 10; // Items per page (site default)

        // 아트누리는 sc_isDo 쿼리 파라미터로 접수 상태별 서버 필터를 지원한다.
        // 상태별로 끝까지(rowCount===0) 순회하면 정렬 가정 없이 전량을 확보할 수 있다.
        // (sc_isDo=E는 '마감'이며 수집 대상이 아니다)
        const STATES = [
            { code: 'I', name: '진행중' },
            { code: 'T', name: '예정' },
            { code: 'U', name: '미정' },
        ];

        try {
            for (const state of STATES) {
                let pageIndex = 1;
                let stateCount = 0;

                while (true) {
                    const url = `${this.baseUrl}/crawler/info/search.do?key=2301170002&pageUnit=${pageUnit}&pageIndex=${pageIndex}&sc_limitAt=Y&sc_isDo=${state.code}`;
                    const { data } = await axios.get(url, { timeout: 15000 });
                    const $ = cheerio.load(data);
                    const pageItems = [];
                    let rowCount = 0;

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

                        if (!docId) return;
                        rowCount++;

                        // 마감일은 <strong>마감일</strong><em>날짜</em> 구조에 들어있다
                        let deadline = '';
                        $el.find('ul.txt > li').each((j, li) => {
                            if ($(li).find('strong').text().trim().includes('마감일')) {
                                deadline = $(li).find('em').text().trim();
                            }
                        });

                        const detailUrl = `${this.baseUrl}/crawler/info/view.do?docid=${docId}&key=2301170002&source=${encodeURIComponent(source)}&seNo=${seNo}`;
                        pageItems.push({
                            docId: docId,
                            detailUrl: detailUrl,
                            title: $el.find('a.title').text().trim(),
                            state: state.name,
                            deadline: deadline
                        });
                    });

                    if (rowCount === 0) {
                        // 이 상태의 목록 끝
                        break;
                    }

                    allItems.push(...pageItems);
                    stateCount += pageItems.length;

                    pageIndex++;

                    // Safety limit to prevent infinite loops
                    if (pageIndex > 100) {
                        console.log(`⚠️ [${state.name}] 최대 페이지 수 도달 (100페이지)`);
                        break;
                    }
                }

                console.log(`  - ${state.name}: ${stateCount}건`);
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
            const { data } = await axios.get(item.detailUrl, { timeout: 15000 });
            const $ = cheerio.load(data);

            const detail = { ...item };

            // 1. Parse Period from top application box
            const periodText = $('.top.applic').text().trim();
            if (periodText) {
                // 일부 공고는 깨진 데이터를 내려주므로 (예: "2026-03-26 ~ 653 20260423 542"),
                // 텍스트에서 YYYY-MM-DD 또는 YYYYMMDD 패턴을 추출해 정규화한다.
                // '미정'(상시 접수) 공고는 "2026-06-02 ~" 형태로 종료일이 없다 —
                // 시작일/종료일을 독립적으로 세팅해 이런 경우에도 시작일은 살린다.
                const dateTokens = periodText.match(/\d{4}-?\d{2}-?\d{2}/g) || [];
                const normalize = (s) => {
                    const m = s.match(/(\d{4})-?(\d{2})-?(\d{2})/);
                    if (!m) return null;
                    const iso = `${m[1]}-${m[2]}-${m[3]}`;
                    return isNaN(new Date(iso).getTime()) ? null : iso;
                };
                const start = dateTokens[0] ? normalize(dateTokens[0]) : null;
                const end = dateTokens[1] ? normalize(dateTokens[1]) : null;
                if (start) detail.startDate = start;
                if (end) detail.endDate = end;

                if (start && end) {
                    detail.period = `${start} ~ ${end}`;
                } else if (start) {
                    detail.period = `${start} ~`;
                } else {
                    console.warn(`⚠️ 날짜 파싱 실패 (원문: "${periodText}") - 항목 건너뜀: ${item.title}`);
                }
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
