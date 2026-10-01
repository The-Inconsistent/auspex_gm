#!/bin/zsh
# Usage: ./render.sh [glob, e.g. "I39-*"]. Renders preview/<Name>.html to png/<Name>.png at the size on the first
# line of src/<Name>.body.html, at 2x. Each run gets its own Chrome profile (parallel-safe); with one, headless Chrome
# writes the screenshot but doesn't exit, so we wait for the file and stop it.
cd "${0:A:h}" && mkdir -p png
for f in preview/${~1:-*}.html; do
  n=${f:t:r}; out="png/$n.png"; prof=$(mktemp -d)
  read -r w h <<< "$(head -1 src/$n.body.html | sed -E 's/.*w=([0-9]+) h=([0-9]+).*/\1 \2/')"
  rm -f "$out"
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars \
    --force-device-scale-factor=2 --virtual-time-budget=4000 --user-data-dir="$prof" --window-size=$w,$h \
    --screenshot="$out" "file://$PWD/$f" >/dev/null 2>&1 &
  pid=$!
  for i in {1..40}; do [[ -s "$out" ]] && sleep 1 && break; sleep 0.5; done
  kill $pid 2>/dev/null; wait $pid 2>/dev/null; rm -rf "$prof"
  [[ -s "$out" ]] && echo "$out" || echo "FAILED $n"
done
