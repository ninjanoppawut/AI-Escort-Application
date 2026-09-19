-- Phase 0 intentionally has no domain fixtures.
-- Add deterministic synthetic identities and records with their owning slice.

-- P14-05A: local and CI databases reject unregistered research events and
-- payload keys so producer drift fails tests (hosted projects never run seed).
insert into private.runtime_flags (key, value)
values ('research_events_strict', 'on');
