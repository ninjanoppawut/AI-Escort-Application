repo: ninjanoppawut/AI-Escort-Application
branch: main
path: docs/

## Last sync

date: 2026-08-03T14:05:00Z

### Original visual design baseline

- Read CLAUDE.md, DECISIONS_AND_QUESTIONS.md, PRODUCT_REQUIREMENTS.md, PLANT_SURVEY_PLUGIN.md as the authoritative product rules.
- Produced the full design phase: brief (IA, flows, screen inventory, visual system, handoff), low-fi wireframes, hi-fi student and teacher screens, clickable prototype.
- The original visual artifacts were produced against accepted decisions D-001…D-045; no business rule in that baseline was simplified for design convenience.
- Two open questions raised (live-location identifiability, cross-student photo visibility) — both privacy-related, documented in the design brief.

## Implementation handoff update — 2026-08-04

Decisions D-046…D-064 and the build-readiness audit add behavior that is not proven by the original visual-artifact manifest. The authoritative written interaction additions are now in:

- `docs/UI_CONTRACTS.md` — full status tokens, notification registry, error mappings, manual plant entry, group unlock/claim reset, cross-class observation list, class member lists, and admin screens;
- `docs/AUTH_IDENTITY_AND_TENANCY.md` — verified email/password, PKCE, teacher provisioning, and admin MFA flows;
- `docs/modules/10-admin-operations.md` — platform-admin operations scope;
- `docs/PRIVACY_RETENTION_AND_RESEARCH.md` — routine versus break-glass data visibility.

If visual artifacts and these written contracts differ, follow the source precedence in `AGENTS.md`. Do not claim a late-decision visual state is implemented until the corresponding application screen and Playwright state exist.

## Screen map

| Deliverable file | Built from |
| --- | --- |
| AI Escort — Design Brief.dc.html | CLAUDE.md, docs/DECISIONS_AND_QUESTIONS.md, docs/PRODUCT_REQUIREMENTS.md |
| AI Escort — Wireframes.dc.html | docs/PRODUCT_REQUIREMENTS.md §4–§17, docs/PLANT_SURVEY_PLUGIN.md |
| AI Escort — Student Hi-Fi.dc.html | docs/PLANT_SURVEY_PLUGIN.md, docs/PRODUCT_REQUIREMENTS.md §5–§14 |
| AI Escort — Teacher Hi-Fi.dc.html | docs/PRODUCT_REQUIREMENTS.md §7–§15, docs/DECISIONS_AND_QUESTIONS.md D-042…D-045 |
| AI Escort — Prototype.dc.html | all of the above (end-to-end student + teacher journeys) |
