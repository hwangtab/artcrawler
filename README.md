# 🎨 ArtNuri Calendar Automation (아트누리 캘린더 자동화)

[아트누리](https://artnuri.or.kr)의 예술 지원사업 공고를 자동으로 수집하여 구글 캘린더에 연동해주는 도구입니다.

## ✨ 주요 기능
- **자동 수집**: 아트누리에 게시된 '진행중'인 모든 공고를 크롤링합니다.
- **캘린더 연동**: 공고 기간(시작~종료), 제목, 상세 링크를 구글 캘린더에 자동으로 등록합니다.
- **스마트 기능**:
    - **중복 방지**: 이미 등록된 공고는 건너뜁니다.
    - **깔끔한 제목**: `[문학/전국] 공고명` 형태로 한눈에 파악 가능합니다.
- **개인화 필터링**: 원하는 지역/장르만 골라서 받을 수도 있습니다.

---

## 📦 설치

### 1. 저장소 클론
```bash
git clone https://github.com/hwangtab/artcrawler.git
cd artcrawler
```

### 2. 의존성 설치
```bash
npm install
```

---

## 🔐 구글 클라우드 설정 (OAuth 2.0)

이 프로그램은 구글 캘린더에 접근하기 위해 **OAuth 2.0 인증**이 필요합니다. 아래 순서대로 진행해 주세요.

### Step 1: 구글 클라우드 콘솔 접속
[Google Cloud Console](https://console.cloud.google.com/)에 접속하여 로그인합니다.

### Step 2: 새 프로젝트 생성
1. 상단의 프로젝트 선택 드롭다운을 클릭합니다.
2. **'새 프로젝트'**를 클릭합니다.
3. 프로젝트 이름(예: `artnuri-calendar`)을 입력하고 **만들기**를 클릭합니다.
4. 생성된 프로젝트를 선택합니다.

### Step 3: Calendar API 활성화
1. 왼쪽 메뉴에서 **'API 및 서비스' > '라이브러리'**로 이동합니다.
2. 검색창에 **'Google Calendar API'**를 검색합니다.
3. 검색 결과에서 **Google Calendar API**를 클릭하고 **'사용'** 버튼을 누릅니다.

### Step 4: OAuth 동의 화면 구성
1. **'API 및 서비스' > 'OAuth 동의 화면'**으로 이동합니다.
2. **User Type**에서 **'외부(External)'**를 선택하고 **만들기**를 클릭합니다.
3. 필수 정보를 입력합니다:
   - **앱 이름**: `ArtNuri Calendar` (아무거나 입력 가능)
   - **사용자 지원 이메일**: 본인 이메일 선택
   - **개발자 연락처 정보**: 본인 이메일 입력
4. **저장 후 계속**을 클릭하여 범위(Scopes) 단계로 넘어갑니다.
5. **'범위 추가 또는 삭제'**를 클릭하고, 검색창에 `calendar`를 입력합니다.
6. `https://www.googleapis.com/auth/calendar` 항목을 체크하고 **업데이트**를 클릭합니다.
7. 나머지 단계는 **저장 후 계속**을 눌러 완료합니다.

### Step 5: OAuth 클라이언트 ID 생성
1. **'API 및 서비스' > '사용자 인증 정보'**로 이동합니다.
2. 상단의 **'+ 사용자 인증 정보 만들기' > 'OAuth 클라이언트 ID'**를 클릭합니다.
3. **애플리케이션 유형**에서 **'데스크톱 앱'**을 선택합니다.
4. 이름(예: `artnuri-desktop`)을 입력하고 **만들기**를 클릭합니다.
5. 생성된 클라이언트 ID 옆의 **다운로드 아이콘(JSON 다운로드)**을 클릭합니다.

### Step 6: 인증 파일 배치
1. 다운로드된 파일의 이름을 **`credentials.json`**으로 변경합니다.
2. 이 파일을 **프로젝트 루트 폴더** (예: `artcrawler/`)에 넣습니다.

> ⚠️ **보안 주의**: `credentials.json` 파일은 절대로 깃허브에 올리지 마세요! `.gitignore`에 이미 등록되어 있으므로 실수로 올라가지 않습니다.

---

## 🚀 사용법

### 전체 모드 (모든 공고 가져오기)
```bash
node index.js
```
- 처음 실행 시 브라우저가 열리면 구글 로그인을 진행합니다.
- 등록할 캘린더(예: `예술지원사업 캘린더`)의 번호를 선택합니다.
- 모든 진행중인 공고가 자동으로 등록됩니다.

### 개인화 모드 (특정 조건만 가져오기)
```bash
node index_personal.js
```
- 기본 설정: **경기/전국** 지역 + **음악/전체** 장르만 가져옵니다.

### 초기화 모드 (자동 등록된 일정 삭제)
```bash
node cleanup.js
```
- **이 프로그램이 등록한 일정만** 안전하게 삭제합니다. 직접 등록한 개인 일정은 건드리지 않습니다.

---

## 🧑‍🎨 개인화 방법 (나만의 필터 만들기)

`index_personal.js` 파일을 열어서 필터 조건을 수정할 수 있습니다.

### 수정할 위치 (약 70번째 줄 부근)
```javascript
// --- FILTER LOGIC (개인화 필터) ---
// 1. 지역: '전국', '전체', 또는 '경기'가 포함된 경우
const region = detail.region || '';
const isRegionMatch = region.includes('전국') || 
                      region.includes('전체') || 
                      region.includes('경기');

// 2. 장르: '전체' 또는 '음악'이 포함된 경우
const genre = detail.field || '';
const isGenreMatch = genre.includes('전체') || 
                     genre.includes('음악');
// ----------------------------------
```

### 예시 1: 서울 지역의 시각예술만 받고 싶다면
```javascript
const isRegionMatch = region.includes('서울');
const isGenreMatch = genre.includes('시각예술');
```

### 예시 2: 전국 대상 + 연극/뮤지컬만 받고 싶다면
```javascript
const isRegionMatch = region.includes('전국') || region.includes('전체');
const isGenreMatch = genre.includes('연극') || genre.includes('뮤지컬');
```

### 사용 가능한 필터 값
| 구분 | 값 |
| :--- | :--- |
| **지역** | 전국, 전체, 서울, 부산, 대구, 인천, 광주, 대전, 울산, 세종, 경기, 강원, 충북, 충남, 전북, 전남, 경북, 경남, 제주, 해외 |
| **장르** | 전체, 문학, 시각예술, 연극, 뮤지컬, 무용, 음악, 전통예술, 다원예술, 문화일반, 기타 |

---

## 🛠️ 기술 스택
- Node.js
- Axios / Cheerio (웹 크롤링)
- Google Calendar API

## 📝 라이선스
MIT License
