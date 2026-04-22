"""
WickedWhims video encoding pipeline.

encode_video(video, out_dir, pkg_dir, mode)
  mode = 'auto'    — re-encode AVI only if settings changed or AVI missing;
                     always rebuild DDS / XML / .package
  mode = 'full'    — always re-encode AVI (+ DDS / XML / .package)
  mode = 'rebuild' — skip AVI entirely; only redo DDS / XML / .package
                     (use when only thumbnail or metadata changed)

Steps:
  1  FFmpeg  → Y4M
  2  FFmpeg  → WAV
  3  sx.exe  → ASF  (EA audio stream)
  4  nihav   → VP6
  5  QuickBMS mux → .vp6  → renamed AVI
  6  texconv → DDS  (thumbnail)
  7  XML tuning file
  8  DBPF .package
"""

import json
import os
import re
import shutil
import subprocess
import tempfile
import xml.sax.saxutils as saxutils

from fnv import s4pe_names
from package_builder import build_package

# ── Resource type IDs ──────────────────────────────────────────────────────────
TYPE_AVI = 0x376840D7
TYPE_IMG = 0x00B2D882
TYPE_XML = 0x5B02819E
GROUP_ID = 0x00000000


# ── Tool paths ─────────────────────────────────────────────────────────────────

def _webapp_root() -> str:
    """Root of the webapp/ directory — Tools/ now lives here."""
    return os.path.dirname(os.path.abspath(__file__))


def tools(name: str) -> str:
    defaults = {
        "ffmpeg":   os.path.join("Tools", "FFMPEG",   "ffmpeg.exe"),
        "nihav":    os.path.join("Tools", "VP6",       "nihav-encoder.exe"),
        "sx":       os.path.join("Tools", "SX",        "sx.exe"),
        "quickbms": os.path.join("Tools", "QuickBMS",  "quickbms.exe"),
        "bms":      os.path.join("Tools", "QuickBMS",  "eavp6_muxer.bms"),
        "texconv":  os.path.join("Tools", "texconv",   "texconv.exe"),
    }
    setting_keys = {
        "ffmpeg":   "path_ffmpeg",
        "nihav":    "path_nihav",
        "sx":       "path_sx",
        "quickbms": "path_quickbms",
        "bms":      "path_bms",
        "texconv":  "path_texconv",
    }
    # Check settings.json for a custom path first
    settings_path = os.path.join(os.path.dirname(__file__), "data", "settings.json")
    key = setting_keys.get(name)
    if key and os.path.exists(settings_path):
        try:
            with open(settings_path) as f:
                cfg = json.load(f)
            custom = cfg.get(key, "").strip()
            if custom:
                return custom
        except Exception:
            pass
    # Fall back to default Tools/ path inside webapp/
    return os.path.join(_webapp_root(), defaults[name])


# ── Subprocess helper ──────────────────────────────────────────────────────────

def _run(cmd: list, cwd: str = None) -> tuple:
    result = subprocess.run(
        cmd,
        cwd=cwd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    return result.returncode, result.stdout


# ── Utilities (used by app.py directly) ───────────────────────────────────────

def extract_thumbnail(src: str, dest: str, seek: str = "00:00:05") -> bool:
    ffmpeg = tools("ffmpeg")
    if not os.path.exists(ffmpeg):
        return False
    for t in [seek, "00:00:01", "00:00:00"]:
        rc, _ = _run([
            ffmpeg, "-hide_banner", "-loglevel", "error",
            "-ss", t, "-i", src,
            "-vframes", "1", "-vf", "scale=320:-1",
            "-y", dest,
        ])
        if rc == 0 and os.path.exists(dest):
            return True
    return False


def probe_duration(src: str) -> int:
    """Return video duration in seconds by parsing ffmpeg -i stderr output."""
    rc, out = _run([tools("ffmpeg"), "-hide_banner", "-i", src])
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)", out)
    if m:
        h, mn, s = int(m.group(1)), int(m.group(2)), float(m.group(3))
        return max(1, int(h * 3600 + mn * 60 + s))
    return 0


# ── XML ────────────────────────────────────────────────────────────────────────

def _xml_bytes(names, title, author, description, orientations, duration_sec) -> bytes:
    ex = saxutils.escape
    lines = [
        f'<I c="WickedVideoChannel" i="object_state"'
        f' m="wickedwhims.sex.features.porn_watching.tv._ts4_channel_video"'
        f' n="{ex(names["base"])}_WW.OBJ.TUNING"'
        f' s="{names["ww_dec"]}">',
        "",
        f'   <T n="video_raw_display_name">{ex(title)}</T>',
    ]
    if description:
        lines.append(f'   <T n="video_raw_display_description">{ex(description)}</T>')
    lines += [
        f'   <T n="video_author">{ex(author)}</T>',
        f'   <T n="video_display_icon">{ex(names["icon_ref"])}</T>',
        "",
        f'   <T n="video_orientations">{ex(orientations)}</T>',
        f'   <T n="video_duration">{duration_sec}</T>',
        '   <U n="new_client_state">',
        '      <V n="video_playlist" t="apply_new_value">',
        '         <V n="apply_new_value" t="start_video">',
        '            <U n="start_video">',
        '               <L n="clip_list">',
        f'                  <T p="">{names["clip_ref"]}</T></L></U></V></V>',
        "",
        '      <V n="autonomy_modifiers" t="apply_new_value">',
        '         <V n="apply_new_value" t="apply_statistic_modifiers">',
        '            <U n="apply_statistic_modifiers">',
        '               <U n="periodic_statistic_change">',
        '                  <T n="interval">60</T>',
        '                  <L n="operations">',
        '                     <U><T n="amount">-1</T><T n="stat">16633</T></U></L></U></U></V></V>',
        "",
        '      <V n="broadcaster" t="apply_new_value">',
        '         <V n="apply_new_value" t="start_broadcaster">',
        '            <U n="start_broadcaster">',
        '               <L n="broadcaster_types">',
        '                  <U><T n="item">74334</T></U></L></U></V></V></U>',
        "",
        '   <V n="_display_data" t="enabled">',
        '      <U n="enabled">',
        '         <V n="instance_display_description" t="enabled"><T n="enabled">0x9865B978</T></V>',
        '         <V n="instance_display_icon" t="disabled" />',
        '         <V n="instance_display_name" t="enabled"><T n="enabled">0x34407B57</T></V></U></V>',
        "",
        '   <T n="affordance">13310387700104523747</T>',
        '   <L n="buff_weight_multipliers">',
        '      <U><T n="key">34527</T><T n="value">1</T></U>',
        '      <U><T n="key">34526</T><T n="value">1</T></U>',
        '      <U><T n="key">34525</T><T n="value">1</T></U>',
        '      <U><T n="key">34524</T><T n="value">1</T></U>',
        '      <U><T n="key">34523</T><T n="value">0.0</T></U></L>',
        "",
        '   <V n="value" t="integral"><T n="integral">700</T></V></I>',
    ]
    return "\n".join(lines).encode("utf-8")


# ── Pipeline steps ─────────────────────────────────────────────────────────────

def _encode_avi(video, out_dir: str, tmp: str) -> tuple:
    """
    Run the full VP6 encode pipeline (steps 1-5).
    Returns (avi_dest_path, error_msg).  error_msg is empty on success.
    """
    src = video.source_path
    author = (video.author or "Author").replace(" ", "")
    stem   = video.hash_name or os.path.splitext(video.filename)[0]
    names  = s4pe_names(author, stem)

    res = video.resolution or "480x272"
    w, h   = res.split("x")
    fps    = str(video.fps or 30)
    asr    = str(video.audio_rate or 44100)
    rate_param = (
        f"bitrate={int(video.cbr_kbps or 500) * 1000}"
        if video.rate_mode == "cbr"
        else f"quant={video.quant or 18}"
    )

    y4m = os.path.join(tmp, "v.Y4M")
    wav = os.path.join(tmp, "a.WAV")
    asf = os.path.join(tmp, "a.asf")
    vp6 = os.path.join(tmp, "v.VP6")

    # 1 — Y4M
    rc, out = _run([
        tools("ffmpeg"), "-hide_banner", "-loglevel", "warning",
        "-y", "-i", src,
        "-vf", f"scale={w}:{h}",
        "-r", fps, "-pix_fmt", "yuv420p",
        "-f", "yuv4mpegpipe", y4m,
    ])
    if rc != 0:
        return None, f"Step 1 (Y4M) failed:\n{out}"

    # 2 — WAV
    rc, out = _run([
        tools("ffmpeg"), "-hide_banner", "-loglevel", "warning",
        "-y", "-i", src,
        "-acodec", "pcm_s16le", "-ar", asr, "-ac", "2", wav,
    ])
    if rc != 0:
        return None, f"Step 2 (WAV) failed:\n{out}"

    # 3 — EA audio stream
    rc, out = _run([tools("sx"), "-sndstream", "-eaxa_blk", f"-fps{fps}", wav, "-=", asf])
    if rc != 0:
        return None, f"Step 3 (ASF) failed:\n{out}"

    # 4 — VP6
    rc, out = _run([
        tools("nihav"),
        "--input", y4m,
        "--output", vp6,
        "--output-format", "ea",
        "--ostream0", f"timebase=1/{fps},encoder=vp6,version=vp61,{rate_param}",
    ])
    if not os.path.exists(vp6):
        return None, f"Step 4 (VP6) failed — output not created:\n{out}"

    # 5 — QuickBMS mux
    mux_in  = tempfile.mkdtemp(prefix="wwmux_in_")
    mux_out = tempfile.mkdtemp(prefix="wwmux_out_")
    try:
        shutil.copy(vp6, os.path.join(mux_in, "v.VP6"))
        shutil.copy(asf, os.path.join(mux_in, "v.asf"))
        rc, out = _run([tools("quickbms"), "-o", tools("bms"), mux_in, mux_out])
        muxed = next(
            (os.path.join(mux_out, f) for f in os.listdir(mux_out)
             if f.lower().endswith(".vp6") or f.lower().endswith(".asf.vp6")),
            None,
        )
        if not muxed:
            return None, f"Step 5 (mux) failed — no .vp6 in output:\n{out}"

        mux_size = os.path.getsize(muxed)
        if mux_size < 1024:
            return None, (
                f"Step 5 (mux) produced a suspiciously small file ({mux_size} bytes). "
                f"QuickBMS may have failed silently.\n{out}"
            )

        avi_dest = os.path.join(out_dir, names["avi_file"])
        shutil.move(muxed, avi_dest)
        return avi_dest, ""
    finally:
        shutil.rmtree(mux_in,  ignore_errors=True)
        shutil.rmtree(mux_out, ignore_errors=True)


def _make_dds(video, out_dir: str, tmp: str, names: dict) -> str:
    """Convert thumbnail PNG → DDS via texconv. Returns dest path or ''."""
    if not video.thumbnail_path or not os.path.exists(video.thumbnail_path):
        return ""

    thumb_src = video.thumbnail_path
    # texconv needs PNG; convert JPEG if needed
    if thumb_src.lower().endswith((".jpg", ".jpeg")):
        png_tmp = os.path.join(tmp, "thumb.png")
        _run([tools("ffmpeg"), "-hide_banner", "-loglevel", "error",
              "-y", "-i", thumb_src, png_tmp])
        if os.path.exists(png_tmp):
            thumb_src = png_tmp

    if not os.path.exists(thumb_src):
        return ""

    dds_dest = os.path.join(out_dir, names["img_file"])
    # -w/-h: resize to 128×128 (TS4 requires power-of-2 icon textures)
    # -m 1:  single mip level (icons don't need mip chains)
    _run([tools("texconv"), "-f", "DXT5", "-w", "128", "-h", "128", "-m", "1",
          "-y", "-o", out_dir, thumb_src])
    stem_png  = os.path.splitext(os.path.basename(thumb_src))[0]
    texconv_out = os.path.join(out_dir, stem_png + ".DDS")
    if os.path.exists(texconv_out):
        os.replace(texconv_out, dds_dest)
        return dds_dest
    return ""


def _assemble_package(video, xml_data: bytes, names: dict, pkg_dest: str) -> str:
    """Bundle AVI + DDS + XML into a .package at pkg_dest. Returns dest path."""
    resources = []

    if video.avi_path and os.path.exists(video.avi_path):
        with open(video.avi_path, "rb") as f:
            resources.append((TYPE_AVI, GROUP_ID, names["avi_hash"], f.read()))

    if video.dds_path and os.path.exists(video.dds_path):
        with open(video.dds_path, "rb") as f:
            resources.append((TYPE_IMG, GROUP_ID, names["avi_hash"], f.read()))

    resources.append((TYPE_XML, GROUP_ID, names["ww_hash"], xml_data))

    os.makedirs(os.path.dirname(pkg_dest), exist_ok=True)
    pkg_data = build_package(resources)
    with open(pkg_dest, "wb") as f:
        f.write(pkg_data)
    return pkg_dest


# ── Standalone one-shot operations (run synchronously, no background thread) ──

def save_xml_only(video, out_dir: str) -> tuple:
    """Write the XML tuning file from current metadata. Returns (path, err)."""
    author = (video.author or "Author").replace(" ", "")
    stem   = video.hash_name or os.path.splitext(video.filename)[0]
    names  = s4pe_names(author, stem)
    xml_data = _xml_bytes(
        names,
        video.display_name or video.title or stem,
        video.author       or "Unknown",
        video.description  or "",
        video.orientations or "BISEXUAL",
        video.duration_sec or 0,
    )
    dest = os.path.join(out_dir, names["xml_file"])
    with open(dest, "wb") as f:
        f.write(xml_data)
    return dest, ""


def save_dds_only(video, out_dir: str) -> tuple:
    """Convert current thumbnail → DDS via texconv. Returns (path, err)."""
    author = (video.author or "Author").replace(" ", "")
    stem   = video.hash_name or os.path.splitext(video.filename)[0]
    names  = s4pe_names(author, stem)
    tmp = tempfile.mkdtemp(prefix="wwdds_")
    try:
        dds = _make_dds(video, out_dir, tmp, names)
        if not dds:
            return "", "texconv failed or no thumbnail set — open the edit modal and use 'Save DDS' after setting a thumbnail"
        return dds, ""
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def rebuild_package_only(video, pkg_dest: str) -> tuple:
    """Assemble .package from existing AVI + DDS + XML on disk. Returns (path, err)."""
    if not (video.avi_path and os.path.exists(video.avi_path)):
        return "", "No AVI found — run Encode AVI first"
    if not (video.xml_path and os.path.exists(video.xml_path)):
        return "", "No XML found — run Save XML first"

    author = (video.author or "Author").replace(" ", "")
    stem   = video.hash_name or os.path.splitext(video.filename)[0]
    names  = s4pe_names(author, stem)

    with open(video.xml_path, "rb") as f:
        xml_data = f.read()

    dest = _assemble_package(video, xml_data, names, pkg_dest)
    return dest, ""


# ── Main entry point ───────────────────────────────────────────────────────────

def encode_video(video, out_dir: str, pkg_dest: str, mode: str = "auto") -> None:
    """
    mode:
      'auto'    — re-encode AVI only if settings changed or AVI missing;
                  always rebuild DDS / XML / .package
      'full'    — always re-encode AVI
      'rebuild' — skip AVI; only redo DDS / XML / .package
    """
    from models import db

    def _step(n, msg):
        video.progress_step = n
        video.progress_msg  = msg
        video.status        = "encoding"
        db.session.commit()

    def _fail(msg):
        video.status    = "error"
        video.error_msg = msg
        db.session.commit()

    src = video.source_path
    if not os.path.exists(src) and mode != "rebuild":
        _fail(f"Source not found: {src}")
        return

    author = (video.author or "Author").replace(" ", "")
    stem   = video.hash_name or os.path.splitext(video.filename)[0]
    names  = s4pe_names(author, stem)

    # Decide whether the AVI needs re-encoding
    do_avi = {
        "full":    True,
        "rebuild": False,
        "auto":    video.avi_settings_changed(),
    }.get(mode, video.avi_settings_changed())

    tmp = tempfile.mkdtemp(prefix="wwenc_")
    try:
        # ── AVI (steps 1-5) ───────────────────────────────────────────────────
        if do_avi:
            _step(1, "Encoding AVI (VP6)…  step 1/5 — Y4M")
            avi_dest, err = _encode_avi(video, out_dir, tmp)
            if err:
                _fail(err)
                return
            video.avi_path = avi_dest
            video.stamp_avi_settings()
            db.session.commit()
        else:
            _step(1, "AVI unchanged — skipping re-encode")

        # ── DDS (step 6) ──────────────────────────────────────────────────────
        _step(6, "Converting thumbnail to DDS…")
        dds = _make_dds(video, out_dir, tmp, names)
        if dds:
            video.dds_path = dds
            db.session.commit()

        # ── XML (step 7) ──────────────────────────────────────────────────────
        _step(7, "Writing XML tuning…")
        xml_data = _xml_bytes(
            names,
            video.display_name or video.title or stem,
            video.author       or "Unknown",
            video.description  or "",
            video.orientations or "BISEXUAL",
            video.duration_sec or 0,
        )
        xml_dest = os.path.join(out_dir, names["xml_file"])
        with open(xml_dest, "wb") as f:
            f.write(xml_data)
        video.xml_path = xml_dest
        db.session.commit()

        # ── .package (step 8) ─────────────────────────────────────────────────
        _step(8, "Building .package…")
        final_pkg = _assemble_package(video, xml_data, names, pkg_dest)
        video.package_path = final_pkg

        video.status        = "done"
        video.progress_step = 8
        video.progress_msg  = "Complete"
        db.session.commit()

    except Exception as e:
        _fail(f"Unexpected error: {e}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
