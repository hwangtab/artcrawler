const { test } = require('node:test');
const assert = require('node:assert');
const { normalizeTitle, isSimilarTitle } = require('../lib/titleSimilarity');

test('프리픽스·공백·기호를 제거해 정규화한다', () => {
    assert.strictEqual(
        normalizeTitle('[음악/서울] 2026년 서리풀 뮤직 페스티벌!'),
        '2026년서리풀뮤직페스티벌'
    );
});

test('프리픽스만 다른 같은 공고는 유사 판정한다', () => {
    assert.ok(isSimilarTitle(
        '[KOCCA] 2026년 대중음악 공연환경 개선 지원사업 공고',
        '[음악/전국] 2026년 대중음악 공연환경 개선 지원사업 공고'
    ));
});

test('전혀 다른 공고는 유사 판정하지 않는다', () => {
    assert.ok(!isSimilarTitle(
        '[KOCCA] 2026 스웨덴 게임 컨퍼런스 참가기업 모집',
        '[음악/전국] 2026년 청년예술인 창작지원 공모'
    ));
});

test('한쪽이 다른 쪽에 포함되면 유사 판정한다 (10자 이상)', () => {
    assert.ok(isSimilarTitle(
        '2026년 아르코예술행정아카데미',
        '[문화일반/전국] 2026년 아르코예술행정아카데미 참여자 모집'
    ));
});

test('짧은 문자열의 포함관계는 유사 판정하지 않는다', () => {
    assert.ok(!isSimilarTitle('공모전', '2026년 업사이클 디자인 공모전'));
});

test('빈 제목은 유사 판정하지 않는다', () => {
    assert.ok(!isSimilarTitle('', '2026년 공모'));
});
