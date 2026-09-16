# condition-base

볼린저밴드 상단 돌파 계열 조건식의 성능을 측정하는 SRB 연구 인프라입니다.
Node.js 20 이상, MySQL 8.0.22 이상을 사용합니다.

## 확정 규약

- 일봉 조건 성립 D → 다음 시장 거래일 T+1 시가가 앵커입니다.
- 일봉은 MFE만 평가합니다. 비용·손절·체결 순서를 포함한 손익 백테스트는 아닙니다.
- 조건 추가·설정 변경·ON/OFF·순서 변경·명시적 재측정은 새 버전과 연구 시도 1회를 만듭니다.
- 가설은 측정 전에 등록하며 한 번만 사용할 수 있습니다. 앵커 조건은 동결합니다.
- IS 창·임계값 조회는 무료입니다. OOS/VAULT는 가설과 예산을 사용한 측정만 가능하며,
  무료 조회는 저장된 창·임계값의 결과로 제한합니다.

## PowerShell에서 시작

`cd /d`는 cmd 문법이고 PowerShell은 `< file.sql` 입력 리디렉션을 지원하지 않습니다.
아래 npm 래퍼를 사용하면 mysql 실행 파일을 PATH에 추가할 필요도 없습니다.
밑줄은 `srb_build`처럼 그대로 씁니다. `srb\_build`가 아닙니다.

```powershell
Set-Location 'E:\2026\opus\condition-base'
npm install
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

.env에 읽기(MD), 빌드(BUILD), 실험(LAB) 계정 정보를 설정합니다.
최초 설치 시에만 ADMIN_USER/ADMIN_PASSWORD에 스키마와 계정을 관리할 수 있는 계정을 지정합니다.
웹 서버는 관리자 계정을 사용하지 않습니다. 기존 .env를 예시 파일로 덮어쓰지 마세요.

```powershell
npm run db:setup
npm run db:grants
npm run p0
```

각 명령이 성공한 뒤 다음 명령을 실행합니다. P0가 출력한 전체/신규/소멸 종목 수와
연도별 소멸 분포를 검토한 후 빌드합니다. 자동으로 생존편향이 없다고 판정하지 않습니다.

```powershell
npm run build:derived -- --p0-reviewed
npm run universe
npm run dev
```

기본 주소는 **http://127.0.0.1:5180**입니다. 일반 실행은 `npm start`입니다.
스키마가 이미 준비되어 있으면 관리자 설치 단계는 생략할 수 있습니다.
`db:grants`는 없는 사용자를 만들고 역할을 지정하지만 기존 사용자의 비밀번호는 바꾸지 않습니다.
`ER_ACCESS_DENIED_ERROR`는 .env의 계정/비밀번호, DB_ACCOUNT_HOST 및 실제 MySQL 권한을 확인해야 합니다.

## 사용 흐름

1. 새 전략을 만들면 +10~15% 점화 앵커가 포함된 첫 버전이 생성됩니다.
2. 조건 추가에서 조건·파라미터와 가설·예상 감소율·예상 MFE 통과율을 입력합니다.
3. 새 버전에 각 행의 생존 수, 감소율, 전체 구간 거래일 기준 일평균, MFE 통과율, 집행 가능률이 저장됩니다.
4. 표본을 선택하면 캔들, MA60, 볼린저 상단, 거래대금과 D/T+1 기준점을 확인합니다.
5. 연구이력에서 시도 회계, 가설 판정, OOS/VAULT 예산을 조회합니다.
6. 데이터 준비에서 원천 자료가 없어 비활성화된 조건을 확인합니다.

## 명령과 데이터 경계

| 명령 | 목적 | 계정 |
| --- | --- | --- |
| npm run db:setup | core/derived/lab 스키마와 기준 정의 설치 | ADMIN |
| npm run db:grants | 계정 생성 및 MySQL 역할 부여 | ADMIN |
| npm run p0 | 생존편향 진단과 data/p0-report.json 저장 | MD |
| npm run build:derived -- --p0-reviewed | 지표와 후보·성과 테이블 재생성 | BUILD |
| npm run universe | MINUTE_UNIVERSE_TOP_N개의 월말 유니버스 생성 | BUILD |
| npm start / npm run dev | API와 웹 화면 | MD / LAB |
| npm test | 단위·HTTP 검사, 설정된 경우 DB 통합 검사 | 테스트 DB만 |

`db:setup`, `p0`, `build:derived`, `universe`에 `-- --dry-run`을 붙이면 DB에 연결하지 않고 SQL 파일 읽기·문장 분할을 확인합니다.
dry run은 DB 문법/권한 검증이 아닙니다.

- market_data: 원천 데이터. 앱과 빌드 계정은 읽기 전용입니다.
- srb_core: 기준 조건과 초기 설정. 웹 앱은 읽기 전용입니다.
- srb_derived: 지표, 거래일 캘린더, 후보, 시점별 입력 자료. BUILD만 씁니다.
- srb_lab: 전략·버전·가설·시도·스냅샷·검증 예산. LAB이 트랜잭션으로 씁니다.
- PROM은 별도 승격용 INSERT 권한만 준비하며 웹 앱에서 사용하지 않습니다.

DB 이름은 MD_DATABASE/CORE_DATABASE/DERIVED_DATABASE/LAB_DATABASE로 변경할 수 있습니다.
기존 core 연구 테이블을 삭제하거나 lab으로 자동 이관하지 않습니다.
SQL 파일은 sql/, 실행 래퍼는 scripts/*.mjs에 둡니다.

빌드는 d_ind/d_feat/trading_calendar를 재생성합니다. MySQL DDL은 전체 롤백되지 않으므로
실패 시 build_state를 FAILED로 표시하고 조회를 차단합니다. 재빌드를 완료해야 다시 조회할 수 있습니다.
빌드 ID가 바뀌면 예전 OOS/VAULT 스냅샷 자체는 열람할 수 있지만 새 데이터의 표본·차트는 새 측정이 필요합니다.

## 입력 자료와 측정 한계

기본 원천 계약은 [DESIGN.md](docs/DESIGN.md)에 있습니다.
상장주식수, 상장상태, 투자자 수급은 known_date를 포함한 입력 테이블을 제공합니다.
원천 자료가 없으면 해당 조건을 비활성화하며 값을 추정해서 채우지 않습니다.

- 거래일 캘린더는 전 종목 일봉의 관측 날짜 합집합입니다. 시장 전체 수집 누락은 별도 검증해야 합니다.
- 거래정지는 T+1 봉 누락/거래대금 0 및 과거 결측 거래일로 판별하는 대용 규칙입니다.
- 시가 상한가 갇힘은 고가=저가=시가이면서 전일 종가 대비 29% 이상인 보수적 대용 규칙입니다.
- MFE는 정해진 거래일 수만큼 모든 봉이 있고 구간 종료일을 넘지 않은 표본만 분모에 포함합니다.
- 시점별 폐지 이력은 미래 last_seen_date를 조건 필터로 사용하지 않습니다.
- 투자경고/주의 규칙 및 실제 세금·비용 모델은 확인 전까지 활성화하지 않습니다.

## 테스트

`npm test`는 DB 없이도 실행합니다. MYSQL_TEST_URL이 없으면 MySQL 통합 테스트 하나가 명시적으로 skip됩니다.
통합 테스트는 localhost의 **별도 테스트 MySQL 인스턴스**를 사용하며,
고유한 srb_test_* 스키마·사용자를 만들고 종료 시 삭제합니다.

```powershell
$env:MYSQL_TEST_URL = 'mysql://test_admin:password@127.0.0.1:33307'
$env:BROWSER_TEST = '1'
$env:BROWSER_CHANNEL = 'chrome'
npm test
Remove-Item Env:MYSQL_TEST_URL, Env:BROWSER_TEST, Env:BROWSER_CHANNEL
```

브라우저 검사는 설치된 Chrome을 사용합니다(Edge는 BROWSER_CHANNEL=msedge).
스크린샷은 Git에서 제외된 artifacts/에 저장합니다.
MySQL 9.7.1의 격리 인스턴스와 Chrome에서 SQL·실제 역할 권한·동시 요청·롤백·전체 화면 흐름을 검증했습니다.
실제 운영 원천 데이터의 커버리지와 P0 결과는 별도로 확인해야 합니다.
