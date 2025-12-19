import yfinance as yf
import json
import os
from datetime import datetime

TICKER = "JEPQ"
OUT_DIR = "data/history/daily"

os.makedirs(OUT_DIR, exist_ok=True)

def main():
    df = yf.download(TICKER, period="5y", interval="1d", auto_adjust=False)
    if df.empty:
        raise Exception("데이터 다운로드 실패")

    df = df.reset_index()

    for _, row in df.iterrows():
        d = row["Date"].strftime("%Y-%m-%d")
        out_path = f"{OUT_DIR}/{d}.json"

        payload = {
            "date": d,
            "open": float(row["Open"]),
            "high": float(row["High"]),
            "low": float(row["Low"]),
            "close": float(row["Close"]),
            "volume": int(row["Volume"])
        }

        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f"✅ saved {len(df)} daily files")

if __name__ == "__main__":
    main()
