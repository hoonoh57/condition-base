import { createChart, CandlestickSeries, LineSeries, HistogramSeries,
         createSeriesMarkers } from 'lightweight-charts';

const chart = createChart(document.getElementById('chart'),
  { autoSize: true, rightPriceScale: { scaleMargins: { top: .1, bottom: .25 } } });

const candle = chart.addSeries(CandlestickSeries, {});
const ma60   = chart.addSeries(LineSeries, { lineWidth: 2 });
const bbUp   = chart.addSeries(LineSeries, { lineWidth: 1, lineStyle: 2 });
const vol    = chart.addSeries(HistogramSeries, { priceScaleId: '' }, 1); // pane 1

export async function showEvidence(code, condDate, versionId) {
  const d = await api(`/api/bars?code=${code}&cond_date=${condDate}&version=${versionId}`);
  candle.setData(d.candles); ma60.setData(d.ma60);
  bbUp.setData(d.bb_up);     vol.setData(d.volume);
  createSeriesMarkers(candle, [
    { time: d.cond_date,   position: 'belowBar', shape: 'arrowUp',   text: '조건성립 D' },
    { time: d.anchor_date, position: 'aboveBar', shape: 'circle',
      text: `앵커 T+1 시가 ${d.anchor_open}` },
  ]);
}
