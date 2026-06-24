# Dev server for GeoGlobe that disables browser caching, so every reload always serves the latest
# files (no more stale modes/data after an edit). Run from anywhere:
#   python build/devserver.py
# then open http://localhost:5599
import http.server, socketserver, os

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
PORT = 5599

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", PORT), NoCacheHandler) as httpd:
    print(f"GeoGlobe dev server (no-cache) on http://localhost:{PORT}")
    httpd.serve_forever()
