const DATA_URL = "/JEPQ251218/data/jepq.json";

let raw = null;
let chart = null;
let candleSeries = null;
let volSeries = null;

function fmtNum(n){
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toLocaleString("en-US");
}
function fmtPrice(n){
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toFixed(2);
}
function unixFromISO(iso){
  // iso: YYYY-MM-DD
  const [y,m,d] = iso.split("-").map(Number);
  return Math.floor(Date.UTC(y, m-1, d) / 1000);
}
function sliceByTF(series, tf){
  // series: [{time, open, high, low, close, volume}]
  if (!series?.length) return [];

  const last = series[series.length - 1];
  const lastTime = last.time; // unix seconds
  const lastDate = new Date(lastTime * 1000);

  const day = 24*60*60;

  const cut = (t) => series.filter(x => x.time >= t);

  if (tf === "MAX") return series;

  if (tf === "5Y"){
    const t = lastTime - (365*5*day);
    return cut(t);
  }
  if (tf === "1Y"){
    const t = lastTime - (365*day);
    return cut(t);
  }
  if (tf === "6M"){
    const t = lastTime - (183*day);
    return cut(t);
  }
  if (tf === "1M"){
    const t = lastTime - (31*day);
    return cut(t);
  }
  if (tf === "5D"){
    const t = lastTime - (10*day); // 주말 고려해서 넉넉히
    return cut(t);
  }
  if (tf === "1D"){
    const t = lastTime - (3*day); // 일봉 기준 “최근 며칠”
    return cut(t);
  }
  if (tf === "YTD"){
    const y = lastDate.getUTCFullYear();
    const t = Math.floor(Date.UTC(y, 0, 1) / 1000);
    return cut(t);
  }
  return series;
}

function ensureChart(){
  const el = document.getElementById("chart");
  el.innerHTML = "";

  chart = LightweightCharts.createChart(el, {
    layout: { background: { type:"solid", color: "rgba(0,0,0,0)" }, textColor: "#e5e7eb" },
    grid: { vertLines: { color: "rgba(255,255,255,.05)" }, horzLines: { color: "rgba(255,255,255,.05)" } },
    rightPriceScale: { borderColor: "rgba(255,255,255,.10)" },
    timeScale: { borderColor: "rgba(255,255,255,.10)" },
    crosshair: {
      vertLine: { labelBackgroundColor: "rgba(251,146,60,.9)" },
      horzLine: { labelBackgroundColor: "rgba(251,146,60,.9)" }
    },
    height: el.clientHeight,
  });

candleSeries = chart.addSeries(LightweightCharts.CandlestickSeries, {
  upColor: "rgba(34,197,94,.95)",
  downColor: "rgba(239,68,68,.95)",
  borderVisible: false,
  wickUpColor: "rgba(34,197,94,.95)",
  wickDownColor: "rgba(239,68,68,.95)",
});


  volSeries = chart.addHistogramSeries({
    priceFormat: { type: "volume" },
    priceScaleId: "",
    scaleMargins: { top: 0.80, bottom: 0 },
  });

  chart.timeScale().fitContent();
  window.addEventListener("resize", () => {
    chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
  });
}

function renderStats(summary){
  document.getElementById("asof").textContent = summary.asof
    ? `As of ${summary.asof} (UTC)`
    : "As of —";

  const pill = document.getElementById("pricePill");
  const close = summary.last_close;
  const chg = summary.change;
  const pct = summary.change_pct;

  pill.textContent = close != null ? `$${fmtPrice(close)}  ${chg>=0?"+":""}${fmtPrice(chg)} (${chg>=0?"+":""}${fmtPrice(pct)}%)` : "—";
  pill.style.borderColor = chg>=0 ? "rgba(34,197,94,.7)" : "rgba(239,68,68,.7)";
  pill.style.background = chg>=0 ? "rgba(34,197,94,.14)" : "rgba(239,68,68,.14)";

  document.getElementById("range52").textContent =
    (summary.range_52w_low != null && summary.range_52w_high != null)
      ? `${fmtPrice(summary.range_52w_low)} ~ ${fmtPrice(summary.range_52w_high)}`
      : "—";

  document.getElementById("range1d").textContent =
    (summary.day_low != null && summary.day_high != null)
      ? `${fmtPrice(summary.day_low)} ~ ${fmtPrice(summary.day_high)}`
      : "—";

  document.getElementById("vol").textContent = summary.volume != null ? fmtNum(summary.volume) : "—";
  document.getElementById("close").textContent = summary.last_close != null ? fmtPrice(summary.last_close) : "—";

  const chgEl = document.getElementById("chg");
  if (chg != null && pct != null){
    chgEl.textContent = `${chg>=0?"+":""}${fmtPrice(chg)} (${chg>=0?"+":""}${fmtPrice(pct)}%)`;
    chgEl.style.color = chg>=0 ? "#22c55e" : "#ef4444";
  } else {
    chgEl.textContent = "—";
  }
}

function setData(series){
  const c = series.map(x => ({
    time: x.time, open: x.open, high: x.high, low: x.low, close: x.close
  }));
  candleSeries.setData(c);

  const v = series.map(x => ({
    time: x.time,
    value: x.volume ?? 0,
    color: (x.close >= x.open) ? "rgba(34,197,94,.35)" : "rgba(239,68,68,.35)"
  }));
  volSeries.setData(v);

  chart.timeScale().fitContent();
}

async function load(){
  const res = await fetch(DATA_URL, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load data/jepq.json");
  raw = await res.json();

  ensureChart();
  renderStats(raw.summary);

  // default 1Y
  const sliced = sliceByTF(raw.series, "1Y");
  setData(sliced);

  // buttons
  const wrap = document.getElementById("tf");
  wrap.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const tf = btn.dataset.tf;

    [...wrap.querySelectorAll("button")].forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    const s = sliceByTF(raw.series, tf);
    setData(s);
  });
}

load().catch(err => {
  console.error(err);
  document.getElementById("asof").textContent = "Data load error. Check if data/jepq.json exists.";
});


