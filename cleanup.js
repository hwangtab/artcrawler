const CalendarService = require('./calendar');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const askQuestion = (query) => new Promise((resolve) => rl.question(query, resolve));

async function main() {
    console.log('=== 🧹 캘린더 초기화(삭제) 도구 ===');

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
    console.log('\n📅 초기화할 캘린더를 선택하세요 (주의: 모든 일정이 삭제됩니다!!)');
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
    console.log(`\n🚨 경고: 정말로 '${targetCalendar.summary}' 캘린더의 모든 일정을 삭제하시겠습니까?`);
    console.log('삭제된 일정은 복구할 수 없습니다.');
    const confirm = await askQuestion('동의하시면 "yes"라고 입력하세요: ');

    if (confirm.trim().toLowerCase() !== 'yes') {
        console.log('❌ 취소되었습니다.');
        process.exit(0);
    }

    // 5. Delete All Events
    console.log('\n🗑️ 삭제 작업을 시작합니다...');

    let pageToken = null;
    let totalDeleted = 0;

    do {
        const res = await calendarService.calendar.events.list({
            calendarId: targetCalendar.id,
            pageToken: pageToken,
            maxResults: 250, // Max allowed
            singleEvents: true // Expand recurring events to delete instances
        });

        const events = res.data.items;
        if (events.length === 0 && totalDeleted === 0) {
            console.log('삭제할 일정이 없습니다.');
            break;
        }

        for (const event of events) {
            // Only delete events created by our crawler
            // We identify them by the signature text in description
            if (event.description && event.description.includes('[지원사업 정보]')) {
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
                // Add a small delay to avoid rate limits
                await new Promise(r => setTimeout(r, 100));
            } else {
                // Skip manual events
                // console.log(`⏩ 건너뜀 (사용자 등록 일정): ${event.summary}`);
            }
        }

        pageToken = res.data.nextPageToken;

    } while (pageToken);

    console.log(`\n✨ 총 ${totalDeleted}개의 일정을 삭제했습니다.`);
    console.log('이제 다시 깨끗한 상태에서 index.js를 실행해보세요!');
    process.exit(0);
}

main();
