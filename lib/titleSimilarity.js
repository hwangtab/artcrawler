/**
 * 소스 간 중복(같은 공고가 다른 소스로 들어오는 경우) 판별용 제목 유사도.
 * 시작일 ±1일 범위의 이벤트끼리만 비교되므로, 회차만 다른 공고(2차/3차)는
 * 접수기간이 달라 애초에 비교 대상에 오르지 않는다.
 */

const SIMILARITY_THRESHOLD = 0.75; // bigram Jaccard 임계값
const MIN_CONTAIN_LENGTH = 10;     // 포함관계 판정 최소 길이 (짧은 제목 오탐 방지)

function normalizeTitle(title) {
    return String(title || '')
        .replace(/\[[^\]]*\]/g, '')       // [장르/지역], [KOCCA] 등 프리픽스 제거
        .toLowerCase()
        .replace(/[^0-9a-z가-힣]/g, '');  // 공백·기호 제거
}

function bigrams(s) {
    const set = new Set();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
}

function jaccard(a, b) {
    if (a.size === 0 || b.size === 0) return 0;
    let inter = 0;
    for (const x of a) if (b.has(x)) inter++;
    return inter / (a.size + b.size - inter);
}

function isSimilarTitle(a, b) {
    const na = normalizeTitle(a);
    const nb = normalizeTitle(b);
    if (!na || !nb) return false;
    const shorter = na.length <= nb.length ? na : nb;
    const longer = na.length <= nb.length ? nb : na;
    if (shorter.length >= MIN_CONTAIN_LENGTH && longer.includes(shorter)) return true;
    return jaccard(bigrams(na), bigrams(nb)) >= SIMILARITY_THRESHOLD;
}

module.exports = { normalizeTitle, isSimilarTitle };
