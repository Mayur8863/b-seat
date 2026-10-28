---
'@bseat/api'
---

Add image processing for space photos (`sharp`, a direct dependency: it is the only maintained libvips binding with prebuilt binaries and no install script, ADR-0011). It validates by content, rejects animated and out-of-range images, strips metadata and produces WebP card and display variants. Not wired to an endpoint yet.
