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


volSeries = chart.addSeries(LightweightCharts.HistogramSeries, {
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
function fmtUsd(n){
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `$${Number(n).toFixed(2)}`;
}
function fmtPct(n){
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${Number(n).toFixed(2)}%`;
}

function render52wPosition(summary, derived){
  const pos = derived?.pos_52w_pct;
  const lo = summary?.range_52w_low;
  const hi = summary?.range_52w_high;

  document.getElementById("pos52Low").textContent = lo != null ? fmtPrice(lo) : "—";
  document.getElementById("pos52High").textContent = hi != null ? fmtPrice(hi) : "—";

  const txt = document.getElementById("pos52Txt");
  const fill = document.getElementById("pos52Fill");
  const dot  = document.getElementById("pos52Dot");

  if (pos == null){
    txt.textContent = "—";
    fill.style.width = "0%";
    dot.style.left = "0%";
    return;
  }
  const p = Math.max(0, Math.min(100, pos));
  txt.textContent = `${p.toFixed(1)}%`;
  fill.style.width = `${p}%`;
  dot.style.left = `${p}%`;
}

function renderDividends(divSummary, dividends){
  const lastDivEl = document.getElementById("lastDiv");
  const ttmDivEl = document.getElementById("ttmDiv");
  const ttmYieldEl = document.getElementById("ttmYield");
  const listEl = document.getElementById("divList");

  const lastAmt = divSummary?.last_dividend;
  const lastDate = divSummary?.last_dividend_date;

  lastDivEl.textContent = (lastAmt != null && lastDate)
    ? `${fmtUsd(lastAmt)} · ${lastDate}`
    : "—";

  ttmDivEl.textContent = divSummary?.ttm_dividend != null
    ? fmtUsd(divSummary.ttm_dividend)
    : "—";

  ttmYieldEl.textContent = divSummary?.ttm_yield_pct != null
    ? fmtPct(divSummary.ttm_yield_pct)
    : "—";

  // list last 12
  listEl.innerHTML = "";
  const items = (dividends || []).slice(-12).reverse();
  if (!items.length){
    listEl.innerHTML = `<div class="mini-item"><span class="d">—</span><span class="a">No dividend data</span></div>`;
    return;
  }
  for (const d of items){
    const row = document.createElement("div");
    row.className = "mini-item";
    row.innerHTML = `<span class="d">${d.date}</span><span class="a">${fmtUsd(d.amount)}</span>`;
    listEl.appendChild(row);
  }
}

function calcSimulator(raw){
  const close = raw?.summary?.last_close;
  const divMonthly = raw?.dividend_summary?.monthly_avg_dividend; // USD per share per month (avg)
  const ttmDiv = raw?.dividend_summary?.ttm_dividend;

  // default inputs
  const invKrw = document.getElementById("invKrw");
  const fx = document.getElementById("fx");
  const buyPrice = document.getElementById("buyPrice");
  const months = document.getElementById("months");
  const reinvest = document.getElementById("reinvest");

  // 자동 채우기
  if (buyPrice.value.trim() === "" && close != null) buyPrice.value = close.toFixed(2);
  if (fx.value.trim() === "") fx.value = "1350";

  const inv = Number(invKrw.value || 0);
  const fxv = Number(fx.value || 0);
  const price = Number(buyPrice.value || 0);
  const m = Math.max(1, Number(months.value || 12));
  const doRe = !!reinvest.checked;

  const outShares = document.getElementById("outShares");
  const outMonthly = document.getElementById("outMonthly");
  const outTotalDiv = document.getElementById("outTotalDiv");
  const outSharesEnd = document.getElementById("outSharesEnd");

  if (!inv || !fxv || !price || !divMonthly){
    outShares.textContent = "—";
    outMonthly.textContent = "—";
    outTotalDiv.textContent = "—";
    outSharesEnd.textContent = "—";
    return;
  }

  // KRW -> USD
  const usd = inv / fxv;
  let shares = usd / price;

  // 월 평균 배당(추정)
  const monthlyDivUsd = shares * divMonthly;

  // 누적 배당 / 재투자
  let totalDivUsd = 0;
  let sharesEnd = shares;

  for (let i=0; i<m; i++){
    const div = sharesEnd * divMonthly;
    totalDivUsd += div;
    if (doRe){
      // 배당 재투자: 해당 월 배당으로 즉시 추가 매수(현재가로 가정)
      sharesEnd += (div / price);
    }
  }

  outShares.textContent = `${shares.toFixed(4)} shares`;
  outMonthly.textContent = `${fmtUsd(monthlyDivUsd)} / month (est.)`;
  outTotalDiv.textContent = `${fmtUsd(totalDivUsd)} (est.)`;
  outSharesEnd.textContent = doRe ? `${sharesEnd.toFixed(4)} shares` : "— (reinvest off)";

  // 참고로 TTM 기반이라는 걸 더 체감시키고 싶으면:
  // (ttmDiv 있으면) "연간 배당(추정)"도 출력 가능
}

load().catch(err => {
  console.error(err);
  document.getElementById("asof").textContent = "Data load error. Check if data/jepq.json exists.";
});




