from __future__ import annotations

import html as html_lib
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass, asdict
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen

BASE_URL = "https://overwatch.nexon.com"
LIST_URL = f"{BASE_URL}/news/patchnotes"
_ALLOWED_HOSTS = {"overwatch.nexon.com"}

_DATE_KO_RE = re.compile(r"(20\d{2})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일")
_DATE_DOT_RE = re.compile(r"(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})")


@dataclass(frozen=True)
class PatchNoteItem:
    title: str
    published_date: str | None
    url: str


@dataclass(frozen=True)
class PatchNoteDetail:
    title: str
    published_date: str | None
    url: str
    body_text: str


class _PageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.skip_depth = 0
        self.current_href: str | None = None
        self.current_anchor: list[str] = []
        self.anchors: list[tuple[str, str]] = []
        self.text_parts: list[str] = []
        self.h1_parts: list[str] = []
        self.in_h1 = False
        self.og_title: str | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_dict = dict(attrs)
        if tag in {"script", "style", "svg", "noscript", "template"}:
            self.skip_depth += 1
            return
        if self.skip_depth:
            return

        if tag == "meta":
            prop = (attrs_dict.get("property") or attrs_dict.get("name") or "").lower()
            if prop == "og:title" and attrs_dict.get("content"):
                self.og_title = str(attrs_dict["content"]).strip()

        if tag == "a":
            href = attrs_dict.get("href")
            if href:
                self.current_href = href
                self.current_anchor = []

        if tag == "h1":
            self.in_h1 = True
            self.h1_parts = []

        if tag in {"p", "div", "section", "article", "li", "h1", "h2", "h3", "h4", "h5", "br"}:
            self.text_parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "svg", "noscript", "template"}:
            if self.skip_depth:
                self.skip_depth -= 1
            return
        if self.skip_depth:
            return

        if tag == "a" and self.current_href:
            text = _clean_inline(" ".join(self.current_anchor))
            self.anchors.append((self.current_href, text))
            self.current_href = None
            self.current_anchor = []

        if tag == "h1":
            self.in_h1 = False

        if tag in {"p", "div", "section", "article", "li", "h1", "h2", "h3", "h4", "h5"}:
            self.text_parts.append("\n")

    def handle_data(self, data: str) -> None:
        if self.skip_depth:
            return
        if not data.strip():
            return
        self.text_parts.append(data)
        if self.current_href is not None:
            self.current_anchor.append(data)
        if self.in_h1:
            self.h1_parts.append(data)


def _clean_inline(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def _normalize_lines(value: str) -> list[str]:
    lines = []
    for line in re.split(r"[\r\n]+", value):
        cleaned = _clean_inline(line)
        if cleaned:
            lines.append(cleaned)
    return lines


def _to_iso_date(value: str) -> str | None:
    match = _DATE_KO_RE.search(value) or _DATE_DOT_RE.search(value)
    if not match:
        return None
    year, month, day = (int(part) for part in match.groups())
    return f"{year:04d}-{month:02d}-{day:02d}"


def _validate_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in _ALLOWED_HOSTS:
        raise ValueError("Only https://overwatch.nexon.com patch-note URLs are allowed.")
    if not parsed.path.startswith("/news/patchnotes"):
        raise ValueError("URL must point to the Nexon Overwatch patch-note section.")


def _fetch_html(url: str, timeout: float = 15.0) -> str:
    _validate_url(url)
    request = Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) ORCA-Patchnote/0.1",
            "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.6",
        },
    )
    with urlopen(request, timeout=timeout) as response:
        charset = response.headers.get_content_charset() or "utf-8"
        return response.read().decode(charset, errors="replace")





def _find_chrome_executable() -> str | None:
    candidates = [
        os.environ.get("ORCA_CHROME_PATH"),
        str(Path(os.environ.get("PROGRAMFILES", r"C:\Program Files")) / "Google/Chrome/Application/chrome.exe"),
        str(Path(os.environ.get("PROGRAMFILES(X86)", r"C:\Program Files (x86)")) / "Google/Chrome/Application/chrome.exe"),
        str(Path(os.environ.get("LOCALAPPDATA", "")) / "Google/Chrome/Application/chrome.exe"),
    ]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return candidate
    return None


def _fetch_rendered_html(url: str, timeout: float = 25.0) -> str:
    """Fallback for Nexon pages whose article cards are injected by JavaScript.

    Uses the user's already-installed Chrome in headless mode. No webdriver or
    extra browser package is required.
    """
    _validate_url(url)
    chrome = _find_chrome_executable()
    if not chrome:
        raise RuntimeError(
            "Chrome executable was not found. Set ORCA_CHROME_PATH if Chrome is installed in a custom location."
        )

    command = [
        chrome,
        "--headless=new",
        "--disable-gpu",
        "--disable-extensions",
        "--disable-background-networking",
        "--no-first-run",
        "--no-default-browser-check",
        "--virtual-time-budget=5000",
        "--dump-dom",
        url,
    ]
    completed = subprocess.run(
        command,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=timeout,
        check=False,
    )
    if completed.returncode != 0 or not completed.stdout.strip():
        detail = (completed.stderr or "").strip()
        raise RuntimeError(f"Chrome DOM render failed ({completed.returncode}): {detail[:500]}")
    return completed.stdout


def _extract_patchnote_urls(raw_html: str) -> list[str]:
    """Find detail URLs even when they live inside rendered/script markup."""
    normalized = html_lib.unescape(raw_html).replace(r"\/", "/")
    matches = re.findall(
        r"(?:https://overwatch\.nexon\.com)?(/news/patchnotes/\d+(?:/[^\"'<>\s?#]+)?)",
        normalized,
        flags=re.I,
    )
    urls: list[str] = []
    seen: set[str] = set()
    for path in matches:
        url = urljoin(BASE_URL, path)
        if url not in seen:
            seen.add(url)
            urls.append(url)
    return urls


def _items_from_raw_markup(raw_html: str, limit: int) -> list[PatchNoteItem]:
    """Recover cards when Nexon's rendered DOM keeps title and route outside a normal <a>."""
    normalized = html_lib.unescape(raw_html).replace(r"\/", "/")
    title_pattern = re.compile(
        r"오버워치(?:\s*2)?\s*패치\s*노트\s*[-–—]\s*20\d{2}년\s*\d{1,2}월\s*\d{1,2}일"
    )
    route_pattern = re.compile(
        r"(?:https://overwatch\.nexon\.com)?(/news/patchnotes/\d+(?:/[^\"'<>\s?#]+)?)",
        flags=re.I,
    )

    items: list[PatchNoteItem] = []
    seen_urls: set[str] = set()

    for match in title_pattern.finditer(normalized):
        left = max(0, match.start() - 2500)
        right = min(len(normalized), match.end() + 2500)
        window = normalized[left:right]
        route_matches = list(route_pattern.finditer(window))
        if not route_matches:
            continue

        title_center = match.start() - left
        nearest = min(
            route_matches,
            key=lambda route: abs(((route.start() + route.end()) // 2) - title_center),
        )
        absolute = urljoin(BASE_URL, nearest.group(1))
        if absolute in seen_urls:
            continue

        title = _clean_inline(match.group(0))
        seen_urls.add(absolute)
        items.append(
            PatchNoteItem(
                title=title,
                published_date=_to_iso_date(title),
                url=absolute,
            )
        )
        if len(items) >= limit:
            break

    return items


def _title_contexts(raw_html: str, max_items: int = 3, radius: int = 900) -> list[str]:
    normalized = html_lib.unescape(raw_html).replace(r"\/", "/")
    pattern = re.compile(
        r"오버워치(?:\s*2)?\s*패치\s*노트\s*[-–—]\s*20\d{2}년\s*\d{1,2}월\s*\d{1,2}일"
    )
    contexts: list[str] = []
    for match in pattern.finditer(normalized):
        left = max(0, match.start() - radius)
        right = min(len(normalized), match.end() + radius)
        snippet = normalized[left:right]
        contexts.append(snippet)
        if len(contexts) >= max_items:
            break
    return contexts


def patchnotes_debug() -> dict:
    """Small diagnostics payload so we can see what Nexon actually returned on the user's PC."""
    plain = _fetch_html(LIST_URL)
    plain_parser = _PageParser()
    plain_parser.feed(plain)

    result = {
        "collector_version": "0.3",
        "chrome_path": _find_chrome_executable(),
        "plain_html_length": len(plain),
        "plain_anchor_count": len(plain_parser.anchors),
        "plain_patch_urls": _extract_patchnote_urls(plain)[:10],
        "plain_title_hits": re.findall(
            r"오버워치(?:\s*2)?\s*패치\s*노트\s*[-–—]\s*20\d{2}년\s*\d{1,2}월\s*\d{1,2}일",
            html_lib.unescape(plain),
        )[:10],
        "plain_title_context": _title_contexts(plain),
        "plain_anchor_hrefs": [href for href, _ in plain_parser.anchors[:30]],
    }

    try:
        rendered = _fetch_rendered_html(LIST_URL)
        rendered_parser = _PageParser()
        rendered_parser.feed(rendered)
        result.update(
            {
                "rendered_html_length": len(rendered),
                "rendered_anchor_count": len(rendered_parser.anchors),
                "rendered_patch_urls": _extract_patchnote_urls(rendered)[:10],
                "rendered_title_hits": re.findall(
                    r"오버워치(?:\s*2)?\s*패치\s*노트\s*[-–—]\s*20\d{2}년\s*\d{1,2}월\s*\d{1,2}일",
                    html_lib.unescape(rendered),
                )[:10],
                "rendered_title_context": _title_contexts(rendered),
                "rendered_anchor_hrefs": [href for href, _ in rendered_parser.anchors[:80]],
            }
        )
    except Exception as exc:
        result["rendered_error"] = f"{type(exc).__name__}: {exc}"

    return result


def _items_from_html(raw_html: str, limit: int) -> list[PatchNoteItem]:
    parser = _PageParser()
    parser.feed(raw_html)

    seen: set[str] = set()
    items: list[PatchNoteItem] = []

    for href, anchor_text in parser.anchors:
        absolute = urljoin(BASE_URL, href)
        parsed = urlparse(absolute)
        if parsed.hostname not in _ALLOWED_HOSTS:
            continue
        if not re.match(r"^/news/patchnotes/\d+(?:/|$)", parsed.path):
            continue
        if absolute in seen:
            continue

        title_match = re.search(
            r"(오버워치(?:\s*2)?\s*패치\s*노트\s*[-–—]\s*20\d{2}년\s*\d{1,2}월\s*\d{1,2}일)",
            anchor_text,
        )
        title = _clean_inline(title_match.group(1) if title_match else anchor_text)
        if not title:
            continue

        seen.add(absolute)
        items.append(PatchNoteItem(title=title, published_date=_to_iso_date(title), url=absolute))
        if len(items) >= limit:
            return items

    return items



def _list_patchnotes_via_playwright(limit: int) -> list[PatchNoteItem]:
    """Run Playwright in a separate Python process.

    Uvicorn on Windows can use an event-loop policy that cannot spawn the
    Playwright driver and raises NotImplementedError. A standalone worker uses
    the normal Windows subprocess/event-loop environment instead.
    """
    completed = subprocess.run(
        [sys.executable, str(Path(__file__).resolve().with_name("browser_worker.py")), str(limit)],
        cwd=str(Path(__file__).resolve().parents[1]),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=90,
        check=False,
    )

    stdout = (completed.stdout or "").strip()
    stderr = (completed.stderr or "").strip()

    try:
        payload = json.loads(stdout.splitlines()[-1]) if stdout else {}
    except json.JSONDecodeError as exc:
        raise RuntimeError(
            f"Patchnote browser worker returned invalid JSON. stderr={stderr[:500]}"
        ) from exc

    if completed.returncode != 0 or payload.get("ok") is not True:
        detail = payload.get("error") or stderr or f"exit={completed.returncode}"
        raise RuntimeError(f"Patchnote browser worker failed: {detail}")

    items: list[PatchNoteItem] = []
    for item in payload.get("items", []):
        if not isinstance(item, dict):
            continue
        title = _clean_inline(str(item.get("title") or ""))
        url = str(item.get("url") or "")
        if not title or not url:
            continue
        items.append(
            PatchNoteItem(
                title=title,
                published_date=str(item.get("published_date") or "") or _to_iso_date(title),
                url=url,
            )
        )
    return items


def list_patchnotes(limit: int = 20) -> list[dict]:
    limit = max(1, min(limit, 100))

    # Fast path: plain HTTP. Some Nexon responses already contain the cards.
    raw_html = _fetch_html(LIST_URL)
    items = _items_from_html(raw_html, limit)

    # Current Nexon list can return only a JS shell to urllib. In that case,
    # render once with the user's installed Chrome and parse the final DOM.
    if not items:
        rendered_html = _fetch_rendered_html(LIST_URL)
        items = _items_from_html(rendered_html, limit)

        if not items:
            items = _items_from_raw_markup(rendered_html, limit)

        # Last fallback: if clickable cards do not expose anchor text cleanly,
        # discover their URLs from the rendered DOM and read each detail page.
        if not items:
            for url in _extract_patchnote_urls(rendered_html)[:limit]:
                try:
                    detail = fetch_patchnote(url)
                except Exception:
                    continue
                items.append(
                    PatchNoteItem(
                        title=detail.get("title") or "오버워치 패치 노트",
                        published_date=detail.get("published_date"),
                        url=url,
                    )
                )

    # Nexon's current cards are clickable Vue components with no href in the
    # rendered HTML. When markup parsing cannot discover routes, use the same
    # browser click behavior a user would use and capture the resulting URL.
    if not items:
        items = _list_patchnotes_via_playwright(limit)

    return [asdict(item) for item in items]


def fetch_patchnote(url: str) -> dict:
    raw_html = _fetch_html(url)
    parser = _PageParser()
    parser.feed(raw_html)

    lines = _normalize_lines("".join(parser.text_parts))

    # Detail pages may also arrive as a JS shell. Retry with rendered DOM when
    # there is no meaningful patch-note body in the plain response.
    if len(lines) < 8 or not any("패치" in line for line in lines):
        raw_html = _fetch_rendered_html(url)
        parser = _PageParser()
        parser.feed(raw_html)
        lines = _normalize_lines("".join(parser.text_parts))
    h1 = _clean_inline(" ".join(parser.h1_parts))
    title = h1 or parser.og_title or ""
    if not title:
        title = next((line for line in lines if "패치 노트" in line), "")
    title = _clean_inline(title.replace("| 오버워치(Overwatch)", ""))

    published_date = _to_iso_date(title)
    if published_date is None:
        for line in lines:
            published_date = _to_iso_date(line)
            if published_date:
                break

    # Keep only the article portion. The Nexon page sometimes exposes the
    # title through metadata while the visible title has slightly different
    # whitespace, so fall back to the first patch-note title with the same date.
    start = 0
    if title:
        normalized_title = _clean_inline(title)
        for index, line in enumerate(lines):
            normalized_line = _clean_inline(line)
            if normalized_title == normalized_line or normalized_title in normalized_line:
                start = index + 1
                break
        else:
            for index, line in enumerate(lines):
                if "패치 노트" in line and _to_iso_date(line) == published_date:
                    start = index + 1
                    break

    body_lines = lines[start:]

    # Drop common site chrome.
    chrome_tokens = {
        "게임정보", "영웅", "시즌", "소식", "커뮤니티", "고객지원", "계정연동",
        "play now", "news", "넥슨 id 로그인", "전체", "공지사항", "패치노트", "이벤트", "넥슨공지",
        "patchnote",
    }
    body_lines = [
        line for line in body_lines
        if _clean_inline(line).lower() not in chrome_tokens
    ]

    # Remove one standalone publication date or relative-time label near the top.
    if body_lines and _to_iso_date(body_lines[0]) == published_date:
        body_lines = body_lines[1:]
    while body_lines and re.fullmatch(
        r"^(?:방금\s*전|\d+\s*(?:초|분|시간|일|주|개월|달|년)\s*전)$",
        _clean_inline(body_lines[0]),
    ):
        body_lines = body_lines[1:]

    # Everything after the share/list controls belongs to the site footer.
    footer_index = next(
        (index for index, line in enumerate(body_lines) if "URL 공유하기" in line),
        None,
    )
    if footer_index is not None:
        body_lines = body_lines[:footer_index]

    body_text = "\n".join(body_lines).strip()
    if not body_text:
        raise ValueError("Patch-note body could not be extracted from the page.")

    return asdict(
        PatchNoteDetail(
            title=title,
            published_date=published_date,
            url=url,
            body_text=body_text,
        )
    )
