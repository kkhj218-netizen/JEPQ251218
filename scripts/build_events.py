import json
import os
from datetime import date, timedelta

# ✅ GitHub Pages 기준 저장 위치
OUT_PATH = "JEPQ251218/data/events.json"

def third_friday(year: int, month: int) -> date:
    d = date(year, month, 1)
    # weekday(): Mon=0 ... Sun=6, Friday=4
    days_to_friday = (4 - d.weekday()) % 7
    first_friday = d + timedelta(days=days_to_friday)
    return first_friday + timedelta(days=14)

def add_months(y: int, m: int, add: int):
    m2 = m + add
    y2 = y + (m2 - 1) // 12
    m2 = (m2 - 1) % 12 + 1
    return y2, m2

def build_events(start: date, months_ahead: int = 12):
    events = []

    for i in range(months_ahead + 1):
        y, m = add_months(start.year, start.month, i)
        exp = third_friday(y, m)

        # OPTIONS: 매월
        events.append({
            "date": exp.isoformat(),
            "type": "options",
            "title": "옵션 만기 (3번째 금요일)",
            "note": "만기 주간엔 변동성·거래량이 늘 수 있어요. (급변 지표 체크)"
        })

        # FUTURES: 분기(3,6,9,12)
        if m in (3, 6, 9, 12):
            events.append({
                "date": exp.isoformat(),
                "type": "futures",
                "title": "선물 만기 (분기 3번째 금요일)",
                "note": "분기 만기 주간은 롤오버·수급 변화로 변동성이 커질 수 있어요."
            })

    # 날짜 + 타입 기준 중복 제거
    uniq = {}
    for e in events:
        key = (e["date"], e["type"])
        uniq[key] = e

    events = list(uniq.values())
    events.sort(key=lambda x: x["date"])
    return events

def main():
    today = date.today()
    events = build_events(today, months_ahead=12)

    payload = {
        "asof": today.isoformat(),
        "timezone_note": "Dates are calendar dates. D-Day is computed in browser local time.",
        "events": events
    }

    # ✅ 폴더 보장
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f"✅ wrote {OUT_PATH} ({len(events)} events)")

if __name__ == "__main__":
    main()
