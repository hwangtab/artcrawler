const axios = require('axios');
const cheerio = require('cheerio');

async function testPagination() {
    // Try requesting 100 items
    const url = 'https://artnuri.or.kr/crawler/info/search.do?key=2301170002&pageUnit=10&pageIndex=1';
    console.log(`Fetching: ${url}`);

    try {
        const { data } = await axios.get(url);
        const $ = cheerio.load(data);
        const count = $('ul.card li').length;
        console.log(`Items found: ${count}`);

        // Also check typical pagination controls if pageUnit didn't work
        const pagination = $('.paging').text().trim();
        console.log('Pagination text:', pagination);

    } catch (e) {
        console.error(e.message);
    }
}

testPagination();
