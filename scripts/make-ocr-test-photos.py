"""
OCR 瓶頸隔離實驗（ablation）—— 一次只加一種真實拍照的劣化因素。

【為什麼要這樣做】
   前兩輪我一共犯了兩個錯：
     ① 模擬太乾淨 → 誤以為「1024px 就夠」，差點去改解析度
     ② 透視變形的頂點順序寫錯（PIL QUAD 要 左上→左下→右下→右上），
        產生自交的蝴蝶結四邊形，把圖徹底毀掉 → 誤以為「OCR 完全不行」
   兩次都是**測試本身的問題**，不是被測物的問題。
   → 所以改成逐一因素隔離：只有當「單獨加上某一項」就讓辨識崩掉，
     才能說那項是瓶頸。

PIL QUAD 的資料順序：左上、左下、右下、右上。
"""

from PIL import Image, ImageFilter, ImageEnhance, ImageDraw
import os

SRC = "shots-cjk/label-zh-TW_ramen.png"
OUT = ".tmp-ocr-exp"
os.makedirs(OUT, exist_ok=True)

W, H = 3024, 4032
LABEL_FRAC = 0.58          # 包裝佔畫面寬度比例
MAXDIM = 1024              # App 目前 OCR 模式的縮圖上限


def base_canvas():
    """把標籤貼進一張模擬的手機照片畫布（尚未加入任何劣化）。"""
    label = Image.open(SRC).convert("RGB")
    canvas = Image.new("RGB", (W, H), (210, 205, 198))
    scale = (W * LABEL_FRAC) / label.width
    lw, lh = int(label.width * scale), int(label.height * scale)
    label_big = label.resize((lw, lh), Image.LANCZOS)
    canvas.paste(label_big, ((W - lw) // 2, int(H * 0.20)))
    return canvas, label_big


def add_perspective_on(canvas, label_img, box):
    """透視變形（從斜角拍）。box=(x,y,w,h)。

    ⚠️ 直接對 label_img 做 transform，不要去裁 canvas ——
       第一版先在那塊區域塗白再裁切，結果裁到的是一片空白（檔案只有 12 KB）。
    """
    x, y, lw, lh = box
    warp = label_img.transform(
        (lw, lh),
        Image.Transform.QUAD,
        # ⚠️ 順序是 左上 → 左下 → 右下 → 右上
        (int(lw * 0.07), int(lh * 0.015),   # 左上（往內縮）
         0, lh,                             # 左下
         lw, lh,                            # 右下
         lw, 0),                            # 右上
        Image.Resampling.BICUBIC,
    )
    out = canvas.copy()
    # 先把原本的位置塗成背景色，再把變形後的貼上去
    out.paste(Image.new("RGB", (lw, lh), (210, 205, 198)), (x, y))
    out.paste(warp, (x, y))
    return out


def add_rotation(im, deg):
    return im.rotate(deg, resample=Image.Resampling.BICUBIC, expand=True, fillcolor=(210, 205, 198))


def add_glare(im):
    w, h = im.size
    g = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(g)
    cx, cy, r = int(w * 0.30), int(h * 0.30), int(w * 0.6)
    step = max(1, r // 120)
    for i in range(r, 0, -step):
        d.ellipse([cx - i, cy - i, cx + i, cy + i], fill=int(120 * (1 - i / r) ** 1.6))
    return Image.composite(Image.new("RGB", (w, h), (255, 255, 250)), im, g)


def add_shadow(im):
    w, h = im.size
    s = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(s)
    for y in range(0, h, 2):
        d.line([(0, y), (w, y)], fill=int(80 * (y / h) ** 2))
    return Image.composite(Image.new("RGB", (w, h), (40, 38, 36)), im, s)


def add_color_cast(im):
    im = ImageEnhance.Color(im).enhance(0.85)
    return ImageEnhance.Contrast(im).enhance(0.9)


def shrink(im, maxdim=MAXDIM):
    if max(im.size) > maxdim:
        r = maxdim / max(im.size)
        im = im.resize((int(im.width * r), int(im.height * r)), Image.LANCZOS)
    return im


def save(im, name):
    p = os.path.join(OUT, f"{name}.jpg")
    im.save(p, "JPEG", quality=80)
    print(f"  {name:26s} {str(im.size):14s} {os.path.getsize(p)//1024:5d} KB")


# 依序疊加因素，每一步都輸出一個檔案（可看出是哪一步崩掉）
cases = []

canvas0, box_label = base_canvas()
x = (W - box_label.width) // 2
y = int(H * 0.20)

# 0. 基準：單純貼上、只縮圖（理想情況，應該要讀得到）
im0 = shrink(canvas0.copy())
cases.append(("00-base", im0))

# 1. + 輕微失焦
im1 = shrink(canvas0.copy().filter(ImageFilter.GaussianBlur(0.8)))
cases.append(("01-blur0.8", im1))

# 2. + 較強失焦
im2 = shrink(canvas0.copy().filter(ImageFilter.GaussianBlur(1.6)))
cases.append(("02-blur1.6", im2))

# 3. + 旋轉 6 度
im3 = shrink(add_rotation(canvas0.copy(), 6))
cases.append(("03-rot6", im3))

# 4. + 透視變形
c4 = add_perspective_on(canvas0, box_label, (x, y, box_label.width, box_label.height))
cases.append(("04-persp", shrink(c4)))

# 5. + 反光
cases.append(("05-glare", shrink(add_glare(canvas0.copy()))))

# 6. + 陰影
cases.append(("06-shadow", shrink(add_shadow(canvas0.copy()))))

# 7. + 色偏／低對比
cases.append(("07-colour", shrink(add_color_cast(canvas0.copy()))))

# 8. 全部疊加（最接近真實）
allv = canvas0.copy()
allv = add_rotation(allv, 4)
allv = add_glare(allv)
allv = add_shadow(allv)
allv = add_color_cast(allv)
allv = allv.filter(ImageFilter.GaussianBlur(1.0))
cases.append(("08-all", shrink(allv)))

# 9. 全部疊加 + 1800px（測解析度有沒有幫助）
cases.append(("09-all-1800", shrink(allv, 1800)))

print("產生測試圖（逐一疊加劣化因素）：")
for name, im in cases:
    save(im, name)
print("\n接著用 ocr-smoke.ts 逐張跑，看哪一步開始崩掉。")
