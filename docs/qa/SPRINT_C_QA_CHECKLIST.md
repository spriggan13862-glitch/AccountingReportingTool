# Sprint C — Account Parsing & Matching Engine QA Checklist
Last updated: 2026-06-19

## Acceptance Criteria
- [ ] parse_account_label() handles all 7 separator formats
- [ ] Subaccounts (1000-01) parsed correctly with number as "1000-01"
- [ ] Name-only strings (Total Assets) return number=None
- [ ] Account conflict (1200 AR vs 1200 Inventory) surfaces as CONFLICT, not auto-matched
- [ ] Parent match detected when 1000 exists and 1000-01 is parsed
- [ ] Conflict shown in Mapping Workbench with red chip and conflict_reason text
- [ ] Conflicts filter tab shows only rows with conflict status
