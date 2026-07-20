---
category: Added
bump: minor
---

Doklady config backend: document_type table + document_category (9) / document_kind (Druh) enums, number_series gains a config category + Dokladová řada metadata (Název/Poznámka/Popis/Platnost), and reusable @workspace/accounting reads/writes for both config pages — doklad types (listDocumentTypes/getDocumentType/upsertDocumentType/setPrimaryDocumentType/setDocumentTypeActive) and číselné řady (listDocumentSeries/getDocumentSeries/upsertDocumentSeries/upsertNumberSeriesPeriod/deleteNumberSeriesPeriod), with gapless-counter-safe period editing.
