"""Material Icons ligature-aware subsetter (called by subset-material-icons.mjs).

Naive pyftsubset cannot cut this font:
  - --layout-features=liga drops the (rlig-encoded) icon mapping entirely
    -> 476-byte letters-only font, zero icons.
  - --layout-features=rlig WITH letters in --text keeps EVERYTHING: GSUB
    closure adds any ligature whose components survive, and every icon
    name is spelled with a-z/_ -> all ~2 200 glyphs return (119 KB).

So we pre-prune: rewrite each LigatureSubst subtable to contain only the
rules whose letter sequence spells one of the wanted icon names, THEN run
the normal subsetter (closure now only reaches the wanted glyphs).

Usage: python tools/subset_material_icons.py SRC_FONT MANIFEST OUT_FONT
"""

import sys

from fontTools import subset
from fontTools.ttLib import TTFont

LETTERS = "abcdefghijklmnopqrstuvwxyz0123456789_"


def main(src: str, manifest: str, out: str) -> None:
    with open(manifest, encoding="utf-8") as fh:
        names = [ln.strip() for ln in fh if ln.strip() and not ln.startswith("#")]

    font = TTFont(src)
    cmap = font.getBestCmap()
    char2glyph = {chr(cp): g for cp, g in cmap.items()}

    wanted: set[tuple[str, ...]] = set()
    for name in names:
        try:
            wanted.add(tuple(char2glyph[ch] for ch in name))
        except KeyError:
            # a character of the name is not even in the font -> no such
            # ligature can exist; skip (e.g. 'instagram' has no glyph and
            # simply renders as text).
            continue

    kept_rules = 0
    for lookup in font["GSUB"].table.LookupList.Lookup:
        for st in lookup.SubTable:
            ligatures = getattr(st, "ligatures", None)
            if ligatures is None:
                continue
            pruned = {}
            for first, ligs in ligatures.items():
                keep = [
                    lig
                    for lig in ligs
                    if (first, *lig.Component) in wanted
                ]
                if keep:
                    pruned[first] = keep
                    kept_rules += len(keep)
            st.ligatures = pruned

    options = subset.Options()
    options.layout_features = ["rlig", "liga", "ccmp"]
    options.flavor = "woff2"
    options.hinting = False
    options.desubroutinize = True
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(text=LETTERS + " " + " ".join(names))
    subsetter.subset(font)
    font.save(out)

    n_glyphs = font["maxp"].numGlyphs
    print(f"pre-pruned to {kept_rules} ligature rules; subset keeps {n_glyphs} glyphs")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3])
