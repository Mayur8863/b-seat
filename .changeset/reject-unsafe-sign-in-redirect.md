---
'@bseat/web': patch
'@bseat/api-client': patch
---

Security: sign-in no longer follows redirect targets containing backslashes or control characters, which could send users to another site. Error pages no longer crash when the server answers with a non-JSON body.
