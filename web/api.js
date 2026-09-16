const messages={
 DATABASE_UNAVAILABLE:'DB 연결 또는 계정 권한을 확인해 주세요. .env 수정 후 서버를 다시 시작하세요.',
 DATABASE_SETUP_REQUIRED:'DB 스키마 설치가 필요합니다. README의 DB 준비 순서를 확인해 주세요.',
 DERIVED_NOT_READY:'파생 데이터가 아직 준비되지 않았습니다. P0 점검 후 빌드를 완료해 주세요.',
 HYPOTHESIS_REQUIRED:'이 버전의 미사용 가설이 필요합니다.',
 PARTITION_BUDGET_EXHAUSTED:'선택한 구간의 측정 예산을 모두 사용했습니다.',
 HOLDOUT_MEASUREMENT_REQUIRED:'OOS·VAULT는 먼저 가설을 등록하고 측정해야 합니다. 저장된 창·임계값으로만 조회할 수 있습니다.',
 MEASUREMENT_DATA_CHANGED:'측정 이후 데이터가 재생성되었습니다. 새 가설로 다시 측정해 주세요.',
 ROW_FROZEN:'앵커 조건은 동결되어 변경할 수 없습니다.',
 CONDITION_UNAVAILABLE:'이 조건에 필요한 시점별 원천 데이터가 준비되지 않았습니다.',
 CONDITION_EXISTS:'이미 추가된 조건입니다. 기존 행의 설정을 수정해 주세요.',
 INVALID_RANGE:'최솟값은 최댓값보다 클 수 없습니다.',
 ALREADY_EXISTS:'같은 이름 또는 항목이 이미 있습니다.',
};
export async function api(path,{body,signal}={}) {
 const response=await fetch(path,{signal,headers:body?{'Content-Type':'application/json'}:undefined,
   method:body?'POST':'GET',body:body?JSON.stringify(body):undefined});
 const data=await response.json();
 if(!response.ok) throw new Error(messages[data.error]??[data.error,data.detail].filter(Boolean).join(' · '));
 return data;
}
