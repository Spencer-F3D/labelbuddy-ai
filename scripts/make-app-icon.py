"""
產生 App 圖示（放大鏡）—— 2026-10-03

【為什麼用程式畫，而不是 AI 生圖】
  放大鏡是純幾何圖形，程式繪製在 **48px（mdpi）仍然清晰**；
  AI 生圖在小尺寸會出現雜訊與鋸齒，而且沒有辦法精確控制安全區。
  這個專案已經有 Pillow，畫出來的東西可重現、可調參數。

【產出什麼（Capacitor 的 Android 專案需要的三種）】
  ic_launcher.png            48 / 72 / 96 / 144 / 192     圓角方形底 ＋ 白色放大鏡
  ic_launcher_round.png      48 / 72 / 96 / 144 / 192     圓形底 ＋ 白色放大鏡
  ic_launcher_foreground.png 108 / 162 / 216 / 324 / 432  透明底 ＋ 白色放大鏡（自適應前景）

★ 自適應圖示（Android 8+）的前景只保證中央 **66% 安全區**會被看到，
  外圈會被各種造型的遮罩裁掉 —— 所以前景的圖案必須畫在中央 66% 之內，
  而且**不能有底色**（底色由 ic_launcher_background 提供）。

用法：python make-app-icon.py
"""

from __future__ import annotations

import os
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
RES = ROOT / "android" / "app" / "src" / "main" / "res"

# 品牌藍（與 App 標題列同色系），白色放大鏡放在上面
BLUE = (24, 95, 165, 255)  # #185FA5
BLUE_DARK = (12, 68, 124, 255)  # #0C447C
WHITE = (255, 255, 255, 255)
CLEAR = (0, 0, 0, 0)

# 每個密度對應的尺寸（px）
LAUNCHER = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
FOREGROUND = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}

# 自適應圖示的安全區：前景只有中央 66% 保證可見
SAFE_ZONE = 0.66


def draw_magnifier(size: int, *, with_background: str | None, scale: float = 1.0) -> Image.Image:
    """
    畫一個放大鏡。

    @param with_background 'rounded' / 'circle' / None（透明）
    @param scale          圖案相對於畫布的比例（自適應前景要縮到安全區內）
    """
    # 用 4 倍解析度繪製再縮小 —— PIL 沒有抗鋸齒的圓弧，這樣才平滑
    ss = 4
    S = size * ss
    img = Image.new("RGBA", (S, S), CLEAR)
    d = ImageDraw.Draw(img)

    if with_background == "rounded":
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=BLUE)
        # 底部加一點深色漸層感（單純畫一條較暗的帶狀，讓扁平圖示有層次）
        d.rounded_rectangle(
            [0, int(S * 0.62), S - 1, S - 1], radius=int(S * 0.22), fill=BLUE_DARK
        )
        d.rectangle([0, int(S * 0.62), S - 1, int(S * 0.84)], fill=BLUE)
    elif with_background == "circle":
        d.ellipse([0, 0, S - 1, S - 1], fill=BLUE)
        d.ellipse([int(S * 0.06), int(S * 0.62), S + int(S * 0.6), S + int(S * 0.6)], fill=BLUE)

    # ── 放大鏡本體（以畫布中心為基準，再依 scale 縮放）──
    cx = cy = S / 2
    unit = S * scale
    r = unit * 0.28  # 鏡片半徑
    ring = unit * 0.062  # 鏡框粗細（粗一點，小尺寸才看得見）
    # 鏡片往左上移一點，讓右下有空間放握把
    lens_cx = cx - unit * 0.075
    lens_cy = cy - unit * 0.075

    # 握把：從鏡框右下角往右下延伸的粗線（畫成圓角矩形比較穩）
    handle_len = unit * 0.30
    hx0 = lens_cx + r * 0.72
    hy0 = lens_cy + r * 0.72
    hx1 = hx0 + handle_len * 0.72
    hy1 = hy0 + handle_len * 0.72
    d.line([hx0, hy0, hx1, hy1], fill=WHITE, width=int(ring * 1.25))
    # 線的兩端補圓頭（PIL 的 line 沒有圓端點）
    d.ellipse([hx1 - ring * 0.62, hy1 - ring * 0.62, hx1 + ring * 0.62, hy1 + ring * 0.62], fill=WHITE)

    # 鏡框：外圓填白、內圓挖空（用透明覆蓋做出空心環）
    d.ellipse(
        [lens_cx - r, lens_cy - r, lens_cx + r, lens_cy + r],
        outline=WHITE,
        width=int(ring),
    )

    # 鏡片裡的三條橫線 —— 暗示「營養標示表格」
    # ⚠️ 小尺寸（48px）時三條會糊成一團，所以只畫兩條。
    bars = 2 if size <= 72 else 3
    bar_w = r * 1.05 * (1.0 if bars == 2 else 1.12)
    bar_h = max(1, int(ring * 0.34))
    gap = r * 0.30
    top = lens_cy - gap * (bars - 1) / 2
    for i in range(bars):
        by = top + i * gap
        # 第 2 條短一點，看起來像表格的「項目 → 數值」
        w = bar_w * (0.68 if i == 1 else 1.0)
        d.rounded_rectangle(
            [lens_cx - w / 2, by - bar_h / 2, lens_cx + w / 2, by + bar_h / 2],
            radius=bar_h / 2,
            fill=WHITE,
        )

    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    written = 0
    for density, size in LAUNCHER.items():
        out = RES / f"mipmap-{density}"
        out.mkdir(parents=True, exist_ok=True)

        draw_magnifier(size, with_background="rounded").save(out / "ic_launcher.png")
        draw_magnifier(size, with_background="circle").save(out / "ic_launcher_round.png")
        write_foreground(out, FOREGROUND[density])
        written += 3
        print(f"  mipmap-{density:8} {size:>3}px  前景 {FOREGROUND[density]:>3}px")

    print(f"\n✅ 共寫入 {written} 個檔案到 {RES}")
    print("⚠️ 前景只畫在中央 66% 安全區內（自適應圖示的外圈會被遮罩裁掉）")


def write_foreground(out: Path, size: int) -> None:
    """自適應圖示的前景：透明底，圖案縮到安全區內"""
    draw_magnifier(size, with_background=None, scale=SAFE_ZONE).save(
        out / "ic_launcher_foreground.png"
    )


if __name__ == "__main__":
    main()
