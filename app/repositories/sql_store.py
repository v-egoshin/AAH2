from uuid import UUID

from app.db.models import AssessmentORM, AssetORM, CandidateORM, ImportBatchORM
from app.db.session import get_session
from app.schemas.asset import AssetCreate, AssetRead, AssetUpdate
from app.schemas.assessment import AssessmentCreate, AssessmentRead, AssessmentUpdate
from app.schemas.domain import CandidateAcceptRequest, CandidateRead, ImportBatchRead, ImportCreate


class SqlStore:
    def create_assessment(self, payload: AssessmentCreate) -> AssessmentRead:
        with get_session() as db:
            rec = AssessmentORM(title=payload.title, description=payload.description)
            db.add(rec); db.commit(); db.refresh(rec)
            return AssessmentRead.model_validate({"id": rec.id, "title": rec.title, "description": rec.description, "status": rec.status, "metadata": rec.metadata})

    def list_assessments(self) -> list[AssessmentRead]:
        with get_session() as db:
            return [AssessmentRead.model_validate({"id": r.id, "title": r.title, "description": r.description, "status": r.status, "metadata": r.metadata}) for r in db.query(AssessmentORM).all()]

    def get_assessment(self, assessment_id: UUID) -> AssessmentRead | None:
        with get_session() as db:
            r = db.get(AssessmentORM, str(assessment_id))
            return None if not r else AssessmentRead.model_validate({"id": r.id, "title": r.title, "description": r.description, "status": r.status, "metadata": r.metadata})

    def update_assessment(self, assessment_id: UUID, payload: AssessmentUpdate) -> AssessmentRead | None:
        with get_session() as db:
            r = db.get(AssessmentORM, str(assessment_id))
            if not r:
                return None
            for k, v in payload.model_dump(exclude_unset=True).items():
                setattr(r, k, v)
            db.commit(); db.refresh(r)
            return AssessmentRead.model_validate({"id": r.id, "title": r.title, "description": r.description, "status": r.status, "metadata": r.metadata})

    def create_asset(self, assessment_id: UUID, payload: AssetCreate) -> AssetRead:
        with get_session() as db:
            r = AssetORM(assessment_id=str(assessment_id), type=payload.type, name=payload.name, locator=payload.locator, version_ref=payload.version_ref, metadata=payload.metadata)
            db.add(r); db.commit(); db.refresh(r)
            return AssetRead.model_validate({"id": r.id, "assessment_id": r.assessment_id, "type": r.type, "name": r.name, "locator": r.locator, "version_ref": r.version_ref, "metadata": r.metadata})

    def list_assets(self, assessment_id: UUID) -> list[AssetRead]:
        with get_session() as db:
            rows = db.query(AssetORM).filter(AssetORM.assessment_id == str(assessment_id)).all()
            return [AssetRead.model_validate({"id": r.id, "assessment_id": r.assessment_id, "type": r.type, "name": r.name, "locator": r.locator, "version_ref": r.version_ref, "metadata": r.metadata}) for r in rows]

    def get_asset(self, asset_id: UUID) -> AssetRead | None:
        with get_session() as db:
            r = db.get(AssetORM, str(asset_id))
            return None if not r else AssetRead.model_validate({"id": r.id, "assessment_id": r.assessment_id, "type": r.type, "name": r.name, "locator": r.locator, "version_ref": r.version_ref, "metadata": r.metadata})

    def update_asset(self, asset_id: UUID, payload: AssetUpdate) -> AssetRead | None:
        with get_session() as db:
            r = db.get(AssetORM, str(asset_id))
            if not r:
                return None
            for k, v in payload.model_dump(exclude_unset=True).items(): setattr(r, k, v)
            db.commit(); db.refresh(r)
            return AssetRead.model_validate({"id": r.id, "assessment_id": r.assessment_id, "type": r.type, "name": r.name, "locator": r.locator, "version_ref": r.version_ref, "metadata": r.metadata})

    def create_import(self, assessment_id: UUID, payload: ImportCreate):
        with get_session() as db:
            batch = ImportBatchORM(assessment_id=str(assessment_id), asset_id=str(payload.asset_id) if payload.asset_id else None, source_type=payload.source.source_type, source_name=payload.source.source_name, tool_name=payload.source.tool_name, tool_version=payload.source.tool_version)
            db.add(batch); db.flush()
            for c in payload.candidates:
                db.add(CandidateORM(assessment_id=str(assessment_id), import_batch_id=batch.id, candidate_type=c.candidate_type, proposed_object_type=c.proposed_object_type, proposed_payload=c.proposed_payload, confidence=c.confidence, source=c.source))
            db.commit(); db.refresh(batch)
            candidates = db.query(CandidateORM).filter(CandidateORM.import_batch_id == batch.id).all()
            summary = {"candidates_created": len(candidates), "duplicates": 0, "errors": 0}
            batch.summary = summary
            db.commit(); db.refresh(batch)
            return ImportBatchRead.model_validate({"id": batch.id, "assessment_id": batch.assessment_id, "asset_id": batch.asset_id, "source_type": batch.source_type, "source_name": batch.source_name, "tool_name": batch.tool_name, "tool_version": batch.tool_version, "status": batch.status, "summary": batch.summary}), [self._candidate_to_schema(x) for x in candidates]

    def list_candidates(self, assessment_id: UUID) -> list[CandidateRead]:
        with get_session() as db:
            rows = db.query(CandidateORM).filter(CandidateORM.assessment_id == str(assessment_id)).all()
            return [self._candidate_to_schema(x) for x in rows]

    def get_candidate(self, candidate_id: UUID) -> CandidateRead | None:
        with get_session() as db:
            r = db.get(CandidateORM, str(candidate_id))
            return None if not r else self._candidate_to_schema(r)

    def accept_candidate(self, candidate_id: UUID, payload: CandidateAcceptRequest) -> dict:
        with get_session() as db:
            r = db.get(CandidateORM, str(candidate_id))
            if not r:
                raise KeyError
            r.status = "ACCEPTED"
            db.commit()
            return {"object_ids": [], "mark_ids": [], "relation_ids": [], "check_ids": [], "case_ids": []}

    def _candidate_to_schema(self, r: CandidateORM) -> CandidateRead:
        return CandidateRead.model_validate({
            "id": r.id,
            "assessment_id": r.assessment_id,
            "import_batch_id": r.import_batch_id,
            "candidate_type": r.candidate_type,
            "proposed_object_type": r.proposed_object_type,
            "proposed_payload": r.proposed_payload,
            "confidence": r.confidence,
            "status": r.status,
            "dedupe_key": r.dedupe_key,
            "duplicate_of_id": r.duplicate_of_id,
            "validation_errors": r.validation_errors,
            "source": r.source,
        })
