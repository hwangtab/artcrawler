const fs = require('fs').promises;
const path = require('path');
const process = require('process');
const { authenticate } = require('@google-cloud/local-auth');
const { google } = require('googleapis');

// If modifying these scopes, delete token.json.
const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const TOKEN_PATH = path.join(process.cwd(), 'token.json');
const CREDENTIALS_PATH = path.join(process.cwd(), 'credentials.json');

class CalendarService {
    constructor() {
        this.calendarId = null; // Will be set by user or config
        this.auth = null;
        this.calendar = null;
    }

    async loadSavedCredentialsIfExist() {
        try {
            const content = await fs.readFile(TOKEN_PATH);
            const credentials = JSON.parse(content);
            return google.auth.fromJSON(credentials);
        } catch (err) {
            return null;
        }
    }

    async saveCredentials(client) {
        const content = await fs.readFile(CREDENTIALS_PATH);
        const keys = JSON.parse(content);
        const key = keys.installed || keys.web;
        const payload = JSON.stringify({
            type: 'authorized_user',
            client_id: key.client_id,
            client_secret: key.client_secret,
            refresh_token: client.credentials.refresh_token,
        });
        await fs.writeFile(TOKEN_PATH, payload);
    }

    /**
     * @param {object} [options]
     * @param {boolean} [options.interactive=true] false면 브라우저 로그인 창을 절대 띄우지 않는다.
     *   (launchd 자동 실행처럼 사람이 없는 환경에서 무한 대기에 빠지는 것을 방지)
     */
    async authorize({ interactive = true } = {}) {
        console.log('🔐 구글 캘린더 인증을 시도합니다...');
        let client = await this.loadSavedCredentialsIfExist();
        if (client) {
            this.auth = client;
            this.calendar = google.calendar({ version: 'v3', auth: client });

            // Validate the token by making a dummy request
            try {
                await this.calendar.calendarList.list({ maxResults: 1 });
                return client;
            } catch (e) {
                if (!interactive) {
                    // 토큰은 지우지 않는다. 일시적 네트워크 오류일 수도 있고,
                    // 지워버리면 사용자가 원인을 파악하기 더 어려워진다.
                    throw new Error(
                        `저장된 인증 토큰을 사용할 수 없습니다 (${e.message}). ` +
                        '터미널에서 `node index.js`를 한 번 실행해 다시 로그인해주세요.'
                    );
                }
                console.log('⚠️ 저장된 인증 정보가 만료되었습니다. 다시 로그인을 진행합니다...');
                await fs.unlink(TOKEN_PATH).catch(() => { });
                client = null; // Force re-auth
            }
        }

        if (!client) {
            if (!interactive) {
                throw new Error(
                    'token.json이 없습니다. 터미널에서 `node index.js`를 한 번 실행해 최초 로그인을 완료해주세요.'
                );
            }
            try {
                client = await authenticate({
                    scopes: SCOPES,
                    keyfilePath: CREDENTIALS_PATH,
                });
            } catch (error) {
                console.error('❌ 인증 실패: credentials.json 파일을 찾을 수 없거나 올바르지 않습니다.');
                console.error('   프로젝트 폴더 안에 credentials.json 파일이 있는지 확인해주세요.');
                throw error;
            }
        }

        if (client.credentials) {
            await this.saveCredentials(client);
        }

        this.auth = client;
        this.calendar = google.calendar({ version: 'v3', auth: client });
        console.log('✅ 인증 성공! (토큰 저장됨)');
        return client;
    }

    /**
     * Lists the next 10 events on the user's primary calendar.
     */
    async listCalendars() {
        const res = await this.calendar.calendarList.list();
        return res.data.items;
    }

    async findEvent(calendarId, docId, startDate) {
        // Search for existing events to prevent duplicates by docId
        const start = new Date(startDate);
        const end = new Date(startDate);
        end.setDate(end.getDate() + 1); // Look within that day

        try {
            const res = await this.calendar.events.list({
                calendarId,
                timeMin: start.toISOString(),
                timeMax: end.toISOString(),
                singleEvents: true,
                q: docId // Search for docId in event text (title or description)
            });

            // Check if any event contains this docId in description
            const found = res.data.items.find(e =>
                e.description && e.description.includes(`ID: ${docId}`)
            );
            return found;
        } catch (error) {
            console.warn('⚠️ 일정 검색 중 오류 (무시하고 진행):', error.message);
            return null;
        }
    }

    /**
     * ID 정확 일치로만 중복을 판정한다.
     * 설명(description)에 `ID: <dedupeKey>)` 문자열이 포함된 이벤트를 시작일
     * ±1일 범위에서 찾는다.
     *
     * 과거에는 여기에 제목 유사도 비교를 안전망으로 추가해 소스 간 중복
     * ("아트누리"와 "KOCCA"에 같은 공고가 올라오는 경우)까지 잡으려 했으나,
     * 실제로는 "1차/2차 모집", "아카데미/아카데미 심화과정"처럼 서로 다른
     * 신규 공고를 유사 판정해 조용히 등록을 누락시키는 결함이었다. 또한
     * normalizeTitle이 `[장르/지역]` 프리픽스를 통째로 지워버려 지역만 다른
     * 템플릿 공고가 항상 중복 판정되는 문제도 있었다. Google Calendar의
     * events.list는 기간이 겹치는 종일 이벤트를 폭넓게 반환하기 때문에
     * "시작일 ±1일만 비교하면 안전하다"는 전제 자체가 성립하지 않았다.
     * 아트누리·KOCCA는 서로 겹치지 않아 소스 간 중복은 원래 드물므로,
     * 눈에 보이는 중복 1건이 조용한 신규 공고 누락보다 낫다는 판단 하에
     * 유사도 경로를 제거하고 ID 정확 일치만 사용한다.
     *
     * events.list는 한 번에 최대 250건만 반환하므로, 윈도우 안에 이벤트가
     * 많으면 nextPageToken으로 이어서 조회한다(최대 MAX_PAGES 페이지). ID를
     * 찾으면 그 즉시 반환해 불필요한 페이지 조회를 피한다.
     */
    async findDuplicate(calendarId, { dedupeKey, startDate }) {
        const timeMin = new Date(startDate);
        timeMin.setDate(timeMin.getDate() - 1);
        const timeMax = new Date(startDate);
        timeMax.setDate(timeMax.getDate() + 2);

        const MAX_PAGES = 20; // 무한루프 방지 상한

        try {
            let pageToken;
            for (let page = 0; page < MAX_PAGES; page++) {
                const res = await this.calendar.events.list({
                    calendarId,
                    timeMin: timeMin.toISOString(),
                    timeMax: timeMax.toISOString(),
                    singleEvents: true,
                    maxResults: 250,
                    pageToken,
                });
                const events = res.data.items || [];

                const idHit = events.find(e =>
                    e.description && e.description.includes(`ID: ${dedupeKey})`)
                );
                if (idHit) return { reason: 'id', event: idHit };

                pageToken = res.data.nextPageToken;
                if (!pageToken) break;
            }

            return null;
        } catch (error) {
            console.warn('⚠️ 중복 검색 중 오류 (무시하고 진행):', error.message);
            return null;
        }
    }

    async createEvent(calendarId, eventData) {
        const { title, description, startDate, endDate } = eventData;

        // Google Calendar requires YYYY-MM-DD for all-day events
        const resource = {
            summary: title,
            description: description,
            start: {
                date: startDate, // '2025-01-01'
            },
            end: {
                date: endDate, // '2025-01-02' (Note: End date is exclusive in GCal, so we might need to add 1 day if we want it to include the end date. BUT usually 'until' means up to. I will add logic to handle this if needed, but for now assuming direct mapping.)
            },
        };

        // Adjust end date: Google Calendar all-day events are exclusive of the end date.
        // If an event is Jan 1 - Jan 3, we should send start: Jan 1, end: Jan 4.
        // Let's increment the end date string by 1 day.
        const endDt = new Date(endDate);
        if (isNaN(endDt.getTime())) {
            console.warn(`⚠️ 잘못된 종료일자로 일정 등록 건너뜀: ${title} (endDate="${endDate}")`);
            return;
        }
        endDt.setDate(endDt.getDate() + 1);
        resource.end.date = endDt.toISOString().split('T')[0];

        try {
            const res = await this.calendar.events.insert({
                calendarId,
                resource,
            });
            console.log(`📅 일정 등록 완료: ${title} (${res.data.htmlLink})`);
            return res.data;
        } catch (error) {
            console.error(`❌ 일정 등록 실패 (${title}):`, error.message);
        }
    }
}

module.exports = CalendarService;
