"""Build web images from the Desktop painting folder.
Reads works.json for the source list, writes img/full (1800px webp) and img/thumb (640px webp),
and fills in aspect ratio + average colour per work. EXIF is dropped (no GPS leaves the machine)."""
import json, os
from PIL import Image, ImageOps, ImageStat
SRC = os.path.expanduser("~/Desktop/Painting/Warbuck PNG")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
works = json.load(open(os.path.join(ROOT, "works.json")))
for w in works:
    im = ImageOps.exif_transpose(Image.open(os.path.join(SRC, w["src"]))).convert("RGB")
    w["w"], w["h"] = im.size
    r, g, b = [int(x) for x in ImageStat.Stat(im.resize((32, 32))).mean]
    w["color"] = "#%02x%02x%02x" % (r, g, b)
    for folder, size, q in (("full", 1800, 82), ("thumb", 640, 78)):
        out = im.copy(); out.thumbnail((size, size), Image.LANCZOS)
        out.save(os.path.join(ROOT, "img", folder, w["id"] + ".webp"), "WEBP", quality=q, method=6)
    print(w["id"], im.size, w["color"])
json.dump(works, open(os.path.join(ROOT, "works.json"), "w"), indent=2)
