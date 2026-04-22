"""
WickedWhims Video Toolkit — Flask backend.
Run:  python app.py
"""
import json
import os
import queue
import re
import sqlite3
import threading

from flask import Flask, jsonify, render_template, request, send_from_directory
from models import Video, db
from pipeline import (encode_video, extract_thumbnail, probe_duration,
                       save_xml_only, save_dds_only, rebuild_package_only)

# ── Paths ──────────────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR  = os.path.join(BASE_DIR, "data")
THUMB_DIR  = os.path.join(DATA_DIR, "thumbs")
OUT_DIR    = os.path.join(DATA_DIR, "output")
PKG_DIR    = os.path.join(DATA_DIR, "packages")
SETTINGS_PATH = os.path.join(DATA_DIR, "settings.json")

for _d in [DATA_DIR, THUMB_DIR, OUT_DIR, PKG_DIR]:
    os.makedirs(_d, exist_ok=True)


def _video_out_dir(video) -> str:
    """Return (and create) a per-video subfolder under OUT_DIR."""
    stem = video.hash_name or os.path.splitext(video.filename)[0]
    safe = re.sub(r"[^\w\-]", "_", stem).strip("_") or "video"
    d = os.path.join(OUT_DIR, safe)
    os.makedirs(d, exist_ok=True)
    return d


# ── Default / persisted app settings ──────────────────────────────────────────
_DEFAULT_SETTINGS = {
    "author":          "",
    "resolution":      "480x272",
    "fps":             30,
    "audio_rate":      44100,
    "rate_mode":       "cqp",
    "quant":           18,
    "cbr_kbps":        500,
    "orientations":    "BISEXUAL",
    # Package naming & output
    "pkg_prefix":      "",
    "pkg_naming":      "title",   # "title" | "counter"
    "pkg_counter":     1,
    "pkg_output_dir":  "",        # blank → use internal packages/ dir
    # Tool paths (blank → use default Tools/ relative paths)
    "path_ffmpeg":     "",
    "path_nihav":      "",
    "path_sx":         "",
    "path_quickbms":   "",
    "path_bms":        "",
    "path_texconv":    "",
}


def load_settings() -> dict:
    if os.path.exists(SETTINGS_PATH):
        try:
            with open(SETTINGS_PATH) as f:
                saved = json.load(f)
            return {**_DEFAULT_SETTINGS, **saved}
        except Exception:
            pass
    return dict(_DEFAULT_SETTINGS)


def save_settings(data: dict) -> dict:
    merged = {**_DEFAULT_SETTINGS, **{k: v for k, v in data.items() if k in _DEFAULT_SETTINGS}}
    with open(SETTINGS_PATH, "w") as f:
        json.dump(merged, f, indent=2)
    return merged


def _make_pkg_dest(video) -> str:
    """
    Compute the full output path for this video's .package using current settings.
    For counter-mode, increments and saves the counter atomically.
    """
    cfg    = load_settings()
    prefix = cfg.get("pkg_prefix", "").strip()
    naming = cfg.get("pkg_naming", "title")
    out_dir = cfg.get("pkg_output_dir", "").strip()

    if not out_dir or not os.path.isdir(out_dir):
        out_dir = PKG_DIR
    os.makedirs(out_dir, exist_ok=True)

    if naming == "counter":
        n    = int(cfg.get("pkg_counter", 1))
        stem = f"{prefix}-{n:03d}" if prefix else f"{n:03d}"
        cfg["pkg_counter"] = n + 1
        save_settings(cfg)
    else:                           # "title"
        raw  = os.path.splitext(video.filename)[0]
        safe = re.sub(r"[^\w\-]", "_", raw).strip("_")
        stem = f"{prefix}-{safe}" if prefix else safe

    return os.path.join(out_dir, stem + ".package")


# ── Flask app ──────────────────────────────────────────────────────────────────
app = Flask(__name__)
app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{os.path.join(DATA_DIR, 'ww.db')}"
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["MAX_CONTENT_LENGTH"] = 4 * 1024 * 1024 * 1024  # 4 GB

db.init_app(app)

with app.app_context():
    db.create_all()
    # ── Migrate existing DBs: add new columns if they don't exist ─────────────
    _db_path = os.path.join(DATA_DIR, "ww.db")
    _conn = sqlite3.connect(_db_path)
    _cur  = _conn.cursor()
    _cur.execute("PRAGMA table_info(videos)")
    _existing_cols = {row[1] for row in _cur.fetchall()}
    _new_cols = [
        ("avi_resolution", 'TEXT    DEFAULT ""'),
        ("avi_fps",        'INTEGER DEFAULT 0'),
        ("avi_audio_rate", 'INTEGER DEFAULT 0'),
        ("avi_rate_mode",  'TEXT    DEFAULT ""'),
        ("avi_quant",      'INTEGER DEFAULT 0'),
        ("avi_cbr_kbps",   'INTEGER DEFAULT 0'),
        ("hash_name",      'TEXT    DEFAULT ""'),
        ("display_name",   'TEXT    DEFAULT ""'),
    ]
    for _col, _def in _new_cols:
        if _col not in _existing_cols:
            _conn.execute(f"ALTER TABLE videos ADD COLUMN {_col} {_def}")
    _conn.commit()
    _conn.close()

# ── Background encode worker ───────────────────────────────────────────────────
_encode_queue: queue.Queue = queue.Queue()


def _worker():
    while True:
        vid_id, mode = _encode_queue.get()
        try:
            with app.app_context():
                video = db.session.get(Video, vid_id)
                if video:
                    pkg_dest = _make_pkg_dest(video)
                    encode_video(video, _video_out_dir(video), pkg_dest, mode=mode)
        except Exception as e:
            with app.app_context():
                video = db.session.get(Video, vid_id)
                if video:
                    video.status    = "error"
                    video.error_msg = str(e)
                    db.session.commit()
        finally:
            _encode_queue.task_done()


threading.Thread(target=_worker, daemon=True).start()


# ── Ingest helper ──────────────────────────────────────────────────────────────
def _ingest(src_path: str, original_name: str) -> Video:
    stem  = os.path.splitext(original_name)[0]
    title = stem.replace("_", " ").replace("-", " ")
    cfg   = load_settings()

    v = Video(
        source_path  = src_path,
        filename     = original_name,
        title        = title,
        hash_name    = stem,
        display_name = stem,
        author       = cfg["author"],
        resolution   = cfg["resolution"],
        fps          = cfg["fps"],
        audio_rate   = cfg["audio_rate"],
        rate_mode    = cfg["rate_mode"],
        quant        = cfg["quant"],
        cbr_kbps     = cfg["cbr_kbps"],
        orientations = cfg["orientations"],
    )
    db.session.add(v)
    db.session.flush()

    thumb = os.path.join(THUMB_DIR, f"{v.id}.jpg")
    if extract_thumbnail(src_path, thumb):
        v.thumbnail_path = thumb

    dur = probe_duration(src_path)
    if dur:
        v.duration_sec = dur

    db.session.commit()
    return v


# ── Pages ──────────────────────────────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html")


# ── Static assets ──────────────────────────────────────────────────────────────
@app.route("/thumbs/<path:filename>")
def serve_thumb(filename):
    return send_from_directory(THUMB_DIR, filename)


@app.route("/packages/<path:filename>")
def serve_package(filename):
    return send_from_directory(PKG_DIR, filename, as_attachment=True)


# ── Settings API ───────────────────────────────────────────────────────────────
@app.route("/api/settings", methods=["GET"])
def api_settings_get():
    return jsonify(load_settings())


@app.route("/api/settings", methods=["PUT"])
def api_settings_put():
    data = request.get_json() or {}
    return jsonify(save_settings(data))


@app.route("/api/settings/apply-defaults", methods=["POST"])
def api_apply_defaults():
    """Push current default settings onto every video that is still pending."""
    cfg = load_settings()
    count = 0
    for v in Video.query.filter_by(status="pending").all():
        v.author       = cfg["author"]      or v.author
        v.resolution   = cfg["resolution"]
        v.fps          = cfg["fps"]
        v.audio_rate   = cfg["audio_rate"]
        v.rate_mode    = cfg["rate_mode"]
        v.quant        = cfg["quant"]
        v.cbr_kbps     = cfg["cbr_kbps"]
        v.orientations = cfg["orientations"]
        count += 1
    db.session.commit()
    return jsonify({"updated": count})


# ── Videos API ────────────────────────────────────────────────────────────────
@app.route("/api/videos")
def api_list():
    status_f = request.args.get("status")
    orient_f = request.args.get("orientation")
    search   = request.args.get("q", "").strip()

    q = Video.query
    if status_f:
        q = q.filter(Video.status == status_f)
    if orient_f:
        q = q.filter(Video.orientations.ilike(f"%{orient_f}%"))
    if search:
        like = f"%{search}%"
        q = q.filter(db.or_(Video.title.ilike(like), Video.author.ilike(like)))

    return jsonify([v.to_dict() for v in q.order_by(Video.created_at.desc()).all()])


@app.route("/api/videos/<int:vid_id>")
def api_get(vid_id):
    return jsonify(db.get_or_404(Video, vid_id).to_dict())


@app.route("/api/videos/<int:vid_id>", methods=["PUT"])
def api_update(vid_id):
    v    = db.get_or_404(Video, vid_id)
    data = request.get_json() or {}
    for field in ["title", "display_name", "hash_name",
                  "author", "description",
                  "resolution", "fps", "audio_rate",
                  "rate_mode", "quant", "cbr_kbps",
                  "orientations", "duration_sec"]:
        if field in data:
            setattr(v, field, data[field])
    db.session.commit()
    return jsonify(v.to_dict())


@app.route("/api/videos/<int:vid_id>", methods=["DELETE"])
def api_delete(vid_id):
    v = db.get_or_404(Video, vid_id)
    # Remove thumbnail (in data/thumbs/)
    if v.thumbnail_path and os.path.exists(v.thumbnail_path):
        try:
            os.remove(v.thumbnail_path)
        except OSError:
            pass
    # Remove the whole per-video output folder (AVI, DDS, XML, debug packages)
    # source_path is intentionally NOT deleted — it's the user's original file
    out_dir = _video_out_dir(v)
    if os.path.isdir(out_dir):
        shutil.rmtree(out_dir, ignore_errors=True)
    db.session.delete(v)
    db.session.commit()
    return jsonify({"ok": True})



@app.route("/api/scan", methods=["POST"])
def api_scan():
    folder = (request.get_json() or {}).get("folder", "").strip()
    if not folder or not os.path.isdir(folder):
        return jsonify({"error": "Invalid or missing folder path"}), 400

    added, skipped = [], 0
    for fname in sorted(os.listdir(folder)):
        if not fname.lower().endswith(".mp4"):
            continue
        src = os.path.join(folder, fname)
        if Video.query.filter_by(source_path=src).first():
            skipped += 1
            continue
        added.append(_ingest(src, fname).to_dict())

    return jsonify({"added": len(added), "skipped": skipped, "videos": added})


@app.route("/api/videos/<int:vid_id>/save-xml", methods=["POST"])
def api_save_xml(vid_id):
    """Regenerate and write the XML tuning file from current metadata."""
    v = db.get_or_404(Video, vid_id)
    path, err = save_xml_only(v, _video_out_dir(v))
    if err:
        return jsonify({"error": err}), 500
    v.xml_path = path
    db.session.commit()
    return jsonify({"ok": True, **v.to_dict()})


@app.route("/api/videos/<int:vid_id>/save-dds", methods=["POST"])
def api_save_dds(vid_id):
    """Convert current thumbnail to DDS via texconv."""
    v = db.get_or_404(Video, vid_id)
    path, err = save_dds_only(v, _video_out_dir(v))
    if err:
        return jsonify({"error": err}), 500
    v.dds_path = path
    db.session.commit()
    return jsonify({"ok": True, **v.to_dict()})


@app.route("/api/videos/<int:vid_id>/rebuild-package", methods=["POST"])
def api_rebuild_package(vid_id):
    """Assemble .package from whatever AVI + DDS + XML are currently on disk."""
    v = db.get_or_404(Video, vid_id)
    pkg_dest = _make_pkg_dest(v)
    path, err = rebuild_package_only(v, pkg_dest)
    if err:
        return jsonify({"error": err}), 400
    v.package_path = path
    db.session.commit()
    return jsonify({"ok": True, **v.to_dict()})


@app.route("/api/videos/<int:vid_id>/debug-package", methods=["POST"])
def api_debug_package(vid_id):
    """
    Build stripped test .package files to help isolate a game crash:
      xml_only  — just the XML tuning resource (no AVI, no DDS)
      no_avi    — XML + DDS only
      no_dds    — XML + AVI only (no icon texture)
      full      — same as normal Save .package (default)

    Body: { "variant": "xml_only" | "no_avi" | "no_dds" | "full" }
    Files are saved to webapp/data/output/ with _DEBUG_<variant> suffix.
    """
    from fnv import s4pe_names
    from package_builder import build_package
    from pipeline import TYPE_AVI, TYPE_IMG, TYPE_XML, GROUP_ID

    v = db.get_or_404(Video, vid_id)
    variant = (request.get_json() or {}).get("variant", "full")

    author = (v.author or "Author").replace(" ", "")
    stem   = v.hash_name or os.path.splitext(v.filename)[0]
    names  = s4pe_names(author, stem)

    # Read XML from disk (or regenerate if not saved yet)
    from pipeline import save_xml_only as _sxo
    if not (v.xml_path and os.path.exists(v.xml_path)):
        _sxo(v, _video_out_dir(v))

    if not (v.xml_path and os.path.exists(v.xml_path)):
        return jsonify({"error": "No XML found — run Save XML first"}), 400

    with open(v.xml_path, "rb") as f:
        xml_data = f.read()

    resources = []
    skip_avi = variant in ("xml_only", "no_avi")
    skip_dds = variant in ("xml_only", "no_dds")

    if not skip_avi and v.avi_path and os.path.exists(v.avi_path):
        with open(v.avi_path, "rb") as f:
            resources.append((TYPE_AVI, GROUP_ID, names["avi_hash"], f.read()))

    if not skip_dds and v.dds_path and os.path.exists(v.dds_path):
        with open(v.dds_path, "rb") as f:
            resources.append((TYPE_IMG, GROUP_ID, names["avi_hash"], f.read()))

    resources.append((TYPE_XML, GROUP_ID, names["ww_hash"], xml_data))

    safe_stem = "".join(c for c in stem if c.isalnum() or c in "-_")[:32]
    out_name  = f"DEBUG_{safe_stem}_{variant}.package"
    out_path  = os.path.join(_video_out_dir(v), out_name)
    with open(out_path, "wb") as f:
        f.write(build_package(resources))

    return jsonify({
        "ok": True,
        "variant": variant,
        "resources": len(resources),
        "path": out_path,
        "filename": out_name,
        "hint": "Drop this .package into your Mods folder (remove the normal one first) and launch the game.",
    })


@app.route("/api/videos/<int:vid_id>/encode", methods=["POST"])
def api_encode(vid_id):
    """
    Encode the AVI (VP6 pipeline).  Body: { "mode": "auto" | "full" }
      auto — re-encode only if settings changed or AVI missing (default)
      full — always re-encode
    """
    v = db.get_or_404(Video, vid_id)
    if v.status in ("encoding", "queued"):
        return jsonify({"error": "Already queued or encoding"}), 400

    mode = (request.get_json() or {}).get("mode", "auto")
    if mode not in ("auto", "full"):
        mode = "auto"

    v.status        = "queued"
    v.error_msg     = ""
    v.progress_step = 0
    v.progress_msg  = "Queued…"
    db.session.commit()
    _encode_queue.put((vid_id, mode))
    return jsonify({"ok": True, "mode": mode})


@app.route("/api/videos/<int:vid_id>/status")
def api_status(vid_id):
    v = db.get_or_404(Video, vid_id)
    return jsonify({
        "status":        v.status,
        "progress_step": v.progress_step,
        "progress_msg":  v.progress_msg,
        "error_msg":     v.error_msg,
        "has_package":   bool(v.package_path),
        "package_url":   ("/packages/" + os.path.basename(v.package_path)) if v.package_path else "",
        "avi_settings_changed": v.avi_settings_changed(),
    })


@app.route("/api/open-folder", methods=["POST"])
def api_open_folder():
    """Open the video's output subfolder (or root output dir) in Windows Explorer."""
    import subprocess
    vid_id = (request.get_json() or {}).get("id")
    if vid_id:
        v = db.session.get(Video, int(vid_id))
        target = _video_out_dir(v) if v else OUT_DIR
    else:
        target = OUT_DIR
    os.makedirs(target, exist_ok=True)
    subprocess.Popen(["explorer", os.path.abspath(target)])
    return jsonify({"ok": True, "path": target})


@app.route("/api/open-mod-folder", methods=["POST"])
def api_open_mod_folder():
    """Open the configured Sims 4 Mods folder (pkg_output_dir) in Windows Explorer."""
    import subprocess
    cfg     = load_settings()
    out_dir = cfg.get("pkg_output_dir", "").strip()
    if not out_dir:
        return jsonify({"error": "No Mods folder configured in Settings."}), 400
    if not os.path.isdir(out_dir):
        return jsonify({"error": f"Folder not found: {out_dir}"}), 400
    subprocess.Popen(["explorer", os.path.abspath(out_dir)])
    return jsonify({"ok": True, "path": out_dir})


@app.route("/api/videos/<int:vid_id>/thumbnail", methods=["POST"])
def api_set_thumbnail(vid_id):
    v = db.get_or_404(Video, vid_id)
    f = request.files.get("thumbnail")
    if not f:
        return jsonify({"error": "No file uploaded"}), 400
    dest = os.path.join(THUMB_DIR, f"{vid_id}_icon.png")
    f.save(dest)
    v.thumbnail_path = dest
    db.session.commit()
    return jsonify({"ok": True, "url": f"/thumbs/{vid_id}_icon.png"})


@app.route("/api/ingest-paths", methods=["POST"])
def api_ingest_paths():
    """
    Accept an array of absolute .mp4 file paths from the clipboard and add
    each one to the library (skipping duplicates and non-existent files).
    Body: { "paths": ["C:/…/foo.mp4", …] }
    """
    paths = (request.get_json() or {}).get("paths", [])
    added, skipped = [], 0
    for p in paths:
        p = os.path.abspath(p)
        if not os.path.isfile(p) or not p.lower().endswith(".mp4"):
            continue
        if Video.query.filter_by(source_path=p).first():
            skipped += 1
            continue
        v = _ingest(p, os.path.basename(p))
        added.append(v.to_dict())
    return jsonify({"added": len(added), "skipped": skipped, "videos": added})


@app.route("/api/videos/batch-encode", methods=["POST"])
def api_batch_encode():
    data  = request.get_json() or {}
    ids   = data.get("ids", [])
    mode  = data.get("mode", "auto")
    if mode not in ("auto", "full"):
        mode = "auto"

    queued = []
    for vid_id in ids:
        v = db.session.get(Video, vid_id)
        if v and v.status not in ("encoding", "queued"):
            v.status        = "queued"
            v.error_msg     = ""
            v.progress_step = 0
            v.progress_msg  = "Queued…"
            db.session.commit()
            _encode_queue.put((v.id, mode))
            queued.append(v.id)
    return jsonify({"queued": queued})


if __name__ == "__main__":
    print("WW Video Toolkit running at http://127.0.0.1:5000")
    app.run(debug=True, port=5000, use_reloader=False)
