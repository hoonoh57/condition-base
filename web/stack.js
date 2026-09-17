import { api } from './api.js';
const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pct=value=>value==null?'—':(Number(value)*100).toFixed(1)+'%';
const fmt=value=>value==null?'—':Number(value).toLocaleString('ko-KR');
const state={versionId:'',rows:[],definitions:[],versions:[],change:null,refreshId:0};
const paramLabels={lo:'하한',hi:'상한',min_krw:'평균 거래대금 하한 (원)',top_n:'거래대금 순위 상한',pool:'순위 모집단',
 within:'돌파 후 거래일',len:'계산 기간',mult:'표준편차 배수',buf_atr:'ATR 여유 배수',pct:'밴드폭 분위 (%)',look:'분위 관측 기간',
 max_ret:'최대 수익률 (소수)',days:'재포착 간격 (거래일)',gap_days:'결측 거래일 기준',tail_days:'폐지 이력 배제 기간 (일)',
 win:'MFE 창',thr:'MFE 임계값 (소수)'};
function message(value=''){const el=$('#message');el.textContent=value;el.hidden=!value;}
function error(err){message(err.message);}
function opts(){return{part:$('#part').value,mfeWin:Number($('#win').value),mfeThr:Number($('#thr').value)};}
function query(){return new URLSearchParams({versionId:state.versionId,...opts()});}
function locked(yes){for(const id of ['add','measure','refresh']) $('#'+id).disabled=yes;}

function resetMetrics(){
 for(const key of ['n','pass','exec']) $('#metric-'+key).textContent='—';
 $('#metric-day').textContent='일평균 —';
 $('#metric-lift').textContent='기준 대비 —';
 $('#metric-evaluated').textContent='측정 가능 표본 —';
 $('#chart').hidden=true;$('#chart-title').textContent='가격과 측정 기준점';
 $('#chart-note').textContent='현재 표본을 선택해 근거를 확인하세요.';
}


function render(result){
 state.rows=result.rows;
 const liftClass=v=>v==null?'':v>=1.2?'good':v<1?'bad':'flat';
 const liftText=v=>v==null?'—':Number(v).toFixed(2)+'배';
 const tbody=$('#stack tbody');
 tbody.innerHTML=result.rows.length?result.rows.map(r=>'<tr class="'+(r.enabled?'':'off')+'"><td>'+r.order_no+'</td><td>'+esc(r.label_ko??r.cond_key)+(r.frozen?'<span class="badge">동결</span>':'')+
  '<small>'+esc(Object.entries(r.params).map(([k,v])=>(paramLabels[k]??k)+' '+v).join(' · '))+'</small></td><td>'+fmt(r.n_survive)+'</td><td>'+(r.is_quality?'컷 없음':pct(r.cut_pct))+'</td><td>'+(r.per_day==null?'—':Number(r.per_day).toFixed(2))+'</td><td>'+pct(r.mfe_pass_pct)+'</td><td class="base">'+pct(r.base_pass_pct)+'</td><td class="'+liftClass(r.lift)+'">'+liftText(r.lift)+'</td><td>'+pct(r.exec_pct)+'</td><td>'+
  (r.frozen?'<span class="muted">앵커</span>':'<button data-edit="'+r.order_no+'">설정</button><button data-toggle="'+r.order_no+'">'+(r.enabled?'OFF':'ON')+'</button><button aria-label="위로 이동" data-up="'+r.order_no+'" '+(r.order_no<=2?'disabled':'')+'>↑</button><button aria-label="아래로 이동" data-down="'+r.order_no+'" '+(r.order_no===result.rows.length?'disabled':'')+'>↓</button>')+'</td></tr>').join(''):'<tr><td colspan="10" class="empty">조건을 추가하세요.</td></tr>';
 const final=result.rows.filter(r=>r.enabled).at(-1);
 $('#metric-n').textContent=fmt(final?.n_survive);
 $('#metric-day').textContent='일평균 '+(final?.per_day==null?'—':Number(final.per_day).toFixed(2));
 $('#metric-pass').textContent=pct(final?.mfe_pass_pct);
 $('#metric-exec').textContent=pct(final?.exec_pct);
 $('#metric-lift').textContent=final?.lift==null?'기준 대비 —':'기준 '+pct(final.base_pass_pct)+' · '+liftText(final.lift);
 $('#metric-evaluated').textContent='측정 가능 표본 '+fmt(final?.n_evaluated)+' / 기준 '+fmt(final?.base_n);
 $('#asof').textContent='데이터 기준 '+(result.dataAsOf??'—');
 $('#stack-note').textContent=result.part+' · '+(result.stored?'저장된 측정':'현재 데이터 탐색')+' · '+(result.dateFrom??'')+' ~ '+(result.dateTo??'');
 $('#verdict').textContent=result.hypothesis?'가설 '+result.hypothesis.verdict+' · 예상 감소 '+pct(result.hypothesis.predictedCut)+' / 실측 '+pct(result.hypothesis.measuredCut)+' · 예상 통과 '+pct(result.hypothesis.predictedPass)+' / 실측 '+pct(result.hypothesis.measuredPass):
  'MFE는 전방 기간이 완전하고 해당 구간 안에 있는 표본만 평가합니다. 미측정은 —로 표시합니다. 기준은 점화 조건을 뺀 동일 필터의 비점화 표본입니다.';
}


async function loadCandidates(){
 const token=state.refreshId;
 const data=await api('/api/stack/candidates?'+query());
 if(token!==state.refreshId)return;
 $('#candidates').innerHTML=data.rows.length?data.rows.map(r=>'<button class="candidate" data-instrument="'+esc(r.instrument_id)+'" data-date="'+esc(r.cond_date)+'"><span>종목 '+esc(r.instrument_id)+'<br><small>'+esc(r.cond_date)+'</small></span><span>'+pct(r.mfe)+'<br><small>MFE</small></span></button>').join(''):'<p class="empty">통과한 표본이 없습니다.</p>';
}
async function refresh(){
 if(!state.versionId)return;
 const token=++state.refreshId;
 message();locked(true);resetMetrics();
 try{
  const result=await api('/api/stack?'+query());
  if(token!==state.refreshId)return;
  $('#stack tbody').innerHTML='<tr><td colspan="8" class="empty">선택한 구간·설정의 측정 결과가 없습니다.</td></tr>';
  $('#stack-note').textContent=opts().part+' · 조회할 수 없음';$('#verdict').textContent='';
  render(result);await loadCandidates();
 }catch(err){
  if(token!==state.refreshId)return;
  $('#candidates').innerHTML='<p class="empty">현재 설정으로 조회할 수 없습니다.</p>';
  error(err);
 }finally{if(token===state.refreshId)locked(false);}
}
async function loadLedger(){
 const data=await api('/api/ledger');
 $('#metric-trials').textContent=fmt(data.N);
 $('#metric-budget').textContent=data.partitions.filter(p=>p.part!=='IS').map(p=>p.part+' '+p.unlock_count+'/'+p.max_unlocks).join(' · ');
 $('#partitions').innerHTML=data.partitions.map(p=>'<div class="card"><span>'+esc(p.part)+' 측정</span><strong>'+p.unlock_count+' <small>/ '+p.max_unlocks+'</small></strong><small>'+esc(p.date_from)+' ~ '+esc(p.date_to)+'</small></div>').join('')+'<div class="card"><span>Bonferroni α</span><strong>'+(data.bonferroni_alpha==null?'—':data.bonferroni_alpha.toFixed(4))+'</strong><small>시도 수 '+data.N+' · q 기준 0.10</small></div>';
 $('#trials').innerHTML='<thead><tr><th>시도</th><th>전략 / 버전</th><th>가설</th><th>구간</th><th>예상 → 실측 통과</th><th>판정</th></tr></thead><tbody>'+
  (data.trials.length?data.trials.map(r=>'<tr><td>'+esc(r.trial_id)+'</td><td>'+esc(r.strategy_name)+' · v'+r.ver+'</td><td>'+esc(r.statement)+'</td><td>'+r.partition_used+'</td><td>'+pct(r.pred_pass_pct)+' → '+pct(r.measured_pass_pct)+'</td><td>'+esc(r.verdict)+'</td></tr>').join(''):'<tr><td colspan="6" class="empty">아직 기록된 연구 시도가 없습니다.</td></tr>')+'</tbody>';
}
async function loadCatalog(){
 const data=await api('/api/strategies/conditions');state.definitions=data.conditions;
 $('#availability').innerHTML='<thead><tr><th>조건</th><th>슬롯</th><th>사용 가능</th><th>설명</th></tr></thead><tbody>'+data.conditions.map(d=>'<tr><td>'+esc(d.label_ko)+'</td><td>'+d.slot+'</td><td>'+(d.available?'준비됨':'대기')+'</td><td>'+esc(d.reason??d.note??'—')+'</td></tr>').join('')+'</tbody>';
 return data;
}
async function loadSupply(){
 const data=await api('/api/supply');
 $('#coverage').textContent='파생 데이터: '+data.coverage.status+' · 기준일 '+(data.coverage.dataAsOf??'—')+' · 후보 '+fmt(data.coverage.candidates)+'건. '+data.note;
 $('#improvements').innerHTML=data.items.map(i=>'<article class="card"><h3>'+esc(i.title)+'</h3><p>'+esc(i.current_state_assumption)+'</p><small>'+esc(i.expected_effect??'')+' · '+esc(i.status)+'</small></article>').join('');
}
async function loadStrategies(selected){
 const data=await api('/api/strategies');
 $('#strategy').innerHTML='<option value="">전략을 선택하세요</option>'+data.strategies.map(s=>'<option value="'+esc(s.strategy_id)+'">'+esc(s.name)+'</option>').join('');
 if(selected)$('#strategy').value=selected;
 else if(data.strategies.length)$('#strategy').value=data.strategies[0].strategy_id;
 if($('#strategy').value)await loadVersions();
}
async function loadVersions(selected){
 const data=await api('/api/strategies/'+$('#strategy').value+'/versions');state.versions=data.versions;
 $('#version').innerHTML=data.versions.map(v=>'<option value="'+esc(v.version_id)+'">v'+v.ver+' · '+esc(v.status)+(v.part?' · '+v.part:'')+'</option>').join('');
 if(selected)$('#version').value=selected;
 state.versionId=$('#version').value;
 resetMetrics();
 const selectedVersion=state.versions.find(v=>String(v.version_id)===state.versionId);
 if(selectedVersion?.part){
  const snapshot=await api('/api/stack/snapshot/'+state.versionId);
  $('#part').value=snapshot.part;$('#win').value=snapshot.mfeWin;$('#thr').value=snapshot.mfeThr;updateThreshold();
  state.refreshId++;render(snapshot);locked(false);await loadCandidates();
 }else{$('#part').value='IS';await refresh();}
}
function updateThreshold(){$('#thrv').textContent=(Number($('#thr').value)*100).toFixed(0)+'%';}
function drawParams(params){
 $('#params').innerHTML=Object.entries(params).map(([k,v])=>'<label>'+esc(paramLabels[k]??k)+'<input data-param="'+esc(k)+'" type="'+(typeof v==='number'?'number':'text')+'" '+(typeof v==='number'?'step="any"':'')+' value="'+esc(v)+'" required '+(['len','look','pool'].includes(k)?'readonly':'')+'></label>').join('');
}
function chooseCondition(){
 const def=state.definitions.find(d=>d.cond_key===$('#condition').value);
 $('#change-description').textContent=def?.note??'조건을 추가해 순차 감소율과 품질을 측정합니다.';
 drawParams(def?.defaults??{});
}
function openChange(change){
 if(!state.versionId)return;
 state.change={...change,versionId:state.versionId,hypId:null};$('#change-form').reset();
 $('#change-form .form-error').textContent='';
 $('#condition-label').hidden=change.action!=='add';
 $('#params').innerHTML='';
 const titles={add:'조건 추가',update:'조건 설정 변경',toggle:'조건 ON / OFF',reorder:'조건 순서 변경',measure:'현재 스택 측정'};
 $('#change-title').textContent=titles[change.action];
 if(change.action==='add'){
  const used=new Set(state.rows.map(r=>r.cond_key));
  $('#condition').innerHTML=state.definitions.filter(d=>!used.has(d.cond_key)).map(d=>'<option value="'+esc(d.cond_key)+'" '+(!d.available?'disabled':'')+'>'+esc(d.label_ko)+(!d.available?' · 데이터 대기':'')+'</option>').join('');
  const first=state.definitions.find(d=>!used.has(d.cond_key)&&d.available);
  $('#condition').value=first?.cond_key??'';
  $('#change-submit').disabled=!first;chooseCondition();
 }else{
  $('#change-submit').disabled=false;
  $('#change-description').textContent=change.description??'기존 버전을 보존하고 새 버전을 측정합니다.';
  if(change.action==='update')drawParams(change.row.params);
 }
 $('#change-dialog').showModal();
}
async function submitChange(event){
 event.preventDefault();const button=$('#change-submit');button.disabled=true;
 const change=state.change;
 try{
  if(!change.hypId){
   const h=await api('/api/strategies/versions/'+change.versionId+'/hypotheses',{body:{
    statement:$('#hyp-statement').value,predCut:Number($('#pred-cut').value)/100,predPass:Number($('#pred-pass').value)/100}});
   change.hypId=h.hypId;
  }
  const body={versionId:change.versionId,hypId:change.hypId,...opts()};
  const params={};for(const input of document.querySelectorAll('[data-param]'))params[input.dataset.param]=input.type==='number'?Number(input.value):input.value;
  let path='/api/stack/measure';
  if(change.action==='add'){path='/api/stack/rows';Object.assign(body,{condKey:$('#condition').value,params});}
  if(change.action==='update'){path='/api/stack/rows/update';Object.assign(body,{orderNo:change.row.order_no,params});}
  if(change.action==='toggle'){path='/api/stack/rows/update';Object.assign(body,{orderNo:change.row.order_no,enabled:!change.row.enabled});}
  if(change.action==='reorder'){path='/api/stack/order';body.order=change.order;}
  const result=await api(path,{body});
  $('#change-dialog').close();message();
  await loadVersions(result.versionId);await loadLedger();
 }catch(err){$('#change-form .form-error').textContent=err.message;}
 finally{button.disabled=false;}
}
$('#create-form').addEventListener('submit',async event=>{
 event.preventDefault();const form=event.currentTarget,button=form.querySelector('.primary');button.disabled=true;
 try{const result=await api('/api/strategies',{body:{name:new FormData(form).get('name')}});
  $('#create-dialog').close();await loadStrategies(result.strategyId);message();
 }catch(err){form.querySelector('.form-error').textContent=err.message;}
 finally{button.disabled=false;}
});
$('#new-strategy').addEventListener('click',()=>{$('#create-form').reset();$('#create-form .form-error').textContent='';$('#create-dialog').showModal();});
document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',async()=>{
 document.querySelectorAll('.tab').forEach(el=>el.hidden=el.id!==b.dataset.tab);
 document.querySelectorAll('[data-tab]').forEach(el=>el.classList.toggle('on',el===b));
 try{if(b.dataset.tab==='history')await loadLedger();if(b.dataset.tab==='data')await Promise.all([loadCatalog(),loadSupply()]);}catch(err){error(err);}
}));
$('#strategy').addEventListener('change',()=>{
 if($('#strategy').value)loadVersions().catch(error);
 else{state.versionId='';state.rows=[];state.refreshId++;resetMetrics();locked(true);
  $('#version').replaceChildren();$('#stack tbody').innerHTML='<tr><td colspan="8" class="empty">전략을 선택하세요.</td></tr>';
  $('#candidates').innerHTML='<p class="empty">선택된 전략이 없습니다.</p>';}
});
$('#version').addEventListener('change',()=>loadVersions($('#version').value).catch(error));
$('#condition').addEventListener('change',chooseCondition);
$('#add').addEventListener('click',()=>openChange({action:'add'}));
$('#measure').addEventListener('click',()=>openChange({action:'measure'}));
$('#refresh').addEventListener('click',refresh);
$('#part').addEventListener('change',refresh);
$('#win').addEventListener('change',refresh);
let timer;
$('#thr').addEventListener('input',()=>{updateThreshold();clearTimeout(timer);timer=setTimeout(refresh,200);});
$('#change-form').addEventListener('submit',submitChange);
for(const selector of ['#hyp-statement','#pred-cut','#pred-pass'])$(selector).addEventListener('input',()=>{if(state.change)state.change.hypId=null;});
$('#stack').addEventListener('click',event=>{
 const button=event.target.closest('button');if(!button)return;
 const key=['edit','toggle','up','down'].find(k=>button.dataset[k]);if(!key)return;
 const row=state.rows.find(r=>r.order_no===Number(button.dataset[key]));
 if(key==='edit')openChange({action:'update',row,description:row.label_ko});
 else if(key==='toggle')openChange({action:'toggle',row,description:row.label_ko+' → '+(row.enabled?'OFF':'ON')});
 else{const order=state.rows.map(r=>r.order_no),index=order.indexOf(row.order_no),target=index+(key==='up'?-1:1);
  [order[index],order[target]]=[order[target],order[index]];openChange({action:'reorder',order});}
});
$('#candidates').addEventListener('click',async event=>{
 const button=event.target.closest('[data-instrument]');if(!button)return;
 document.querySelectorAll('.candidate').forEach(el=>el.classList.toggle('on',el===button));
 try{const {showEvidence}=await import('./chart.js');await showEvidence(button.dataset.instrument,button.dataset.date,state.versionId,opts());
  $('#chart-title').textContent='종목 '+button.dataset.instrument+' · '+button.dataset.date;
 }catch(err){error(err);}
});
async function init(){
 locked(true);
 try{
  await api('/api/health?db=1');$('#connection').textContent='DB 연결됨';$('#connection').className='status ok';
  await Promise.all([loadCatalog(),loadLedger(),loadSupply()]);await loadStrategies();
 }catch(err){$('#connection').textContent='DB 준비 필요';$('#connection').className='status error';error(err);}
}
await init();
