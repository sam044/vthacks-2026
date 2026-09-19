"""Read-only public data access probes. Not application implementation.

Raw downloads stay in ignored data/raw/healthcare. Reports contain metadata only.
Uses Python's standard library; does not require API keys or third-party packages.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.parse import urljoin

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw" / "healthcare"
REPORTS = ROOT / "research" / "healthcare"


class Page(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self.parts = []
        self.ignore = 0

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style"}:
            self.ignore += 1
        if tag == "a":
            href = dict(attrs).get("href")
            if href:
                self.links.append(href)

    def handle_endtag(self, tag):
        if tag in {"script", "style"}:
            self.ignore = max(0, self.ignore - 1)

    def handle_data(self, data):
        if not self.ignore and data.strip():
            self.parts.append(data.strip())


def fetch(item):
    key, url = item
    result = {"source_id": key, "requested_url": url,
              "retrieved_at": datetime.now(timezone.utc).isoformat()}
    try:
        request = Request(url, headers={"User-Agent": "VTHacks-Data-Feasibility/1.0"})
        with urlopen(request, timeout=35) as response:
            body = response.read(80 * 1024 * 1024 + 1)
            if len(body) > 80 * 1024 * 1024:
                raise ValueError("Response exceeds 80 MiB research download limit")
            content_type = response.headers.get("Content-Type", "")
            result.update(status=response.status, final_url=response.url,
                          content_type=content_type, bytes=len(body),
                          sha256=hashlib.sha256(body).hexdigest())
        suffix = ".html" if "html" in content_type else ".json" if "json" in content_type else ".bin"
        path = RAW / (key + suffix)
        path.write_bytes(body)
        result["local_path"] = str(path.relative_to(ROOT)).replace("\\", "/")
        if "html" in content_type:
            page = Page()
            page.feed(body.decode("utf-8", errors="replace"))
            result["links"] = list(dict.fromkeys(urljoin(result["final_url"], link) for link in page.links))
            (RAW / (key + ".txt")).write_text("\n".join(page.parts), encoding="utf-8")
            result["text_characters"] = sum(map(len, page.parts))
    except Exception as exc:
        result["error"] = str(exc)
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("sources", help="JSON object mapping source IDs to public URLs")
    parser.add_argument("--report", default="access_checks.json")
    parser.add_argument("--links", action="store_true")
    args = parser.parse_args()
    sources = json.loads(Path(args.sources).read_text(encoding="utf-8-sig"))
    RAW.mkdir(parents=True, exist_ok=True)
    REPORTS.mkdir(parents=True, exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(fetch, sources.items()))
    (REPORTS / args.report).write_text(json.dumps(results, indent=2), encoding="utf-8")
    for result in results:
        summary = {k: v for k, v in result.items() if k != "links"}
        if args.links:
            summary["links"] = result.get("links", [])
        print(json.dumps(summary))


if __name__ == "__main__":
    main()
