#!/bin/bash
# Usage: tools/render.sh <render-binary> name1 name2 ...   (compile: swiftc -O tools/render.swift -o render)
# One process per screen with a 20s watchdog; retries once.
BIN="$1"; shift
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${CREW_RENDER_OUT:-$ROOT/renders}"
mkdir -p "$OUT"
for n in "$@"; do
  for try in 1 2; do
    "$BIN" "$ROOT" "$OUT" "$n" >/dev/null 2>&1 & pid=$!
    for i in $(seq 1 20); do sleep 1; kill -0 $pid 2>/dev/null || break; done
    kill $pid 2>/dev/null; wait $pid 2>/dev/null
    [ -f "$OUT/$n.png" ] && break
  done
  [ -f "$OUT/$n.png" ] && echo "ok $n" || echo "FAIL $n"
done
