# Arabic Font Assets

Self-hosted Noto Arabic fonts for offline-first RTL support.

## Fonts Included

### Noto Sans Arabic (UI text)
- `NotoSansArabic-Regular.woff2` — weight 400
- `NotoSansArabic-Medium.woff2` — weight 500
- `NotoSansArabic-Bold.woff2` — weight 700

### Noto Naskh Arabic (formal/clinical content)
- `NotoNaskhArabic-Regular.woff2` — weight 400
- `NotoNaskhArabic-Bold.woff2` — weight 700

## Subsetting

All fonts are subsetted to include only:
- Arabic: U+0600-U+06FF, U+0750-U+077F, U+08A0-U+08FF, U+FB50-U+FDFF, U+FE70-U+FEFF
- Basic Latin: U+0000-U+007F

Subsetting command (using pyftsubset from fonttools):
```bash
pyftsubset NotoSansArabic-Regular.ttf \
  --output-file=NotoSansArabic-Regular.woff2 \
  --flavor=woff2 \
  --unicodes="U+0000-007F,U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFF"
```

## Source

Downloaded from https://fonts.google.com/noto (SIL Open Font License 1.1)
NOT loaded from Google Fonts CDN at runtime — bundled for offline availability.
