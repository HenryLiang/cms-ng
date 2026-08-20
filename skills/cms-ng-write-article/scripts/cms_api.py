#!/usr/bin/env python3
"""Small, dependency-free HTTP client for the CMS-NG writing skill."""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


DEFAULT_API_URL = "https://cms-demo-hk01.com"
DEFAULT_TIMEOUT_SECONDS = 180.0
ALLOWED_METHODS = ("GET", "POST", "PATCH", "DELETE")


class NoRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Refuse redirects so Authorization cannot escape the configured origin."""

    def redirect_request(
        self,
        req: Any,
        fp: Any,
        code: int,
        msg: str,
        headers: Any,
        newurl: str,
    ) -> None:
        return None


def fail(message: str, *, exit_code: int = 2) -> None:
    print(
        json.dumps({"error": message}, ensure_ascii=False, indent=2),
        file=sys.stderr,
    )
    raise SystemExit(exit_code)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Call a CMS-NG REST endpoint using token configuration from the environment."
    )
    parser.add_argument("method", choices=ALLOWED_METHODS, type=str.upper)
    parser.add_argument(
        "path",
        help="Relative API path beginning with /; absolute URLs are rejected",
    )
    body = parser.add_mutually_exclusive_group()
    body.add_argument("--json", dest="json_text", help="JSON request body")
    body.add_argument(
        "--json-file",
        help="Read JSON body from this file, or use - to read from standard input",
    )
    parser.add_argument(
        "--query",
        action="append",
        default=[],
        metavar="KEY=VALUE",
        help="Add a query parameter; repeat for multiple values",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=DEFAULT_TIMEOUT_SECONDS,
        help=f"Request timeout in seconds (default: {DEFAULT_TIMEOUT_SECONDS:g})",
    )
    parser.add_argument(
        "--anonymous",
        action="store_true",
        help="Do not attach a bearer token (only for public endpoints)",
    )
    return parser.parse_args()


def get_base_url() -> str:
    raw = os.environ.get("CMS_NG_API_URL", DEFAULT_API_URL).strip().rstrip("/")
    parsed = urllib.parse.urlsplit(raw)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        fail(
            "CMS_NG_API_URL must be an http(s) origin such as https://cms-demo-hk01.com"
        )
    if parsed.query or parsed.fragment:
        fail("CMS_NG_API_URL must not contain a query string or fragment")
    return raw


def get_token() -> str | None:
    token = os.environ.get("CMS_NG_TOKEN", "").strip()
    if not token:
        token_file = os.environ.get("CMS_NG_TOKEN_FILE", "").strip()
        if token_file:
            try:
                token = Path(token_file).expanduser().read_text(encoding="utf-8").strip()
            except OSError as exc:
                fail(f"Could not read CMS_NG_TOKEN_FILE: {exc}")
    if token.lower().startswith("bearer "):
        token = token[7:].strip()
    return token or None


def parse_query(items: list[str]) -> list[tuple[str, str]]:
    result: list[tuple[str, str]] = []
    for item in items:
        if "=" not in item:
            fail(f"Invalid --query value {item!r}; expected KEY=VALUE")
        key, value = item.split("=", 1)
        if not key:
            fail("Query parameter keys must not be empty")
        result.append((key, value))
    return result


def build_url(base_url: str, path: str, query: list[tuple[str, str]]) -> str:
    parsed_path = urllib.parse.urlsplit(path)
    if not path.startswith("/") or parsed_path.scheme or parsed_path.netloc:
        fail("path must be a relative API path beginning with /, not an absolute URL")
    if parsed_path.fragment:
        fail("path must not contain a fragment")
    existing = urllib.parse.parse_qsl(parsed_path.query, keep_blank_values=True)
    encoded_query = urllib.parse.urlencode(existing + query, doseq=True)
    clean_path = urllib.parse.quote(
        urllib.parse.unquote(parsed_path.path), safe="/%:@"
    )
    base = urllib.parse.urlsplit(base_url)
    return urllib.parse.urlunsplit(
        (base.scheme, base.netloc, f"{base.path.rstrip('/')}{clean_path}", encoded_query, "")
    )


def load_body(args: argparse.Namespace) -> bytes | None:
    if args.json_text is not None:
        text = args.json_text
    elif args.json_file is not None:
        if args.json_file == "-":
            text = sys.stdin.read()
        else:
            try:
                text = Path(args.json_file).read_text(encoding="utf-8")
            except OSError as exc:
                fail(f"Could not read JSON body file: {exc}")
    else:
        return None

    try:
        value = json.loads(text)
    except json.JSONDecodeError as exc:
        fail(
            f"Request body is not valid JSON: {exc.msg} at line {exc.lineno} column {exc.colno}"
        )
    return json.dumps(
        value, ensure_ascii=False, separators=(",", ":")
    ).encode("utf-8")


def parse_response(raw: bytes, content_type: str | None) -> Any:
    if not raw:
        return None
    text = raw.decode("utf-8", errors="replace")
    if content_type and "json" in content_type.lower():
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return {"raw": text}
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return text


def print_value(value: Any, *, stream: Any = sys.stdout) -> None:
    if isinstance(value, (dict, list)) or value is None:
        print(json.dumps(value, ensure_ascii=False, indent=2), file=stream)
    else:
        print(value, file=stream)


def main() -> None:
    args = parse_args()
    if args.timeout <= 0:
        fail("--timeout must be greater than zero")

    token = None if args.anonymous else get_token()
    if not args.anonymous and not token:
        fail(
            "No CMS-NG token configured. Set CMS_NG_TOKEN or CMS_NG_TOKEN_FILE "
            "in your local environment; do not paste credentials into chat."
        )

    url = build_url(get_base_url(), args.path, parse_query(args.query))
    body = load_body(args)
    headers = {
        "Accept": "application/json",
        "User-Agent": "cms-ng-write-article-skill/1.0",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if body is not None:
        headers["Content-Type"] = "application/json"

    request = urllib.request.Request(
        url, data=body, headers=headers, method=args.method
    )
    opener = urllib.request.build_opener(NoRedirectHandler())

    try:
        with opener.open(request, timeout=args.timeout) as response:
            value = parse_response(
                response.read(), response.headers.get("Content-Type")
            )
            print_value(value)
    except urllib.error.HTTPError as exc:
        value = parse_response(exc.read(), exc.headers.get("Content-Type"))
        print_value(
            {
                "error": "CMS-NG API request failed",
                "status": exc.code,
                "response": value,
            },
            stream=sys.stderr,
        )
        raise SystemExit(3) from None
    except urllib.error.URLError as exc:
        fail(f"Could not reach CMS-NG API at {url}: {exc.reason}", exit_code=4)
    except TimeoutError:
        fail(
            f"CMS-NG API request timed out after {args.timeout:g} seconds",
            exit_code=4,
        )


if __name__ == "__main__":
    main()
