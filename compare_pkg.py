"""
Compare two .package files side-by-side.
Usage: python compare_pkg.py <our_pkg.package> <s4pe_pkg.package>
"""
import struct
import sys
import os


def read_header(data: bytes) -> dict:
    magic = data[:4]
    major, minor = struct.unpack_from("<II", data, 4)
    idx_version  = struct.unpack_from("<I", data, 32)[0]
    entry_count  = struct.unpack_from("<I", data, 36)[0]
    idx_size     = struct.unpack_from("<I", data, 44)[0]
    unknown60    = struct.unpack_from("<I", data, 60)[0]
    idx_offset   = struct.unpack_from("<I", data, 64)[0]
    return {
        "magic": magic,
        "version": f"{major}.{minor}",
        "index_version": idx_version,
        "entry_count": entry_count,
        "index_size": idx_size,
        "unknown_60": unknown60,
        "index_offset": idx_offset,
    }


def read_index(data: bytes, offset: int, count: int) -> list:
    pos = offset
    flags = struct.unpack_from("<I", data, pos)[0]
    pos += 4
    entries = []
    for _ in range(count):
        type_id, grp, inst_hi, inst_lo, chunk_off, disk_size, mem_size = \
            struct.unpack_from("<IIIIIII", data, pos)
        comp_type, committed = struct.unpack_from("<HH", data, pos + 28)
        entries.append({
            "type_id":   f"0x{type_id:08X}",
            "group":     f"0x{grp:08X}",
            "instance":  f"0x{(inst_hi << 32 | inst_lo):016X}",
            "offset":    chunk_off,
            "disk_size": disk_size,
            "mem_size":  mem_size,
            "comp_type": f"0x{comp_type:04X}",
            "committed": committed,
        })
        pos += 32
    return flags, entries


def hexdump(data: bytes, limit: int = 64) -> str:
    chunk = data[:limit]
    hex_part = " ".join(f"{b:02X}" for b in chunk)
    asc_part = "".join(chr(b) if 32 <= b < 127 else "." for b in chunk)
    extra = f" ... ({len(data)} bytes total)" if len(data) > limit else f" ({len(data)} bytes)"
    return f"{hex_part}  |{asc_part}|{extra}"


def analyze(path: str) -> dict:
    with open(path, "rb") as f:
        data = f.read()
    hdr = read_header(data)
    flags, entries = read_index(data, hdr["index_offset"], hdr["entry_count"])
    resources = []
    for e in entries:
        rdata = data[e["offset"] : e["offset"] + e["disk_size"]]
        resources.append((e, rdata))
    return {"header": hdr, "index_flags": flags, "resources": resources}


def print_analysis(label: str, info: dict):
    print(f"\n{'='*60}")
    print(f"  {label}")
    print(f"{'='*60}")
    h = info["header"]
    print(f"  Magic:         {h['magic']}")
    print(f"  Version:       {h['version']}")
    print(f"  Index version: {h['index_version']}")
    print(f"  Entry count:   {h['entry_count']}")
    print(f"  Index size:    {h['index_size']}")
    print(f"  Unknown @60:   {h['unknown_60']}")
    print(f"  Index offset:  {h['index_offset']}")
    print(f"  Index flags:   0x{info['index_flags']:08X}")
    print()
    for i, (e, rdata) in enumerate(info["resources"]):
        print(f"  Resource {i}:")
        for k, v in e.items():
            print(f"    {k:12s} = {v}")
        print(f"    data[0:64]   = {hexdump(rdata)}")
        print()


def compare(a: dict, b: dict):
    print(f"\n{'='*60}")
    print("  DIFFERENCES")
    print(f"{'='*60}")
    for key in ["version", "index_version", "unknown_60"]:
        va = a["header"][key]
        vb = b["header"][key]
        if va != vb:
            print(f"  HEADER {key}: OURS={va}  S4PE={vb}")

    if a["index_flags"] != b["index_flags"]:
        print(f"  INDEX flags: OURS=0x{a['index_flags']:08X}  S4PE=0x{b['index_flags']:08X}")

    ra = {e["type_id"]: (e, d) for e, d in a["resources"]}
    rb = {e["type_id"]: (e, d) for e, d in b["resources"]}
    for tid in set(ra) | set(rb):
        if tid not in ra:
            print(f"  TYPE {tid}: only in S4PE package")
            continue
        if tid not in rb:
            print(f"  TYPE {tid}: only in OUR package")
            continue
        ea, da = ra[tid]
        eb, db = rb[tid]
        for key in ["instance", "comp_type", "committed"]:
            if ea[key] != eb[key]:
                print(f"  TYPE {tid} index.{key}: OURS={ea[key]}  S4PE={eb[key]}")
        if da != db:
            # Find first difference
            diff_at = next((i for i in range(min(len(da), len(db))) if da[i] != db[i]), None)
            if diff_at is None:
                diff_at = f"length: {len(da)} vs {len(db)}"
            print(f"  TYPE {tid} DATA differs: first diff at byte {diff_at}")
            print(f"    OURS:  {hexdump(da, 64)}")
            print(f"    S4PE:  {hexdump(db, 64)}")
            if len(da) != len(db):
                print(f"    SIZE:  OURS={len(da)}  S4PE={len(db)}")
        else:
            print(f"  TYPE {tid}: data identical ({len(da)} bytes)")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python compare_pkg.py <our.package> <s4pe.package>")
        sys.exit(1)

    our_path  = sys.argv[1]
    s4pe_path = sys.argv[2]

    our_info  = analyze(our_path)
    s4pe_info = analyze(s4pe_path)

    print_analysis(f"OURS: {os.path.basename(our_path)}", our_info)
    print_analysis(f"S4PE: {os.path.basename(s4pe_path)}", s4pe_info)
    compare(our_info, s4pe_info)
