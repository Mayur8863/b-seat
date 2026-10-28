---
'@bseat/api': patch
---

Add the storage module for space photos: put and delete objects in S3-compatible storage and sign short-lived GET URLs in half-TTL windows. New dependencies: `@aws-sdk/client-s3` (put and delete objects) and `@aws-sdk/s3-request-presigner` (SigV4 presigned GET URLs), the standard SDK for S3 and any S3-compatible server (ADR-0011). No endpoint uses it yet.
