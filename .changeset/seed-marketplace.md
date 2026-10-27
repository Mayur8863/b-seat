---
'@bseat/api': patch
---

The dev seed now creates the demo owner and renter (password from `SEED_DEMO_PASSWORD`, at least 12 characters) and claims the existing 001 demo spaces London HQ and Pune Hub in place: it completes them as priced, published listings with cubicles (existing seats keep their ids) and a shared calendar. It runs in one transaction, refuses any `NODE_ENV` but development or test, and never prints the password or driver errors.
