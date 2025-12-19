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
function fmtUsd(n){
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `$${Number(n).toFixed(2)}`;
}
function fmtPct(n){
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${Number(n).toFixed(2)}%`;
}

function sliceByTF(series, tf){
  if (!series?.length) return [];

  const last = series[series.length - 1];
  const lastTime = last.time; // unix seconds
  const lastDate = new Date(lastTime * 1000);

  const day = 24*60*60;
  const cut = (t) => series.filter(x => x.time >= t);

  if (tf === "MAX") return series;

  if (tf === "5Y") return cut(lastTime - (365*5*day));
  if (tf === "1Y") return cut(lastTime - (365*day));
  if (tf === "6M") return cut(lastTime - (183*day));
  if (tf === "1M") return cut(lastTime - (31*day));
  if (tf === "5D") return cut(lastTime - (10*day)); // 주말 고려
  if (tf === "1D") return cut(lastTime - (3*day));  // 일봉 기준 최근 며칠
  if (tf === "YTD"){
    const y = lastDate.getUTCFullYear();
    return cut(Math.floor(Date.UTC(y, 0, 1) / 1000));
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

  // ✅ v5 방식 (너가 지금 성공한 방식 그대로)
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

  pill.textContent = close != null
    ? `$${fmtPrice(close)}  ${chg>=0?"+":""}${fmtPrice(chg)} (${chg>=0?"+":""}${fmtPrice(pct)}%)`
    : "—";

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

function render52wPosition(summary, derived){
  const pos = derived?.pos_52w_pct;
  const lo = summary?.range_52w_low;
  const hi = summary?.range_52w_high;

  // 이 ID들이 index.html에 있어야 함
  const lowEl = document.getElementById("pos52Low");
  const highEl = document.getElementById("pos52High");
  const txt = document.getElementById("pos52Txt");
  const fill = document.getElementById("pos52Fill");
  const dot  = document.getElementById("pos52Dot");

  // 혹시 HTML 아직 안 붙였으면 그냥 조용히 패스
  if (!lowEl || !highEl || !txt || !fill || !dot) return;

  lowEl.textContent = lo != null ? fmtPrice(lo) : "—";
  highEl.textContent = hi != null ? fmtPrice(hi) : "—";

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

  // HTML 아직 안 붙였으면 패스
  if (!lastDivEl || !ttmDivEl || !ttmYieldEl || !listEl) return;

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

  const invKrw = document.getElementById("invKrw");
  const fx = document.getElementById("fx");
  const buyPrice = document.getElementById("buyPrice");
  const months = document.getElementById("months");
  const reinvest = document.getElementById("reinvest");

  const outShares = document.getElementById("outShares");
  const outMonthly = document.getElementById("outMonthly");
  const outTotalDiv = document.getElementById("outTotalDiv");
  const outSharesEnd = document.getElementById("outSharesEnd");

  // 시뮬레이터 HTML 아직 없으면 패스
  if (!invKrw || !fx || !buyPrice || !months || !reinvest || !outShares || !outMonthly || !outTotalDiv || !outSharesEnd) return;

  // 자동 채우기
  if (buyPrice.value.trim() === "" && close != null) buyPrice.value = close.toFixed(2);
  if (fx.value.trim() === "") fx.value = "1350";

  const inv = Number(invKrw.value || 0);
  const fxv = Number(fx.value || 0);
  const price = Number(buyPrice.value || 0);
  const m = Math.max(1, Number(months.value || 12));
  const doRe = !!reinvest.checked;

  if (!inv || !fxv || !price || !divMonthly){
    outShares.textContent = "—";
    outMonthly.textContent = "—";
    outTotalDiv.textContent = "—";
    outSharesEnd.textContent = "—";
    return;
  }

  // KRW -> USD
  const usd = inv / fxv;
  const shares0 = usd / price;

  const monthlyDivUsd0 = shares0 * divMonthly;

  let totalDivUsd = 0;
  let sharesEnd = shares0;

  for (let i=0; i<m; i++){
    const div = sharesEnd * divMonthly;
    totalDivUsd += div;
    if (doRe){
      sharesEnd += (div / price);
    }
  }

  outShares.textContent = `${shares0.toFixed(4)} shares`;
  outMonthly.textContent = `${fmtUsd(monthlyDivUsd0)} / month (est.)`;
  outTotalDiv.textContent = `${fmtUsd(totalDivUsd)} (est.)`;
  outSharesEnd.textContent = doRe ? `${sharesEnd.toFixed(4)} shares` : "— (reinvest off)";
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
  if (!res.ok) throw new Error(`Failed to load ${DATA_URL}`);
  raw = await res.json();

  ensureChart();

  // ✅ 안전장치: summary가 없으면 터지니까 기본값
  if (!raw.summary) raw.summary = {};
  if (!raw.series) raw.series = [];

  renderStats(raw.summary);
  render52wPosition(raw.summary, raw.derived);
  renderDividends(raw.dividend_summary, raw.dividends);

  // default 1Y
  const sliced = sliceByTF(raw.series, "1Y");
  setData(sliced);

  // buttons
  const wrap = document.getElementById("tf");
  if (wrap){
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

  // simulator events
  const calcBtn = document.getElementById("calcBtn");
  if (calcBtn){
    calcBtn.addEventListener("click", () => calcSimulator(raw));
    ["invKrw","fx","buyPrice","months","reinvest"].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("change", () => calcSimulator(raw));
      el.addEventListener("keyup", () => calcSimulator(raw));
    });
    calcSimulator(raw);
  }
}

load().catch(err => {
  console.error(err);
  const asof = document.getElementById("asof");
  if (asof) asof.textContent = "Data load error. Check if data/jepq.json exists.";
});
