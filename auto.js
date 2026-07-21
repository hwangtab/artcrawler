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
const ArtNuriCrawler = require('./crawler');
const CalendarService = require('./calendar');

// token.json / credentials.json은 process.cwd() 기준으로 읽히므로,
// 어디서 실행하든 프로젝트 폴더를 기준으로 맞춘다.
process.chdir(__dirname);

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

    const crawler = new ArtNuriCrawler();
    const calendarService = new CalendarService();

    // 1. 인증 (실패 시 즉시 종료 — 로그인 창을 띄우지 않는다)
    await calendarService.authorize({ interactive: false });

    // 2. 목록 수집
    console.log('\n🕷️ 데이터 수집을 시작합니다...');
    const items = await crawler.fetchList();

    if (items.length === 0) {
        console.log('⚠️ 수집된 데이터가 없습니다.');
        return { added: 0, duplicated: 0, skipped: 0, failed: 0, total: 0 };
    }

    console.log(`\n총 ${items.length}개의 항목을 처리합니다.`);

    // 3. 캘린더 등록
    const stat = { added: 0, duplicated: 0, skipped: 0, failed: 0, total: items.length };
    let count = 0;

    for (const item of items) {
        count++;
        const tag = `[${count}/${items.length}]`;

        const detail = await crawler.fetchDetail(item);

        if (!detail) {
            console.log(`❌ ${tag} 상세 정보 수집 실패: ${item.title}`);
            stat.failed++;
            continue;
        }

        if (!detail.startDate || !detail.endDate) {
            console.log(`⏩ ${tag} 날짜 정보 없음으로 건너뜀: ${item.title}`);
            stat.skipped++;
            continue;
        }

        // '대관' 제외 (사용자 요청)
        if (detail.title.includes('대관')) {
            console.log(`⏩ ${tag} 대관 정보 제외: ${detail.title}`);
            stat.skipped++;
            continue;
        }

        // docId 기준 중복 확인
        const existing = await calendarService.findEvent(CALENDAR_ID, detail.docId, detail.startDate);
        if (existing) {
            console.log(`⏩ ${tag} 이미 등록된 일정: ${detail.title}`);
            stat.duplicated++;
            continue;
        }

        console.log(`Processing ${tag}: ${detail.title} (${detail.startDate} ~ ${detail.endDate})`);
        const created = await calendarService.createEvent(CALENDAR_ID, detail);

        // createEvent는 실패를 내부에서 처리하고 undefined를 반환한다
        if (created) stat.added++;
        else stat.failed++;
    }

    return stat;
}

// 사이트가 응답하지 않아 프로세스가 매달리는 것을 막는다
const watchdog = setTimeout(() => {
    console.error(`\n⏱️ 최대 실행 시간(${MAX_RUNTIME_MS / 60000}분)을 초과해 강제 종료합니다. (${now()})`);
    process.exit(1);
}, MAX_RUNTIME_MS);

main()
    .then((stat) => {
        clearTimeout(watchdog);
        console.log('\n' + '-'.repeat(60));
        console.log(`🎉 완료: ${now()}`);
        console.log(`   신규 등록 ${stat.added}건 / 중복 ${stat.duplicated}건 / 건너뜀 ${stat.skipped}건 / 실패 ${stat.failed}건 (전체 ${stat.total}건)`);
        console.log('-'.repeat(60) + '\n');
        process.exit(0);
    })
    .catch((error) => {
        clearTimeout(watchdog);
        console.error('\n' + '-'.repeat(60));
        console.error(`💥 실행 실패: ${now()}`);
        console.error(`   ${error.message}`);
        console.error('-'.repeat(60) + '\n');
        process.exit(1);
    });
