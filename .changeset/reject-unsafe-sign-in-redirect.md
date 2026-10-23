---
'@bseat/web': patch
'@bseat/api-client': patch
---

Security: after sign-in, the app no longer follows redirect targets that a browser could turn into another site, such as paths with backslashes, control characters or dot segments (for example `/a/..//example.com`). An error response with a malformed JSON body now shows its HTTP status instead of a JSON parse error.
