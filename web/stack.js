// stack.js 핵심 렌더
function render(res) {
  const t = document.getElementById('stack');
  t.innerHTML = `<tr><th>#<th>조건<th>생존<th>감소율<th>일평균
                 <th>MFE통과<th>집행가능<th></tr>` +
    res.rows.map(r => {
      const grey = r.hyp && r.measured_pass_pct < r.pred_pass_pct;  // 예측 미달 → 회색
      return `<tr class="${grey ? 'under' : ''} ${r.enabled ? '' : 'off'}">
        <td>${r.order_no}
        <td>${r.label_ko}${r.frozen ? ' <b>[동결]</b>' : ''}
        <td>${r.n_survive.toLocaleString()}
        <td>${r.is_quality ? '컷 없음' : (-r.cut_pct*100).toFixed(0)+'%'}
        <td>${r.per_day.toFixed(1)}
        <td>${pct(r.mfe_pass_pct)}
        <td>${pct(r.exec_pct)}
        <td><button data-off="${r.order_no}">${r.enabled?'OFF':'ON'}</button></tr>`;
    }).join('');
}
// 슬라이더는 GET만 → 회계 미소모
['win','thr'].forEach(id => document.getElementById(id)
  .addEventListener('input', () => refresh({ charge: false })));
