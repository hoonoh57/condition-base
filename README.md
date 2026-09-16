# condition-base

볼린저밴드 상단 돌파 계열 조건식의 **성능을 측정**하는 연구 인프라.
수익 로직을 가정하지 않고, 측정 장치가 판정한다.

## 확정 규약
- 앵커: 일봉 조건 성립(D) → **T+1 시가**. 측정 기준점 = 체결 기준점.
- 일봉 레이어는 **MFE만** 평가. 손절·비용·청산순서는 분봉 레이어 소관.
- 기본값은 전부 최악 가정. 완화는 실측 근거가 있을 때만, 로그 남기고 재측정.
- 조건식은 문자열이 아니라 `strategy_condition` 행. UI는 렌더러.
- 행 추가 = 새 버전 + 시도 회계 +1. 슬라이더 탐색은 회계 미소모.

## 시작
1. `copy .env.example .env` 후 비밀번호 입력
2. `mysql < sql/00_core/01_schema.sql` / `02_condition_def.sql`
3. `node scripts/p0-check.mjs` ← **결과 확인 전 다음 단계 금지**
4. `mysql < sql/01_derived/01_schema.sql` / `node scripts/build-derived.mjs`
5. `npm run dev`

## 미확인 항목
- 2026년 증권거래세 시행일·농특세 포함 여부 → `TAX_SCHEDULE_VER`
- KRX 시장경보 시기별 임계치 → `EXCL_ALERT_RULE.rule_ver`
- 폐지종목 커버리지 (P0 점검 결과에 따라 생존편향 명시)
