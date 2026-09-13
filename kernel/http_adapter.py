"""Dependency-free HTTP adapter for the Worker-to-kernel bridge."""

import argparse
import json
import logging
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any, Dict

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
if str(REPOSITORY_ROOT) not in sys.path:
    sys.path.insert(0, str(REPOSITORY_ROOT))

from kernel.boot import handle_message

LOGGER = logging.getLogger("portal.kernel.http")
MAX_BODY_BYTES = 1024 * 1024


class KernelRequestHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path == "/health":
            self._write_json(200, {"ok": True, "service": "portal-os-kernel"})
            return
        self._write_json(404, {"ok": False, "error": {"code": "NOT_FOUND", "message": "Route not found"}})

    def do_POST(self) -> None:
        if self.path != "/api/kernel/message":
            self._write_json(404, {"ok": False, "error": {"code": "NOT_FOUND", "message": "Route not found"}})
            return
        try:
            content_length = int(self.headers.get("Content-Length", "0"))
            if content_length <= 0 or content_length > MAX_BODY_BYTES:
                raise ValueError("request body size is invalid")
            envelope = json.loads(self.rfile.read(content_length))
            if not isinstance(envelope, dict):
                raise ValueError("message envelope must be an object")
            response = handle_message(envelope)
            code = response.get("error", {}).get("code") if not response.get("ok") else None
            status = {"UNAUTHENTICATED": 401, "FORBIDDEN": 403, "INVALID_MESSAGE": 400}.get(code, 500 if code else 200)
            self._write_json(status, response)
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as error:
            LOGGER.warning("invalid kernel HTTP request: %s", error)
            self._write_json(400, {"ok": False, "error": {"code": "INVALID_JSON", "message": str(error)}})

    def log_message(self, message: str, *args: Any) -> None:
        LOGGER.info("%s - %s", self.address_string(), message % args)

    def _write_json(self, status: int, body: Dict[str, Any]) -> None:
        encoded = json.dumps(body, sort_keys=True, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)


def main() -> int:
    parser = argparse.ArgumentParser(description="Serve the Portal-OS kernel HTTP adapter")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8788)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    server = HTTPServer((args.host, args.port), KernelRequestHandler)
    LOGGER.info("kernel adapter listening host=%s port=%d", args.host, args.port)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
