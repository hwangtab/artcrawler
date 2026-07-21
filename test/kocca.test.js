const { test } = require('node:test');
const assert = require('node:assert');
const { parseListHtml, parsePeriod, passesFilter } = require('../sources/kocca');

const FIXTURE = `
<table><tbody>
<tr>
  <td>모집공모</td>
  <td><a href="/kocca/pims/view.do?intcNo=326D00091012&menuNo=204104">2026년 대중음악 공연환경 개선 지원사업 공고</a></td>
  <td>26.07.09</td><td>26.07.13 ~ 26.07.31</td><td>1234</td>
</tr>
<tr>
  <td>모집공모</td>
  <td><a href="/kocca/pims/view.do?intcNo=326D00099999&menuNo=204104">2026 스웨덴 게임 컨퍼런스 참가기업 모집공고</a></td>
  <td>26.07.10</td><td>26.07.10 ~ 26.07.27</td><td>2597</td>
</tr>
<tr><td>안내</td><td>링크 없는 행</td><td></td><td></td><td></td></tr>
</tbody></table>`;

test('목록 HTML에서 intcNo·제목·접수기간을 파싱한다', () => {
    const rows = parseListHtml(FIXTURE);
    assert.strictEqual(rows.length, 2);
    assert.strictEqual(rows[0].docId, '326D00091012');
    assert.strictEqual(rows[0].title, '2026년 대중음악 공연환경 개선 지원사업 공고');
    assert.deepStrictEqual(rows[0].period, { startDate: '2026-07-13', endDate: '2026-07-31' });
});

test('YY.MM.DD ~ YY.MM.DD 접수기간을 ISO로 변환한다', () => {
    assert.deepStrictEqual(
        parsePeriod('26.07.15 26.07.13 ~ 26.07.31 1234'),  // 공고일이 앞에 섞여도 ~ 패턴만 매칭
        { startDate: '2026-07-13', endDate: '2026-07-31' }
    );
});

test('접수기간이 없으면 null', () => {
    assert.strictEqual(parsePeriod('상시 접수'), null);
});

test('문화예술 키워드가 있으면 통과, 없으면 제외', () => {
    assert.ok(passesFilter('2026년 대중음악 공연환경 개선 지원사업 공고'));
    assert.ok(!passesFilter('2026 스웨덴 게임 컨퍼런스 참가기업 모집공고'));
    assert.ok(!passesFilter('2026 콘텐츠IP 마켓 참가기업 모집'));
});

test('대관 공고는 키워드가 있어도 제외', () => {
    assert.ok(!passesFilter('예술극장 공연장 대관 공고'));
});
