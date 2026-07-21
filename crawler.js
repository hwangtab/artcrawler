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

        // 목록은 '진행중' → '예정' → '마감' 순으로 정렬되어 있고,
        // 뒤로 갈수록 몇 년 전 공고까지 끝없이 이어진다 (500페이지에도 항목이 있다).
        // 따라서 마감된 공고 구간에 닿으면 더 볼 이유가 없으므로 멈춘다.
        const COLLECT_STATES = ['진행중', '예정'];
        // 정렬이 한 번 흐트러져도 바로 멈추지 않도록 두는 여유분
        const STOP_AFTER_EMPTY_PAGES = 2;
        let emptyPageStreak = 0;

        try {
            while (true) {
                const url = `${this.baseUrl}/crawler/info/search.do?key=2301170002&pageUnit=${pageUnit}&pageIndex=${pageIndex}&sc_limitAt=Y`;
                const { data } = await axios.get(url);
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

                    // 접수 상태 배지 (진행중 / 예정 / 마감 / 미정)
                    const state = $el.find('span[class*=state-st]').first().text().trim();
                    if (!COLLECT_STATES.includes(state)) return;

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
                        state: state,
                        deadline: deadline
                    });
                });

                if (rowCount === 0) {
                    // 더 이상 결과가 없다 (목록의 진짜 끝)
                    break;
                }

                if (pageItems.length === 0) {
                    // 항목은 있는데 전부 마감 상태 → 마감 구간에 진입했다
                    emptyPageStreak++;
                    if (emptyPageStreak >= STOP_AFTER_EMPTY_PAGES) {
                        console.log(`  - 페이지 ${pageIndex}: 마감 공고 구간 도달, 수집을 종료합니다.`);
                        break;
                    }
                } else {
                    emptyPageStreak = 0;
                    allItems.push(...pageItems);
                    console.log(`  - 페이지 ${pageIndex}: ${pageItems.length}개 수집 (누적: ${allItems.length}개)`);
                }

                pageIndex++;

                // Safety limit to prevent infinite loops
                if (pageIndex > 200) {
                    console.log('⚠️ 최대 페이지 수 도달 (200페이지)');
                    break;
                }
            }

            console.log(`✅ 총 ${allItems.length}개의 모집중/예정 지원사업을 발견했습니다.`);
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
                // 일부 공고는 깨진 데이터를 내려주므로 (예: "2026-03-26 ~ 653 20260423 542"),
                // 텍스트에서 YYYY-MM-DD 또는 YYYYMMDD 패턴을 추출해 정규화한다.
                const dateTokens = periodText.match(/\d{4}-?\d{2}-?\d{2}/g) || [];
                const normalize = (s) => {
                    const m = s.match(/(\d{4})-?(\d{2})-?(\d{2})/);
                    if (!m) return null;
                    const iso = `${m[1]}-${m[2]}-${m[3]}`;
                    return isNaN(new Date(iso).getTime()) ? null : iso;
                };
                const start = dateTokens[0] ? normalize(dateTokens[0]) : null;
                const end = dateTokens[1] ? normalize(dateTokens[1]) : null;
                if (start && end) {
                    detail.startDate = start;
                    detail.endDate = end;
                    detail.period = `${start} ~ ${end}`;
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
