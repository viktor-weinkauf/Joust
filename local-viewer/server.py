"""Read-only, loopback-only host for the maintained Joust build and HDT replays."""
import argparse
import hashlib
import json
import logging
import mimetypes
import os
from pathlib import Path
import secrets
import threading
import urllib.parse
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from hslog import LogParser
from hslog.export import FriendlyPlayerExporter
from hsreplay.document import HSReplayDocument
from hsreplay.utils import ElementTree

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent
APP_ID = "maintained-joust-local-viewer"
MAX_LOG_BYTES = 64 * 1024 * 1024


def convert_replay(path):
    """Keep all packets (including Rewind/creator changes), never edit the source."""
    with zipfile.ZipFile(path) as archive:
        entry = archive.getinfo("output_log.txt")
        if entry.file_size > MAX_LOG_BYTES:
            raise ValueError("Replay log exceeds the 64 MB local conversion limit.")
        raw = archive.read(entry).decode("utf-8-sig")
    parser = LogParser()
    # HDT writes CRCRLF in some files; ignore only blank lines, not game packets.
    parser.read(line + "\n" for line in raw.splitlines() if line.strip())
    parser.flush()
    if len(parser.games) != 1:
        raise ValueError("Expected one recorded match in this replay.")
    friendly = FriendlyPlayerExporter(parser.games[0]).export()
    document = HSReplayDocument.from_parser(parser)
    root = ElementTree.fromstring(document.to_xml().encode("utf-8"))
    game = root.find("Game")
    game.set("id", "1")
    for player in game.findall("Player"):
        # The upstream XML exporter only fills names when a deck is supplied.
        known = parser.player_manager.get_player_by_entity_id(int(player.get("id")))
        player.set("name", known.name or "Player " + player.get("playerID"))
        player.attrib.pop("accountHi", None)
        player.attrib.pop("accountLo", None)
    return ElementTree.tostring(root, encoding="utf-8"), friendly


def replay_list(directory):
    files = [p for p in directory.glob("*.hdtreplay") if p.is_file() and not p.is_symlink()]
    files.sort(key=lambda p: p.stat().st_mtime_ns, reverse=True)
    return [(hashlib.sha256(p.name.encode("utf-8")).hexdigest()[:24], p) for p in files]


class ViewerServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = False

    def __init__(self, port, replays):
        super().__init__(("127.0.0.1", port), Handler)
        self.replays = replays
        self.origin = "http://127.0.0.1:" + str(self.server_port)
        self.token = secrets.token_urlsafe(32)
        self.converted = {}
        self.convert_lock = threading.Lock()


class Handler(BaseHTTPRequestHandler):
    server_version = "LocalReplayViewer/1"

    def send_data(self, data, content_type, status=200, headers=None):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "DENY")
        self.send_header("Referrer-Policy", "no-referrer")
        for name, value in (headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(data)

    def json(self, value, status=200, headers=None):
        self.send_data(json.dumps(value, ensure_ascii=False).encode("utf-8"),
                       "application/json; charset=utf-8", status, headers)

    def local_request(self):
        if self.headers.get("Host") != urllib.parse.urlsplit(self.server.origin).netloc:
            self.json({"error": "Use the local viewer address."}, 403)
            return False
        origin = self.headers.get("Origin")
        if origin and origin != self.server.origin:
            self.json({"error": "Cross-origin requests are not allowed."}, 403)
            return False
        if self.headers.get("Sec-Fetch-Site") == "cross-site":
            self.json({"error": "Cross-site requests are not allowed."}, 403)
            return False
        return True

    def do_GET(self):
        if not self.local_request():
            return
        route = urllib.parse.urlsplit(self.path).path
        try:
            if route == "/api/health":
                version = (REPO / "dist/VERSION").read_text().strip()
                return self.json({"application": APP_ID, "version": version,
                                  "stop_token": self.server.token})
            if route == "/api/replays":
                items = [{"id": key, "name": p.stem, "modified": p.stat().st_mtime}
                         for key, p in replay_list(self.server.replays)]
                return self.json({"replays": items})
            if route.startswith("/api/replay/"):
                replay_id = route.removeprefix("/api/replay/")
                path = dict(replay_list(self.server.replays)).get(replay_id)
                if path is None:
                    return self.json({"error": "Recorded game not found. Refresh the list."}, 404)
                stat = path.stat()
                cache_key = (replay_id, stat.st_mtime_ns, stat.st_size)
                with self.server.convert_lock:
                    cached = self.server.converted.get(cache_key)
                    if cached is None:
                        cached = convert_replay(path)
                        # Keep only the most recently opened replay in memory.
                        self.server.converted = {cache_key: cached}
                xml, friendly = cached
                return self.send_data(xml, "application/xml; charset=utf-8",
                                      headers={"X-Friendly-Player": str(friendly or "")})

            fixed = {
                "/": ROOT / "index.html",
                "/viewer.js": ROOT / "viewer.js",
                "/viewer.css": ROOT / "viewer.css",
                "/vendor/react.js": REPO / "node_modules/react/umd/react.production.min.js",
                "/vendor/react-dom.js": REPO / "node_modules/react-dom/umd/react-dom.production.min.js",
            }
            path = fixed.get(route)
            if route.startswith("/joust/"):
                base = (REPO / "dist").resolve()
                path = (base / urllib.parse.unquote(route.removeprefix("/joust/"))).resolve()
                if not path.is_relative_to(base):
                    return self.json({"error": "Not found."}, 404)
            if path is None or not path.is_file():
                return self.json({"error": "Not found."}, 404)
            content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
            if path.suffix == ".js":
                content_type = "text/javascript"
            self.send_data(path.read_bytes(), content_type)
        except (ValueError, KeyError, zipfile.BadZipFile) as error:
            self.json({"error": str(error)}, 422)
        except Exception:
            logging.exception("Unable to load local replay")
            self.json({"error": "This replay could not be converted. See the local viewer log."}, 500)

    def do_POST(self):
        if not self.local_request():
            return
        if self.path != "/api/stop" or not secrets.compare_digest(
                self.headers.get("X-Viewer-Token", ""), self.server.token):
            return self.json({"error": "Not found."}, 404)
        self.json({"stopped": True})
        threading.Thread(target=self.server.shutdown, daemon=True).start()

    def log_message(self, message, *args):
        logging.info(message, *args)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8879)
    parser.add_argument("--replays", type=Path,
                        default=Path(os.environ["APPDATA"]) / "HearthstoneDeckTracker/Replays")
    parser.add_argument("--log", type=Path, required=True)
    args = parser.parse_args()
    args.log.parent.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(filename=args.log, level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s", encoding="utf-8")
    with ViewerServer(args.port, args.replays.resolve()) as server:
        logging.info("Ready at %s", server.origin)
        server.serve_forever()
    logging.info("Viewer stopped")


if __name__ == "__main__":
    main()
