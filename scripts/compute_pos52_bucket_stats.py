import json
import glob
import os
from pathlib import Path
from statistics import mean

HISTORY_DIR = "data/history/daily"
OUT_FILE = "data/pos52_bucket_stats.json"

LOOKBACK_DAYS = 252   # 52주(거래일) 기준
FORWARD_DAYS  = 63    # 3개월(거래일) 기준


def _safe_float(x):
    try:
        return float(x)
    except Exception:
        return None


def load_history():
    """
    history 파일이 보통 아래 둘 중 하나로 올 수 있어서 둘 다 대응:
    1) dict: {"date": "...", "close": 57.91, ...}
    2) list: [{"date": "...", "close": ...}, ...]
    """
    files = sorted(glob.glob(f"{HISTORY_DIR}/*.json"))
    rows = []

    for f in files:
        with open(f, encoding="utf-8") as fp:
            obj = json.load(fp)

        if isinstance(obj, list):
            for r in obj:
                if isinstance(r, dict) and "close" in r:
                    c = _safe_float(r.get("close"))
                    if c is not None:
                        rows.append({"date": r.get("date"), "close": c})
        elif isinstance(obj, dict):
            c = _safe_float(obj.get("close"))
            if c is not None:
                rows.append({"date": obj.get("date"), "close": c})

    # 날짜가 없을 수도 있으니 close만이라도 정렬 유지
    return rows


def pos52_pct(cur, window):
    lo = min(window)
    hi = max(window)
    if hi == lo:
        return None
    return (cur - lo) / (hi - lo) * 100.0


def max_drawdown_forward(cur, forward_closes):
    """
    다음 FORWARD_DAYS 구간에서 최저 종가 기준 조정률(%)
    예) 최저가가 cur 대비 -6.4%면 -6.4 반환
    """
    if not forward_closes:
        return None
    min_fwd = min(forward_closes)
    dd = (min_fwd - cur) / cur * 100.0
    return dd


def bucket_key(pos):
    # 프론트에서 바로 쓰기 좋은 키
    if pos is None:
        return None
    if pos >= 90:
        return "90_100"
    if pos >= 70:
        return "70_90"
    if pos >= 35:
        return "35_70"
    return "0_35"


def calc():
    data = load_history()
    if len(data) < (LOOKBACK_DAYS + FORWARD_DAYS + 10):
        raise RuntimeError(f"History too short: {len(data)} rows (need at least ~{LOOKBACK_DAYS+FORWARD_DAYS})")

    closes = [d["close"] for d in data]

    # 각 관측치마다: pos52 / 3m return / 3m max drawdown 계산
    samples = []
    start_i = LOOKBACK_DAYS
    end_i = len(data) - FORWARD_DAYS

    for i in range(start_i, end_i):
        window = closes[i-LOOKBACK_DAYS:i]
        cur = closes[i]

        pos = pos52_pct(cur, window)
        if pos is None:
            continue

        future = closes[i+FORWARD_DAYS]
        ret_3m = (future - cur) / cur * 100.0

        forward_slice = closes[i:i+FORWARD_DAYS+1]  # 포함해서 최저 확인
        dd = max_drawdown_forward(cur, forward_slice)

        samples.append({
            "pos52": pos,
            "ret_3m": ret_3m,
            "max_dd": dd
        })

    # 버킷별로 모으기
    buckets = {}
    for s in samples:
        k = bucket_key(s["pos52"])
        if k is None:
            continue
        buckets.setdefault(k, []).append(s)

    # 출력 스키마: derived.pos52_bucket_stats에서 그대로 쓰게
    out = {
        "meta": {
            "lookback_days": LOOKBACK_DAYS,
            "forward_days": FORWARD_DAYS,
            "history_dir": HISTORY_DIR,
            "sample_total": len(samples),
        }
    }

    for k in ["90_100", "70_90", "35_70", "0_35"]:
        rows = buckets.get(k, [])
        if not rows:
            continue

        out[k] = {
            "avg_return_3m": round(mean(r["ret_3m"] for r in rows), 2),
            "max_drawdown": round(min(r["max_dd"] for r in rows), 2),  # 가장 나쁜(가장 음수) 조정
            "sample_size": len(rows),
        }

    # 저장 경로 보장
    Path(os.path.dirname(OUT_FILE) or ".").mkdir(parents=True, exist_ok=True)

    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print(f"✅ pos52 bucket stats updated → {OUT_FILE}")


if __name__ == "__main__":
    calc()
