from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.assessments import router as assessments_router
from app.api.routes.assets import router as assets_router
from app.api.routes.candidates import router as candidates_router
from app.api.routes.checks import router as checks_router
from app.api.routes.coverage import router as coverage_router
from app.api.routes.cases import router as cases_router
from app.api.routes.findings import router as findings_router
from app.api.routes.relations import router as relations_router
from app.api.routes.mark_kind_catalog import router as mark_kind_catalog_router
from app.api.routes.imports import router as imports_router
from app.api.routes.marks import router as marks_router
from app.api.routes.objects import router as objects_router
from app.api.routes.review_context import router as review_context_router

app = FastAPI(title="AppSec Assessment Workbench", version="0.3.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
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
app.include_router(review_context_router)
app.include_router(mark_kind_catalog_router)
app.include_router(coverage_router)
