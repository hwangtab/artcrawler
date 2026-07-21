/**
 * 예술지원사업 캘린더 자동 등록 (비대화형)
 *
 * index.js와 달리 캘린더를 직접 고르지 않고 아래 CALENDAR_ID로 바로 등록한다.
 * launchd(주 1회)가 이 파일을 실행한다. 사람이 지켜보지 않는 환경이므로
 *  - 입력을 기다리지 않고
 *  - 브라우저 로그인 창을 띄우지 않으며
 *  - 멈추지 않도록 최대 실행 시간을 둔다.
 *
 * 수동 실행: node auto.js
 */
// token.json / credentials.json은 process.cwd() 기준으로 읽히므로,
// 어디서 실행하든 프로젝트 폴더를 기준으로 맞춘다.
process.chdir(__dirname);

const CalendarService = require('./calendar');

// 수집 소스 어댑터 목록. 새 소스는 sources/에 어댑터를 만들어 여기에 추가한다.
const SOURCES = [
    require('./sources/artnuri'),
    require('./sources/kocca'),
];

// 예술지원사업 캘린더
const CALENDAR_ID = process.env.CALENDAR_ID ||
    '55003b5c29557cb6f006200151c200230248039f63ba67e3738974ea9763f3f9@group.calendar.google.com';

// 크롤링 대상 사이트가 응답하지 않을 때 무한 대기하지 않도록 하는 안전장치
const MAX_RUNTIME_MS = 30 * 60 * 1000; // 30분

const now = () => new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });

async function main() {
    console.log('='.repeat(60));
    console.log(`🎨 자동 실행 시작: ${now()}`);
    console.log('='.repeat(60));

    const calendarService = new CalendarService();

    // 1. 인증 (실패 시 즉시 종료 — 로그인 창을 띄우지 않는다)
    await calendarService.authorize({ interactive: false });

    // 2. 소스별 수집·등록 (한 소스가 실패해도 나머지는 진행)
    const summary = [];
    for (const source of SOURCES) {
        const stat = {
            source: source.sourceKey,
            added: 0, duplicated: 0, similar: 0, failed: 0, total: 0,
            fetchFailed: false,
        };
        summary.push(stat);

        let items;
        try {
            items = await source.fetchAll();
        } catch (error) {
            console.error(`❌ [${source.sourceKey}] 수집 실패: ${error.message}`);
            stat.fetchFailed = true;
            continue;
        }
        stat.total = items.length;

        for (const [i, item] of items.entries()) {
            const tag = `[${source.sourceKey} ${i + 1}/${items.length}]`;

            const dup = await calendarService.findDuplicate(CALENDAR_ID, item);
            if (dup) {
                if (dup.reason === 'id') {
                    console.log(`⏩ ${tag} 이미 등록된 일정: ${item.title}`);
                    stat.duplicated++;
                } else {
                    console.log(`⏩ ${tag} 유사 공고 존재 ("${dup.event.summary}"): ${item.title}`);
                    stat.similar++;
                }
                continue;
            }

            console.log(`Processing ${tag}: ${item.title} (${item.startDate} ~ ${item.endDate})`);
            const created = await calendarService.createEvent(CALENDAR_ID, item);
            if (created) stat.added++;
            else stat.failed++;
        }
    }

    return summary;
}

// 사이트가 응답하지 않아 프로세스가 매달리는 것을 막는다
const watchdog = setTimeout(() => {
    console.error(`\n⏱️ 최대 실행 시간(${MAX_RUNTIME_MS / 60000}분)을 초과해 강제 종료합니다. (${now()})`);
    process.exit(1);
}, MAX_RUNTIME_MS);

main()
    .then((summary) => {
        clearTimeout(watchdog);
        console.log('\n' + '-'.repeat(60));
        console.log(`🎉 완료: ${now()}`);
        summary.forEach(s => {
            if (s.fetchFailed) {
                console.log(`   ${s.source}: ❌ 수집 실패`);
            } else {
                console.log(`   ${s.source}: 신규 ${s.added} / 중복 ${s.duplicated} / 유사 ${s.similar} / 실패 ${s.failed} (수집 ${s.total})`);
            }
        });
        console.log('-'.repeat(60) + '\n');
        const allFailed = summary.length > 0 && summary.every(s => s.fetchFailed);
        process.exit(allFailed ? 1 : 0);
    })
    .catch((error) => {
        clearTimeout(watchdog);
        console.error('\n' + '-'.repeat(60));
        console.error(`💥 실행 실패: ${now()}`);
        console.error(`   ${error.message}`);
        console.error('-'.repeat(60) + '\n');
        process.exit(1);
    });
