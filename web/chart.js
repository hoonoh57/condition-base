import { createChart,CandlestickSeries,LineSeries,HistogramSeries,createSeriesMarkers } from 'lightweight-charts';
import { api } from './api.js';
let chart,candle,ma60,bbUp,volume,markers,anchorLine,peakLine;
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
 if(data.anchor_date&&dates.has(data.anchor_date))points.push({time:data.anchor_date,position:'belowBar',shape:'arrowUp',color:'#dd9c39',text:'매수 '+(data.anchor_open??'관측 없음')});
 if(data.mfe_end&&dates.has(data.mfe_end))points.push({time:data.mfe_end,position:'aboveBar',shape:'square',color:'#6b7280',text:'창 종료 '+(data.ret_end==null?'':(data.ret_end>=0?'+':'')+(data.ret_end*100).toFixed(1)+'%')});
 markers.setMarkers(points.filter(p=>dates.has(p.time)));
 if(anchorLine){candle.removePriceLine(anchorLine);anchorLine=null;}
 if(data.anchor_open)anchorLine=candle.createPriceLine({price:data.anchor_open,color:'#dd9c39',lineWidth:1,lineStyle:2,axisLabelVisible:true,title:'매수'});
 if(peakLine){candle.removePriceLine(peakLine);peakLine=null;}
 if(data.anchor_open&&data.mfe!=null)peakLine=candle.createPriceLine({price:Math.round(data.anchor_open*(1+data.mfe)),color:'#0a7c3f',lineWidth:1,lineStyle:2,axisLabelVisible:true,title:'최고'});
 chart.timeScale().fitContent();
 const parts=['조건 성립 '+data.cond_date];
 parts.push(data.anchor_date?'매수 '+data.anchor_date+' / '+(data.anchor_open??'관측 없음'):'앵커 미관측');
 if(data.mfe!=null)parts.push('MFE '+(data.mfe*100).toFixed(1)+'%'+(data.mfe_day?' ('+data.mfe_day+'일째)':''));
 if(data.ret_end!=null)parts.push('창 종료 '+(data.ret_end>=0?'+':'')+(data.ret_end*100).toFixed(1)+'%');
 document.getElementById('chart-note').textContent=parts.join(' · ');
}
