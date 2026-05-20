from fastapi import APIRouter, HTTPException

router = APIRouter(tags=["mvp-placeholders"])


@router.post("/api/assessments/{assessment_id}/review-context")
def review_context(assessment_id: str) -> dict:
    raise HTTPException(status_code=501, detail="ReviewContext endpoint is planned in next increment")


@router.get("/api/assessments/{assessment_id}/coverage")
def coverage(assessment_id: str) -> dict:
    raise HTTPException(status_code=501, detail="Coverage endpoint is planned in next increment")
