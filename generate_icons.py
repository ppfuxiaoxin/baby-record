#!/usr/bin/env python3
# 生成淡蓝色 app 图标（192/512 PNG），无第三方依赖。
# 设计：圆角蓝底 + 白色小脸（两只蓝眼睛 + 微笑）。
import zlib, struct, os

BG = (74, 144, 217, 255)      # #4A90D9
WHITE = (255, 255, 255, 255)
BLUE = (74, 144, 217, 255)

def write_png(path, w, h, rows):
    raw = bytearray()
    for row in rows:
        raw.append(0)  # filter: none
        for px in row:
            raw += bytes(px)
    def chunk(typ, data):
        return (struct.pack('>I', len(data)) + typ + data +
                struct.pack('>I', zlib.crc32(typ + data) & 0xffffffff))
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)))
        f.write(chunk(b'IDAT', zlib.compress(bytes(raw), 9)))
        f.write(chunk(b'IEND', b''))

def make(size):
    s = size
    cx = s / 2.0
    radius = s * 0.22          # 圆角半径
    fcx, fcy, fr = cx, s * 0.49, s * 0.30   # 脸
    er = s * 0.045             # 眼睛半径
    eoff = s * 0.085           # 眼睛水平偏移
    ey = s * 0.44              # 眼睛 y
    # 微笑：以 (cx, s*0.50) 为圆心的圆环下半段
    scx, scy = cx, s * 0.505
    s_inner, s_outer = s * 0.075, s * 0.100

    rows = []
    for y in range(s):
        row = []
        for x in range(s):
            # 圆角掩码：四个角外的像素透明
            dx = dy = 0
            if x < radius:
                dx = radius - x
            elif x > s - 1 - radius:
                dx = x - (s - 1 - radius)
            if y < radius:
                dy = radius - y
            elif y > s - 1 - radius:
                dy = y - (s - 1 - radius)
            if dx > 0 and dy > 0 and (dx * dx + dy * dy) > radius * radius:
                row.append((0, 0, 0, 0))
                continue

            col = BG
            if (x - fcx) ** 2 + (y - fcy) ** 2 <= fr * fr:
                col = WHITE
            # 眼睛
            if ((x - (cx - eoff)) ** 2 + (y - ey) ** 2 <= er * er or
                    (x - (cx + eoff)) ** 2 + (y - ey) ** 2 <= er * er):
                col = BLUE
            # 微笑下半弧
            dsq = (x - scx) ** 2 + (y - scy) ** 2
            if y >= scy and s_inner * s_inner <= dsq <= s_outer * s_outer:
                col = BLUE
            row.append(col)
        rows.append(row)
    return rows

os.makedirs('icons', exist_ok=True)
for sz in (192, 512):
    write_png(f'icons/icon-{sz}.png', sz, sz, make(sz))
    print(f'wrote icons/icon-{sz}.png')
