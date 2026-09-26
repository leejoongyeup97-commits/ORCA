from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

BASE_URL = "https://overwatch.nexon.com"
LIST_URL = f"{BASE_URL}/news/patchnotes"
_ALLOWED_HOSTS = {"overwatch.nexon.com"}
_DATE_RE = re.compile(r"(20\\d{2})\\s*년\\s*(\\d{1,2})\\s*월\\s*(\\d{1,2})\\s*일")


def _find_chrome_executable() -> str:
    candidates = [
        os.environ.get("ORCA_CHROME_PATH"),
        str(Path(os.environ.get("PROGRAMFILES", r"C:\\Program Files")) / "Google/Chrome/Application/chrome.exe"),
        str(Path(os.environ.get("PROGRAMFILES(X86)", r"C:\\Program Files (x86)")) / "Google/Chrome/Application/chrome.exe"),
        str(Path(os.environ.get("LOCALAPPDATA", "")) / "Google/Chrome/Application/chrome.exe"),
    ]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return candidate
    raise RuntimeError("Chrome executable was not found.")


def _iso_date(title: str) -> str | None:
    match = _DATE_RE.search(title)
    if not match:
        return None
    y, m, d = (int(v) for v in match.groups())
    return f"{y:04d}-{m:02d}-{d:02d}"


def collect(limit: int) -> list[dict]:
    chrome = _find_chrome_executable()
    items: list[dict] = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=chrome,
            headless=True,
            args=["--disable-extensions", "--no-first-run", "--no-default-browser-check"],
        )
        page = browser.new_page(locale="ko-KR")
        page.goto(LIST_URL, wait_until="domcontentloaded", timeout=30_000)
        page.wait_for_selector(".news-list-item", timeout=15_000)
        page.wait_for_timeout(1000)

        count = min(page.locator(".news-list-item").count(), max(1, min(limit, 100)))

        for index in range(count):
            cards = page.locator(".news-list-item")
            card = cards.nth(index)

            try:
                title = re.sub(r"\\s+", " ", card.locator(".news-title").inner_text(timeout=5_000)).strip()
            except Exception:
                continue

            if "패치" not in title:
                continue

            origin = page.url
            try:
                card.click(timeout=5_000)
                page.wait_for_timeout(500)
                try:
                    page.wait_for_function(
                        "(oldUrl) => window.location.href !== oldUrl",
                        arg=origin,
                        timeout=8_000,
                    )
                except Exception:
                    pass
                detail_url = page.url
            except Exception:
                detail_url = page.url

            parsed = urlparse(detail_url)
            if (
                detail_url != origin
                and parsed.hostname in _ALLOWED_HOSTS
                and parsed.path.startswith("/news/patchnotes")
            ):
                items.append(
                    {
                        "title": title,
                        "published_date": _iso_date(title),
                        "url": detail_url,
                    }
                )

            if page.url != LIST_URL:
                page.goto(LIST_URL, wait_until="domcontentloaded", timeout=30_000)
                page.wait_for_selector(".news-list-item", timeout=15_000)
                page.wait_for_timeout(350)

        browser.close()

    return items


def main() -> int:
    try:
        limit = int(sys.argv[1]) if len(sys.argv) > 1 else 20
        print(json.dumps({"ok": True, "items": collect(limit)}, ensure_ascii=False))
        return 0
    except Exception as exc:
        print(
            json.dumps(
                {"ok": False, "error": f"{type(exc).__name__}: {exc}"},
                ensure_ascii=False,
            )
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
