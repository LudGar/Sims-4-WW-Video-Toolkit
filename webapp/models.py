"""SQLAlchemy models."""
import datetime
import os
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


class Video(db.Model):
    __tablename__ = "videos"

    id = db.Column(db.Integer, primary_key=True)

    # Source
    source_path = db.Column(db.String, nullable=False)
    filename    = db.Column(db.String, nullable=False)

    # Metadata
    title        = db.Column(db.String, nullable=False, default="")  # icon generator label
    display_name = db.Column(db.String, default="")  # video_raw_display_name in XML
    hash_name    = db.Column(db.String, default="")  # identifier used in FNV hash key
    author       = db.Column(db.String, default="")
    description  = db.Column(db.Text,   default="")

    # Encode settings (what the user wants next time)
    resolution  = db.Column(db.String,  default="480x272")
    fps         = db.Column(db.Integer, default=30)
    audio_rate  = db.Column(db.Integer, default=44100)
    rate_mode   = db.Column(db.String,  default="cqp")   # cqp | cbr
    quant       = db.Column(db.Integer, default=18)
    cbr_kbps    = db.Column(db.Integer, default=500)

    # WW tags
    orientations = db.Column(db.String,  default="BISEXUAL")
    duration_sec = db.Column(db.Integer, default=0)

    # ── What settings were actually used for the CURRENT AVI on disk ──────────
    # Used to detect whether a re-encode is needed.
    avi_resolution = db.Column(db.String,  default="")
    avi_fps        = db.Column(db.Integer, default=0)
    avi_audio_rate = db.Column(db.Integer, default=0)
    avi_rate_mode  = db.Column(db.String,  default="")
    avi_quant      = db.Column(db.Integer, default=0)
    avi_cbr_kbps   = db.Column(db.Integer, default=0)

    # Status
    status        = db.Column(db.String,  default="pending")
    progress_step = db.Column(db.Integer, default=0)
    progress_msg  = db.Column(db.String,  default="")
    error_msg     = db.Column(db.Text,    default="")

    # Output paths
    thumbnail_path = db.Column(db.String, default="")
    avi_path       = db.Column(db.String, default="")
    dds_path       = db.Column(db.String, default="")
    xml_path       = db.Column(db.String, default="")
    package_path   = db.Column(db.String, default="")

    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    updated_at = db.Column(
        db.DateTime,
        default=datetime.datetime.utcnow,
        onupdate=datetime.datetime.utcnow,
    )

    # ── Helpers ───────────────────────────────────────────────────────────────

    def avi_exists(self) -> bool:
        return bool(self.avi_path) and os.path.exists(self.avi_path)

    def avi_settings_changed(self) -> bool:
        """True if current encode settings differ from what the AVI was built with."""
        if not self.avi_exists():
            return True   # no AVI at all → must encode
        return not (
            self.resolution == self.avi_resolution
            and self.fps        == self.avi_fps
            and self.audio_rate == self.avi_audio_rate
            and self.rate_mode  == self.avi_rate_mode
            and self.quant      == self.avi_quant
            and self.cbr_kbps   == self.avi_cbr_kbps
        )

    def stamp_avi_settings(self):
        """Call after a successful AVI encode to record what settings were used."""
        self.avi_resolution = self.resolution
        self.avi_fps        = self.fps
        self.avi_audio_rate = self.audio_rate
        self.avi_rate_mode  = self.rate_mode
        self.avi_quant      = self.quant
        self.avi_cbr_kbps   = self.cbr_kbps

    def _mtime(self, path: str) -> str:
        """Return last-modified timestamp of path as a human string, or ''."""
        if path and os.path.exists(path):
            import datetime
            t = os.path.getmtime(path)
            return datetime.datetime.fromtimestamp(t).strftime("%Y-%m-%d %H:%M:%S")
        return ""

    def to_dict(self):
        from fnv import s4pe_names as _s4pe
        thumb = ""
        if self.thumbnail_path:
            thumb = "/thumbs/" + os.path.basename(self.thumbnail_path)
        pkg = ""
        if self.package_path:
            pkg = "/packages/" + os.path.basename(self.package_path)

        author_clean = (self.author or "Author").replace(" ", "")
        stem = self.hash_name or os.path.splitext(self.filename)[0]
        names = _s4pe(author_clean, stem)

        return {
            "id":           self.id,
            "filename":     self.filename,
            "title":        self.title,
            "display_name": self.display_name,
            "hash_name":    self.hash_name,
            "author":       self.author,
            "description":  self.description,
            # current desired settings
            "resolution":  self.resolution,
            "fps":         self.fps,
            "audio_rate":  self.audio_rate,
            "rate_mode":   self.rate_mode,
            "quant":       self.quant,
            "cbr_kbps":    self.cbr_kbps,
            "orientations":  self.orientations,
            "duration_sec":  self.duration_sec,
            # what the AVI on disk was encoded with
            "avi_resolution": self.avi_resolution,
            "avi_fps":        self.avi_fps,
            "avi_audio_rate": self.avi_audio_rate,
            "avi_rate_mode":  self.avi_rate_mode,
            "avi_quant":      self.avi_quant,
            "avi_cbr_kbps":   self.avi_cbr_kbps,
            "avi_exists":     self.avi_exists(),
            "avi_settings_changed": self.avi_settings_changed(),
            # status
            "status":        self.status,
            "progress_step": self.progress_step,
            "progress_msg":  self.progress_msg,
            "error_msg":     self.error_msg,
            # assets
            "thumbnail_url": thumb,
            "package_url":   pkg,
            "has_package":   bool(self.package_path),
            "created_at":    self.created_at.isoformat() if self.created_at else "",
            # S4PE filenames (computed from current author + filename)
            "s4pe_avi": names["avi_file"],
            "s4pe_dds": names["img_file"],
            "s4pe_xml": names["xml_file"],
            # Per-file last-saved timestamps
            "avi_saved": self._mtime(self.avi_path),
            "dds_saved": self._mtime(self.dds_path),
            "xml_saved": self._mtime(self.xml_path),
            "pkg_saved": self._mtime(self.package_path),
        }
