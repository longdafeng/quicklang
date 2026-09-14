# QuickLang licensing

Profile: clean-room. QuickLang original source, tests, scripts and documentation use Apache-2.0.
Reference repositories are excluded from Git, compilation and packages.
Do not copy GPL/AGPL source, tests or expressive documentation from them.

Ink learning assets remain CC-BY-SA-4.0 and are imported separately with pinned hashes,
license text, attribution and modification notices. No upstream courses or program code are included. Dictionary definitions and bilingual
example sentences are imported as separately licensed learning assets. Preview words are independently authored.

The 11 verified Ink word lists are bundled separately in `src/ui/public/content/ink/`,
with Chinese definitions, phonetics, bilingual sentences, their license, attribution,
source/modification manifest and a coverage report. Sentence source labels are retained,
including Tatoeba attribution under CC BY 2.0 as described in ATTRIBUTION.md. Regenerate them using
`node scripts/content/import-ink.mjs` with the pinned reference checkout available.

QuickLang AI-authored bilingual supplements in `src/content/supplements/` are
distributed under CC BY-SA 4.0, separately from the Apache-2.0 application code.
They are labelled `quicklang-ai-authored` in data and in the study interface.
The import validates complete coverage and preserves existing upstream examples.

Switching to an AGPL-derived implementation requires revisiting the design's section 17,
including Mnemosyne's additional name-display condition. The default source license does not
override the licenses of dependencies or imported content.
