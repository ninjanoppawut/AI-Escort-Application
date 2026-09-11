# Owner Questions Pending

This file collects items the autonomous build could not complete without
external access or an owner decision, and implementation choices made under
existing documents that the owner should confirm. It does not replace
`DECISIONS_AND_QUESTIONS.md`; accepted answers move there with the affected
module, traceability, and roadmap updates in the same change.

Last updated: 2026-09-12.

## Blocked on external access or environment ownership

| Roadmap item | Blocked because | What is needed |
|---|---|---|
| P0-09, P0-EXIT | Production custom SMTP, deployed Auth redirect allowlists, and the environment matrix need the hosted Supabase and deployment accounts. | An environment owner configures custom SMTP and redirect allowlists on the dedicated hosted project, then records staging email delivery evidence. |
| P1-01 | Same hosted Auth configuration as P0-09 (SMTP, redirect allowlists, CAPTCHA/rate policy). | Same as above; local and CI Auth flows already pass against local Supabase and Mailpit. |
| Hosted migrations | Phase 1–4 migrations after the first identity migration are verified locally and in CI but not applied to hosted project `rhntelxdmuvldrxyceqx`. | Owner approval to push migrations to the hosted development project (`supabase db push`). |
| P10 (Gemini) | Requires a Gemini API key, model choice, and budget (DEC-Q003). | Owner provides server-only credentials and approves model and limits. |
| Mapbox map screens (P6, P7, P13) | Requires a Mapbox access token. | Owner provides a restricted public token for development. |

## Pilot blockers already listed in the roadmap

DEC-Q001 consent and target age, DEC-Q002 retention schedule approval,
DEC-Q003 Gemini model and limits, DEC-Q004 taxonomy normalization source,
DEC-Q005 research variables and export fields, and DEC-Q006 service ownership
remain open. No answer was assumed.

## Implementation choices to confirm

These follow existing documents or design artifacts where the canonical
contract was silent. Each can be changed without data loss.

1. **Group invitation lifetime is 24 hours.** Source: design artifact S-08
   (`AI Escort - Forms.dc.html`). The API and database documents define
   expiry but no duration.
2. **Closed group formation also blocks student invitations, acceptances,
   readiness, and leader removals.** PRD §6 describes `forming` as the state
   where membership may change; teachers can still cancel invitations.
3. **Pending invitations count against seats when sending.** A leader can
   hold at most `max_group_size − members` pending invitations (design S-08:
   selections beyond open seats are disabled). Acceptance revalidates
   capacity again.
4. **Accepting one invitation cancels the student's other pending
   invitations in the class** without notifying those leaders; their open
   group screens refresh from the class-group signal.
5. **A group may be marked ready only by its leader, only from `forming`, and
   only at or above minimum size.** A ready group that drops below minimum
   after a removal returns to `forming`.
6. **Leader removal of a member has no notification** because no removal
   notification type exists in `UI_CONTRACTS.md` §4. Adding one needs a
   registry entry and Thai copy.
7. **`expectedGroupVersion` is not part of the transfer request.** Leadership
   is rechecked after the group row lock, so a stale transfer returns
   `NOT_GROUP_LEADER`; no group version column was added.
8. **Design items not implemented because accepted decisions reject them:**
   student "ask the leader to invite me" (D-050) and teacher group creation
   above the maximum with confirmation (D-047).

## Local environment note

During the 2026-09-12 run the local Docker engine stopped responding.
Database, generated-type, and browser verification continued in hosted CI.
Docker Desktop was not force-restarted because other local projects share it;
restarting Docker Desktop restores local `supabase test db`, the PowerShell
race harnesses, and local Playwright runs.
