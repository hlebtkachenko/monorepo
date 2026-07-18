---
category: Fixed
---

IR→capture adapter: `eventIco` no longer strips a foreign/prefixed identifier (e.g. a Slovak `SK12345678`) down to 8 digits and binds it as a Czech IČO — a value carrying any non-digit is rejected and the counterparty falls through to its DIČ/name, preventing a wrong-but-real Czech partner bind
