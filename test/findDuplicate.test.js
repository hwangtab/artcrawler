const { test } = require('node:test');
const assert = require('node:assert');
const CalendarService = require('../calendar');

function stubService(events) {
    const svc = new CalendarService();
    svc.calendar = { events: { list: async () => ({ data: { items: events } }) } };
    return svc;
}

test('ID 라인이 일치하면 reason=id', async () => {
    const svc = stubService([
        { summary: '다른 제목', description: '[지원사업 정보] (ID: KOCCA:ABC123)\n- 접수기간: ...' },
    ]);
    const dup = await svc.findDuplicate('cal', {
        dedupeKey: 'KOCCA:ABC123', title: '아무거나', startDate: '2026-08-01',
    });
    assert.strictEqual(dup.reason, 'id');
});

test('ID는 다르지만 제목이 유사하면 reason=similar', async () => {
    const svc = stubService([
        { summary: '[음악/전국] 2026년 대중음악 공연환경 개선 지원사업 공고', description: '(ID: CRL9999)' },
    ]);
    const dup = await svc.findDuplicate('cal', {
        dedupeKey: 'KOCCA:XYZ', title: '[KOCCA] 2026년 대중음악 공연환경 개선 지원사업 공고', startDate: '2026-08-01',
    });
    assert.strictEqual(dup.reason, 'similar');
});

test('ID·제목 모두 다르면 null', async () => {
    const svc = stubService([
        { summary: '[문학/서울] 창작시 공모전', description: '(ID: CRL1111)' },
    ]);
    const dup = await svc.findDuplicate('cal', {
        dedupeKey: 'KOCCA:XYZ', title: '[KOCCA] 대중음악 공연환경 개선 지원', startDate: '2026-08-01',
    });
    assert.strictEqual(dup, null);
});

test('dedupeKey가 기존 ID의 접두사여도 오탐하지 않는다', async () => {
    const svc = stubService([
        { summary: '다른 공고', description: '[지원사업 정보] (ID: CRL35690)' },
    ]);
    const dup = await svc.findDuplicate('cal', {
        dedupeKey: 'CRL3569', title: '전혀 다른 새 공고 제목입니다', startDate: '2026-08-01',
    });
    assert.strictEqual(dup, null);
});

test('API 오류 시 null (등록을 막지 않는다)', async () => {
    const svc = new CalendarService();
    svc.calendar = { events: { list: async () => { throw new Error('boom'); } } };
    const dup = await svc.findDuplicate('cal', {
        dedupeKey: 'X', title: 'T', startDate: '2026-08-01',
    });
    assert.strictEqual(dup, null);
});
