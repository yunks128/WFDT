#!/usr/bin/env python3
"""
Build WFDT's wind field from NOAA GFS.

Fetches 10 m U/V wind components for southern California from the NOMADS GRIB
filter,
decodes them with ecCodes, subsamples to a 1-degree grid, and writes one small
JSON file per forecast hour into public/data/wind/.

The output is plain static JSON, so GitHub Pages can serve it with no API key,
no CORS proxy, and no server. A scheduled GitHub Action re-runs this every
6 hours to track the GFS cycle.

Usage:
    python scripts/build_wind.py [--out public/data/wind] [--hours 0,6,12,18,24]

Notes:
    * NOMADS' OPeNDAP service was retired (NWS SCN 25-81); the GRIB filter
      endpoint used here is the supported replacement.
    * A GFS cycle publishes ~3.5-5 h after its nominal time, so we walk
      backwards through recent cycles until one has the hours we need.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
import urllib.error
import urllib.request
from datetime import datetime, timedelta, timezone

try:
    import eccodes as ec
except ImportError:  # pragma: no cover
    sys.exit("Missing dependency: pip install eccodes")

FILTER = "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl"

# Southern California and the Great Basin margin the Santa Ana winds come out
# of. The window is deliberately wider than the default view so particles do
# not appear to spawn at the edge of the screen.
LAT_MIN, LAT_MAX = 30, 40
LON_MIN, LON_MAX = 235, 250  # 0-360, i.e. 125W to 110W
# Quarter degree matches the GFS grid: at this scale a coarser field visibly
# smears the terrain-driven flow through the passes, which is the whole point
# of showing wind on a fire map.
STEP = 0.25
TIMEOUT = 180


def cycle_url(cycle: datetime, fhour: int) -> str:
    return (
        f"{FILTER}?file=gfs.t{cycle:%H}z.pgrb2.0p25.f{fhour:03d}"
        "&lev_10_m_above_ground=on&var_UGRD=on&var_VGRD=on"
        f"&subregion=&leftlon={LON_MIN}&rightlon={LON_MAX}&toplat={LAT_MAX}&bottomlat={LAT_MIN}"
        f"&dir=%2Fgfs.{cycle:%Y%m%d}%2F{cycle:%H}%2Fatmos"
    )


def fetch(url: str) -> bytes | None:
    req = urllib.request.Request(url, headers={"User-Agent": "wfdt/0.1 (wildfire map)"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            data = r.read()
    except (urllib.error.URLError, TimeoutError) as e:
        print(f"    fetch failed: {e}", file=sys.stderr)
        return None
    # The filter returns an HTML error page with HTTP 200 when a cycle or
    # forecast hour is not on disk yet, so validate the GRIB magic number.
    if not data.startswith(b"GRIB"):
        return None
    return data


def decode(grib: bytes) -> dict:
    """Decode a 2-message (U,V) GRIB2 blob onto a regular lat/lon grid."""
    fields: dict[str, list[float]] = {}
    geom: dict = {}

    with tempfile.NamedTemporaryFile(suffix=".grb2", delete=False) as tmp:
        tmp.write(grib)
        path = tmp.name
    try:
        with open(path, "rb") as fh:
            while True:
                gid = ec.codes_grib_new_from_file(fh)
                if gid is None:
                    break
                try:
                    name = ec.codes_get(gid, "shortName")  # 10u / 10v
                    ni = ec.codes_get(gid, "Ni")
                    nj = ec.codes_get(gid, "Nj")
                    la1 = ec.codes_get(gid, "latitudeOfFirstGridPointInDegrees")
                    la2 = ec.codes_get(gid, "latitudeOfLastGridPointInDegrees")
                    lo1 = ec.codes_get(gid, "longitudeOfFirstGridPointInDegrees")
                    di = ec.codes_get(gid, "iDirectionIncrementInDegrees")
                    dj = ec.codes_get(gid, "jDirectionIncrementInDegrees")
                    vals = ec.codes_get_values(gid)
                    geom = dict(ni=ni, nj=nj, la1=la1, la2=la2, lo1=lo1, di=di, dj=dj)
                    fields[name] = vals
                finally:
                    ec.codes_release(gid)
    finally:
        os.unlink(path)

    if "10u" not in fields or "10v" not in fields:
        raise ValueError(f"expected 10u and 10v, got {sorted(fields)}")
    return {"geom": geom, "u": fields["10u"], "v": fields["10v"]}


def resample(decoded: dict) -> dict:
    """Subsample the native 0.25-degree grid to STEP degrees, north row first."""
    g = decoded["geom"]
    ni, nj = g["ni"], g["nj"]
    di, dj = g["di"], g["dj"]
    la1, lo1 = g["la1"], g["lo1"]

    # Native scan order: rows run from la1 toward la2. Normalise to north-first.
    north_first = g["la1"] > g["la2"]
    jstep = max(1, round(STEP / dj))
    istep = max(1, round(STEP / di))

    lats, out_u, out_v = [], [], []
    j_indices = range(0, nj, jstep)
    for j in j_indices:
        lat = la1 + (-dj * j if north_first else dj * j)
        lats.append(lat)
    order = sorted(range(len(lats)), key=lambda k: -lats[k])  # north -> south

    nx = len(range(0, ni, istep))
    for k in order:
        j = list(j_indices)[k]
        base = j * ni
        for i in range(0, ni, istep):
            out_u.append(round(float(decoded["u"][base + i]), 1))
            out_v.append(round(float(decoded["v"][base + i]), 1))

    return {
        "nx": nx,
        "ny": len(order),
        "lat0": max(lats),          # first row latitude (north)
        "lon0": lo1,                # first column longitude
        "dlat": -STEP,              # rows march south
        "dlon": STEP,               # columns march east
        "u": out_u,
        "v": out_v,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="public/data/wind")
    ap.add_argument("--hours", default="0,6,12,18,24")
    args = ap.parse_args()

    hours = [int(h) for h in args.hours.split(",") if h.strip()]
    os.makedirs(args.out, exist_ok=True)

    now = datetime.now(timezone.utc)
    # GFS runs at 00/06/12/18Z and posts a few hours late. Try the last 4 cycles.
    base = now.replace(minute=0, second=0, microsecond=0, hour=(now.hour // 6) * 6)
    candidates = [base - timedelta(hours=6 * i) for i in range(5)]

    frames, chosen = [], None
    for cycle in candidates:
        print(f"trying GFS cycle {cycle:%Y-%m-%d %HZ}")
        got = []
        for fh in hours:
            url = cycle_url(cycle, fh)
            print(f"  f{fh:03d} …", end=" ", flush=True)
            blob = fetch(url)
            if blob is None:
                print("unavailable")
                break
            grid = resample(decode(blob))
            grid["hour"] = fh
            grid["valid"] = (cycle + timedelta(hours=fh)).strftime("%Y-%m-%dT%H:%M:%SZ")
            got.append(grid)
            print(f"ok ({len(blob) // 1024} KiB → {grid['nx']}×{grid['ny']})")
        if got:
            frames, chosen = got, cycle
            break

    if not frames:
        print("No GFS cycle available; leaving existing data untouched.", file=sys.stderr)
        return 1

    for grid in frames:
        path = os.path.join(args.out, f"f{grid['hour']:03d}.json")
        with open(path, "w") as fh:
            json.dump(grid, fh, separators=(",", ":"))
        print(f"wrote {path} ({os.path.getsize(path) // 1024} KiB)")

    index = {
        "source": "NOAA NCEP GFS 0.25° via NOMADS GRIB filter",
        "cycle": chosen.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "built": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "variable": "10 m wind (u, v) in m/s",
        "step": STEP,
        "frames": [
            {"hour": g["hour"], "valid": g["valid"], "file": f"f{g['hour']:03d}.json"}
            for g in frames
        ],
    }
    with open(os.path.join(args.out, "index.json"), "w") as fh:
        json.dump(index, fh, indent=1)
    print(f"wrote {args.out}/index.json — cycle {index['cycle']}, {len(frames)} frames")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
