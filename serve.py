from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os

class NoCacheHandler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        '.js': 'application/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.html': 'text/html; charset=utf-8',
    }
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()

os.chdir(Path(__file__).parent / "lab")
print("==================================================")
print("  Duck Everything — Laboratório Local Iniciado")
print("  Abra no navegador: http://127.0.0.1:8765")
print("  Pressione Ctrl+C para encerrar")
print("==================================================")
ThreadingHTTPServer(("127.0.0.1", 8765), NoCacheHandler).serve_forever()
