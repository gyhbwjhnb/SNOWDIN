import json
import struct
import zlib
from datetime import datetime, UTC
from pathlib import Path


PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
BYTES_PER_PIXEL = 4
ALPHA_THRESHOLD = 8


def paeth_predictor(a: int, b: int, c: int) -> int:
    p = a + b - c
    pa = abs(p - a)
    pb = abs(p - b)
    pc = abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    if pb <= pc:
        return b
    return c


def read_chunks(path: Path) -> tuple[int, int, bytes]:
    with path.open("rb") as file:
        if file.read(8) != PNG_SIGNATURE:
            raise ValueError(f"{path} is not a PNG file")

        width = height = None
        idat_parts: list[bytes] = []

        while True:
            length_bytes = file.read(4)
            if not length_bytes:
                break

            length = struct.unpack(">I", length_bytes)[0]
            chunk_type = file.read(4)
            chunk_data = file.read(length)
            file.read(4)  # CRC

            if chunk_type == b"IHDR":
                width, height, bit_depth, color_type, compression, filter_method, interlace = struct.unpack(
                    ">IIBBBBB",
                    chunk_data,
                )
                if bit_depth != 8 or color_type != 6:
                    raise ValueError(
                        f"{path} must be 8-bit RGBA PNG; got bitDepth={bit_depth}, colorType={color_type}",
                    )
                if compression != 0 or filter_method != 0 or interlace != 0:
                    raise ValueError(f"{path} uses unsupported PNG settings")
            elif chunk_type == b"IDAT":
                idat_parts.append(chunk_data)
            elif chunk_type == b"IEND":
                break

        if width is None or height is None:
            raise ValueError(f"{path} is missing IHDR")

        return width, height, b"".join(idat_parts)


def decode_rgba(path: Path) -> tuple[int, int, bytearray]:
    width, height, compressed = read_chunks(path)
    decompressed = zlib.decompress(compressed)
    stride = width * BYTES_PER_PIXEL
    expected_size = height * (stride + 1)

    if len(decompressed) != expected_size:
        raise ValueError(
            f"{path} decoded to {len(decompressed)} bytes; expected {expected_size}",
        )

    output = bytearray(height * stride)
    previous_row = bytearray(stride)

    for row_index in range(height):
        row_start = row_index * (stride + 1)
        filter_type = decompressed[row_start]
        filtered = decompressed[row_start + 1 : row_start + 1 + stride]
        row = bytearray(stride)

        for column in range(stride):
            left = row[column - BYTES_PER_PIXEL] if column >= BYTES_PER_PIXEL else 0
            up = previous_row[column]
            up_left = previous_row[column - BYTES_PER_PIXEL] if column >= BYTES_PER_PIXEL else 0
            value = filtered[column]

            if filter_type == 0:
                row[column] = value
            elif filter_type == 1:
                row[column] = (value + left) & 0xFF
            elif filter_type == 2:
                row[column] = (value + up) & 0xFF
            elif filter_type == 3:
                row[column] = (value + ((left + up) // 2)) & 0xFF
            elif filter_type == 4:
                row[column] = (value + paeth_predictor(left, up, up_left)) & 0xFF
            else:
                raise ValueError(f"{path} uses unsupported PNG filter type {filter_type}")

        output[row_index * stride : (row_index + 1) * stride] = row
        previous_row = row

    return width, height, output


def extract_hull(path: Path) -> dict:
    width, height, rgba = decode_rgba(path)
    lefts: list[int | None] = [None] * height
    rights: list[int | None] = [None] * height
    top = None
    bottom = None
    bound_left = width
    bound_right = 0

    for y in range(height):
        row_left = None
        row_right = None
        for x in range(width):
            alpha = rgba[(y * width + x) * BYTES_PER_PIXEL + 3]
            if alpha < ALPHA_THRESHOLD:
                continue
            if row_left is None:
                row_left = x
            row_right = x + 1

        lefts[y] = row_left
        rights[y] = row_right

        if row_left is not None and row_right is not None:
            if top is None:
                top = y
            bottom = y + 1
            bound_left = min(bound_left, row_left)
            bound_right = max(bound_right, row_right)

    bounds = None
    if top is not None and bottom is not None:
        bounds = {
            "left": bound_left,
            "top": top,
            "right": bound_right,
            "bottom": bottom,
        }

    direction = path.parent.name
    stem = path.stem
    frame = int("".join(character for character in stem if character.isdigit()) or "0")

    return {
        "path": path.as_posix(),
        "direction": direction,
        "frame": frame,
        "width": width,
        "height": height,
        "alphaThreshold": ALPHA_THRESHOLD,
        "bounds": bounds,
        "lefts": lefts,
        "rights": rights,
    }


def main() -> None:
    root = Path(__file__).resolve().parent.parent
    image_root = root / "img"
    output_path = root / "public" / "sprite-hulls.json"
    frames = sorted(image_root.glob("*/*.png"))

    payload = {
        "generatedAt": datetime.now(UTC).isoformat(),
        "frameCount": len(frames),
        "images": [extract_hull(path.relative_to(root)) for path in frames],
    }

    output_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
