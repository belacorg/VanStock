# ADR-0009: The scanner reads the print

## Status
Accepted — supersedes ADR-0008.

## Context
ADR-0008 chose the bottom-right barcode over the printed text, on the grounds that a barcode read is exact. In the field it read nothing: two or three real labels, including with the barcode alone filling the frame.

It also could never have delivered the whole job. The barcode carries the GC code and a staff ID; the description exists only as print. Filling in the description means reading text whatever the barcode does.

Measured against real labels before building, reading the GC code exactly:

| Framing | GC exact |
| --- | --- |
| Whole scene, as photographed | 0/5 |
| Whole label filling the frame | 0/5 |
| Top of the label — GC and Desc lines | 3/5 |

On photographs downscaled to a quarter of phone resolution and not framed for the purpose. With the whole label in view, the tables and barcodes crowd the characters and the reads collapse.

## Decision
Read the print with Tesseract, on the phone. The instruction is to fill the screen with the top of the label and hold it straight.

The GC code is found by its shape — six characters, four or more digits — because the small grey `GC:` and `Desc:` captions are what OCR reads worst. Candidates are scored, since the pick time (`08:27:24`) strips to six digits and sits above the code. The description is the line under it.

This label font's 7 reads as a 1. A read one character off a part already on the van is asked about; anything else goes to the Add sheet with a note to check the number.

The barcode reader was kept at first as a cross-check, and then removed (ADR-0010): it never read in the field, and choosing the right barcode meant storing the pay IDs printed on them.

## Consequences
First field test, on a real phone at full resolution: one read right first time; one read a 7 as a 1, and a clearer retake read it right. That is the expected failure, and the engineer caught it by eye.

The weak spot is a *new* part — not yet on the van, so there is nothing to be one character off, and a misread goes straight into the Add sheet. The note there says to check the number for exactly this reason.

About 7MB loads on the first scan and is kept after. The labels carry customer names and addresses, so nothing is sent off the phone to read them.
