from flask import Flask, request, send_from_directory, Response, abort
import requests
from urllib.parse import urlparse, urljoin, quote
import os
import mimetypes
import re

app = Flask(__name__, static_folder=".", static_url_path="")

# Carpeta local para tus archivos estáticos remotos (thumbnails, json, etc)
REMOTE_MEDIA_DIR = os.path.abspath("./remote-media")

# Hosts permitidos para proxy (seguridad básica)
ALLOWED_HOSTS = {
    "cdn.jsdelivr.net",
    "movies.solargentinotv.com.ar",
    "old.movies.solargentinotv.com.ar",
    "akira.satvplus.com.ar",
}

def is_allowed_url(url: str) -> bool:
    try:
        u = urlparse(url)
        return u.scheme in ("http", "https") and u.hostname in ALLOWED_HOSTS
    except Exception:
        return False

def proxify_url(url: str) -> str:
    return f"/remote-media?url={quote(url, safe='')}"

def looks_like_m3u8(url: str, content_type: str = "") -> bool:
    u = (url or "").lower()
    ct = (content_type or "").lower()
    return (".m3u8" in u) or ("application/vnd.apple.mpegurl" in ct) or ("application/x-mpegurl" in ct)

def rewrite_m3u8(text: str, manifest_url: str) -> str:
    """
    Reescribe:
    - líneas de segmentos/playlists (no empiezan con #)
    - URI="..." en tags HLS (EXT-X-KEY, EXT-X-MAP, EXT-X-MEDIA)
    """
    out_lines = []

    for line in text.splitlines():
        stripped = line.strip()

        if not stripped:
            out_lines.append(line)
            continue

        if stripped.startswith("#"):
            # Reescribir URI="..."
            def repl_uri(m):
                original_uri = m.group(1)
                absolute = urljoin(manifest_url, original_uri)
                if is_allowed_url(absolute):
                    return f'URI="{proxify_url(absolute)}"'
                return f'URI="{original_uri}"'

            newline = re.sub(r'URI="([^"]+)"', repl_uri, line)
            out_lines.append(newline)
            continue

        # Línea normal => segmento o child playlist
        absolute = urljoin(manifest_url, stripped)
        if is_allowed_url(absolute):
            out_lines.append(proxify_url(absolute))
        else:
            out_lines.append(line)

    return "\n".join(out_lines) + ("\n" if text.endswith("\n") else "")

# ------------------------------------------------------------
# 1) Proxy dinámico: /remote-media?url=https://...
# ------------------------------------------------------------
@app.route("/remote-media")
def remote_media_proxy():
    raw_url = request.args.get("url", type=str)
    if not raw_url:
        return "Missing ?url", 400

    if not is_allowed_url(raw_url):
        return "Remote host not allowed", 403

    # Passthrough de headers útiles (range para video)
    headers = {}
    if request.headers.get("Range"):
        headers["Range"] = request.headers.get("Range")
    if request.headers.get("User-Agent"):
        headers["User-Agent"] = request.headers.get("User-Agent")
    if request.headers.get("Accept"):
        headers["Accept"] = request.headers.get("Accept")

    try:
        upstream = requests.get(raw_url, headers=headers, stream=True, timeout=20, allow_redirects=True)
    except requests.RequestException as e:
        return f"Proxy error: {e}", 502

    content_type = upstream.headers.get("Content-Type", "")
    status_code = upstream.status_code

    # Error upstream
    if status_code >= 400:
        return Response(upstream.content, status=status_code, content_type=content_type or "text/plain")

    # Manifest HLS => reescribir
    if looks_like_m3u8(raw_url, content_type):
        text = upstream.text
        rewritten = rewrite_m3u8(text, raw_url)

        resp = Response(rewritten, status=200, content_type="application/vnd.apple.mpegurl; charset=utf-8")
        resp.headers["Cache-Control"] = "no-store"
        resp.headers["Access-Control-Allow-Origin"] = "*"
        return resp

    # VTT
    if raw_url.lower().endswith(".vtt"):
        resp = Response(upstream.content, status=status_code, content_type="text/vtt; charset=utf-8")
        resp.headers["Access-Control-Allow-Origin"] = "*"
        return resp

    # Segmentos/binarios/imágenes
    def generate():
        for chunk in upstream.iter_content(chunk_size=64 * 1024):
            if chunk:
                yield chunk

    resp = Response(generate(), status=status_code, content_type=content_type or "application/octet-stream")
    # Copiamos algunos headers útiles
    if upstream.headers.get("Content-Length"):
        resp.headers["Content-Length"] = upstream.headers["Content-Length"]
    if upstream.headers.get("Accept-Ranges"):
        resp.headers["Accept-Ranges"] = upstream.headers["Accept-Ranges"]
    if upstream.headers.get("Content-Range"):
        resp.headers["Content-Range"] = upstream.headers["Content-Range"]

    resp.headers["Access-Control-Allow-Origin"] = "*"
    return resp

# ------------------------------------------------------------
# 2) Carpeta estática local: /remote-media/... (thumbnails locales)
# ------------------------------------------------------------
@app.route("/remote-media/")
@app.route("/remote-media/<path:filename>")
def remote_media_static(filename=""):
    target = os.path.join(REMOTE_MEDIA_DIR, filename)
    if os.path.isdir(target):
        # listing simple
        try:
            entries = sorted(os.listdir(target))
        except OSError:
            abort(404)

        items = []
        base = "/remote-media/" + (filename.rstrip("/") + "/" if filename else "")
        for name in entries:
            href = base + name
            if os.path.isdir(os.path.join(target, name)):
                href += "/"
            items.append(f'<li><a href="{href}">{name}</a></li>')

        html = f"""
        <!doctype html>
        <html><head><meta charset="utf-8"><title>Directory listing for /remote-media/{filename}</title></head>
        <body>
          <h1>Directory listing for /remote-media/{filename}</h1>
          <ul>{''.join(items)}</ul>
        </body></html>
        """
        return Response(html, content_type="text/html; charset=utf-8")

    if not os.path.exists(target):
        abort(404)

    guessed, _ = mimetypes.guess_type(target)
    return send_from_directory(REMOTE_MEDIA_DIR, filename, mimetype=guessed)

# ------------------------------------------------------------
# 3) Archivos del proyecto (watch.html, js/, etc.)
# ------------------------------------------------------------
@app.route("/")
def index():
    return send_from_directory(".", "watch.html")

@app.route("/<path:filename>")
def static_files(filename):
    if os.path.isdir(filename):
        return "Directory", 403
    return send_from_directory(".", filename)

if __name__ == "__main__":
    print("▶ Local server running: http://localhost:4343")
    app.run(host="0.0.0.0", port=4343, debug=True)