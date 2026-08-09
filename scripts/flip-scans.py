#!/usr/bin/env python3
"""Rotate or mirror selected scans in place.

Lab scans come back wrong now and then — a roll loaded upside down, or a strip
fed through the scanner emulsion-side up. This fixes the ones you name and
leaves everything else alone.

JPEGs are handed to jpegtran first, which rearranges the existing DCT blocks
instead of decoding and re-encoding, so the pixels survive untouched. That only
works when both dimensions are a multiple of the JPEG block size, which most lab
scans are not — 1791x1188 is not — so jpegtran runs with -perfect and is allowed
to refuse. Anything it refuses is re-encoded with Pillow instead.

Either way the result is checked against the transform computed independently in
memory before it is allowed to replace your original. A file that does not match
is left exactly as it was.

    # a whole roll
    scripts/flip-scans.py roll-02 --rotate 180

    # just the frames that are wrong
    scripts/flip-scans.py roll-05/74300003.JPG roll-05/74300007.JPG --flip h

    # see what would happen first
    scripts/flip-scans.py roll-02 --rotate 180 --dry-run

Targets are roll folders or individual files, given either as a path from the
repo root or as a name inside content/photography/.
"""

import argparse
import os
import shutil
import subprocess
import sys
import tempfile

PHOTO_ROOT = os.path.join("content", "photography")
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".tif", ".tiff", ".webp"}
JPEG_EXTS = {".jpg", ".jpeg"}


def resolve(target):
    """Accept 'roll-02', 'content/photography/roll-02', or a path to one file."""
    for candidate in (target, os.path.join(PHOTO_ROOT, target)):
        if os.path.exists(candidate):
            return candidate
    sys.exit(f"error: no such roll or file: {target}")


def collect(targets):
    files = []
    for target in targets:
        path = resolve(target)
        if os.path.isdir(path):
            found = sorted(
                os.path.join(path, name)
                for name in os.listdir(path)
                if os.path.splitext(name)[1].lower() in IMAGE_EXTS
            )
            if not found:
                print(f"  ! {path} holds no images, skipping")
            files.extend(found)
        elif os.path.splitext(path)[1].lower() in IMAGE_EXTS:
            files.append(path)
        else:
            print(f"  ! {path} is not an image, skipping")
    return files


def apply(im, rotate, flip):
    from PIL import Image

    if rotate:
        # PIL rotates anticlockwise; the CLI angle means clockwise.
        return im.transpose({90: Image.ROTATE_270,
                             180: Image.ROTATE_180,
                             270: Image.ROTATE_90}[rotate])
    return im.transpose(Image.FLIP_LEFT_RIGHT if flip == "h"
                        else Image.FLIP_TOP_BOTTOM)


def compare(path, want):
    """How far the written file sits from the intended result.

    Returns (exact, mean_error), or None if it will not decode or is the wrong
    size. Mean error is the discriminator, not peak error: re-encoding a scan
    leaves a mean around 0.6 while single pixels on hard edges still swing 20,
    whereas a misaligned transform means about 22 across the whole frame.
    """
    from PIL import Image, ImageChops

    try:
        with Image.open(path) as im:
            got = im.convert("RGB")
            if got.size != want.size:
                return None
            diff = ImageChops.difference(got, want)
            if diff.getbbox() is None:
                return True, 0.0
            histogram = diff.convert("L").histogram()
            pixels = sum(histogram)
            mean = sum(i * n for i, n in enumerate(histogram)) / pixels
            return False, mean
    except Exception:                       # noqa: BLE001
        return None


def transform_jpeg(path, rotate, flip, want):
    """Lossless block transform. False if jpegtran declined or got it wrong.

    -perfect makes jpegtran refuse rather than silently shifting the image when
    the dimensions are not a whole number of blocks. Without it the edges come
    back scrambled, which is the whole reason this check exists.
    """
    handle, tmp = tempfile.mkstemp(dir=os.path.dirname(path) or ".", suffix=".tmp")
    os.close(handle)
    try:
        args = ["-rotate", str(rotate)] if rotate else \
               ["-flip", "horizontal" if flip == "h" else "vertical"]
        with open(tmp, "wb") as out:
            result = subprocess.run(["jpegtran", "-copy", "all", "-perfect"] + args + [path],
                                    stdout=out, stderr=subprocess.PIPE)
        if result.returncode != 0 or os.path.getsize(tmp) == 0:
            return False
        # Lossless means lossless: accept only a pixel-for-pixel match.
        result = compare(tmp, want)
        if not result or not result[0]:
            return False
        os.replace(tmp, path)
        return True
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)


# Re-encoding a scan lands near 0.6. A transform that is subtly misaligned lands
# above 20. Anything past this is not compression noise.
MAX_MEAN_ERROR = 3.0


def transform_pillow(path, rotate, flip, want):
    from PIL import Image, JpegImagePlugin

    with Image.open(path) as im:
        fmt = im.format
        exif = im.info.get("exif")

        save = {"format": fmt}
        if fmt == "JPEG":
            # Reuse the scanner's own quantization tables and chroma sampling so
            # the re-encode costs as little quality as possible. These have to be
            # read off the source image — "keep" only works when saving the very
            # image that was loaded, not a rotated copy of it.
            save["optimize"] = True
            tables = getattr(im, "quantization", None)
            if tables:
                save["qtables"] = tables
            else:
                save["quality"] = 95
            sampling = JpegImagePlugin.get_sampling(im)
            if sampling in (0, 1, 2):
                save["subsampling"] = sampling
        if exif:
            save["exif"] = exif

        out = apply(im, rotate, flip)

        handle, tmp = tempfile.mkstemp(dir=os.path.dirname(path) or ".", suffix=".tmp")
        os.close(handle)
        try:
            out.save(tmp, **save)

            result = compare(tmp, want)
            if result is None or result[1] > MAX_MEAN_ERROR:
                detail = "unreadable" if result is None else f"mean error {result[1]:.2f}"
                raise RuntimeError(
                    f"result did not match the intended transform ({detail}); "
                    "original left untouched")
            os.replace(tmp, path)
        finally:
            if os.path.exists(tmp):
                os.remove(tmp)


def main():
    parser = argparse.ArgumentParser(
        description="Rotate or mirror selected scans in place.",
        epilog="Angles are clockwise. Editing is in place, so commit first or pass --backup.",
    )
    parser.add_argument("targets", nargs="+", metavar="ROLL-OR-FILE")
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--rotate", type=int, choices=[90, 180, 270],
                        help="rotate clockwise by this many degrees")
    action.add_argument("--flip", choices=["h", "v"],
                        help="mirror horizontally or vertically")
    parser.add_argument("--dry-run", action="store_true",
                        help="list the files that would change, touch nothing")
    parser.add_argument("--backup", action="store_true",
                        help="keep the original alongside as <name>.orig")
    args = parser.parse_args()

    try:
        import PIL  # noqa: F401
    except ImportError:
        sys.exit("error: Pillow is required (pip install pillow)")

    files = collect(args.targets)
    if not files:
        sys.exit("error: nothing to do — no images matched")

    what = f"rotate {args.rotate}° clockwise" if args.rotate else \
           f"flip {'horizontally' if args.flip == 'h' else 'vertically'}"
    print(f"{what}: {len(files)} file{'s' if len(files) != 1 else ''}")

    if args.dry_run:
        for path in files:
            print(f"  would change {path}")
        print("\n(dry run — nothing was written)")
        return

    from PIL import Image

    have_jpegtran = shutil.which("jpegtran") is not None
    if not have_jpegtran:
        print("  note: jpegtran not found, every file will be re-encoded "
              "(install libjpeg-turbo to keep aligned JPEGs lossless)")

    changed = lossless_count = failed = 0
    for path in files:
        if args.backup:
            shutil.copy2(path, path + ".orig")
        try:
            with Image.open(path) as im:
                want = apply(im, args.rotate, args.flip).convert("RGB")

            lossless = False
            if have_jpegtran and os.path.splitext(path)[1].lower() in JPEG_EXTS:
                lossless = transform_jpeg(path, args.rotate, args.flip, want)
            if not lossless:
                transform_pillow(path, args.rotate, args.flip, want)

            changed += 1
            lossless_count += 1 if lossless else 0
            print(f"  {'lossless' if lossless else 're-encoded'}  {path}")
        except Exception as exc:            # noqa: BLE001 - report and keep going
            failed += 1
            print(f"  FAILED    {path}: {exc}")

    print(f"\n{changed}/{len(files)} rewritten "
          f"({lossless_count} lossless, {changed - lossless_count} re-encoded)")
    if failed:
        print(f"{failed} left untouched — see the messages above")
    if changed:
        print("Hugo regenerates the thumbnails on the next build.")


if __name__ == "__main__":
    main()
