/* =========================
   JEPQ Dashboard app.js (FINAL - overwrite)
   - includes:
     (1) Today Investment Tone
     (2) Events D-Day Board (badge/type + sort + filter)
========================= */

const DATA_URL   = "data/jepq.json";
const EVENTS_URL = "data/events.json";

let raw = null;
let chart = null;
let candleSeries = null;
let volSeries = null;

/* =========================
   Format helpers
========================= */
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

/* =========================
   Small utils
========================= */
function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

function daysUntil(yyyy_mm_dd){
  try{
    const today = new Date();
    const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const [y,m,d] = String(yyyy_mm_dd).split("-").map(Number);
    const t1 = new Date(y, m-1, d);
    return Math.round((t1 - t0) / (1000*60*60*24));
  }catch(_){
    return null;
  }
}

function ddayTag(dday){
  if (dday === 0) return "D-DAY";
  if (dday > 0) return `D-${dday}`;
  return `D+${Math.abs(dday)}`;
}

/* =========================
   (2) Events D-Day Board
========================= */
async function loadEventsJson(){
  const res = await fetch(EVENTS_URL, { cache:"no-store" });
  if (!res.ok) throw new Error(`Failed to load ${EVENTS_URL}`);
  return await res.json();
}

function renderEventsBoard(payload){
  const wrap = document.getElementById("eventsBoard");
  if (!wrap) return;

  const list = Array.isArray(payload?.events) ? payload.events : [];

  // -1일까지 노출(어제 D+1까지는 안 보이게), 앞으로는 가까운 순 정렬
  const items = list
    .map(e => ({ ...e, _dday: daysUntil(e.date) }))
    .filter(e => typeof e._dday === "number" && e._dday >= -1)
    .sort((a,b) => a._dday - b._dday)
    .slice(0, 10);

  if (!items.length){
    wrap.innerHTML = `<div style="opacity:.7;font-size:13px;">이벤트 데이터가 아직 없습니다.</div>`;
    return;
  }

  wrap.innerHTML = items.map(e => {
    const type = (e.type || "").toLowerCase();
    const isFut = type === "futures";
    const badgeCls = isFut ? "badge-fut" : "badge-opt";
    const badgeTxt = isFut ? "FUTURES" : "OPTIONS";

    // D-0/1/2/3 시각적 강조(원하면 CSS로 더 진하게 가능)
    const urgent = (e._dday <= 3 && e._dday >= 0) ? ` style="border-color: rgba(251,146,60,.28); background: rgba(251,146,60,.06);"` : "";

    return `
      <div class="event-card"${urgent}>
        <div class="event-top">
          <span class="badge ${badgeCls}">${badgeTxt}</span>
          <span class="dday">${ddayTag(e._dday)}</span>
        </div>
        <div class="event-title">${e.title || "-"}</div>
        <div class="event-date">${e.date || "-"}</div>
        ${e.note ? `<div class="event-note">${e.note}</div>` : ""}
      </div>
    `;
  }).join("");
}

async function initEventsBoard(){
  try{
    const payload = await loadEventsJson();
    renderEventsBoard(payload);
  }catch(err){
    console.warn(err);
    const wrap = document.getElementById("eventsBoard");
    if (wrap) wrap.innerHTML = `<div style="opacity:.7;font-size:13px;">events.json 로드 실패</div>`;
  }
}

/* =========================
   (1) Today Investment Tone
========================= */
function computeTone(summary = {}, derived = {}){
  // 유연하게 읽기
  const pos52 = (derived?.pos_52w_pct ?? derived?.pos52 ?? null); // 0~100
  const riskScore = (derived?.risk_score ?? derived?.score ?? null); // 0~100 가정
  const volPct = (derived?.vol_vs_avg_pct ?? derived?.volume_vs_avg_pct ?? null); // 평균 대비 %
  const dayChg = (summary?.change_pct ?? summary?.pct_change ?? null); // %

  let score = 50;
  const reasons = [];

  if (typeof riskScore === "number"){
    score = riskScore;
    reasons.push(`리스크 점수 ${Math.round(riskScore)}`);
  }

  if (typeof pos52 === "number"){
    if (pos52 >= 85){ score += 12; reasons.push(`52주 상단(${Math.round(pos52)}%)`); }
    else if (pos52 <= 30){ score -= 8; reasons.push(`52주 하단(${Math.round(pos52)}%)`); }
    else { reasons.push(`52주 중간(${Math.round(pos52)}%)`); }
  }

  if (typeof volPct === "number"){
    if (volPct >= 30){ score += 10; reasons.push(`거래량 급증(+${Math.round(volPct)}%)`); }
    else if (volPct >= 10){ score += 5; reasons.push(`거래량 증가(+${Math.round(volPct)}%)`); }
  }

  if (typeof dayChg === "number"){
    if (dayChg <= -2){ score += 8; reasons.push(`당일 하락(${dayChg.toFixed(1)}%)`); }
    else if (dayChg >= 2){ score -= 4; reasons.push(`당일 상승(+${dayChg.toFixed(1)}%)`); }
  }

  score = clamp(score, 0, 100);

  let toneLabel = "🟡 중립 (관망 우세)";
  let toneClass = "neutral";
  let action = { entry:"⚠️ 신중", hold:"⭕", dca:"⚠️ 신중" };

  if (score <= 30){
    toneLabel = "🔵 안정 (적립 유리)";
    toneClass = "safe";
    action = { entry:"⭕", hold:"⭕", dca:"⭕" };
  } else if (score <= 60){
    toneLabel = "🟡 중립 (관망 우세)";
    toneClass = "neutral";
    action = { entry:"⚠️ 신중", hold:"⭕", dca:"⚠️ 신중" };
  } else {
    toneLabel = "🔴 경계 (리스크 관리)";
    toneClass = "risk";
    action = { entry:"❌", hold:"⚠️ 점검", dca:"❌" };
  }

  const reasonText = reasons.length
    ? reasons.slice(0,3).map(r => `· ${r}`).join("<br/>")
    : "· 데이터 수집 중 (곧 자동 요약 표시)";

  return { score, toneLabel, toneClass, action, reasonText };
}

function renderTone(summary, derived){
  const statusEl = document.getElementById("toneStatus");
  const actionsEl = document.getElementById("toneActions");
  const reasonEl = document.getElementById("toneReason");
  if (!statusEl || !actionsEl || !reasonEl) return;

  const t = computeTone(summary, derived);

  statusEl.textContent = t.toneLabel;
  statusEl.classList.remove("safe","neutral","risk");
  statusEl.classList.add(t.toneClass);

  actionsEl.innerHTML = `
    <li>신규 진입: ${t.action.entry}</li>
    <li>기존 보유: ${t.action.hold}</li>
    <li>분할 매수: ${t.action.dca}</li>
  `;

  reasonEl.innerHTML = t.reasonText;
}

/* =========================
   Timeframe slicing
========================= */
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

/* =========================
   Chart
========================= */
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

/* =========================
   Render stats
========================= */
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

/* =========================
   52W Position
========================= */
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
    if (msgEl) msgEl.textContent = "52주 위치를 계산 중입니다.";
    return;
  }

  const p = clamp(pos, 0, 100);
  txt.textContent = `${p.toFixed(1)}%`;
  fill.style.width = `${p}%`;
  dot.style.left = `${p}%`;

  let zone = "mid";
  if (p < 35) zone = "low";
  else if (p >= 70) zone = "high";

  if (tagEl){
    tagEl.classList.remove("is-low","is-mid","is-high");
    tagEl.classList.add(zone === "low" ? "is-low" : zone === "high" ? "is-high" : "is-mid");
    tagEl.textContent = zone === "low" ? "하단 구간" : zone === "high" ? "상단 구간" : "중단 구간";
  }

  if (msgEl){
    if (zone === "high"){
      msgEl.innerHTML =
        `현재 가격은 52주 범위 중 <b>상위 ${p.toFixed(0)}%</b>에 있어요.<br/>
         이 구간은 <b>추격</b>보다 <b>분할 접근</b>이 안전할 수 있어요.`;
    } else if (zone === "low"){
      msgEl.innerHTML =
        `현재 가격은 52주 범위 중 <b>하위 ${Math.max(0, 100 - p).toFixed(0)}%</b> 근처예요.<br/>
         변동성은 커질 수 있으니 <b>분할</b>로 접근하고, 배당 흐름을 같이 확인해요.`;
    } else {
      msgEl.innerHTML =
        `현재 가격은 52주 범위의 <b>중간대</b>에 있어요.<br/>
         무리한 타이밍보다 <b>정기 적립/분할</b>로 평균단가를 관리하기 좋아요.`;
    }
  }
}

/* =========================
   Dividends
========================= */
function renderDividends(divSummary, dividends){
  const lastDivEl = document.getElementById("lastDiv");
  const ttmDivEl = document.getElementById("ttmDiv");
  const ttmYieldEl = document.getElementById("ttmYield");
  const listEl = document.getElementById("divList");
  if (!lastDivEl || !ttmDivEl || !ttmYieldEl || !listEl) return;

  const lastAmt = divSummary?.last_dividend;
  const lastDate = divSummary?.last_dividend_date;

  lastDivEl.textContent = (lastAmt != null && lastDate)
    ? `${fmtUsd(lastAmt)} · ${lastDate}`
    : "—";

  ttmDivEl.textContent = divSummary?.ttm_dividend != null ? fmtUsd(divSummary.ttm_dividend) : "—";
  ttmYieldEl.textContent = divSummary?.ttm_yield_pct != null ? fmtPct(divSummary.ttm_yield_pct) : "—";

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

/* =========================
   Simulator
========================= */
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
    if (doRe) sharesEnd += (div / price);
  }

  outShares.textContent = `${shares0.toFixed(4)} shares`;
  outMonthly.textContent = `${fmtUsd(monthlyDivUsd0)} / month (추정)`;
  outTotalDiv.textContent = `${fmtUsd(totalDivUsd)} (추정)`;
  outSharesEnd.textContent = doRe ? `${sharesEnd.toFixed(4)} shares` : "— (재투자 꺼짐)";
}

/* =========================
   Set chart data
========================= */
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

/* =========================
   Main load
========================= */
async function load(){
  const res = await fetch(DATA_URL, { cache:"no-store" });
  if (!res.ok) throw new Error(`Failed to load ${DATA_URL}`);
  raw = await res.json();

  raw.summary = raw.summary || {};
  raw.series  = raw.series  || [];

  ensureChart();

  renderStats(raw.summary);
  render52wPosition(raw.summary, raw.derived);
  renderDividends(raw.dividend_summary, raw.dividends);

  // (1) Tone
  renderTone(raw.summary, raw.derived);

  // (2) Events
  initEventsBoard();

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

