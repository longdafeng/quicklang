# Offline example supplements

`ink-examples-authored.tsv` contains 1,775 original AI-authored bilingual sentences,
one per previously missing source spelling. Columns are source spelling, English
sentence, and Simplified Chinese translation. These are not quotations from Ink or
an external dictionary. The content is distributed under CC BY-SA 4.0.

Run `node scripts/content/import-ink.mjs` to apply the supplements and rebuild the
bundled books. The script validates the pinned upstream source files, then fills
only missing examples. Existing upstream sentences are retained. It fails before
writing output if any word lacks a meaning or bilingual example. No model service
or network request is used during importing or studying.

`ink-spelling-corrections.json` records corrections inferred from source meanings
and obvious misspellings or concatenated dictionary labels. Original spellings,
meanings, IDs and order are preserved as metadata; corrected dictionary phonetics
are used where available. Semantically duplicate source entries are retained to
avoid shifting saved study-session indices.

The generated manifest records SHA-256 checksums for both supplement inputs.
`coverage.json` reports 49,436 entries with examples, including 1,943 filled slots
across the 11 books. All supplemented examples carry `quicklang-ai-authored`, and
the study card labels them as AI-written. Structural validation checks coverage,
bilingual fields and target-word presence; it is not a claim of professional
linguistic review of every original or generated sentence.
