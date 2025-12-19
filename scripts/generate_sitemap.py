# scripts/generate_sitemap.py
import os
from datetime import datetime, timezone

BASE_URL = os.environ.get("BASE_URL", "https://kkhj218-netizen.github.io/JEPQ251218")
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUTPUT_PATH = os.path.join(REPO_ROOT, "sitemap.xml")

# 스캔에서 제외할 폴더(필요하면 추가)
EXCLUDE_DIRS = {
    ".git", ".github", "node_modules", ".vscode", "__pycache__"
}

# 사이트맵에 포함할 확장자 (html만 잡는 게 일반적으로 가장 안전)
INCLUDE_EXTS = {".html"}

def should_exclude_dir(dirpath: str) -> bool:
    parts = set(os.path.normpath(dirpath).split(os.sep))
    return any(p in EXCLUDE_DIRS for p in parts)

def to_url(path_rel: str) -> str:
    # Windows 경로 대응
    path_rel = path_rel.replace("\\", "/")
    # index.html은 폴더 URL로
    if path_rel.endswith("/index.html"):
        path_rel = path_rel[:-len("index.html")]
    if path_rel == "index.html":
        path_rel = ""
    if path_rel and not path_rel.startswith("/"):
        path_rel = "/" + path_rel
    return BASE_URL.rstrip("/") + path_rel

def priority_for(path_rel: str) -> str:
    # 홈은 높게, 나머지는 기본값
    if path_rel in ("", "index.html"):
        return "1.0"
    return "0.6"

def main():
    urls = []
    for root, dirs, files in os.walk(REPO_ROOT):
        if should_exclude_dir(root):
            dirs[:] = []
            continue

        # 숨김폴더 제외
        dirs[:] = [d for d in dirs if not d.startswith(".") and d not in EXCLUDE_DIRS]

        for name in files:
            ext = os.path.splitext(name)[1].lower()
            if ext not in INCLUDE_EXTS:
                continue
            # sitemap에 자기 자신 포함 방지
            if name.lower() == "sitemap.xml":
                continue

            full = os.path.join(root, name)
            rel = os.path.relpath(full, REPO_ROOT).replace("\\", "/")
            urls.append(rel)

    # 중복 제거 + 정렬
    urls = sorted(set(urls))

    lastmod = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    lines = []
    lines.append('<?xml version="1.0" encoding="UTF-8"?>')
    lines.append('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">')

    # 루트(홈) 강제 포함
    lines.append("  <url>")
    lines.append(f"    <loc>{BASE_URL.rstrip('/')}/</loc>")
    lines.append(f"    <lastmod>{lastmod}</lastmod>")
    lines.append("    <changefreq>daily</changefreq>")
    lines.append("    <priority>1.0</priority>")
    lines.append("  </url>")

    for rel in urls:
        url = to_url(rel)
        pr = priority_for(rel)
        lines.append("  <url>")
        lines.append(f"    <loc>{url}</loc>")
        lines.append(f"    <lastmod>{lastmod}</lastmod>")
        lines.append("    <changefreq>weekly</changefreq>")
        lines.append(f"    <priority>{pr}</priority>")
        lines.append("  </url>")

    lines.append("</urlset>")
    xml = "\n".join(lines) + "\n"

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        f.write(xml)

    print(f"[OK] wrote {OUTPUT_PATH} with {len(urls)+1} urls")

if __name__ == "__main__":
    main()
