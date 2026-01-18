const ArtNuriCrawler = require('./crawler');
const CalendarService = require('./calendar');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const askQuestion = (query) => new Promise((resolve) => rl.question(query, resolve));

async function main() {
    console.log('=== 🎨 아트누리 캘린더 등록기 (개인화 버전: 경기/전국 + 음악) ===');

    // 1. Initialize Services
    const crawler = new ArtNuriCrawler();
    const calendarService = new CalendarService();

    // 2. Auth with Calendar
    try {
        await calendarService.authorize();
    } catch (error) {
        console.log('\n🚫 인증 실패. 프로그램을 종료합니다.');
        process.exit(1);
    }

    // 3. Select Calendar
    console.log('\n📅 사용 가능한 캘린더 목록을 불러옵니다...');
    const calendars = await calendarService.listCalendars();
    const writableCalendars = calendars.filter(c => c.accessRole === 'owner' || c.accessRole === 'writer');

    console.log('------------------------------------------------');
    writableCalendars.forEach((cal, index) => {
        console.log(`${index + 1}. ${cal.summary} (${cal.id})`);
    });
    console.log('------------------------------------------------');

    let selectedIndex = -1;
    while (selectedIndex < 0 || selectedIndex >= writableCalendars.length) {
        const answer = await askQuestion('👉 일정을 등록할 캘린더 번호를 입력하세요: ');
        selectedIndex = parseInt(answer) - 1;
    }
    const targetCalendarId = writableCalendars[selectedIndex].id;
    console.log(`\n✅ 선택된 캘린더: ${writableCalendars[selectedIndex].summary}`);

    // 4. Crawl Data
    console.log('\n🕷️ 아트누리 데이터 수집을 시작합니다...');
    const items = await crawler.fetchList();

    if (items.length === 0) {
        console.log('⚠️ 수집된 데이터가 없습니다. 프로그램을 종료합니다.');
        process.exit(0);
    }

    console.log(`\n총 ${items.length}개의 항목을 검토합니다... (필터링 적용)`);

    // 5. Process and Add to Calendar
    let count = 0;
    let registeredCount = 0;

    for (const item of items) {
        count++;
        // Fetch full details
        const detail = await crawler.fetchDetail(item);
        if (!detail || !detail.startDate || !detail.endDate) {
            continue;
        }

        // --- FILTER LOGIC (개인화 필터) ---
        // 1. 지역: '전국', '전체', 또는 '경기'가 포함된 경우
        const region = detail.region || '';
        const isRegionMatch = region.includes('전국') ||
            region.includes('전체') ||
            region.includes('경기');

        // 2. 장르: '전체' 또는 '음악'이 포함된 경우
        const genre = detail.field || '';
        const isGenreMatch = genre.includes('전체') ||
            genre.includes('음악');

        if (!isRegionMatch || !isGenreMatch) {
            // console.log(`⏩ [Skip] 조건 불일치: [${genre}/${region}] ${detail.title}`);
            process.stdout.write('.'); // Show progress
            continue;
        }
        // ----------------------------------

        console.log(`\n🎯 조건 일치 발견! [${genre}/${region}] ${detail.title}`);

        // Check for duplicate using docId
        const existing = await calendarService.findEvent(targetCalendarId, detail.docId, detail.startDate);
        if (existing) {
            console.log(`  └─ ⏩ 이미 등록된 일정입니다.`);
            continue;
        }

        // Create Event
        console.log(`  └─ 📅 일정 등록 중... (${detail.startDate} ~ ${detail.endDate})`);
        await calendarService.createEvent(targetCalendarId, detail);
        registeredCount++;
    }

    console.log(`\n🎉 작업 완료! 총 ${registeredCount}개의 맞춤형 공고가 등록되었습니다.`);
    process.exit(0);
}

main();
