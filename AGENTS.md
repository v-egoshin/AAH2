# Execution Status Ledger

## DONE
- Added Alembic baseline config/env + initial migration file.
- Added requirements.txt and updated backend Docker build to use it.
- Preserved runnable docker-compose startup flow.

## PARTIAL DONE
- Alembic migration coverage is baseline-only (full domain schema evolution still pending).
- Test coverage remains baseline.

## Remaining
- Complete full migration chain for all domain tables.
- Expand integration/e2e tests and tighten SQL behavioral parity.

# Agent Implementation Rules

## Product Surfaces
AAH2 has four first-class product surfaces:

1. Backend API: FastAPI routes, schemas, repositories, services, domain errors, audit events.
2. Web UI: React/Vite frontend under `web/`.
3. VS Code extension: analyst workflow under `vscode-extension/`.
4. MCP server: LLM/agent interface under `app/mcp/`.

A domain feature is not complete until all applicable surfaces are updated or explicitly marked as not applicable in the PR summary.

## Source of Truth
- Backend schemas and application services are the canonical domain contract.
- Web, VS Code extension, and MCP must not invent separate domain semantics.
- MCP tools must call the same service layer used by FastAPI routes, not duplicate persistence logic.
- If an operation mutates Objects, Marks, Checks, Cases, Findings, Relations, Evidence, Candidates, Assets, or Assessments, it must use one shared command/service path.

## Required Change Pattern
For every domain change, apply this order:

1. Update backend schema/service/repository logic.
2. Update or add FastAPI route coverage when the operation is user-facing.
3. Update web API client and UI affordance when the operation should be visible in browser workflow.
4. Update VS Code extension command, CodeLens, decoration, tree/panel, or inline action when the operation is code-location-driven.
5. Update MCP tools/resources/prompts when the operation should be available to agents.
6. Add tests for the backend contract and at least one surface-level smoke test or documented manual test.

## MCP Design Rules
- Put MCP code under `app/mcp/`.
- Provide a runnable entrypoint named `aah2-mcp`.
- Support stdio transport for local agent clients.
- Optionally mount Streamable HTTP at `/mcp` for local or remote clients.
- Expose read-only context as MCP resources.
- Expose mutations as MCP tools.
- Expose analyst workflows as MCP prompts.
- Never write logs to stdout in stdio mode; stdout is reserved for MCP JSON-RPC messages.
- Mutating tools must require explicit parameters and must return structured created/updated IDs.
- Dangerous bulk operations must support dry-run mode.

## Minimum MCP Surface
The MCP server should start with these capabilities:

### Resources
- `aah2://assessments/{assessment_id}`
- `aah2://assessments/{assessment_id}/assets`
- `aah2://assessments/{assessment_id}/review-context?file={file}&line={line}`
- `aah2://assessments/{assessment_id}/coverage`
- `aah2://cases/{case_id}`
- `aah2://findings/{finding_id}`

### Tools
- `aah2_create_mark`
- `aah2_create_check`
- `aah2_update_check_status`
- `aah2_accept_candidate`
- `aah2_reject_candidate`
- `aah2_create_case`
- `aah2_create_finding`
- `aah2_create_relation`
- `aah2_attach_evidence`
- `aah2_get_review_context`

### Prompts
- `aah2_triage_candidate`
- `aah2_build_case_from_marks`
- `aah2_review_source_sink_path`
- `aah2_convert_failed_check_to_finding`

## Cross-Surface Parity Matrix
When adding or changing an operation, update this matrix in the PR summary:

| Operation | Backend API | Web | VS Code extension | MCP | Tests |
| --- | --- | --- | --- | --- | --- |
| create mark | required | required | required | required | required |
| create check | required | required | required | required | required |
| update check status | required | required | required | required | required |
| accept/reject candidate | required | required | required | required | required |
| review context | required | required | required | required | required |
| create case | required | required | optional | required | required |
| create finding | required | required | optional | required | required |
| attach evidence | required | required | required | required | required |
| create relation | required | optional | optional | required | required |
| coverage read | required | required | optional | required | required |

## Definition of Done
A change is done only when:

- Backend route/service/repository behavior is implemented.
- Web can perform or display the operation when relevant.
- VS Code extension can perform or display the operation when code-location-driven.
- MCP exposes the same operation as a resource, tool, or prompt.
- Shared schemas/types are updated instead of duplicated ad hoc payloads.
- Tests or documented manual verification cover backend plus at least one UI/agent surface.
- PR summary states which of backend, web, VS Code extension, and MCP were changed.

## Anti-Patterns
- Do not implement MCP as a separate shadow backend.
- Do not add web-only operations without backend and MCP parity review.
- Do not add extension-only commands that call undocumented payloads.
- Do not add write-capable MCP tools without explicit input schema and auditability.
- Do not bypass repository/provider abstractions from UI or MCP code.
- Do not leave `suggested_actions` without a concrete command/tool path when the action is meant to be executable.
