from fastapi import FastAPI
from app.api.errors import DomainError, domain_error_handler
from app.audit import audit_events

from app.api.routes.assessments import router as assessments_router
from app.api.routes.assets import router as assets_router
from app.api.routes.candidates import router as candidates_router
from app.api.routes.checks import router as checks_router
from app.api.routes.coverage import router as coverage_router
from app.api.routes.cases import router as cases_router
from app.api.routes.findings import router as findings_router
from app.api.routes.relations import router as relations_router
from app.api.routes.evidence import router as evidence_router
from app.api.routes.imports import router as imports_router
from app.api.routes.marks import router as marks_router
from app.api.routes.objects import router as objects_router
from app.api.routes.review_context import router as review_context_router

app = FastAPI(title="AppSec Assessment Workbench", version="0.3.0")
app.include_router(assessments_router)
app.include_router(assets_router)
app.include_router(imports_router)
app.include_router(candidates_router)
app.include_router(objects_router)
app.include_router(marks_router)
app.include_router(checks_router)
app.include_router(cases_router)
app.include_router(findings_router)
app.include_router(relations_router)
app.include_router(evidence_router)
app.include_router(review_context_router)
app.include_router(coverage_router)


@app.get("/api/audit-events")
def get_audit_events():
    return audit_events

app.add_exception_handler(DomainError, domain_error_handler)
