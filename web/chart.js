import { createChart,CandlestickSeries,LineSeries,HistogramSeries,createSeriesMarkers } from 'lightweight-charts';
import { api } from './api.js';
let chart,candle,ma60,bbUp,volume,markers;
export async function showEvidence(instrumentId,condDate,versionId,opts){
 const data=await api('/api/bars?'+new URLSearchParams({instrumentId,cond_date:condDate,versionId,...opts}));
 document.getElementById('chart').hidden=false;
 if(!chart){
  const element=document.getElementById('chart');element.replaceChildren();
  chart=createChart(element,{autoSize:true,layout:{textColor:'#8491a5',fontFamily:'system-ui'},
   grid:{vertLines:{color:'#f3f5f9'},horzLines:{color:'#f0f3f8'}},rightPriceScale:{borderColor:'#edf0f5'},timeScale:{borderColor:'#edf0f5'}});
  candle=chart.addSeries(CandlestickSeries,{upColor:'#df626c',downColor:'#4773df',borderVisible:false,wickUpColor:'#df626c',wickDownColor:'#4773df'});
  ma60=chart.addSeries(LineSeries,{color:'#d7a84d',lineWidth:2,priceLineVisible:false,lastValueVisible:false});
  bbUp=chart.addSeries(LineSeries,{color:'#8e85cf',lineWidth:1,lineStyle:2,priceLineVisible:false,lastValueVisible:false});
  volume=chart.addSeries(HistogramSeries,{color:'#dce4f7',priceFormat:{type:'volume'},priceLineVisible:false,lastValueVisible:false},1);
  markers=createSeriesMarkers(candle,[]);
 }
 candle.setData(data.candles);ma60.setData(data.ma60);bbUp.setData(data.bb_up);volume.setData(data.volume);
 const dates=new Set(data.candles.map(c=>c.time));
 const points=[{time:data.cond_date,position:'belowBar',shape:'arrowUp',color:'#345ee1',text:'조건 D'}];
 if(data.anchor_date&&dates.has(data.anchor_date))points.push({time:data.anchor_date,position:'aboveBar',shape:'circle',color:'#dd9c39',text:'T+1 시가 '+data.anchor_open});
 markers.setMarkers(points.filter(p=>dates.has(p.time)));chart.timeScale().fitContent();
 document.getElementById('chart-note').textContent='조건 성립 '+data.cond_date+' · '+(data.anchor_date?'앵커 '+data.anchor_date+' / 시가 '+(data.anchor_open??'관측 없음'):'앵커 미관측');
}
