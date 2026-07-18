---
category: Fixed
---

Web CSP connect-src now allows the S3 origin (`https://*.amazonaws.com`) in production, so react-pdf/pdf.js can fetch document preview bytes from presigned S3 URLs; previously only img-src allowed it, silently blocking prod PDF previews (#735)
