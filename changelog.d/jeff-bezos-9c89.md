---
category: Changed
---

Inspector key-detail fields now persist at their commit boundary (blur / Enter / pick) via a new onCommit, so a save-driven re-render can no longer tear down an open editor mid-edit.
