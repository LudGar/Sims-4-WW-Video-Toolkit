"""
Minimal DBPF 2.1 package builder for Sims 4.

The .package format (DBPF 2.1) layout:
  96-byte header
  resource data blobs (uncompressed)
  index (4-byte flags + N * 32-byte entries)
"""
import io
import struct
import time


COMPRESS_NONE = 0x0000   # uncompressed; 0xFFFF = deleted-record marker in DBPF 2.1
COMMITTED = 1


def _header(entry_count: int, index_offset: int, index_size: int) -> bytes:
    """Build the 96-byte DBPF 2.1 header."""
    now = int(time.time())
    # 68 bytes of defined fields
    hdr = struct.pack(
        "<4s"   # magic
        "II"    # major=2, minor=1
        "III"   # unknown x3
        "II"    # created, modified
        "I"     # index version = 7
        "I"     # index entry count
        "I"     # v1 index offset (unused in v2, = 0)
        "I"     # index size in bytes
        "III"   # hole count, hole offset, hole size
        "I"     # unknown = 3
        "I",    # index offset (v2)
        b"DBPF",
        2, 1,
        0, 0, 0,
        now, now,
        7,
        entry_count,
        0,
        index_size,
        0, 0, 0,
        3,
        index_offset,
    )
    # Pad to 96 bytes
    return hdr + b"\x00" * (96 - len(hdr))


def _index(entries: list) -> bytes:
    """
    Build the index block.
    entries: list of (type_id, group_id, instance_id_64, file_offset, data_size)
    flags = 0 → all fields per-entry (no shared constants).
    """
    buf = io.BytesIO()
    buf.write(struct.pack("<I", 0))   # flags = 0
    for type_id, group_id, inst64, offset, size in entries:
        inst_hi = (inst64 >> 32) & 0xFFFFFFFF
        inst_lo = inst64 & 0xFFFFFFFF
        buf.write(struct.pack(
            "<IIIIIII HH",
            type_id, group_id, inst_hi, inst_lo,
            offset,
            size,   # compressed size  (same as decompressed — no compression)
            size,   # decompressed size
            COMPRESS_NONE,
            COMMITTED,
        ))
    return buf.getvalue()


def build_package(resources: list) -> bytes:
    """
    Build a .package file from a list of resources.

    resources: list of (type_id: int, group_id: int, instance_id: int, data: bytes)

    Returns the raw bytes of the .package file.
    """
    buf = io.BytesIO()
    buf.write(b"\x00" * 96)   # placeholder header

    entries = []
    for type_id, group_id, inst64, data in resources:
        offset = buf.tell()
        buf.write(data)
        entries.append((type_id, group_id, inst64, offset, len(data)))

    index_offset = buf.tell()
    idx = _index(entries)
    buf.write(idx)

    hdr = _header(len(entries), index_offset, len(idx))
    buf.seek(0)
    buf.write(hdr)

    buf.seek(0)
    return buf.read()
