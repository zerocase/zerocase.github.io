# Photography structure

One folder per film roll. Hugo calls these "page bundles": the `index.md` is the
roll's page, and every image sitting next to it becomes a frame on that page.

```
content/photography/
  _index.md          the /photography/ shelf — a cassette per roll
  roll-01/
    index.md         the roll's metadata
    14120003.JPG     drop the scans in here, any name, any order
    14120004.JPG
  roll-02/
    index.md
  ...
```

## Adding a roll's scans

Copy the JPEGs straight into the roll folder. Nothing else to do — no manifest to
update, no image list to maintain. Frames are shown in filename order, so the
scanner's numbering keeps them in the order they were shot.

Sub-folders work too (`roll-15/Scan1/`, `roll-15/Scan2/`); their images are picked
up as part of the same roll.

## Front matter

```yaml
title: "Roll 2"
roll: 2                 # sorts the shelf — highest number first
date: 2020-06-14        # when the roll was SHOT
description: ""         # optional blurb under the title
film: "Kodak Gold 200"  # optional, printed on the cassette label
camera: "Nikon FM2"     # optional, shown beside the roll title
```

`date` is what every frame on the roll shows as its creation date, and with no
date the frame simply shows none. Leave it out
and the gallery falls back to each file's EXIF date — but on lab scans EXIF holds
the *scanner's* clock (a Noritsu stamps the moment it digitised the negative),
not when the shutter fired. Set `date` when you know it.

Note the `roll:` number is what orders the index, not the folder name, so
`roll-26-27-28` sits between 29 and 25 because it carries `roll: 26`.

## How the page works

`/photography/` is a single screen. A column of 35mm cassettes runs down the
left on a fixed selection axis; scrolling that column — wheel, drag, arrow keys,
or clicking a cassette — picks a roll, and that roll's film unrolls to the right
through a tapered leader. The film pans with a drag, the wheel, the arrow keys,
or the buttons at either end, and clicking a frame opens it full size.
`/photography/#roll-12` deep-links straight to a roll.

Each roll also keeps its own page at `/photography/roll-12/` with the same strip.

## Empty rolls

Rolls with no scans in them are left off the shelf — the folders sit in
`content/photography/` waiting, and a roll appears the moment it has photos.
To see the empty ones while you work:

```toml
[params.photography]
  showEmptyRolls = true
```

## Scans that came back wrong

Now and then a roll is scanned upside down or mirrored. `scripts/flip-scans.py`
rotates or mirrors only the frames you name:

```sh
scripts/flip-scans.py roll-02 --rotate 180          # a whole roll
scripts/flip-scans.py roll-05/74300003.JPG --flip h # one frame
scripts/flip-scans.py roll-02 --rotate 180 --dry-run
```

Angles are clockwise, and it edits in place — `--backup` keeps each original
alongside as `<name>.orig`.

It tries jpegtran first, which rearranges the existing JPEG blocks without
decoding them, so the pixels come through untouched. That only works when both
dimensions are a whole number of 16px blocks; 1791x1188 lab scans are not, so
jpegtran runs with `-perfect` and is allowed to refuse rather than silently
shifting the image and scrambling the edges. Whatever it refuses is re-encoded
with Pillow using the scanner's own quantization tables, which costs very little
(mean pixel error under 1 out of 255).

Either way the result is compared against the transform computed separately in
memory before it may replace your original, and a file that does not match is
left exactly as it was. Re-running on already-corrected frames will rotate them
again, so keep track of what you have fixed.

## A note on size

The scans are ~2 MB each. GitHub Pages sites are capped around 1 GB, so a full
archive of every roll at full resolution will not fit — downsize the originals
(1600px on the long edge is plenty, the gallery never displays more) before
committing them. The grid thumbnails Hugo generates are cached in `resources/`
and by the CI cache step, so they are not rebuilt on every push.
