const CalendarService = require('./calendar');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const askQuestion = (query) => new Promise((resolve) => rl.question(query, resolve));

async function main() {
    console.log('=== 🧹 개인화 일정 청소 도구 (경기/전국 + 음악 삭제) ===');

    // 1. Initialize
    const calendarService = new CalendarService();

    // 2. Auth
    try {
        await calendarService.authorize();
    } catch (error) {
        console.log('\n🚫 인증 실패.');
        process.exit(1);
    }

    // 3. Select Calendar
    console.log('\n📅 청소할 캘린더를 선택하세요');
    const calendars = await calendarService.listCalendars();
    const writableCalendars = calendars.filter(c => c.accessRole === 'owner' || c.accessRole === 'writer');

    console.log('------------------------------------------------');
    writableCalendars.forEach((cal, index) => {
        console.log(`${index + 1}. ${cal.summary} (${cal.id})`);
    });
    console.log('------------------------------------------------');

    let selectedIndex = -1;
    while (selectedIndex < 0 || selectedIndex >= writableCalendars.length) {
        const answer = await askQuestion('👉 번호를 입력하세요: ');
        selectedIndex = parseInt(answer) - 1;
    }
    const targetCalendar = writableCalendars[selectedIndex];

    // 4. Confirm
    console.log(`\n🚨 경고: '${targetCalendar.summary}'에서 다음 조건의 일정만 삭제합니다.`);
    console.log('   조건: [지역: 경기/전국/전체] AND [분야: 음악/전체]');
    const confirm = await askQuestion('동의하시면 "yes"라고 입력하세요: ');

    if (confirm.trim().toLowerCase() !== 'yes') {
        console.log('❌ 취소되었습니다.');
        process.exit(0);
    }

    // 5. Delete Filtered Events
    console.log('\n🗑️ 삭제 작업을 시작합니다...');

    let pageToken = null;
    let totalDeleted = 0;

    do {
        const res = await calendarService.calendar.events.list({
            calendarId: targetCalendar.id,
            pageToken: pageToken,
            maxResults: 250,
            singleEvents: true
        });

        const events = res.data.items;
        if (events.length === 0 && totalDeleted === 0) {
            console.log('일정이 없습니다.');
            break;
        }

        for (const event of events) {
            if (!event.description || !event.description.includes('[지원사업 정보]')) {
                continue; // Skip non-crawler events
            }

            // Parse Description for Filter
            // Description format: 
            // - 분야: ...
            // - 지역: ...

            const fieldMatch = event.description.match(/- 분야: (.*)/);
            const regionMatch = event.description.match(/- 지역: (.*)/);

            const genre = fieldMatch ? fieldMatch[1].trim() : '';
            const region = regionMatch ? regionMatch[1].trim() : '';

            // Filter Logic (Same as index_personal.js)
            const isRegionMatch = region.includes('전국') || region.includes('전체') || region.includes('경기');
            const isGenreMatch = genre.includes('전 전체') || genre.includes('전체') || genre.includes('음악'); // '전 전체' check just in case

            if (isRegionMatch && isGenreMatch) {
                try {
                    process.stdout.write(`삭제 중: ${event.summary}... `);
                    await calendarService.calendar.events.delete({
                        calendarId: targetCalendar.id,
                        eventId: event.id
                    });
                    console.log('✅');
                    totalDeleted++;
                } catch (e) {
                    console.log(`❌ 실패 (${e.message})`);
                }
                await new Promise(r => setTimeout(r, 100)); // Rate limit
            }
        }

        pageToken = res.data.nextPageToken;

    } while (pageToken);

    console.log(`\n✨ 총 ${totalDeleted}개의 조건 일치 일정을 삭제했습니다.`);
    process.exit(0);
}

main();
