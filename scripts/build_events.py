import json
from datetime import date, timedelta

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
            "title": f"옵션 만기 (3번째 금요일)",
            "note": "만기 주간엔 변동성/거래량이 늘 수 있어요. (지표 급변 체크)"
        })

        # FUTURES: 분기(3,6,9,12)
        if m in (3, 6, 9, 12):
            events.append({
                "date": exp.isoformat(),
                "type": "futures",
                "title": f"선물 만기 (분기 3번째 금요일)",
                "note": "분기 만기 주간은 포지션 롤오버/수급 변화로 흔들릴 수 있어요."
            })

    # 날짜 기준 정렬 + 같은 날짜/타입 중복 제거
    uniq = {}
    for e in events:
        key = (e["date"], e["type"], e["title"])
        uniq[key] = e
    events = list(uniq.values())
    events.sort(key=lambda x: x["date"])

    return events

def main():
    today = date.today()
    events = build_events(today, months_ahead=12)

    payload = {
        "asof": today.isoformat(),
        "timezone_note": "Dates are calendar dates (local display). D-Day is computed in browser local time.",
        "events": events
    }

    # 폴더 없으면(일반적으로는 존재) 대비
    import os
    os.makedirs("data", exist_ok=True)

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f"✅ wrote {OUT_PATH} ({len(events)} events)")

if __name__ == "__main__":
    main()
