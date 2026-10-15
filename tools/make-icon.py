"""Generate the Josué App PNG and multi-size Windows ICO using only Python stdlib."""

from math import hypot
from pathlib import Path
import struct
import zlib

SIZE = 256
ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / 'desktop'


def distance_to_segment(x, y, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    amount = max(0, min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)))
    return hypot(x - ax - amount * dx, y - ay - amount * dy)


def inside_rounded_square(x, y, radius=51):
    cx = max(radius, min(SIZE - radius, x))
    cy = max(radius, min(SIZE - radius, y))
    return hypot(x - cx, y - cy) <= radius


def j_points():
    points = [(153, 74), (153, 151)]
    for step in range(1, 33):
        t = step / 32
        u = 1 - t
        points.append((
            u**3 * 153 + 3 * u*u*t * 155 + 3 * u*t*t * 127 + t**3 * 91,
            u**3 * 151 + 3 * u*u*t * 199 + 3 * u*t*t * 217 + t**3 * 195,
        ))
    points.append((76, 178))
    return points


J = j_points()


def foreground(x, y):
    if distance_to_segment(x, y, 129, 74, 178, 74) <= 12:
        return True
    for first, second in zip(J, J[1:]):
        if distance_to_segment(x, y, *first, *second) <= 12:
            return True
    return False


def wave(x, y):
    for center, top, bottom in ((67, 112, 136), (91, 98, 149), (115, 108, 139)):
        if distance_to_segment(x, y, center, top, center, bottom) <= 5:
            return True
    return False


def render():
    pixels = bytearray()
    samples = ((.25, .25), (.75, .25), (.25, .75), (.75, .75))
    for row in range(SIZE):
        for col in range(SIZE):
            channels = [0, 0, 0, 0]
            for sx, sy in samples:
                x, y = col + sx, row + sy
                if not inside_rounded_square(x, y):
                    color = (0, 0, 0, 0)
                elif foreground(x, y):
                    color = (35, 224, 216, 255)
                elif wave(x, y):
                    color = (73, 154, 182, 255)
                elif inside_rounded_square(x, y, 48):
                    color = (19, 32, 44, 255)
                else:
                    color = (41, 70, 82, 255)
                for index, value in enumerate(color):
                    channels[index] += value
            pixels.extend(value // len(samples) for value in channels)
    return bytes(pixels)


def resize(source, size):
    if size == SIZE:
        return source
    pixels = bytearray()
    for y in range(size):
        for x in range(size):
            x0, x1 = x * SIZE // size, (x + 1) * SIZE // size
            y0, y1 = y * SIZE // size, (y + 1) * SIZE // size
            count = (x1 - x0) * (y1 - y0)
            sums = [0, 0, 0, 0]
            for sy in range(y0, y1):
                for sx in range(x0, x1):
                    offset = (sy * SIZE + sx) * 4
                    for channel in range(4):
                        sums[channel] += source[offset + channel]
            pixels.extend(value // count for value in sums)
    return bytes(pixels)


def png_chunk(name, data):
    return struct.pack('>I', len(data)) + name + data + struct.pack('>I', zlib.crc32(name + data))


def encode_png(pixels, size):
    scanlines = b''.join(b'\0' + pixels[row * size * 4:(row + 1) * size * 4] for row in range(size))
    return (b'\x89PNG\r\n\x1a\n' + png_chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
            + png_chunk(b'IDAT', zlib.compress(scanlines, 9)) + png_chunk(b'IEND', b''))


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    master = render()
    images = [(size, encode_png(resize(master, size), size)) for size in (16, 32, 48, 64, 128, 256)]
    (OUTPUT / 'icon.png').write_bytes(images[-1][1])
    offset = 6 + 16 * len(images)
    header = bytearray(struct.pack('<HHH', 0, 1, len(images)))
    for size, data in images:
        header += struct.pack('<BBBBHHII', size % 256, size % 256, 0, 0, 1, 32, len(data), offset)
        offset += len(data)
    (OUTPUT / 'icon.ico').write_bytes(bytes(header) + b''.join(data for _, data in images))


if __name__ == '__main__':
    main()
