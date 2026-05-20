# AppSec Assessment Workbench — Detailed Sprint Plan

Baseline date: **2026-05-20**

## Completed sprints
- Sprint 1 — Foundation (**DONE**)
- Sprint 2 — Candidate ingest (**DONE**)
- Sprint 3 — Object/Mark/Check APIs (**DONE**)
- Sprint 4 — UI/Extension bootstrap (**DONE**)
- Sprint 5 — Cases/Findings core (**DONE**)
- Sprint 6 — UX baseline polish (**DONE**)
- Sprint 7 — Relations/Evidence slice (**DONE**)
- Sprint 8 — Persistence migration phase 1 (**DONE**)
- Sprint 9 — Dedupe/merge/batch semantics (**DONE**)
- Sprint 10 — Relation validations (**DONE**)
- Sprint 11 — ReviewContext quality upgrade (**DONE**)
- Sprint 12 — Web analyst workflow expansion (**DONE**)
- Sprint 13 — VS Code UX parity expansion (**DONE**)
- Sprint 14 — Automated testing + e2e baseline (**DONE**)
- Sprint 15 — Hardening + release-ready baseline (**DONE**)

## Sprint 14 completion details
- Added backend smoke tests (`tests/test_api_smoke.py`) for core API flow and batch endpoints.
- Added pytest project config (`pyproject.toml`).

## Sprint 15 completion details
- Added domain-error handler scaffold with standard error shape.
- Added audit event recorder and API endpoint (`/api/audit-events`).
- Added audit hooks for key actions:
  - assessment.created
  - asset.created
  - import.created
  - candidate.accepted
  - candidate.rejected
  - candidate.merged

## Release-ready baseline scope statement
- MVP baseline achieved for development/demo release-readiness:
  - runnable backend/web/extension scaffolds,
  - candidate-centric workflow,
  - relation/evidence linking,
  - review context + coverage,
  - persistence path and hardening/test baseline.
