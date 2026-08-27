---
category: Fixed
---

Conductor workspace archiving now stops the workspace's CodeGraph daemon, which previously survived worktree removal and stayed resident holding file watchers until reboot.
