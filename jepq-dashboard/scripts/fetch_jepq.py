#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import json
import math
import datetime as dt
from typing import Any, Dict, List, Optional
import urllib.request


TICKER = "JEPQ"
OUT_DATA = os.path.join("data", "jepq.json")
HIST_DIR = os.path.join("history", "jepq")


def _http_get_json(url: str) -> Dict[str, Any]:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                          "(KHTML, like Gecko) Chrome/120 Safari/537.36"
        }
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read().decode("utf-8")
    return json.loads(raw)


def fetch_daily_ohlcv(ticker: str, range_str: str = "5y") -> List[Dict[str, Any]]:
    # Yahoo chart endpoint (daily)
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?range={range_str}&interval=1d&includePrePost=false"
    data = _http_get_json(url)

    chart = data.get("chart", {})
    if chart.get("error"):
        raise RuntimeError(f"Yahoo chart error: {chart['error']}")

    result = (chart.get("result") or [None])[0]
    if not result:
        raise RuntimeError("No chart result from Yahoo")

    ts = result["timestamp"]  # unix seconds list
    q = result["indicators"]["quote"][0]

    opens = q.get("open", [])
    highs = q.get("high", [])
    lows = q.get("low", [])
    closes = q.get("close", [])
    vols = q.get("volume", [])

    series: List[Dict[str, Any]] = []
    for i, t in enumerate(ts):
        o, h, l, c, v = opens[i], highs[i], lows[i], closes[i], vols[i]
        # skip null rows
        if o is None or h is None or l is None or c is None:
            continue
        series.append({
            "time": int(t),
            "open": float(o),
            "high": float(h),
            "low": float(l),
            "close": float(c),
            "volume": int(v) if v is not None else 0
        })
    return series


def iso_from_unix(unix_s: int) -> str:
    return dt.datetime.utcfromtimestamp(unix_s).strftime("%Y-%m-%d")


def safe_round(x: Optional[float], nd: int = 2) -> Optional[float]:
    if x is None:
        return None
    if isinstance(x, float) and (math.isnan(x) or math.isinf(x)):
        return None
    return round(float(x), nd)


def build_summary(series: List[Dict[str, Any]]) -> Dict[str, Any]:
    if len(series) < 2:
        return {
            "asof": None,
            "last_close": None,
            "day_high": None,
            "day_low": None,
            "volume": None,
            "range_52w_high": None,
            "range_52w_low": None,
            "change": None,
            "change_pct": None,
        }

    last = series[-1]
    prev = series[-2]

    last_close = last["close"]
    prev_close = prev["close"]
    chg = last_close - prev_close
    chg_pct = (chg / prev_close) * 100 if prev_close else None

    # 52w ~= last 252 trading days (approx)
    lookback = series[-252:] if len(series) >= 252 else series
    range_52w_high = max(x["high"] for x in lookback)
    range_52w_low = min(x["low"] for x in lookback)

    return {
        "asof": iso_from_unix(last["time"]),
        "last_close": safe_round(last_close, 2),
        "day_high": safe_round(last["high"], 2),
        "day_low": safe_round(last["low"], 2),
        "volume": int(last.get("volume", 0)),
        "range_52w_high": safe_round(range_52w_high, 2),
        "range_52w_low": safe_round(range_52w_low, 2),
        "change": safe_round(chg, 2),
        "change_pct": safe_round(chg_pct, 2),
    }


def ensure_dirs():
    os.makedirs(os.path.dirname(OUT_DATA), exist_ok=True)
    os.makedirs(HIST_DIR, exist_ok=True)


def write_json(path: str, obj: Any):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)


def main():
    ensure_dirs()

    series = fetch_daily_ohlcv(TICKER, range_str="5y")
    summary = build_summary(series)

    payload = {
        "ticker": TICKER,
        "updated_utc": dt.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
        "summary": summary,
        "series": series
    }

    # latest snapshot date
    snap_date = summary.get("asof") or dt.datetime.utcnow().strftime("%Y-%m-%d")
    snap_path = os.path.join(HIST_DIR, f"{snap_date}.json")

    write_json(OUT_DATA, payload)
    write_json(snap_path, payload)

    print(f"[OK] Updated {OUT_DATA} and snapshot {snap_path} (rows={len(series)})")


if __name__ == "__main__":
    main()
