#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pos52_bucket_stats.py
- 5년치(또는 누적) 일봉 히스토리로
  "52주 위치(0~100) 구간별" 과거 성과 통계를 계산해 JSON으로 저장

필수:
- HISTORY_DIR 안에 {"date": "...", "close": 00.00} 형태의 파일들이 있어야 함
  (파일명은 YYYY-MM-DD.json 형태 권장)

출력:
- data/pos52_bucket_stats.json
"""

import os
import json
import glob
from statistics import mean

HISTORY_DIR = "data/history/daily"
OUT_FILE = "data/pos52_bucket_stats.json"

LOOKBACK = 252      # 52주(거래일) 윈도우
FWD_DAYS = 63       # 3개월(거래일) 앞으로 성과
MIN_SAMPLES = 20    # 버킷 표본 너무 적으면 출력해도 의미 없어서 필터(원하면 0으로)

# 버킷 정의: (이름, 최소포함, 최대미만)  단, 마지막은 100 포함 처리
BUCKETS = [
    ("p0_35", 0, 35),
    ("p35_70", 35, 70),
    ("p70_90", 70, 90),
    ("p90_100", 90, 101),  # 100 포함을 위해 101
]


def load_history():
    files = sorted(glob.glob(os.path.join(HISTORY_DIR, "*.json")))
    data = []
    for f in files:
        try:
            with open(f, encoding="utf-8") as fp:
                j = json.load(fp)
            c = j.get("close", None)
            dt = j.get("date", None) or os.path.splitext(os.path.basename(f))[0]
            if c is None:
                continue
            data.append({"date": dt, "close": float(c)})
        except Exception:
            # 깨진 파일은 조용히 스킵
            continue

    # 날짜 정렬(파일명이 날짜면 대부분 이미 정렬이지만 안전하게)
    data.sort(key=lambda x: x["date"])
    return data


def safe_pos52(cur, window):
    """0으로 나눔 방지 + pos52 계산"""
    lo = min(window)
    hi = max(window)
    if hi <= lo:
        return None
    return (cur - lo) / (hi - lo) * 100.0


def bucket_of(pos52):
    for name, lo, hi in BUCKETS:
        if lo <= pos52 < hi:
            return name
    return None


def calc():
    data = load_history()
    if len(data) < (LOOKBACK + FWD_DAYS + 5):
        raise RuntimeError(f"Not enough history files in {HISTORY_DIR} (need at least {LOOKBACK+FWD_DAYS+5}).")

    closes = [d["close"] for d in data]

    rows = []
    # i는 "현재 시점" 인덱스
    # 과거 LOOKBACK 확보 + 미래 FWD_DAYS 확보 가능한 구간만
    for i in range(LOOKBACK, len(data) - FWD_DAYS):
        cur = closes[i]
        window = closes[i - LOOKBACK : i]  # 과거 252개
        pos52 = safe_pos52(cur, window)
        if pos52 is None:
            continue  # 0으로 나눔 방지: 스킵이 가장 안전(통계 왜곡 방지)

        # 3개월 뒤 수익률(딱 그 시점)
        future = closes[i + FWD_DAYS]
        ret_3m = (future - cur) / cur * 100.0

        # ✅ "최대 조정" = 앞으로 63거래일 구간 중 최저점 기준
        forward_window = closes[i : i + FWD_DAYS + 1]  # 현재 포함 ~ 63일 후 포함
        min_fwd = min(forward_window)
        max_dd = (min_fwd - cur) / cur * 100.0  # 음수(하락)일수록 조정 큼

        rows.append({
            "pos52": pos52,
            "bucket": bucket_of(pos52),
            "ret_3m": ret_3m,
            "max_dd": max_dd,
        })

    # 버킷별 집계
    out = {
        "meta": {
            "history_dir": HISTORY_DIR,
            "lookback_days": LOOKBACK,
            "forward_days": FWD_DAYS,
            "buckets": [b[0] for b in BUCKETS],
            "min_samples": MIN_SAMPLES,
        },
        "stats": {}
    }

    for name, lo, hi in BUCKETS:
        b = [r for r in rows if r["bucket"] == name]
        if len(b) < MIN_SAMPLES:
            continue

        avg_3m = mean(r["ret_3m"] for r in b)
        # 최대 조정은 "가장 나쁜(가장 작은) max_dd" (예: -12%가 더 나쁨)
        worst_dd = min(r["max_dd"] for r in b)
        win_rate = mean(1 if r["ret_3m"] > 0 else 0 for r in b) * 100.0

        out["stats"][name] = {
            "range_pos52": [lo, min(100, hi)],
            "sample_size": len(b),
            "avg_ret_3m_pct": round(avg_3m, 2),
            "worst_max_dd_pct": round(worst_dd, 2),
            "win_rate_3m_pct": round(win_rate, 1),
        }

    # 출력 폴더 생성
    os.makedirs(os.path.dirname(OUT_FILE) or ".", exist_ok=True)

    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print(f"✅ wrote {OUT_FILE} (buckets={len(out['stats'])}, rows={len(rows)})")


if __name__ == "__main__":
    calc()
