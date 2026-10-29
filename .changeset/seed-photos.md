---
'@bseat/api': minor
---

The demo seed now attaches credited photos to London HQ (5) and Pune Hub (4) through the same processing and storage path as uploads. It reads only committed local files, adds nothing on a re-run, and stops with a clear message if photo storage is unreachable.
