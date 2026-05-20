from uuid import UUID

from app.db.models import AssessmentORM, AssetORM, CandidateORM, ImportBatchORM, ObjectORM, MarkORM, CheckORM, CaseORM, FindingORM, RelationORM, EvidenceORM
from app.db.session import get_session
from app.schemas.asset import AssetCreate, AssetRead, AssetUpdate
from app.schemas.assessment import AssessmentCreate, AssessmentRead, AssessmentUpdate
from app.schemas.case_finding import CaseCreate, CaseRead, FindingCreate, FindingRead
from app.schemas.domain import CandidateAcceptRequest, CandidateRead, ImportBatchRead, ImportCreate, MarkRead, ObjectRead
from app.schemas.relation_evidence import EvidenceCreate, EvidenceRead, RelationCreate, RelationRead
from app.schemas.workflow import CheckCreate, CheckRecord, CheckStatusUpdate, MarkCreate, MarkUpdate, ObjectCreate
from app.services.dedupe import candidate_key, minimal_validation_error


class SqlStore:
    def create_assessment(self, payload: AssessmentCreate) -> AssessmentRead:
        with get_session() as db:
            rec = AssessmentORM(title=payload.title, description=payload.description)
            db.add(rec); db.commit(); db.refresh(rec)
            return AssessmentRead.model_validate({"id": rec.id, "title": rec.title, "description": rec.description, "status": rec.status, "metadata": rec.meta})

    def list_assessments(self) -> list[AssessmentRead]:
        with get_session() as db:
            return [AssessmentRead.model_validate({"id": r.id, "title": r.title, "description": r.description, "status": r.status, "metadata": r.meta}) for r in db.query(AssessmentORM).all()]

    def get_assessment(self, assessment_id: UUID) -> AssessmentRead | None:
        with get_session() as db:
            r = db.get(AssessmentORM, str(assessment_id))
            return None if not r else AssessmentRead.model_validate({"id": r.id, "title": r.title, "description": r.description, "status": r.status, "metadata": r.meta})

    def update_assessment(self, assessment_id: UUID, payload: AssessmentUpdate) -> AssessmentRead | None:
        with get_session() as db:
            r = db.get(AssessmentORM, str(assessment_id))
            if not r:
                return None
            for k, v in payload.model_dump(exclude_unset=True).items():
                setattr(r, k, v)
            db.commit(); db.refresh(r)
            return AssessmentRead.model_validate({"id": r.id, "title": r.title, "description": r.description, "status": r.status, "metadata": r.meta})

    def create_asset(self, assessment_id: UUID, payload: AssetCreate) -> AssetRead:
        with get_session() as db:
            r = AssetORM(assessment_id=str(assessment_id), type=payload.type, name=payload.name, locator=payload.locator, version_ref=payload.version_ref, meta=payload.metadata)
            db.add(r); db.commit(); db.refresh(r)
            return AssetRead.model_validate({"id": r.id, "assessment_id": r.assessment_id, "type": r.type, "name": r.name, "locator": r.locator, "version_ref": r.version_ref, "metadata": r.meta})

    def list_assets(self, assessment_id: UUID) -> list[AssetRead]:
        with get_session() as db:
            rows = db.query(AssetORM).filter(AssetORM.assessment_id == str(assessment_id)).all()
            return [AssetRead.model_validate({"id": r.id, "assessment_id": r.assessment_id, "type": r.type, "name": r.name, "locator": r.locator, "version_ref": r.version_ref, "metadata": r.meta}) for r in rows]

    def get_asset(self, asset_id: UUID) -> AssetRead | None:
        with get_session() as db:
            r = db.get(AssetORM, str(asset_id))
            return None if not r else AssetRead.model_validate({"id": r.id, "assessment_id": r.assessment_id, "type": r.type, "name": r.name, "locator": r.locator, "version_ref": r.version_ref, "metadata": r.meta})

    def update_asset(self, asset_id: UUID, payload: AssetUpdate) -> AssetRead | None:
        with get_session() as db:
            r = db.get(AssetORM, str(asset_id))
            if not r:
                return None
            for k, v in payload.model_dump(exclude_unset=True).items(): setattr(r, k, v)
            db.commit(); db.refresh(r)
            return AssetRead.model_validate({"id": r.id, "assessment_id": r.assessment_id, "type": r.type, "name": r.name, "locator": r.locator, "version_ref": r.version_ref, "metadata": r.meta})

    def create_import(self, assessment_id: UUID, payload: ImportCreate):
        with get_session() as db:
            batch = ImportBatchORM(assessment_id=str(assessment_id), asset_id=str(payload.asset_id) if payload.asset_id else None, source_type=payload.source.source_type, source_name=payload.source.source_name, tool_name=payload.source.tool_name, tool_version=payload.source.tool_version)
            db.add(batch); db.flush()
            duplicates = 0
            errors = 0
            for c in payload.candidates:
                dedupe_key = candidate_key(str(assessment_id), str(c.candidate_type), c.proposed_payload)
                status = "NEW"
                validation_errors = []
                err = minimal_validation_error(CandidateRead(assessment_id=assessment_id, import_batch_id=UUID(batch.id), **c.model_dump()))
                if err:
                    status = "ERROR"
                    errors += 1
                    validation_errors = [err]
                existing = db.query(CandidateORM).filter(CandidateORM.assessment_id == str(assessment_id), CandidateORM.dedupe_key == dedupe_key).first()
                duplicate_of_id = None
                if existing:
                    status = "DUPLICATE"
                    duplicate_of_id = existing.id
                    duplicates += 1
                db.add(CandidateORM(assessment_id=str(assessment_id), import_batch_id=batch.id, candidate_type=c.candidate_type, proposed_object_type=c.proposed_object_type, proposed_payload=c.proposed_payload, confidence=c.confidence, source=c.source, status=status, dedupe_key=dedupe_key, duplicate_of_id=duplicate_of_id, validation_errors=validation_errors))
            db.commit(); db.refresh(batch)
            candidates = db.query(CandidateORM).filter(CandidateORM.import_batch_id == batch.id).all()
            summary = {"candidates_created": len(candidates), "duplicates": duplicates, "errors": errors}
            batch.summary = summary
            db.commit(); db.refresh(batch)
            return ImportBatchRead.model_validate({"id": batch.id, "assessment_id": batch.assessment_id, "asset_id": batch.asset_id, "source_type": batch.source_type, "source_name": batch.source_name, "tool_name": batch.tool_name, "tool_version": batch.tool_version, "status": batch.status, "summary": batch.summary}), [self._candidate_to_schema(x) for x in candidates]

    def list_candidates(self, assessment_id: UUID) -> list[CandidateRead]:
        with get_session() as db:
            return [self._candidate_to_schema(x) for x in db.query(CandidateORM).filter(CandidateORM.assessment_id == str(assessment_id)).all()]

    def get_candidate(self, candidate_id: UUID) -> CandidateRead | None:
        with get_session() as db:
            r = db.get(CandidateORM, str(candidate_id))
            return None if not r else self._candidate_to_schema(r)

    def accept_candidate(self, candidate_id: UUID, payload: CandidateAcceptRequest) -> dict:
        with get_session() as db:
            c = db.get(CandidateORM, str(candidate_id))
            if not c:
                raise KeyError
            if c.status == "ACCEPTED":
                return {"object_ids": [], "mark_ids": [], "relation_ids": [], "check_ids": [], "case_ids": []}
            p = payload.override_payload or c.proposed_payload or {}
            created = {"object_ids": [], "mark_ids": [], "relation_ids": [], "check_ids": [], "case_ids": []}
            if c.candidate_type == "OBJECT":
                obj = ObjectORM(assessment_id=c.assessment_id, asset_id=p.get("asset_id"), type=p.get("type", "UNKNOWN"), kind=p.get("kind", "UNKNOWN"), name=p.get("name", "Unnamed object"), locator=p.get("locator"), range=p.get("range"), properties=p.get("properties", {}), source=c.source)
                db.add(obj); db.flush(); created["object_ids"].append(obj.id)
            if c.candidate_type == "MARK":
                obj_payload = p.get("object", {})
                obj = ObjectORM(assessment_id=c.assessment_id, asset_id=obj_payload.get("asset_id"), type=obj_payload.get("type", "CALLSITE"), kind=obj_payload.get("kind", "UNKNOWN"), name=obj_payload.get("name", p.get("title", "Mark object")), locator=obj_payload.get("locator"), range=obj_payload.get("range"), properties=obj_payload.get("properties", {}), source=c.source)
                db.add(obj); db.flush()
                mk = MarkORM(assessment_id=c.assessment_id, object_id=obj.id, kind=p.get("kind", "NOTE"), title=p.get("title", "Imported mark"), note=p.get("note"), confidence=c.confidence, source=c.source)
                db.add(mk); db.flush()
                created["object_ids"].append(obj.id); created["mark_ids"].append(mk.id)
            if c.candidate_type == "CHECK":
                chk = CheckORM(assessment_id=c.assessment_id, title=p.get("title", "Imported check"), description=p.get("description", ""), category=p.get("category"), check_type=p.get("check_type"), priority=p.get("priority", "MEDIUM"), status=p.get("status", "NOT_STARTED"), reason=p.get("reason"), source=c.source)
                db.add(chk); db.flush(); created["check_ids"].append(chk.id)
            c.status = "ACCEPTED"
            db.commit()
            return created

    def reject_candidate(self, candidate_id: UUID) -> bool:
        with get_session() as db:
            r = db.get(CandidateORM, str(candidate_id))
            if not r:
                return False
            r.status = "REJECTED"
            db.commit()
            return True

    def merge_candidate(self, candidate_id: UUID, target_candidate_id: UUID):
        with get_session() as db:
            c = db.get(CandidateORM, str(candidate_id)); t = db.get(CandidateORM, str(target_candidate_id))
            if not c or not t:
                return None
            if c.assessment_id != t.assessment_id:
                return {"error": "CROSS_ASSESSMENT_MERGE", "message": "Candidates must belong to same assessment", "details": {"candidate_id": c.id, "target_candidate_id": t.id}}
            c.status = "DUPLICATE"; c.duplicate_of_id = t.id
            db.commit()
            return {"candidate_id": c.id, "status": c.status, "duplicate_of_id": c.duplicate_of_id}

    # unchanged helpers + CRUD
    def create_object(self, assessment_id: UUID, payload: ObjectCreate) -> ObjectRead:
        with get_session() as db:
            r = ObjectORM(assessment_id=str(assessment_id), **payload.model_dump()); db.add(r); db.commit(); db.refresh(r); return ObjectRead.model_validate(r.__dict__)
    def create_mark(self, assessment_id: UUID, payload: MarkCreate) -> MarkRead:
        with get_session() as db:
            oid = str(payload.object_id) if payload.object_id else None
            if not oid and payload.object_payload:
                o = ObjectORM(assessment_id=str(assessment_id), **payload.object_payload.model_dump()); db.add(o); db.flush(); oid = o.id
            r = MarkORM(assessment_id=str(assessment_id), object_id=oid, kind=payload.kind, title=payload.title, note=payload.note, confidence=payload.confidence, source=payload.source)
            db.add(r); db.commit(); db.refresh(r); return MarkRead.model_validate(r.__dict__)
    def update_mark(self, mark_id: UUID, payload: MarkUpdate):
        with get_session() as db:
            r = db.get(MarkORM, str(mark_id))
            if not r: return None
            for k,v in payload.model_dump(exclude_unset=True).items(): setattr(r,k,v)
            db.commit(); db.refresh(r); return MarkRead.model_validate(r.__dict__)
    def create_check(self, assessment_id: UUID, payload: CheckCreate):
        with get_session() as db:
            r = CheckORM(assessment_id=str(assessment_id), **payload.model_dump()); db.add(r); db.commit(); db.refresh(r); return CheckRecord.model_validate(r.__dict__)
    def update_check_status(self, check_id: UUID, payload: CheckStatusUpdate):
        with get_session() as db:
            r = db.get(CheckORM, str(check_id))
            if not r: return None
            r.status = payload.status; r.reason = payload.reason; db.commit(); db.refresh(r); return CheckRecord.model_validate(r.__dict__)
    def create_case(self, assessment_id: UUID, payload: CaseCreate):
        with get_session() as db:
            r = CaseORM(assessment_id=str(assessment_id), **payload.model_dump()); db.add(r); db.commit(); db.refresh(r); return CaseRead.model_validate(r.__dict__)
    def create_finding(self, assessment_id: UUID, payload: FindingCreate):
        with get_session() as db:
            r = FindingORM(assessment_id=str(assessment_id), **payload.model_dump()); db.add(r); db.commit(); db.refresh(r); return FindingRead.model_validate(r.__dict__)
    def convert_check_to_finding(self, check_id: UUID, payload: FindingCreate):
        with get_session() as db:
            chk = db.get(CheckORM, str(check_id))
            if not chk or chk.status not in {"FAILED", "CHECKED_WEAK"}: return None
            f = FindingORM(assessment_id=chk.assessment_id, **payload.model_dump()); db.add(f); db.flush(); db.add(RelationORM(assessment_id=chk.assessment_id, subject_type="FINDING", subject_id=f.id, predicate="GENERATED_FROM", object_type="CHECK", object_id=chk.id)); db.commit(); db.refresh(f); return FindingRead.model_validate(f.__dict__)
    def create_relation(self, assessment_id: UUID, payload: RelationCreate):
        with get_session() as db:
            r = RelationORM(assessment_id=str(assessment_id), **payload.model_dump()); db.add(r); db.commit(); db.refresh(r); return RelationRead.model_validate(r.__dict__)
    def create_evidence(self, assessment_id: UUID, payload: EvidenceCreate):
        with get_session() as db:
            e = EvidenceORM(assessment_id=str(assessment_id), title=payload.title, evidence_type=payload.evidence_type, summary=payload.summary, content=payload.content, confidence=payload.confidence, source=payload.source, properties=payload.properties)
            db.add(e); db.flush(); link_ids=[]
            for link in payload.link_to:
                rel = RelationORM(assessment_id=str(assessment_id), subject_type="EVIDENCE", subject_id=e.id, predicate=link.predicate, object_type=link.object_type, object_id=str(link.object_id), source=payload.source)
                db.add(rel); db.flush(); link_ids.append(rel.id)
            db.commit(); db.refresh(e)
            return {"evidence": EvidenceRead.model_validate(e.__dict__), "links_created": link_ids}
    def _candidate_to_schema(self, r: CandidateORM) -> CandidateRead:
        return CandidateRead.model_validate({"id": r.id, "assessment_id": r.assessment_id, "import_batch_id": r.import_batch_id, "candidate_type": r.candidate_type, "proposed_object_type": r.proposed_object_type, "proposed_payload": r.proposed_payload, "confidence": r.confidence, "status": r.status, "dedupe_key": r.dedupe_key, "duplicate_of_id": r.duplicate_of_id, "validation_errors": r.validation_errors, "source": r.source})
    def list_objects(self, assessment_id: UUID):
        with get_session() as db: return [ObjectRead.model_validate(r.__dict__) for r in db.query(ObjectORM).filter(ObjectORM.assessment_id==str(assessment_id)).all()]
    def list_marks(self, assessment_id: UUID):
        with get_session() as db: return [MarkRead.model_validate(r.__dict__) for r in db.query(MarkORM).filter(MarkORM.assessment_id==str(assessment_id)).all()]
    def list_checks(self, assessment_id: UUID):
        with get_session() as db: return [CheckRecord.model_validate(r.__dict__) for r in db.query(CheckORM).filter(CheckORM.assessment_id==str(assessment_id)).all()]
    def list_cases(self, assessment_id: UUID):
        with get_session() as db: return [CaseRead.model_validate(r.__dict__) for r in db.query(CaseORM).filter(CaseORM.assessment_id==str(assessment_id)).all()]
    def list_findings(self, assessment_id: UUID):
        with get_session() as db: return [FindingRead.model_validate(r.__dict__) for r in db.query(FindingORM).filter(FindingORM.assessment_id==str(assessment_id)).all()]
    def list_relations(self, assessment_id: UUID):
        with get_session() as db: return [RelationRead.model_validate(r.__dict__) for r in db.query(RelationORM).filter(RelationORM.assessment_id==str(assessment_id)).all()]
    def list_evidence(self, assessment_id: UUID):
        with get_session() as db: return [EvidenceRead.model_validate(r.__dict__) for r in db.query(EvidenceORM).filter(EvidenceORM.assessment_id==str(assessment_id)).all()]
