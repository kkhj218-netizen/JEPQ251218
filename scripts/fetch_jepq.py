#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Fetch JEPQ price (daily candles) + dividends from Yahoo Finance public endpoints
and write data/jepq.json (+ optional daily snapshot).
No external deps.
"""

import json, os, sys, math, datetime
from urllib.request import urlopen, Request
from urllib.error import URLError, HTTPError

TICKER = os.environ.get("TICKER", "JEPQ").upper()
OUT_PATH = os.environ.get("OUT_PATH", "data/jepq.json")
HISTORY_DIR = os.environ.get("HISTORY_DIR", "history/jepq")

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"

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

def fetch_price_daily(ticker: str):
  # daily candles up to 5y
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
      "time": int(t),              # unix seconds
      "open": o, "high": h, "low": l, "close": c,
      "volume": int(v) if v is not None else 0
    })

  # dividends from the same response (events)
  div_events = ((r0.get("events") or {}).get("dividends") or {})
  dividends = []
  for k, dv in div_events.items():
    # dv: {'amount':..., 'date':..., ...}
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
    # "day range"는 마지막 캔들 기준(일봉)
    summary["day_high"] = safe_num(last["high"])
    summary["day_low"]  = safe_num(last["low"])
    if len(series) >= 2:
      prev = series[-2]
      chg = safe_num(last["close"]) - safe_num(prev["close"])
      summary["change"] = chg
      summary["change_pct"] = (chg / safe_num(prev["close"]) * 100.0) if safe_num(prev["close"]) else None

  # 52주 위치 (0~100)
  pos = None
  if summary["last_close"] is not None and summary["range_52w_low"] is not None and summary["range_52w_high"] is not None:
    lo = summary["range_52w_low"]
    hi = summary["range_52w_high"]
    if hi > lo:
      pos = (summary["last_close"] - lo) / (hi - lo) * 100.0
  derived = {"pos_52w_pct": pos}

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

    # TTM: 최근 365일 합
    cutoff = series[-1]["time"] - 365 * 24 * 60 * 60 if series else (dividends[-1]["time"] - 365*24*60*60)
    ttm = [d for d in dividends if d["time"] >= cutoff]
    ttm_sum = sum(d["amount"] for d in ttm)
    div_summary["ttm_dividend"] = ttm_sum
    div_summary["monthly_avg_dividend"] = (ttm_sum / 12.0) if ttm_sum else None
    div_summary["ttm_yield_pct"] = (ttm_sum / summary["last_close"] * 100.0) if summary["last_close"] else None

  return series, summary, derived, dividends, div_summary

def ensure_dir(p):
  if p and not os.path.exists(p):
    os.makedirs(p, exist_ok=True)

def main():
  ensure_dir(os.path.dirname(OUT_PATH) or ".")
  ensure_dir(HISTORY_DIR)

  series, summary, derived, dividends, div_summary = fetch_price_daily(TICKER)

  payload = {
    "ticker": TICKER,
    "updated_utc": utc_now(),
    "summary": summary,
    "derived": derived,               # 52주 위치 등
    "dividend_summary": div_summary,  # 배당 요약
    "dividends": dividends,           # 배당 히스토리
    "series": series                  # 캔들 시계열
  }

  with open(OUT_PATH, "w", encoding="utf-8") as f:
    json.dump(payload, f, ensure_ascii=False)

  # daily snapshot (optional)
  if summary.get("asof"):
    snap_path = os.path.join(HISTORY_DIR, f"{summary['asof']}.json")
    with open(snap_path, "w", encoding="utf-8") as f:
      json.dump(payload, f, ensure_ascii=False)

  print(f"[OK] Updated {OUT_PATH} and snapshot {snap_path if summary.get('asof') else '(none)'} (rows={len(series)}, divs={len(dividends)})")

if __name__ == "__main__":
  try:
    main()
  except Exception as e:
    print("[ERR]", str(e))
    sys.exit(1)
