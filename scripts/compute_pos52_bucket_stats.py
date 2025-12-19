import json
import glob
from statistics import mean

HISTORY_DIR = "data/history/daily"
OUT_FILE = "data/pos52_bucket_stats.json"

def load_history():
    files = sorted(glob.glob(f"{HISTORY_DIR}/*.json"))
    data = []
    for f in files:
        with open(f, encoding="utf-8") as fp:
            data.append(json.load(fp))
    return data

def calc():
    data = load_history()
    closes = [d["close"] for d in data]

    results = []

    for i in range(252, len(data) - 63):
        window = closes[i-252:i]
        cur = closes[i]

        pos52 = (cur - min(window)) / (max(window) - min(window)) * 100

        future = closes[i+63]
        ret_3m = (future - cur) / cur * 100

        results.append({
            "pos52": pos52,
            "ret_3m": ret_3m
        })

    buckets = {
        "low": [r for r in results if r["pos52"] < 35],
        "mid": [r for r in results if 35 <= r["pos52"] < 70],
        "high": [r for r in results if r["pos52"] >= 70],
    }

    out = {}
    for k, rows in buckets.items():
        if not rows:
            continue
        out[k] = {
            "avg_3m": round(mean(r["ret_3m"] for r in rows), 2),
            "sample_size": len(rows),
            "max_dd": round(min(r["ret_3m"] for r in rows), 2)
        }

    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)

    print("✅ pos52 bucket stats updated")

if __name__ == "__main__":
    calc()
