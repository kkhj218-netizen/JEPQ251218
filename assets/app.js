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
  if (!el) return;

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

  // ✅ v5 방식
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
    if (!chart) return;
    chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
  });
}

function renderStats(summary){
  const asofEl = document.getElementById("asof");
  if (asofEl){
    asofEl.textContent = summary?.asof ? `As of ${summary.asof} (UTC)` : "As of —";
  }

  const pill = document.getElementById("pricePill");
  const close = summary?.last_close;
  const chg = summary?.change;
  const pct = summary?.change_pct;

  if (pill){
    pill.textContent = close != null
      ? `$${fmtPrice(close)}  ${chg>=0?"+":""}${fmtPrice(chg)} (${chg>=0?"+":""}${fmtPrice(pct)}%)`
      : "—";

    pill.style.borderColor = (chg ?? 0) >= 0 ? "rgba(34,197,94,.7)" : "rgba(239,68,68,.7)";
    pill.style.background = (chg ?? 0) >= 0 ? "rgba(34,197,94,.14)" : "rgba(239,68,68,.14)";
  }

  const range52El = document.getElementById("range52");
  if (range52El){
    range52El.textContent =
      (summary?.range_52w_low != null && summary?.range_52w_high != null)
        ? `${fmtPrice(summary.range_52w_low)} ~ ${fmtPrice(summary.range_52w_high)}`
        : "—";
  }

  const range1dEl = document.getElementById("range1d");
  if (range1dEl){
    range1dEl.textContent =
      (summary?.day_low != null && summary?.day_high != null)
        ? `${fmtPrice(summary.day_low)} ~ ${fmtPrice(summary.day_high)}`
        : "—";
  }

  const volEl = document.getElementById("vol");
  if (volEl) volEl.textContent = summary?.volume != null ? fmtNum(summary.volume) : "—";

  const closeEl = document.getElementById("close");
  if (closeEl) closeEl.textContent = summary?.last_close != null ? fmtPrice(summary.last_close) : "—";

  const chgEl = document.getElementById("chg");
  if (chgEl){
    if (chg != null && pct != null){
      chgEl.textContent = `${chg>=0?"+":""}${fmtPrice(chg)} (${chg>=0?"+":""}${fmtPrice(pct)}%)`;
      chgEl.style.color = chg>=0 ? "#22c55e" : "#ef4444";
    } else {
      chgEl.textContent = "—";
    }
  }
}

/**
 * ✅ 52W Position + 태그 + 문구 자동 변경
 * - index.html에 아래 요소들이 있어야 함:
 *   pos52Low, pos52High, pos52Txt, pos52Fill, pos52Dot, pos52Tag
 * - 그리고 콜아웃 본문: .pos52-callout .msg
 */
function render52wPosition(summary, derived){
  const pos = derived?.pos_52w_pct; // 0~100
  const lo = summary?.range_52w_low;
  const hi = summary?.range_52w_high;

  const lowEl  = document.getElementById("pos52Low");
  const highEl = document.getElementById("pos52High");
  const txt    = document.getElementById("pos52Txt");
  const fill   = document.getElementById("pos52Fill");
  const dot    = document.getElementById("pos52Dot");
  const tagEl  = document.getElementById("pos52Tag");
  const msgEl  = document.querySelector(".pos52-callout .msg");

  // HTML이 아직 없으면 조용히 패스
  if (!lowEl || !highEl || !txt || !fill || !dot) return;

  lowEl.textContent  = lo != null ? fmtPrice(lo) : "—";
  highEl.textContent = hi != null ? fmtPrice(hi) : "—";

  if (pos == null){
    txt.textContent = "—";
    fill.style.width = "0%";
    dot.style.left = "0%";
    if (tagEl){
      tagEl.textContent = "—";
      tagEl.classList.remove("is-low","is-mid","is-high");
    }
    if (msgEl) msgEl.innerHTML = `52주 위치 데이터를 불러오는 중입니다.`;
    return;
  }

  const p = Math.max(0, Math.min(100, pos));
  txt.textContent = `${p.toFixed(1)}%`;
  fill.style.width = `${p}%`;
  dot.style.left = `${p}%`;

  // 구간 분류
  let zone = "mid";
  if (p < 35) zone = "low";
  else if (p >= 70) zone = "high";

  // 태그
  if (tagEl){
    tagEl.classList.remove("is-low","is-mid","is-high");
    tagEl.classList.add(zone === "low" ? "is-low" : zone === "high" ? "is-high" : "is-mid");

    tagEl.textContent =
      zone === "low" ? "하단 구간" :
      zone === "high" ? "상단 구간" :
      "중단 구간";
  }

  // 문구
  if (msgEl){
    if (zone === "high"){
      msgEl.innerHTML =
        `현재 JEPQ 가격은 최근 1년 가격 범위 기준 <b>상단 구간</b>에 위치해 있습니다.<br/>
         상단 구간에서는 <b>추격 매수</b>보다는 <b>분할 접근</b>이 적합할 수 있습니다.`;
    } else if (zone === "low"){
      msgEl.innerHTML =
        `현재 JEPQ 가격은 최근 1년 가격 범위 기준 <b>하단 구간</b>에 위치해 있습니다.<br/>
         하단 구간에서는 <b>분할 매수</b> 관점이 유효할 수 있고, 변동성 대비 <b>매수 간격</b>을 두는 것이 좋습니다.`;
    } else {
      msgEl.innerHTML =
        `현재 JEPQ 가격은 최근 1년 가격 범위 기준 <b>중단 구간</b>에 위치해 있습니다.<br/>
         중단 구간에서는 <b>정기 적립/분할</b>로 평균 단가를 관리하면서 <b>배당 흐름</b>을 함께 보는 전략이 무난합니다.`;
    }
  }
}

function renderDividends(divSummary, dividends){
  const lastDivEl = document.getElementById("lastDiv");
  const ttmDivEl = document.getElementById("ttmDiv");
  const ttmYieldEl = document.getElementById("ttmYield");
  const listEl = document.getElementById("divList");

  // HTML 없으면 패스
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

  listEl.innerHTML = "";
  const items = (dividends || []).slice(-12).reverse();
  if (!items.length){
    listEl.innerHTML = `<div class="mini-item"><span class="d">—</span><span class="a">배당 데이터가 아직 없습니다</span></div>`;
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
  const divMonthly = raw?.dividend_summary?.monthly_avg_dividend;

  const invKrw = document.getElementById("invKrw");
  const fx = document.getElementById("fx");
  const buyPrice = document.getElementById("buyPrice");
  const months = document.getElementById("months");
  const reinvest = document.getElementById("reinvest");

  const outShares = document.getElementById("outShares");
  const outMonthly = document.getElementById("outMonthly");
  const outTotalDiv = document.getElementById("outTotalDiv");
  const outSharesEnd = document.getElementById("outSharesEnd");

  if (!invKrw || !fx || !buyPrice || !months || !reinvest || !outShares || !outMonthly || !outTotalDiv || !outSharesEnd) return;

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
  outMonthly.textContent = `${fmtUsd(monthlyDivUsd0)} / month (추정)`;
  outTotalDiv.textContent = `${fmtUsd(totalDivUsd)} (추정)`;
  outSharesEnd.textContent = doRe ? `${sharesEnd.toFixed(4)} shares` : "— (재투자 꺼짐)";
}

function setData(series){
  if (!candleSeries || !volSeries || !chart) return;

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

  raw.summary = raw.summary || {};
  raw.series = raw.series || [];

  ensureChart();

  renderStats(raw.summary);
  render52wPosition(raw.summary, raw.derived);
  renderDividends(raw.dividend_summary, raw.dividends);

  // default 1Y
  setData(sliceByTF(raw.series, "1Y"));

  // timeframe buttons
  const wrap = document.getElementById("tf");
  if (wrap){
    wrap.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      const tf = btn.dataset.tf;

      [...wrap.querySelectorAll("button")].forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      setData(sliceByTF(raw.series, tf));
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
  if (asof) asof.textContent = "데이터 로드 오류: data/jepq.json 경로를 확인해줘.";
});
