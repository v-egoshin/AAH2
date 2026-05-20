from collections.abc import Iterable
from uuid import UUID

from app.models.enums import CandidateStatus, CandidateType, CheckStatus, MarkKind, SourceType
from app.schemas.asset import AssetCreate, AssetRead, AssetUpdate
from app.schemas.assessment import AssessmentCreate, AssessmentRead, AssessmentUpdate
from app.schemas.common import utcnow
from app.schemas.domain import CandidateAcceptRequest, CandidateCreate, CandidateRead, ImportBatchRead, ImportCreate, MarkRead, ObjectRead
from app.schemas.workflow import CheckCreate, CheckRecord, CheckStatusUpdate, MarkCreate, MarkUpdate, ObjectCreate
from app.schemas.case_finding import CaseCreate, CaseRead, FindingCreate, FindingRead
from app.schemas.relation_evidence import EvidenceCreate, EvidenceRead, RelationCreate, RelationRead
from app.services.dedupe import candidate_key, minimal_validation_error


class InMemoryStore:
    def __init__(self) -> None:
        self.assessments: dict[UUID, AssessmentRead] = {}
        self.assets: dict[UUID, AssetRead] = {}
        self.imports: dict[UUID, ImportBatchRead] = {}
        self.candidates: dict[UUID, CandidateRead] = {}
        self.objects: dict[UUID, ObjectRead] = {}
        self.marks: dict[UUID, MarkRead] = {}
        self.checks: dict[UUID, CheckRecord] = {}
        self.cases: dict[UUID, CaseRead] = {}
        self.findings: dict[UUID, FindingRead] = {}
        self.relations: dict[UUID, RelationRead] = {}
        self.evidence: dict[UUID, EvidenceRead] = {}

    def create_assessment(self, payload: AssessmentCreate) -> AssessmentRead:
        record = AssessmentRead(title=payload.title, description=payload.description)
        self.assessments[record.id] = record
        return record

    def list_assessments(self) -> Iterable[AssessmentRead]: return self.assessments.values()
    def get_assessment(self, assessment_id: UUID) -> AssessmentRead | None: return self.assessments.get(assessment_id)

    def update_assessment(self, assessment_id: UUID, payload: AssessmentUpdate) -> AssessmentRead | None:
        record = self.assessments.get(assessment_id)
        if not record:
            return None
        for key, value in payload.model_dump(exclude_unset=True).items(): setattr(record, key, value)
        record.updated_at = utcnow()
        return record

    def create_asset(self, assessment_id: UUID, payload: AssetCreate) -> AssetRead:
        record = AssetRead(assessment_id=assessment_id, **payload.model_dump())
        self.assets[record.id] = record
        return record

    def list_assets(self, assessment_id: UUID) -> list[AssetRead]: return [x for x in self.assets.values() if x.assessment_id == assessment_id]
    def get_asset(self, asset_id: UUID) -> AssetRead | None: return self.assets.get(asset_id)

    def update_asset(self, asset_id: UUID, payload: AssetUpdate) -> AssetRead | None:
        record = self.assets.get(asset_id)
        if not record:
            return None
        for key, value in payload.model_dump(exclude_unset=True).items(): setattr(record, key, value)
        record.updated_at = utcnow()
        return record

    def create_import(self, assessment_id: UUID, payload: ImportCreate) -> tuple[ImportBatchRead, list[CandidateRead]]:
        batch = ImportBatchRead(
            assessment_id=assessment_id,
            asset_id=payload.asset_id,
            source_type=payload.source.source_type,
            source_name=payload.source.source_name,
            tool_name=payload.source.tool_name,
            tool_version=payload.source.tool_version,
        )
        self.imports[batch.id] = batch
        created: list[CandidateRead] = []
        duplicates = 0
        errors = 0
        for c in payload.candidates:
            cand = self._create_candidate(assessment_id, batch.id, c)
            if cand.status == CandidateStatus.DUPLICATE:
                duplicates += 1
            if cand.status == CandidateStatus.ERROR:
                errors += 1
            created.append(cand)
        batch.summary = {"candidates_created": len(created), "duplicates": duplicates, "errors": errors}
        return batch, created

    def _create_candidate(self, assessment_id: UUID, import_batch_id: UUID, c: CandidateCreate) -> CandidateRead:
        rec = CandidateRead(assessment_id=assessment_id, import_batch_id=import_batch_id, **c.model_dump())
        rec.dedupe_key = candidate_key(str(assessment_id), str(c.candidate_type), rec.proposed_payload)
        err = minimal_validation_error(rec)
        if err:
            rec.status = CandidateStatus.ERROR
            rec.validation_errors = [err]
        existing = next((x for x in self.candidates.values() if x.dedupe_key == rec.dedupe_key), None)
        if existing:
            rec.status = CandidateStatus.DUPLICATE
            rec.duplicate_of_id = existing.id
            self.create_relation(assessment_id, RelationCreate(subject_type="CANDIDATE", subject_id=rec.id, predicate="DUPLICATE_OF", object_type="CANDIDATE", object_id=existing.id, status="ACCEPTED", source=rec.source))
        self.candidates[rec.id] = rec
        return rec

    def list_candidates(self, assessment_id: UUID) -> list[CandidateRead]:
        return [x for x in self.candidates.values() if x.assessment_id == assessment_id]

    def get_candidate(self, candidate_id: UUID) -> CandidateRead | None:
        return self.candidates.get(candidate_id)


    def reject_candidate(self, candidate_id: UUID) -> bool:
        c = self.candidates.get(candidate_id)
        if not c:
            return False
        c.status = CandidateStatus.REJECTED
        c.updated_at = utcnow()
        return True

    def merge_candidate(self, candidate_id: UUID, target_candidate_id: UUID):
        c = self.candidates.get(candidate_id)
        t = self.candidates.get(target_candidate_id)
        if not c or not t:
            return None
        if c.assessment_id != t.assessment_id:
            return {"error": "CROSS_ASSESSMENT_MERGE", "message": "Candidates must belong to same assessment", "details": {"candidate_id": c.id, "target_candidate_id": t.id}}
        c.status = CandidateStatus.DUPLICATE
        c.duplicate_of_id = t.id
        c.updated_at = utcnow()
        return {"candidate_id": c.id, "status": c.status, "duplicate_of_id": c.duplicate_of_id}
    def create_object(self, assessment_id: UUID, payload: ObjectCreate) -> ObjectRead:
        obj = ObjectRead(assessment_id=assessment_id, **payload.model_dump())
        self.objects[obj.id] = obj
        return obj

    def create_mark(self, assessment_id: UUID, payload: MarkCreate) -> MarkRead:
        object_id = payload.object_id
        if object_id is None and payload.object_payload is not None:
            object_id = self.create_object(assessment_id, payload.object_payload).id
        assert object_id is not None
        mark = MarkRead(
            assessment_id=assessment_id,
            object_id=object_id,
            kind=payload.kind,
            title=payload.title,
            note=payload.note,
            confidence=payload.confidence,
            source=payload.source,
        )
        self.marks[mark.id] = mark
        if payload.link_to_candidate_id:
            candidate = self.candidates.get(payload.link_to_candidate_id)
            if candidate:
                candidate.status = CandidateStatus.ACCEPTED
                candidate.updated_at = utcnow()
        return mark

    def update_mark(self, mark_id: UUID, payload: MarkUpdate) -> MarkRead | None:
        mark = self.marks.get(mark_id)
        if not mark:
            return None
        for key, value in payload.model_dump(exclude_unset=True).items():
            setattr(mark, key, value)
        return mark

    def create_check(self, assessment_id: UUID, payload: CheckCreate) -> CheckRecord:
        check = CheckRecord(assessment_id=assessment_id, **payload.model_dump())
        self.checks[check.id] = check
        return check

    def update_check_status(self, check_id: UUID, payload: CheckStatusUpdate) -> CheckRecord | None:
        check = self.checks.get(check_id)
        if not check:
            return None
        check.status = payload.status
        check.reason = payload.reason
        check.updated_at = utcnow()
        return check

    def accept_candidate(self, candidate_id: UUID, payload: CandidateAcceptRequest) -> dict:
        candidate = self.candidates.get(candidate_id)
        if not candidate:
            raise KeyError
        if candidate.status == CandidateStatus.ACCEPTED:
            return {"object_ids": [], "mark_ids": [], "relation_ids": [], "check_ids": [], "case_ids": []}
        p = payload.override_payload or candidate.proposed_payload
        created = {"object_ids": [], "mark_ids": [], "relation_ids": [], "check_ids": [], "case_ids": []}
        if candidate.candidate_type == CandidateType.OBJECT:
            obj = self.create_object(candidate.assessment_id, ObjectCreate(
                asset_id=p.get("asset_id"),
                type=p.get("type", "UNKNOWN"),
                kind=p.get("kind", "UNKNOWN"),
                name=p.get("name", "Unnamed object"),
                locator=p.get("locator"),
                range=p.get("range"),
                properties=p.get("properties", {}),
                source=candidate.source,
            ))
            created["object_ids"].append(obj.id)
        if candidate.candidate_type == CandidateType.MARK:
            obj_payload = p.get("object", {})
            obj = self.create_object(candidate.assessment_id, ObjectCreate(
                asset_id=obj_payload.get("asset_id"),
                type=obj_payload.get("type", "CALLSITE"),
                kind=obj_payload.get("kind", "UNKNOWN"),
                name=obj_payload.get("name", p.get("title", "Mark object")),
                locator=obj_payload.get("locator"),
                range=obj_payload.get("range"),
                properties=obj_payload.get("properties", {}),
                source=candidate.source,
            ))
            mark = self.create_mark(candidate.assessment_id, MarkCreate(
                object_id=obj.id,
                kind=MarkKind(p.get("kind", "NOTE")),
                title=p.get("title", "Imported mark"),
                note=p.get("note"),
                confidence=candidate.confidence,
                source=candidate.source,
            ))
            created["object_ids"].append(obj.id)
            created["mark_ids"].append(mark.id)
        if candidate.candidate_type == CandidateType.CHECK:
            check = self.create_check(candidate.assessment_id, CheckCreate(
                title=p.get("title", "Imported check"),
                description=p.get("description", ""),
                category=p.get("category"),
                check_type=p.get("check_type"),
                priority=p.get("priority", "MEDIUM"),
                status=CheckStatus(p.get("status", "NOT_STARTED")),
                reason=p.get("reason"),
                source=candidate.source,
            ))
            created["check_ids"].append(check.id)
        candidate.status = CandidateStatus.ACCEPTED
        candidate.updated_at = utcnow()
        return created


    def create_relation(self, assessment_id: UUID, payload: RelationCreate) -> RelationRead:
        rel = RelationRead(assessment_id=assessment_id, **payload.model_dump())
        self.relations[rel.id] = rel
        return rel

    def create_evidence(self, assessment_id: UUID, payload: EvidenceCreate) -> tuple[EvidenceRead, list[RelationRead]]:
        ev = EvidenceRead(assessment_id=assessment_id, title=payload.title, evidence_type=payload.evidence_type, summary=payload.summary, content=payload.content, confidence=payload.confidence, source=payload.source, properties=payload.properties)
        self.evidence[ev.id] = ev
        links: list[RelationRead] = []
        for link in payload.link_to:
            links.append(self.create_relation(assessment_id, RelationCreate(subject_type="EVIDENCE", subject_id=ev.id, predicate=link.predicate, object_type=link.object_type, object_id=link.object_id, source=payload.source)))
        return ev, links
    def create_case(self, assessment_id: UUID, payload: CaseCreate) -> CaseRead:
        record = CaseRead(assessment_id=assessment_id, **payload.model_dump())
        self.cases[record.id] = record
        return record

    def create_finding(self, assessment_id: UUID, payload: FindingCreate) -> FindingRead:
        record = FindingRead(assessment_id=assessment_id, **payload.model_dump())
        self.findings[record.id] = record
        return record

    def convert_check_to_finding(self, check_id: UUID, payload: FindingCreate) -> FindingRead | None:
        check = self.checks.get(check_id)
        if not check or check.status not in {CheckStatus.FAILED, CheckStatus.CHECKED_WEAK}:
            return None
        finding = self.create_finding(check.assessment_id, payload)
        self.create_relation(check.assessment_id, RelationCreate(subject_type="FINDING", subject_id=finding.id, predicate="GENERATED_FROM", object_type="CHECK", object_id=check.id))
        return finding


store = InMemoryStore()
