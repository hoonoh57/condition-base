# SRB 연구 흐름과 데이터 계약

## 구성

Express API → 단일 계정 mysql2 풀 → MySQL core/derived/lab.
브라우저 ES 모듈은 로컬 Lightweight Charts 파일을 import map으로 로드합니다.
설치/P0/빌드/API는 DB_USER와 DB_PASSWORD 한 쌍을 공유합니다.
설정·SQL 식별자는 검증 후 매핑하며 사용자 입력은 SQL 파라미터로 바인딩합니다.

## API

| 경로 | 기능 |
| --- | --- |
| GET /api/health?db=1 | 공통 DB 계정 연결 확인 |
| GET/POST /api/strategies | 전략 목록/생성 |
| GET /api/strategies/conditions | 조건 정의·기본값·자료 준비 여부 |
| GET /api/strategies/:id/versions | 전략 버전 목록 |
| GET /api/strategies/versions/:id | 버전과 조건 행 |
| GET/POST /api/strategies/versions/:id/hypotheses | 가설 목록/사전 등록 |
| GET /api/stack | versionId, part, mfeWin, mfeThr로 조회 |
| POST /api/stack/rows | versionId, hypId, condKey, params로 행 추가 |
| POST /api/stack/rows/update | versionId, hypId, orderNo, params 또는 enabled |
| POST /api/stack/order | versionId, hypId, order(기존 order_no 배열) |
| POST /api/stack/measure | versionId, hypId와 구간·MFE 설정으로 재측정 |
| GET /api/stack/snapshot/:id | 저장된 측정 조회 |
| GET /api/stack/candidates | 최종 조건을 통과한 최근 100개 표본 |
| GET /api/bars | instrumentId, cond_date, versionId, part로 근거 시계열 |
| GET /api/ledger | 누적 시도·가설 판정·구간 예산·최근 200개 기록 |
| GET /api/supply | 준비 상태와 개선 항목; instrumentId/asOf로 IS 내 수급 조회 |

POST body는 JSON입니다. part 기본 IS, mfeWin 기본 20(5/10/20/40), mfeThr 기본 0.08입니다.
ID는 문자열로 취급하여 BIGINT 정밀도를 보존합니다. code 별칭도 instrument_id를 뜻합니다.
별도의 종목 코드/이름 원천 계약은 없으므로 화면은 instrument_id를 표시합니다.
날짜는 항상 YYYY-MM-DD 문자열입니다.

## 트랜잭션

1. 파생 빌드 상태를 공유 잠금으로 확인합니다.
2. 전략 행과 지정 가설을 잠그고 버전 소유·OPEN 상태를 확인합니다.
3. 파라미터·자료 준비 여부·동결 앵커를 검증합니다.
4. 새 버전에 조건을 복제하고 변경합니다. 원본은 수정하지 않습니다.
5. 시도 1회 기록, OOS/VAULT 예산 1회 차감, 평가를 수행합니다.
6. baseline, 행별 snapshot, 정밀한 전체 result JSON을 저장합니다.
7. 가설을 닫고 버전을 TESTED로 바꾼 뒤 커밋합니다. 실패하면 모두 롤백합니다.

초기 전략 생성은 측정이 아니므로 시도를 소모하지 않습니다.
CREATE TABLE LIKE로 만든 lab 연구 테이블에는 원본 FK가 복제되지 않습니다.
따라서 API 서비스의 잠금·존재 확인·트랜잭션이 쓰기 경계이며 수동 SQL 쓰기는 별도 관리 대상입니다.

## 원천 테이블 계약

market_data.korean_equity_daily:

- instrument_id BIGINT UNSIGNED, trading_date DATE (복합 PK)
- open/high/low/close BIGINT UNSIGNED (원 단위, 유효 OHLC)
- amount BIGINT UNSIGNED (거래대금)
- 모든 종목의 동일 거래일 기준 자료. 수정주가/권리락 처리 방식은 공급자가 일관되게 보장해야 합니다.

market_data.market_instrument (P0만 사용):

- instrument_id, instrument_type(EQUITY), first_seen_date, last_seen_date

추가 입력은 srb_derived에 위치합니다:

- shares_history(instrument_id, effective_date, known_date, shares_outstanding)
- status_history(instrument_id, effective_date, known_date, status: ACTIVE/HALTED/DELISTED)
- investor_flow(instrument_id, trading_date, known_date, foreign_net, institution_net)

known_date는 연구자가 그 사실을 알 수 있었던 날짜입니다.
효력 발생일과 인지일 둘 다 D 이하인 최신 자료만 사용합니다.
마지막 관측일을 과거에 알고 있었던 폐지 정보로 사용하지 않습니다.
추가 입력 적재 후 파생 데이터를 다시 빌드합니다.
시총/폐지 필터는 전체 후보에 시점 자료가 있어야 활성화합니다.

## 계산 규약

- d_ind: 20/60/120일 이동평균, sd20, ATR20(단순 평균), amt20, 직전 20봉 고저가,
  BBW=4*sd20/ma20, 이전 ma60/bbw, 점화 여부. 필요한 관측 수 미달 지표는 NULL입니다.
- 시장 거래일은 관측 날짜 합집합, 앵커는 그 다음 날짜입니다. 며칠 뒤 재개된 봉을 T+1로 당기지 않습니다.
- amt_rank_mkt는 당일 거래대금 시장 RANK(동률 포함)입니다.
- ma60_xup_age는 종가가 MA60을 상향 돌파한 뒤 경과한 시장 거래일 수입니다.
- bbw_pct_prev는 D-1 밴드폭을 D 이전 120개 완전한 밴드폭과 비교한 누적 백분위입니다.
- DEDUP_DAYS는 이전 점화 후보와의 시장 거래일 간격입니다. 앞 필터 통과 여부에 따라 기준점을 바꾸지 않습니다.
- EXCL_HALT는 알려진 정지/거래대금 0 및 이전 관측 봉과의 결측 거래일 수를 사용합니다.
- EXCL_DELISTED는 known_date가 충족된 상장상태와 과거 폐지 이력만 사용합니다.
- MFE는 T+1 시가 대비 향후 5/10/20/40 거래일 최고가입니다.
  중간 봉 누락, 기간 부족, 비집행 표본은 NULL입니다.
- 구간 종료일을 넘는 MFE는 해당 구간 통계에서 제외합니다. 일평균 분모는 표본이 없는 날을 포함한 시장 거래일 수입니다.
- MFE_QUALITY는 컷을 만들지 않습니다. 그 행 추가/설정 변경 시 win/thr로 최초 측정하고 이후 IS 전역 컨트롤로 무료 탐색합니다.
- HH20/BB의 len은 20, SQZ look은 120만 지원합니다. 지원하지 않는 값은 무시하지 않고 거절합니다.
- 월말 유니버스는 해당 월의 마지막 관측 거래일에 amt20 내림차순, instrument_id 오름차순으로 정확히 Top N개를 뽑습니다.
  진행 중인 월은 현재 최신 거래일 스냅샷이며 as_of 이후부터 사용할 수 있습니다.

## 가설 판정과 제한

가설 감소율 예측은 마지막 활성 행의 직전 필터 대비 cut_pct를 뜻합니다.
CONFIRMED: 감소율 예측 오차 10%p 이내이면서 MFE 통과율이 사전 예측 이상.
측정 가능한 MFE가 없으면 INCONCLUSIVE, 나머지는 REJECTED입니다.
이는 고정된 연구용 판정 규칙이며 통계적 유의성 검정을 대신하지 않습니다.
N은 실제 시도 수입니다. N=0이면 Bonferroni alpha는 NULL이고, 그 외 0.05/N입니다.

OOS/VAULT의 무료 재계산을 허용하는 설정 우회는 없습니다.
저장된 창/임계값만 조회합니다. 표본과 차트는 해당 버전 최종 필터와 구간을 따라야 하며,
데이터 build_id가 바뀌면 다시 측정해야 합니다.
