# AppSec Assessment Workbench — Detailed Sprint Plan

> Current overall status: **PARTIAL DONE**.
>
> Baseline date: **2026-05-20**.

## Completed so far

### Sprint 1 — Foundation (**DONE**)
- FastAPI bootstrap.
- Assessment + Asset CRUD.

### Sprint 2 — Candidate-first ingest (**DONE**)
- Import batch creation.
- Candidate listing.
- Candidate accept/reject base flow.

### Sprint 3 — Manual marking/checking (**DONE**)
- Object / Mark / Check APIs.
- Check status validation for reason-required statuses.

### Sprint 4 — UI/Extension runnable bootstrap (**DONE**)
- React/Vite scaffold + key pages.
- VS Code extension scaffold + commands/context panel.
- Docker compose one-command startup.

### Sprint 5 — Cases/Findings core (**DONE**)
- Cases + Findings create/list.
- Check -> Finding conversion endpoint.

### Sprint 6 — UX polish baseline (**DONE**)
- Sidebar layout + cleaner visual hierarchy.
- Candidate inbox readability improvements.

### Sprint 7 — Relation/Evidence slice (**DONE**)
- Relations API.
- Evidence API + link creation.
- Coverage/ReviewContext expanded with graph-aware data.

---

## Remaining implementation plan

## Sprint 8 — Persistent storage migration (**PARTIAL DONE**)
**Goal:** replace in-memory store with SQLAlchemy + Alembic.

### Scope
1. Introduce SQLAlchemy models for all current entities.
2. Add Alembic migration setup and initial schema.
3. Add repository/service layer abstraction:
   - `InMemoryStore` kept behind interface for tests/dev.
   - `SqlStore` for runtime.
4. Wire app config for DB URL (`DATABASE_URL`) and store backend selection.
5. Add indexes for core query paths:
   - assessment_id, asset_id, import_batch_id,
   - candidate status/type/source/confidence,
   - relation subject/object,
   - dedupe_key.

### Progress
- DONE: SQLAlchemy baseline, engine/session, ORM for Assessment/Asset, SQL store provider switch.
- NOT DONE: full entity migration and Alembic.

### Definition of Done
- Backend runs with SQLite/Postgres via SQLAlchemy for all entities.
- Existing API endpoints return identical shapes using DB backend.
- Alembic upgrade applies cleanly from empty DB.

### Risks
- Model drift vs existing Pydantic schemas.
- Relation polymorphism complexity.

---

## Sprint 9 — Dedupe + merge + batch semantics (**NOT DONE**)
**Goal:** implement robust candidate dedupe and triage operations.

### Scope
1. Dedupe key calculators for Object/Mark/Relation/Check.
2. Duplicate candidate behavior:
   - mark `DUPLICATE`,
   - create `DUPLICATE_OF` relation.
3. Candidate merge endpoint.
4. Batch accept/reject endpoints with per-item result model.
5. Import validation errors and partial import summaries.

### Definition of Done
- Import creates accurate dedupe status.
- Batch operations return mixed success details without full failure.
- Merge path prevents duplicate accepted artifacts.

---

## Sprint 10 — Full relation convention + validations (**NOT DONE**)
**Goal:** enforce domain relation rules and integrity.

### Scope
1. Predicate compatibility matrix enforcement.
2. Assessment ownership checks for both ends.
3. Strengthen Check/Evidence/Case/Finding linking conventions.
4. Add relation status transitions (candidate/accepted/confirmed/dismissed).

### Definition of Done
- Invalid links rejected with structured domain errors.
- Coverage metrics rely on validated relation graph.

---

## Sprint 11 — ReviewContext quality upgrade (**NOT DONE**)
**Goal:** implement full matching order from spec.

### Scope
1. Match order implementation:
   1) locator exact,
   2) file+range overlap,
   3) symbol match,
   4) file-level,
   5) nearby window.
2. Suggested actions generation.
3. Query optimization for p95 target.

### Definition of Done
- Response includes coherent prioritized context.
- Suggested actions appear for common workflows.

---

## Sprint 12 — Web UI full analyst workflow (**NOT DONE**)
**Goal:** complete primary web analyst UX.

### Scope
1. Pages:
   - Assets,
   - Import History,
   - Candidate Inbox advanced filters/grouping,
   - Objects/Marks explorer,
   - Cases list/detail,
   - Checks list/detail,
   - Findings list/detail,
   - Coverage actionable list.
2. Reusable components (badges, relation list, evidence panel, status controls).
3. Form validation + optimistic updates for safe operations.

### Definition of Done
- End-to-end analyst flow possible from web without API calls by hand.

---

## Sprint 13 — VS Code extension UX parity (**NOT DONE**)
**Goal:** close extension gap vs spec.

### Scope
1. Commands for case/check/evidence create flows.
2. Candidate accept/reject/merge contextual quick-picks.
3. Gutter decorations (S/K/G/T/?).
4. CodeLens summaries and click-through to context panel.
5. Better error/offline handling.

### Definition of Done
- Code review loop in editor supports one-click triage and linking.

---

## Sprint 14 — Automated testing + e2e scenario (**NOT DONE**)
**Goal:** confidence and regression safety.

### Scope
1. Backend tests:
   - service-level unit tests,
   - route integration tests.
2. Web tests (Vitest component + behavior).
3. Extension tests (command wiring, state behavior).
4. E2E happy path (import -> accept -> mark -> relation -> case -> check -> evidence -> fail -> finding).

### Definition of Done
- CI pipeline runs tests and reports coverage.

---

## Sprint 15 — Hardening + release readiness (**NOT DONE**)
**Goal:** production readiness baseline.

### Scope
1. Input sanitization review for UI rendering.
2. Structured audit log events.
3. Performance tuning and pagination hardening.
4. Environment docs and deployment notes.

### Definition of Done
- MVP declared complete with explicit constraints and known limits.

---

## Remaining effort estimate (rough)
- Sprint 8–11 (backend completion): **4 sprints**.
- Sprint 12–13 (UX completion): **2 sprints**.
- Sprint 14–15 (quality/hardening): **2 sprints**.

**Total remaining:** ~**8 focused sprints**.
