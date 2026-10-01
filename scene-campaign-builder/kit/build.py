# Usage: python3 build.py <canvas-root> [glob, e.g. "I39-*"]
# Wraps each src/<Name>.body.html into a canvas artboard (project/<Name>.dc.html) and a local preview
# (preview/<Name>.html, no support.js) so it can be rendered to PNG. First line of a body:
# <!-- w=1194 h=834 title="..." -->
import re, sys, pathlib, json
kit = pathlib.Path(__file__).parent
style = (kit / "style.html").read_text()
root = pathlib.Path(sys.argv[1])
(root / "project").mkdir(parents=True, exist_ok=True)
(kit / "preview").mkdir(exist_ok=True)
meta = {}
pat = (sys.argv[2] if len(sys.argv) > 2 else "*") + ".body.html"
for src in sorted((kit / "src").glob(pat)):
    name = src.name.removesuffix(".body.html")
    body = src.read_text()
    m = re.match(r'<!--\s*w=(\d+)\s+h=(\d+)\s+title="([^"]+)"\s*-->\n', body)
    if not m: sys.exit(f"{src}: missing meta line")
    w, h, title = int(m[1]), int(m[2]), m[3]
    body = body[m.end():]
    props = json.dumps({"$preview": {"width": w, "height": h}})
    page = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{title}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
{style}{body}</x-dc>
<script type="text/x-dc" data-dc-script data-props='{props}'>
class Component extends DCLogic {{
  renderVals() {{ return {{}}; }}
}}
</script>
</body>
</html>
"""
    (root / "project" / f"{name}.dc.html").write_text(page)
    (kit / "preview" / f"{name}.html").write_text(page.replace('<script src="./support.js"></script>\n', ""))
    meta[name] = {"w": w, "h": h, "title": title}
if len(sys.argv) <= 2:  # only a full build rewrites the index of sizes
    (kit / "meta.json").write_text(json.dumps(meta, indent=1))
print("\n".join(f"{k} {v['w']}x{v['h']}" for k, v in meta.items()))
