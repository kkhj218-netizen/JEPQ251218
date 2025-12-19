/* =========================
   JEPQ Dashboard app.js (Premium 1~7)
========================= */

const DATA_URL   = "/JEPQ251218/data/jepq.json";
const EVENTS_URL = "/JEPQ251218/data/events.json";

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
function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

/* =========================
   Date helpers
========================= */
function daysUntil(yyyy_mm_dd) {
  const today = new Date();
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const [y,m,d] = String(yyyy_mm_dd).split("-").map(Number);
  const target = new Date(y, m-1, d);
  return Math.round((target - t) / (1000*60*60*24));
}
function ddayTag(dday){
  if (dday === 0) return "D-DAY";
  if (dday > 0) return `D-${dday}`;
  return `D+${Math.abs(dday)}`;
}

/* =========================
   (6) Mobile: chart collapse
========================= */
function initChartToggle(){
  const btn = document.getElementById("chartToggle");
  const wrap = document.getElementById("chartWrap");
  if (!btn || !wrap) return;

  btn.addEventListener("click", () => {
    wrap.classList.toggle("is-collapsed");
    btn.textContent = wrap.classList.contains("is-collapsed") ? "차트 펼치기" : "차트 접기";
  });
}

/* =========================
   Tone compute (existing + premium)
========================= */
function computeTone(summary = {}, derived = {}) {
  const pos52 = (derived?.pos_52w_pct ?? null);                 // 0~100
  const volPct = (derived?.volume_vs_avg_pct ?? derived?.vol_vs_avg_pct ?? null); // +%
  const dayChg = (summary?.change_pct ?? null);                 // %

  // 기본 스코어(0~100, 높을수록 경계)
  let score = 50;
  const reasons = [];

  if (typeof pos52 === "number") {
    if (pos52 >= 85) { score += 14; reasons.push(`52주 상단(${Math.round(pos52)}%)`); }
    else if (pos52 <= 30) { score -= 10; reasons.push(`52주 하단(${Math.round(pos52)}%)`); }
    else { reasons.push(`52주 중간(${Math.round(pos52)}%)`); }
  }

  if (typeof volPct === "number") {
    if (volPct >= 30) { score += 12; reasons.push(`거래량 급증(+${Math.round(volPct)}%)`); }
    else if (volPct >= 10) { score += 6; reasons.push(`거래량 증가(+${Math.round(volPct)}%)`); }
  }

  if (typeof dayChg === "number") {
    if (dayChg <= -2) { score += 8; reasons.push(`당일 하락(${dayChg.toFixed(1)}%)`); }
    else if (dayChg >= 2) { score -= 4; reasons.push(`당일 상승(+${dayChg.toFixed(1)}%)`); }
  }

  score = clamp(score, 0, 100);

  let toneLabel = "🟡 중립 (관망 우세)";
  let toneClass = "neutral";
  let action = { entry:"⚠️ 신중", hold:"⭕", dca:"⚠️ 신중" };

  if (score <= 30) {
    toneLabel = "🔵 안정 (적립 유리)";
    toneClass = "safe";
    action = { entry:"⭕", hold:"⭕", dca:"⭕" };
  } else if (score <= 60) {
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

  return { score, toneLabel, toneClass, action, reasonText, pos52, volPct, dayChg };
}

function renderTone(summary, derived) {
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

  // left summary
  const lTone = document.getElementById("lTone");
  const lToneReason = document.getElementById("lToneReason");
  if (lTone) lTone.textContent = t.toneLabel;
  if (lToneReason) lToneReason.innerHTML = t.reasonText.replaceAll("<br/>", " / ");
}

/* =========================
   (1) Today one-line decision
========================= */
function renderTodayDecision(summary, derived){
  const el = document.getElementById("todayDecision");
  const sub = document.getElementById("todayDecisionSub");
  if (!el) return;

  const close = summary?.last_close;
  const t = computeTone(summary, derived);

  // 기본 결론(유료 느낌 문장)
  if (t.toneClass === "risk") {
    el.innerHTML = `→ 신규 매수는 쉬고,<br/>→ 기존 보유자는 배당 유지,<br/>→ 다음 분할 매수는 <b>$55 이하</b> 구간 대기`;
  } else if (t.toneClass === "neutral") {
    el.innerHTML = `→ 신규 진입은 관망,<br/>→ 보유자는 유지,<br/>→ 조정 시 <b>분할</b> 접근 고려`;
  } else {
    el.innerHTML = `→ 신규 진입 가능 구간,<br/>→ <b>분할 매수</b> 유효,<br/>→ 배당 재투자 전략 적합`;
  }

  if (sub){
    sub.textContent = (close != null)
      ? `현재가 $${fmtPrice(close)} · 톤 점수 ${Math.round(t.score)} / 100`
      : `톤 점수 ${Math.round(t.score)} / 100`;
  }
}

/* =========================
   Events load + render (2)
========================= */
async function loadEventsJson() {
  const res = await fetch(EVENTS_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${EVENTS_URL}`);
  return await res.json();
}

function impactDots(level){
  // level: 1 low / 2 mid / 3 high
  if (level >= 3) return { dots:"●●●", cls:"high", txt:"높음" };
  if (level === 2) return { dots:"●●○", cls:"mid", txt:"중간" };
  return { dots:"●○○", cls:"low", txt:"낮음" };
}

function inferImpact(e){
  // events.json에 impact가 없으면 타입으로 기본값
  const type = e.type || "";
  if (type === "futures") return 3;
  if (type === "options") return 2;
  return 1;
}

function renderEventsBoard(payload) {
  const wrap = document.getElementById("eventsBoard");
  if (!wrap) return;

  const list = (payload?.events || [])
    .map(e => ({ ...e, dday: daysUntil(e.date) }))
    .filter(e => e.dday >= -1)
    .sort((a,b) => a.dday - b.dday)
    .slice(0, 10);

  if (!list.length) {
    wrap.innerHTML = `<div style="opacity:.7;font-size:13px;">이벤트 데이터가 아직 없습니다.</div>`;
    return;
  }

  // 다음 이벤트(LEFT 필수 정보)
  const next = list.find(x => x.dday >= 0) || list[0];
  const lNext = document.getElementById("lNextEvent");
  const lNextSub = document.getElementById("lNextEventSub");
  if (lNext) lNext.textContent = `${next.title || "이벤트"} (${ddayTag(next.dday)})`;
  if (lNextSub) lNextSub.textContent = `${next.date} · ${next.type || "event"}`;

  wrap.innerHTML = list.map(e => {
    const tag = ddayTag(e.dday);

    const badgeCls = e.type === "futures" ? "badge-fut" : "badge-opt";
    const badgeTxt = e.type === "futures" ? "FUTURES" : (e.type === "options" ? "OPTIONS" : "EVENT");

    const level = (typeof e.impact_level === "number") ? e.impact_level : inferImpact(e);
    const dots = impactDots(level);

    // 과거 평균 변동성(없으면 “데이터 확장 가능” 느낌으로 처리)
    const avgMove = (typeof e.avg_move_pct === "number")
      ? `과거 평균 변동성: ${e.avg_move_pct > 0 ? "+" : ""}${e.avg_move_pct.toFixed(1)}%`
      : `과거 평균 변동성: 데이터 준비중`;

    return `
      <div class="event-card">
        <div class="event-top">
          <span class="badge ${badgeCls}">${badgeTxt}</span>
          <span class="dday">${tag}</span>
        </div>

        <div class="event-title">${e.title || "-"}</div>
        <div class="event-date">${e.date || "-"}</div>

        <div class="event-impact">
          <span>영향도</span>
          <span class="dots ${dots.cls}">${dots.dots}</span>
          <span style="opacity:.8">(${dots.txt})</span>
        </div>

        <div class="event-statline">${avgMove}</div>

        ${e.note ? `<div class="event-note">${e.note}</div>` : ""}
      </div>
    `;
  }).join("");
}

async function initEventsBoard(){
  try{
    const payload = await loadEventsJson();
    renderEventsBoard(payload);
    return payload;
  }catch(e){
    console.warn(e);
    const wrap = document.getElementById("eventsBoard");
    if (wrap) wrap.innerHTML = `<div style="opacity:.7;font-size:13px;">events.json 로드 실패</div>`;
    return null;
  }
}

/* =========================
   (5) Alerts (volume/event overlap)
========================= */
function renderAlerts(summary, derived, eventsPayload){
  const box = document.getElementById("alertsBox");
  if (!box) return;

  const t = computeTone(summary, derived);
  const alerts = [];

  // 거래량 급증
  const volPct = (derived?.volume_vs_avg_pct ?? derived?.vol_vs_avg_pct ?? null);
  if (typeof volPct === "number"){
    if (volPct >= 30) alerts.push({ lvl:"high", label:`거래량 급증 +${Math.round(volPct)}%`, note:"단기 변동성 확대 가능" });
    else if (volPct >= 10) alerts.push({ lvl:"mid", label:`거래량 증가 +${Math.round(volPct)}%`, note:"수급 변화 체크" });
  }

  // 이벤트 임박
  const ev = (eventsPayload?.events || []).map(e => ({...e, dday: daysUntil(e.date)}))
    .filter(x => x.dday >= 0)
    .sort((a,b)=>a.dday-b.dday)[0];
  if (ev && ev.dday <= 3){
    alerts.push({ lvl:"mid", label:`이벤트 임박: ${ev.title} (${ddayTag(ev.dday)})`, note:"만기 주간엔 흔들림 주의" });
  }

  // 톤 자체가 경계면 배지 추가
  if (t.toneClass === "risk"){
    alerts.push({ lvl:"high", label:"오늘 톤: 경계", note:"신규 진입보다 리스크 관리 우선" });
  }

  if (!alerts.length){
    box.innerHTML = `<div style="opacity:.8;font-size:13px;">감지된 이상 신호 없음 · (정상 범위)</div>`;
    return;
  }

  box.innerHTML = alerts.slice(0,4).map(a => `
    <div class="alert-item">
      <div>
        <div style="font-weight:900">${a.label}</div>
        <div style="opacity:.75;font-size:12px;margin-top:4px">${a.note}</div>
      </div>
      <span class="alert-badge ${a.lvl}">${a.lvl === "high" ? "HIGH" : a.lvl === "mid" ? "MID" : "LOW"}</span>
    </div>
  `).join("");
}

/* =========================
   (3) Personal position (LocalStorage)
========================= */
const POS_KEY = "jepq_my_position_v1";

function loadMyPos(){
  try{
    const s = localStorage.getItem(POS_KEY);
    return s ? JSON.parse(s) : { avg:null, shares:null };
  }catch(_){
    return { avg:null, shares:null };
  }
}
function saveMyPos(avg, shares){
  localStorage.setItem(POS_KEY, JSON.stringify({ avg, shares }));
}
function resetMyPos(){
  localStorage.removeItem(POS_KEY);
}
function renderMyPos(summary){
  const avgEl = document.getElementById("myAvgPrice");
  const shEl  = document.getElementById("myShares");
  const pnlPctEl = document.getElementById("myPnlPct");
  const pnlUsdEl = document.getElementById("myPnlUsd");
  const comEl = document.getElementById("myPosComment");

  if (!avgEl || !shEl || !pnlPctEl || !pnlUsdEl || !comEl) return;

  const close = summary?.last_close;
  const { avg, shares } = loadMyPos();

  if (avgEl.value.trim() === "" && avg != null) avgEl.value = avg;
  if (shEl.value.trim() === "" && shares != null) shEl.value = shares;

  const a = Number(avgEl.value || 0);
  const s = Number(shEl.value || 0);

  if (!close || !a || !s){
    pnlPctEl.textContent = "—";
    pnlUsdEl.textContent = "—";
    comEl.textContent = "평균 매수가/수량을 입력하면 ‘내 기준’ 해석이 바로 뜹니다.";
    return;
  }

  const pnlUsd = (close - a) * s;
  const pnlPct = ((close / a) - 1) * 100;

  pnlPctEl.textContent = `${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(2)}%`;
  pnlUsdEl.textContent = `${pnlUsd >= 0 ? "+" : ""}${fmtUsd(pnlUsd)}`;

  // 배당 ETF 관점 코멘트(간단하지만 유료 느낌)
  if (pnlPct >= 8){
    comEl.textContent = "수익 구간: 배당 유지 + 추격 매수 자제. 조정 시 분할 추가가 안정적.";
  }else if (pnlPct >= 0){
    comEl.textContent = "무난 구간: 정기 적립/분할로 평균단가 관리, 배당 흐름 유지.";
  }else if (pnlPct >= -6){
    comEl.textContent = "조정 구간: 감정 매도보다 계획 점검. 배당은 유지하며 분할 접근 고려.";
  }else{
    comEl.textContent = "큰 조정 구간: 무리한 물타기보다 자금관리 우선. 분할 기준을 정해 대응.";
  }
}
function initMyPos(summary){
  const saveBtn = document.getElementById("savePos");
  const resetBtn = document.getElementById("resetPos");
  const avgEl = document.getElementById("myAvgPrice");
  const shEl  = document.getElementById("myShares");

  if (saveBtn && avgEl && shEl){
    saveBtn.addEventListener("click", () => {
      const a = avgEl.value ? Number(avgEl.value) : null;
      const s = shEl.value ? Number(shEl.value) : null;
      saveMyPos(a, s);
      renderMyPos(summary);
    });
  }
  if (resetBtn){
    resetBtn.addEventListener("click", () => {
      resetMyPos();
      if (avgEl) avgEl.value = "";
      if (shEl) shEl.value = "";
      renderMyPos(summary);
    });
  }

  // 입력 즉시 반영
  ["keyup","change"].forEach(evt=>{
    if (avgEl) avgEl.addEventListener(evt, ()=>renderMyPos(summary));
    if (shEl) shEl.addEventListener(evt, ()=>renderMyPos(summary));
  });

  renderMyPos(summary);
}

/* =========================
   (4) pos52 stats (fallback if missing)
========================= */
function renderPos52Stats(derived){
  const el = document.getElementById("pos52Stats");
  if (!el) return;

  // 앞으로 파이썬에서 넣어줄 확장 필드 예시:
  // derived.pos52_bucket_stats = { zone:"high", avg_3m:2.1, max_dd:-6.4 }
  const st = derived?.pos52_bucket_stats;

  if (st && typeof st.avg_3m === "number" && typeof st.max_dd === "number"){
    el.innerHTML = `
      · 현재 구간: <b>${st.zone || "-"}</b><br/>
      · 진입 후 3개월 평균 수익률: <b>${st.avg_3m > 0 ? "+" : ""}${st.avg_3m.toFixed(1)}%</b><br/>
      · 최대 조정(드로다운): <b>${st.max_dd.toFixed(1)}%</b>
    `;
    return;
  }

  el.innerHTML = `
    · 과거 동일 구간 성과는 <b>데이터 확장(백테스트)</b>로 제공됩니다.<br/>
    · 현재는 ‘오늘 결론/이상 신호/이벤트 영향도’ 중심으로 해석해 주세요.
  `;
}

/* =========================
   Timeframe slicing
========================= */
function sliceByTF(series, tf){
  if (!series?.length) return [];
  const last = series[series.length - 1];
  const lastTime = last.time;
  const lastDate = new Date(lastTime * 1000);
  const day = 24*60*60;
  const cut = (t) => series.filter(x => x.time >= t);

  if (tf === "MAX") return series;
  if (tf === "5Y") return cut(lastTime - (365*5*day));
  if (tf === "1Y") return cut(lastTime - (365*day));
  if (tf === "6M") return cut(lastTime - (183*day));
  if (tf === "1M") return cut(lastTime - (31*day));
  if (tf === "5D") return cut(lastTime - (10*day));
  if (tf === "1D") return cut(lastTime - (3*day));
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

  // LEFT 필수 정보
  const lClose = document.getElementById("lClose");
  if (lClose) lClose.textContent = (summary?.last_close != null) ? `$${fmtPrice(summary.last_close)}` : "—";
}

/* =========================
   52W position
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

  const p = Math.max(0, Math.min(100, pos));
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
      msgEl.innerHTML = `현재 가격은 52주 범위 중 <b>상위 ${p.toFixed(0)}%</b>.<br/>추격보다 <b>분할</b>이 유리할 수 있어요.`;
    } else if (zone === "low"){
      msgEl.innerHTML = `현재 가격은 52주 범위 중 <b>하위 ${Math.max(0, 100 - p).toFixed(0)}%</b> 근처.<br/>변동성 대비 <b>자금관리</b>가 우선이에요.`;
    } else {
      msgEl.innerHTML = `현재 가격은 52주 범위의 <b>중간대</b>.<br/><b>정기 적립/분할</b>로 평균단가 관리가 좋아요.`;
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

  ttmDivEl.textContent = divSummary?.ttm_dividend != null
    ? fmtUsd(divSummary.ttm_dividend)
    : "—";

  ttmYieldEl.textContent = divSummary?.ttm_yield_pct != null
    ? fmtPct(divSummary.ttm_yield_pct)
    : "—";

  // LEFT 필수 정보
  const lTtmYield = document.getElementById("lTtmYield");
  if (lTtmYield) lTtmYield.textContent = divSummary?.ttm_yield_pct != null ? fmtPct(divSummary.ttm_yield_pct) : "—";

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
    if (doRe){
      sharesEnd += (div / price);
    }
  }

  outShares.textContent = `${shares0.toFixed(4)} shares`;
  outMonthly.textContent = `${fmtUsd(monthlyDivUsd0)} / month (추정)`;
  outTotalDiv.textContent = `${fmtUsd(totalDivUsd)} (추정)`;
  outSharesEnd.textContent = doRe ? `${sharesEnd.toFixed(4)} shares` : "— (재투자 꺼짐)";
}

/* =========================
   Chart data set
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
  initChartToggle();

  const res = await fetch(DATA_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${DATA_URL}`);
  raw = await res.json();

  raw.summary = raw.summary || {};
  raw.series = raw.series || [];
  raw.derived = raw.derived || {};

  ensureChart();

  renderStats(raw.summary);
  render52wPosition(raw.summary, raw.derived);
  renderDividends(raw.dividend_summary, raw.dividends);

  // (6) tone
  renderTone(raw.summary, raw.derived);

  // (1) today decision
  renderTodayDecision(raw.summary, raw.derived);

  // (4) pos52 stats
  renderPos52Stats(raw.derived);

  // events payload 먼저 로딩(알림에도 사용)
  const eventsPayload = await initEventsBoard();

  // (5) alerts
  renderAlerts(raw.summary, raw.derived, eventsPayload);

  // (3) my position
  initMyPos(raw.summary);

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
