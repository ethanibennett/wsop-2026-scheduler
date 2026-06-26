from PIL import Image, ImageDraw, ImageFont

INK = (20, 23, 28)
FELT = (46, 125, 91)
CHIP = (200, 160, 78)
BONE = (232, 228, 218)

def font(size):
    for p in [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ]:
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            continue
    return ImageFont.load_default()

def spade(d, cx, cy, s, color):
    # simple spade: two circles + triangle + stem
    r = s * 0.30
    d.ellipse([cx - s*0.42, cy - s*0.18, cx - s*0.42 + 2*r, cy - 0.18*s + 2*r], fill=color)
    d.ellipse([cx + s*0.42 - 2*r, cy - s*0.18, cx + s*0.42, cy - 0.18*s + 2*r], fill=color)
    d.polygon([(cx, cy - s*0.55), (cx - s*0.46, cy + s*0.18), (cx + s*0.46, cy + s*0.18)], fill=color)
    # stem
    d.polygon([(cx - s*0.10, cy + s*0.10), (cx + s*0.10, cy + s*0.10),
               (cx + s*0.20, cy + s*0.46), (cx - s*0.20, cy + s*0.46)], fill=color)

def make(size, pad_ratio=0.0, rounded=True):
    img = Image.new("RGBA", (size, size), (0,0,0,0))
    d = ImageDraw.Draw(img)
    m = int(size * 0.06)
    # tile
    radius = int(size * 0.22) if rounded else 0
    d.rounded_rectangle([0,0,size-1,size-1], radius=radius, fill=INK)
    # felt ring
    ring = int(size*0.045)
    d.rounded_rectangle([m, m, size-1-m, size-1-m], radius=max(0,radius-m),
                        outline=CHIP, width=max(2,int(size*0.012)))
    # spade
    spade(d, size/2, size*0.42, size*0.42, FELT)
    # label
    f = font(int(size*0.16))
    txt = "'27"
    bbox = d.textbbox((0,0), txt, font=f)
    w = bbox[2]-bbox[0]; h = bbox[3]-bbox[1]
    d.text(((size-w)/2 - bbox[0], size*0.66 - bbox[1]), txt, font=f, fill=BONE)
    return img

make(512).save("public/icons/icon-512.png")
make(192).save("public/icons/icon-192.png")
# apple touch icon: no transparency, no rounding (iOS masks it)
apple = make(180, rounded=False).convert("RGB")
apple.save("public/icons/apple-touch-icon.png")
# maskable (extra padding)
make(512).save("public/icons/maskable-512.png")
print("icons generated")
