"""FNV-64 hashing and S4PE filename helpers for WickedWhims resources."""


def fnv64(text: str) -> int:
    P = 0x00000100000001B3
    h = 0xCBF29CE484222325
    for b in text.lower().encode("utf-8"):
        h ^= b
        h = (h * P) & 0xFFFFFFFFFFFFFFFF
    return h


def video_hashes(author: str, filename: str):
    """Return (avi_hash, ww_hash) as 64-bit ints."""
    clean = "".join(c for c in filename if c.isalnum())
    base = f"{author}:VIDEO_{clean}"
    return fnv64(base), fnv64(base + "_WW.OBJ.TUNING")


def s4pe_names(author: str, filename: str) -> dict:
    """Return dict of all S4PE filenames, hashes and XML refs for a video."""
    clean = "".join(c for c in filename if c.isalnum())
    author_clean = author.replace(" ", "")
    base = f"{author_clean}:VIDEO_{clean}"
    avi_h = fnv64(base)
    ww_h = fnv64(base + "_WW.OBJ.TUNING")
    avi_hex = format(avi_h, "016X")
    ww_hex = format(ww_h, "016X")
    return {
        "base": base,
        "avi_hash": avi_h,
        "ww_hash": ww_h,
        "avi_hex": avi_hex,
        "ww_hex": ww_hex,
        "ww_dec": str(ww_h),
        "avi_file": f"S4_376840D7_00000000_{avi_hex}____AVI.avi",
        "img_file": f"S4_00B2D882_00000000_{avi_hex}____IMG.dds",
        "xml_file": f"S4_5B02819E_00000000_{ww_hex}____XML.xml",
        "icon_ref": f"00B2D882:00000000:{avi_hex}",
        "clip_ref": f"376840D7:00000000:{avi_hex}",
    }
