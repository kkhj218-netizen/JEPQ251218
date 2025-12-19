import json
import glob
from statistics import mean
from datetime import date, timedelta

HISTORY_DIR = "data/history/daily"
EVENTS_FILE = "data/events.json"

def load_history():
    files = sorted(glob.glob(f"{HISTORY_DIR}/*.json"))
    return {f[-15:-5]: json.load(open(f)) for f in files}

def calc_move(hist, d):
    dates = [(d + timedelta(i)).isoformat() for i in (-1,0,1)]
    rows = [hist[x] for x in dates if x in hist]
    if len(rows) < 2:
        return None
    high = max(r["high"] for r in rows)
    low = min(r["low"] for r in rows)
    close = rows[0]["close"]
    return round((high - low) / close * 100, 2)

def main():
    hist = load_history()

    with open(EVENTS_FILE, encoding="utf-8") as f:
        payload = json.load(f)

    for e in payload["events"]:
        d = date.fromisoformat(e["date"])
        moves = []

        for y in range(3, 8):
            past = d.replace(year=d.year - y)
            m = calc_move(hist, past)
            if m:
                moves.append(m)

        if moves:
            e["avg_move_pct"] = round(mean(moves), 2)
            e["impact_level"] = 3 if e["avg_move_pct"] > 2 else 2 if e["avg_move_pct"] > 1 else 1

    with open(EVENTS_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print("✅ event avg_move updated")

if __name__ == "__main__":
    main()
