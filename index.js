const ArtNuriCrawler = require('./crawler');
const CalendarService = require('./calendar');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const askQuestion = (query) => new Promise((resolve) => rl.question(query, resolve));

async function main() {
    console.log('=== 🎨 아트누리 캘린더 등록기 시작 ===');

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

    // Filter for writable calendars
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

    console.log(`\n총 ${items.length}개의 항목을 처리합니다.`);

    // 5. Process and Add to Calendar
    let count = 0;
    for (const item of items) {
        count++;
        // Fetch full details
        const detail = await crawler.fetchDetail(item);
        if (!detail || !detail.startDate || !detail.endDate) {
            console.log(`⏩ [${count}/${items.length}] 날짜 정보 없음으로 건너뜀: ${item.title}`);
            continue;
        }

        // '대관' 제외 (사용자 요청)
        if (detail.title.includes('대관')) {
            console.log(`⏩ [${count}/${items.length}] 대관 정보 제외: ${detail.title}`);
            continue;
        }

        // Check for duplicate using docId
        const existing = await calendarService.findEvent(targetCalendarId, detail.docId, detail.startDate);
        if (existing) {
            console.log(`⏩ [${count}/${items.length}] 이미 등록된 일정: ${detail.title}`);
            continue;
        }

        // Create Event
        console.log(`Processing [${count}/${items.length}]: ${detail.title} (${detail.startDate} ~ ${detail.endDate})`);
        await calendarService.createEvent(targetCalendarId, detail);
    }

    console.log('\n🎉 모든 작업이 완료되었습니다!');
    process.exit(0);
}

main();
