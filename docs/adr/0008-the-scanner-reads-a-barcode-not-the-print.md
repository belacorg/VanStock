# ADR-0008: The scanner reads a barcode, not the print

## Status
Accepted

## Context
Putting a hundred parts on the list by hand is the thing most likely to stop this app ever being used, so the camera earns its place on data entry before it earns it on lookup.

The obvious route was optical character recognition: photograph the label, read the GC code and the description off it. Three things were wrong with that.

The first was picking the right number. A dispatch label carries the GC code, a location code, a staff ID, a WMIS number, an S/O number, a tote number and a tracking number. Reading digits is the easy half; knowing which digits matter is the hard half.

The second was conditions. Real photographs of these labels are taken one-handed in a van: heavy perspective skew, glare through the polythene the part is bagged in, crumpled and muddy stock, and labels cut off at the frame edge.

The third was weight. A text recogniser is four to five megabytes. This app opens instantly with no signal, and that is not a property to trade away for a feature used once per part.

An earlier design had the engineer tap out where the GC code sits on the label, once, and cropped the same rectangle from every photograph after. Real photographs killed it: the framing varies far too much, and large items carry a different label layout entirely.

## Decision
Read the barcode at the bottom right of the label. It carries the GC code followed by the staff ID of the engineer the part was picked for — `612340` + `0000001` — so the code comes back exactly rather than probably, and the trailing ID tells that barcode apart from the tracking and tote barcodes beside it.

Nothing is read off the print. The description is typed once, when the part first goes on the list.

The reader is vendored and precached rather than fetched from a CDN, for the same reason the typeface is (ADR-0006).

## Consequences
A read is exact or absent — there is no confidently wrong answer, which is the failure mode that would matter most in a stock list.

The engineer must aim at the barcode rather than the label. Photographed the ordinary way, with the whole box in frame, the GC barcode lands around 300 pixels wide and skewed; across five real photographs exactly one barcode decoded, and it was the large flat tracking code on a return label. Filling the frame with the barcode is several times that resolution. The copy says so, and a failed scan says which of the two mistakes was made — other barcodes read means the wrong one was aimed at, none read means too far away.

Whether that instruction is enough in a cold van in November is not yet known, and cannot be settled from photographs taken for another purpose. It is the first thing to find out in the field.

Reading only the GC code also keeps the customer's name, site and address on these labels out of the app entirely, which is right for a stock list whatever the storage rules say.
