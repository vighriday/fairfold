# Packing photo shot list

This folder holds the 20 packing-photo sets and one inspection photo for the Evidence Agent eval. `expected.json` is the ground truth and says exactly what each set must show.

> **Current photos are SYNTHETIC.** They were drawn by `eval/synthetic-photos.ts` (`pnpm photos:synthetic`), not taken with a camera, and `expected.json` has `"synthetic": true`. The drawn text is cleaner than a real handwritten tag on fabric, so eval scores on these photos overstate real-world accuracy. Before publishing eval numbers:
> 1. replace each file with a real phone photo following the shot list below;
> 2. set `"synthetic": false`.

## Garments

| Id | Garment | Colour | Size label |
|---|---|---|---|
| G1 | Block-print cotton hoodie | navy | M |
| G2 | Hand-block T-shirt | ochre | L |
| G3 | Block-print cotton hoodie | indigo | S |
| G4 | Hand-block T-shirt | white | XL |

Any 4 real garments will do. If yours differ, edit `garments` and each set's `order` in `expected.json` so the colour and size match what is in the photo.

## Each set: `photos/set-NN/` with 4 JPEGs

1. `item.jpg` — the garment laid flat, whole item visible.
2. `size_label.jpg` — the size label, readable.
3. `batch_label.jpg` — a handwritten tag on the garment, e.g. "B17" (the batch in `expected.json`).
4. `sealed_parcel.jpg` — the sealed parcel with a printed label showing the set's `trackingNumber` (e.g. FF100000001).

Sets 01–15 are correct. Sets 16–20 are deliberately wrong:

| Set | What is wrong |
|---|---|
| 16 | Wrong colour: shoot the white T-shirt (G4); the order says ochre (G2) |
| 17 | Wrong size: shoot G1 (label M); the order says L |
| 18 | Missing item: the order has G1 + G2; shoot only G1 |
| 19 | Wrong batch tag: shoot G2 with a tag reading **B18** (the packer will enter B17) |
| 20 | Visible defect: shoot G1 with a visible hole or open seam on the front |

## Inspection photo

`inspection/seam_closeup.jpg`: a close-up of one sleeve seam with a deliberate open stitch.

Keep each photo under 12 MB, JPEG or PNG (no HEIC). Photos of real people's faces or addresses must not appear.
