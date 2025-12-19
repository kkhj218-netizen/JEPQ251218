#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Fetch JEPQ price (daily candles) + dividends from Yahoo Finance public endpoints
and write data/jepq.json (+ optional daily snapshot).
No external deps.

✅ Added:
- derived.pos52_bucket_stats 자동 계산 (과거 5y 일봉 기반)
- bucket 세분화: 0-35 / 35-70 / 70-90 / 90-100
- max_dd를 "3개월 구간 내 최대조정"으로 계산
- 52주 범위 0(hi==lo) 안전 처리
"""

import json, os, sys, math, datetime
from urllib.request import urlopen, Request

TICKER = os.environ.get("TICKER", "JEPQ").upper()
OUT_PATH = os.environ.get("OUT_PATH", "data/jepq.json")
HISTORY_DIR = os.environ.get("HISTORY_DIR", "history/jepq")  # 스냅샷 저장 폴더 (네 기존 유지)

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"

# -------------------------
# helpers
# -------------------------
def http_json(url: str):
  req = Request(url, headers={"User-Agent": UA})
  with urlopen(req, timeout=30) as r:
    return json.loads(r.read().decode("utf-8"))

def safe_num(x):
  try:
    if x is None: return None
    if isinstance(x, bool): return None
    v = float(x)
    if math.isnan(v) or math.isinf(v): return None
    return v
  except:
    return None

def iso_from_unix(ts: int):
  return datetime.datetime.utcfromtimestamp(ts).strftime("%Y-%m-%d")

def utc_now():
  return datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

def ensure_dir(p):
  if p and not os.path.exists(p):
    os.makedirs(p, exist_ok=True)

# -------------------------
# core: pos52 bucket stats
# -------------------------
def compute_pos52_bucket_stats(series, lookback=252, horizon=63):
  """
  series: [{"time":..., "close":...}, ...] (daily)
  - pos52: 직전 252거래일(약 1년) window에서 현재 close가 어디쯤(0~100)
  - ret_3m: horizon(기본 63거래일) 뒤 수익률
  - max_dd: horizon 구간 안에서의 최대 조정(최저점 기준, 음수)
  """
  if not series or len(series) < (lookback + horizon + 5):
    return {
      "asof": None,
      "lookback": lookback,
      "horizon": horizon,
      "buckets": {},
      "note": "not enough history"
    }

  closes = [safe_num(x.get("close")) for x in series]
  times  = [int(x.get("time")) for x in series]
  n = len(closes)

  rows = []
  for i in range(lookback, n - horizon):
    cur = closes[i]
    if cur is None:
      continue

    window = closes[i - lookback : i]
    if any(v is None for v in window):
      continue

    lo = min(window)
    hi = max(window)

    # ✅ hi==lo 방지
    if hi is None or lo is None or hi <= lo:
      continue

    pos52 = (cur - lo) / (hi - lo) * 100.0

    fut = closes[i + horizon]
    if fut is None:
      continue
    ret_3m = (fut - cur) / cur * 100.0 if cur else None
    if ret_3m is None:
      continue

    # ✅ max_dd = 향후 horizon 구간 내 "최저 종가" 기준 최대조정
    forward = closes[i : i + horizon + 1]
    if any(v is None for v in forward):
      continue
    min_fwd = min(forward)
    max_dd = (min_fwd - cur) / cur * 100.0 if cur else None
    if max_dd is None:
      continue

    rows.append({"pos52": pos52, "ret_3m": ret_3m, "max_dd": max_dd})

  if not rows:
    return {
      "asof": iso_from_unix(times[-1]) if times else None,
      "lookback": lookback,
      "horizon": horizon,
      "buckets": {},
      "note": "no rows after filtering"
    }

  # ✅ bucket을 세분화해서 “상단 90%” 문장 가능하게
  buckets_def = [
    ("p0_35",   0, 35),
    ("p35_70",  35, 70),
    ("p70_90",  70, 90),
    ("p90_100", 90, 100.000001),
  ]

  out_buckets = {}
  for key, a, b in buckets_def:
    grp = [r for r in rows if (r["pos52"] >= a and r["pos52"] < b)]
    if not grp:
      out_buckets[key] = {
        "range": [a, b if b <= 100 else 100],
        "sample_size": 0,
        "avg_ret_3m": None,
        "avg_max_dd": None,
        "worst_max_dd": None
      }
      continue

    avg_ret = sum(r["ret_3m"] for r in grp) / len(grp)
    avg_dd  = sum(r["max_dd"] for r in grp) / len(grp)
    worst_dd = min(r["max_dd"] for r in grp)  # 가장 크게 빠진(가장 음수)

    out_buckets[key] = {
      "range": [a, b if b <= 100 else 100],
      "sample_size": len(grp),
      "avg_ret_3m": round(avg_ret, 2),
      "avg_max_dd": round(avg_dd, 2),
      "worst_max_dd": round(worst_dd, 2)
    }

  return {
    "asof": iso_from_unix(times[-1]) if times else None,
    "lookback": lookback,
    "horizon": horizon,
    "buckets": out_buckets
  }

def pos52_bucket_key(pos52):
  if pos52 is None:
    return None
  p = float(pos52)
  if p < 35: return "p0_35"
  if p < 70: return "p35_70"
  if p < 90: return "p70_90"
  return "p90_100"

# -------------------------
# yahoo fetch
# -------------------------
def fetch_price_daily(ticker: str):
  url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?range=5y&interval=1d&includePrePost=false&events=div%7Csplit"
  j = http_json(url)
  result = (j.get("chart") or {}).get("result") or []
  if not result:
    raise RuntimeError("No chart result (price).")
  r0 = result[0]

  ts = r0.get("timestamp") or []
  ind = ((r0.get("indicators") or {}).get("quote") or [{}])[0]
  opens = ind.get("open") or []
  highs = ind.get("high") or []
  lows  = ind.get("low")  or []
  closes= ind.get("close")or []
  vols  = ind.get("volume") or []

  series = []
  for i, t in enumerate(ts):
    o = safe_num(opens[i]) if i < len(opens) else None
    h = safe_num(highs[i]) if i < len(highs) else None
    l = safe_num(lows[i])  if i < len(lows)  else None
    c = safe_num(closes[i])if i < len(closes)else None
    v = safe_num(vols[i])  if i < len(vols)  else None
    if c is None or o is None or h is None or l is None:
      continue
    series.append({
      "time": int(t),
      "open": o, "high": h, "low": l, "close": c,
      "volume": int(v) if v is not None else 0
    })

  # dividends (events)
  div_events = ((r0.get("events") or {}).get("dividends") or {})
  dividends = []
  for _, dv in div_events.items():
    dt = int(dv.get("date")) if dv.get("date") else None
    amt = safe_num(dv.get("amount"))
    if dt and amt is not None:
      dividends.append({"time": dt, "date": iso_from_unix(dt), "amount": amt})
  dividends.sort(key=lambda x: x["time"])

  meta = r0.get("meta") or {}
  summary = {
    "asof": None,
    "last_close": None,
    "day_high": None,
    "day_low": None,
    "volume": None,
    "range_52w_high": safe_num(meta.get("fiftyTwoWeekHigh")),
    "range_52w_low":  safe_num(meta.get("fiftyTwoWeekLow")),
    "change": None,
    "change_pct": None,
  }

  if series:
    last = series[-1]
    summary["asof"] = iso_from_unix(last["time"])
    summary["last_close"] = safe_num(last["close"])
    summary["volume"] = int(last["volume"]) if last.get("volume") is not None else None
    summary["day_high"] = safe_num(last["high"])
    summary["day_low"]  = safe_num(last["low"])
    if len(series) >= 2:
      prev = series[-2]
      chg = safe_num(last["close"]) - safe_num(prev["close"])
      summary["change"] = chg
      summary["change_pct"] = (chg / safe_num(prev["close"]) * 100.0) if safe_num(prev["close"]) else None

  # derived: pos52 (meta 기반)
  pos = None
  if summary["last_close"] is not None and summary["range_52w_low"] is not None and summary["range_52w_high"] is not None:
    lo = summary["range_52w_low"]
    hi = summary["range_52w_high"]
    if hi is not None and lo is not None and hi > lo:
      pos = (summary["last_close"] - lo) / (hi - lo) * 100.0

  derived = {
    "pos_52w_pct": pos,
    "pos52_bucket": pos52_bucket_key(pos),
  }

  # ✅ 여기서 바로 통계 계산해서 derived에 주입
  derived["pos52_bucket_stats"] = compute_pos52_bucket_stats(series, lookback=252, horizon=63)

  # dividend summary (TTM)
  div_summary = {
    "last_dividend": None,
    "last_dividend_date": None,
    "ttm_dividend": None,
    "ttm_yield_pct": None,
    "monthly_avg_dividend": None,
  }
  if dividends and summary["last_close"] is not None:
    last_div = dividends[-1]
    div_summary["last_dividend"] = last_div["amount"]
    div_summary["last_dividend_date"] = last_div["date"]

    cutoff = series[-1]["time"] - 365 * 24 * 60 * 60 if series else (dividends[-1]["time"] - 365*24*60*60)
    ttm = [d for d in dividends if d["time"] >= cutoff]
    ttm_sum = sum(d["amount"] for d in ttm)
    div_summary["ttm_dividend"] = ttm_sum
    div_summary["monthly_avg_dividend"] = (ttm_sum / 12.0) if ttm_sum else None
    div_summary["ttm_yield_pct"] = (ttm_sum / summary["last_close"] * 100.0) if summary["last_close"] else None

  return series, summary, derived, dividends, div_summary

# -------------------------
# main
# -------------------------
def main():
  ensure_dir(os.path.dirname(OUT_PATH) or ".")
  ensure_dir(HISTORY_DIR)

  series, summary, derived, dividends, div_summary = fetch_price_daily(TICKER)

  payload = {
    "ticker": TICKER,
    "updated_utc": utc_now(),
    "summary": summary,
    "derived": derived,
    "dividend_summary": div_summary,
    "dividends": dividends,
    "series": series
  }

  with open(OUT_PATH, "w", encoding="utf-8") as f:
    json.dump(payload, f, ensure_ascii=False, indent=2)

  snap_path = None
  if summary.get("asof"):
    snap_path = os.path.join(HISTORY_DIR, f"{summary['asof']}.json")
    with open(snap_path, "w", encoding="utf-8") as f:
      json.dump(payload, f, ensure_ascii=False, indent=2)

  print(f"[OK] Updated {OUT_PATH} and snapshot {snap_path if snap_path else '(none)'} (rows={len(series)}, divs={len(dividends)})")

if __name__ == "__main__":
  try:
    main()
  except Exception as e:
    print("[ERR]", str(e))
    sys.exit(1)
