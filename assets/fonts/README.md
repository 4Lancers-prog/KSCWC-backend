# Fonts for PDF rendering

Place a Kannada-capable TrueType font here so the FID PDF embeds it (deterministic, no network):

- `NotoSansKannada-Regular.ttf` — download from Google Fonts (Open Font License).

Without this file the renderer falls back to the system's Kannada font if one is installed,
otherwise Kannada text may not shape correctly in the generated PDF.
