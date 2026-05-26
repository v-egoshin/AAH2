from collections.abc import Iterable
import re
from uuid import UUID

from app.models.enums import CandidateStatus, CandidateType, CheckStatus, SourceType
from app.schemas.asset import AssetCreate, AssetRead, AssetUpdate
from app.schemas.assessment import AssessmentCreate, AssessmentRead, AssessmentUpdate
from app.schemas.case_finding import CaseCreate, CaseRead, CaseUpdate, FindingCreate, FindingRead, FindingUpdate
from app.schemas.common import utcnow
from app.schemas.domain import (
    CandidateAcceptRequest,
    CandidateCreate,
    CandidateRead,
    CandidateUpdate,
    ImportBatchRead,
    ImportBatchUpdate,
    ImportCreate,
    MarkRead,
    ObjectRead,
)
from app.schemas.relation_evidence import EvidenceCreate, EvidenceRead, EvidenceUpdate, RelationCreate, RelationRead, RelationUpdate
from app.schemas.workflow import CheckCreate, CheckRecord, CheckStatusUpdate, CheckUpdate, MarkCreate, MarkUpdate, ObjectCreate, ObjectUpdate

_COERCE_MARK_KIND = re.compile(r"^[A-Z][A-Z0-9_]*$")


def _coerce_mark_kind_value(raw: object) -> str:
    s = (raw if isinstance(raw, str) else str(raw or "NOTE")).strip().upper()[:64]
    return s if s and _COERCE_MARK_KIND.match(s) else "NOTE"


def _apply_patch(record: object, changes: dict) -> object:
    for key, value in changes.items():
        setattr(record, key, value)
    if hasattr(record, "updated_at"):
        setattr(record, "updated_at", utcnow())
    return record


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

    def list_assessments(self) -> Iterable[AssessmentRead]:
        return self.assessments.values()

    def get_assessment(self, assessment_id: UUID) -> AssessmentRead | None:
        return self.assessments.get(assessment_id)

    def update_assessment(self, assessment_id: UUID, payload: AssessmentUpdate) -> AssessmentRead | None:
        record = self.assessments.get(assessment_id)
        if not record:
            return None
        return _apply_patch(record, payload.model_dump(exclude_unset=True))

    def delete_assessment(self, assessment_id: UUID) -> bool:
        if assessment_id not in self.assessments:
            return False
        self.assessments.pop(assessment_id, None)
        self.assets = {key: value for key, value in self.assets.items() if value.assessment_id != assessment_id}
        self.imports = {key: value for key, value in self.imports.items() if value.assessment_id != assessment_id}
        self.candidates = {key: value for key, value in self.candidates.items() if value.assessment_id != assessment_id}
        self.objects = {key: value for key, value in self.objects.items() if value.assessment_id != assessment_id}
        self.marks = {key: value for key, value in self.marks.items() if value.assessment_id != assessment_id}
        self.checks = {key: value for key, value in self.checks.items() if value.assessment_id != assessment_id}
        self.cases = {key: value for key, value in self.cases.items() if value.assessment_id != assessment_id}
        self.findings = {key: value for key, value in self.findings.items() if value.assessment_id != assessment_id}
        self.evidence = {key: value for key, value in self.evidence.items() if value.assessment_id != assessment_id}
        self.relations = {key: value for key, value in self.relations.items() if value.assessment_id != assessment_id}
        return True

    def create_asset(self, assessment_id: UUID, payload: AssetCreate) -> AssetRead:
        record = AssetRead(assessment_id=assessment_id, **payload.model_dump())
        self.assets[record.id] = record
        return record

    def list_assets(self, assessment_id: UUID) -> list[AssetRead]:
        return [x for x in self.assets.values() if x.assessment_id == assessment_id]

    def get_asset(self, asset_id: UUID) -> AssetRead | None:
        return self.assets.get(asset_id)

    def update_asset(self, asset_id: UUID, payload: AssetUpdate) -> AssetRead | None:
        record = self.assets.get(asset_id)
        if not record:
            return None
        return _apply_patch(record, payload.model_dump(exclude_unset=True))

    def delete_asset(self, asset_id: UUID) -> bool:
        if asset_id not in self.assets:
            return False
        self.assets.pop(asset_id, None)
        import_ids = {key for key, value in self.imports.items() if value.asset_id == asset_id}
        object_ids = {key for key, value in self.objects.items() if value.asset_id == asset_id}
        mark_ids = {key for key, value in self.marks.items() if value.object_id in object_ids}
        target_ids = {asset_id, *import_ids, *object_ids, *mark_ids}
        self.imports = {key: value for key, value in self.imports.items() if key not in import_ids}
        self.candidates = {key: value for key, value in self.candidates.items() if value.import_batch_id not in import_ids}
        self.objects = {key: value for key, value in self.objects.items() if key not in object_ids}
        self.marks = {key: value for key, value in self.marks.items() if key not in mark_ids}
        self.relations = {
            key: value
            for key, value in self.relations.items()
            if value.subject_id not in target_ids and value.object_id not in target_ids
        }
        return True

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
        for candidate in payload.candidates:
            created.append(self._create_candidate(assessment_id, batch.id, candidate))
        batch.summary = {"candidates_created": len(created), "duplicates": 0, "errors": 0}
        batch.updated_at = utcnow()
        return batch, created

    def list_imports(self, assessment_id: UUID) -> list[ImportBatchRead]:
        return [x for x in self.imports.values() if x.assessment_id == assessment_id]

    def get_import(self, import_batch_id: UUID) -> ImportBatchRead | None:
        return self.imports.get(import_batch_id)

    def update_import(self, import_batch_id: UUID, payload: ImportBatchUpdate) -> ImportBatchRead | None:
        record = self.imports.get(import_batch_id)
        if not record:
            return None
        return _apply_patch(record, payload.model_dump(exclude_unset=True))

    def _create_candidate(self, assessment_id: UUID, import_batch_id: UUID, payload: CandidateCreate) -> CandidateRead:
        record = CandidateRead(assessment_id=assessment_id, import_batch_id=import_batch_id, **payload.model_dump())
        self.candidates[record.id] = record
        return record

    def list_candidates(self, assessment_id: UUID) -> list[CandidateRead]:
        return [x for x in self.candidates.values() if x.assessment_id == assessment_id]

    def get_candidate(self, candidate_id: UUID) -> CandidateRead | None:
        return self.candidates.get(candidate_id)

    def update_candidate(self, candidate_id: UUID, payload: CandidateUpdate) -> CandidateRead | None:
        record = self.candidates.get(candidate_id)
        if not record:
            return None
        return _apply_patch(record, payload.model_dump(exclude_unset=True))

    def reject_candidate(self, candidate_id: UUID) -> CandidateRead | None:
        candidate = self.candidates.get(candidate_id)
        if not candidate:
            return None
        candidate.status = CandidateStatus.REJECTED
        candidate.updated_at = utcnow()
        return candidate

    def create_object(self, assessment_id: UUID, payload: ObjectCreate) -> ObjectRead:
        record = ObjectRead(assessment_id=assessment_id, **payload.model_dump())
        self.objects[record.id] = record
        return record

    def list_objects(self, assessment_id: UUID) -> list[ObjectRead]:
        return [x for x in self.objects.values() if x.assessment_id == assessment_id]

    def get_object(self, object_id: UUID) -> ObjectRead | None:
        return self.objects.get(object_id)

    def update_object(self, object_id: UUID, payload: ObjectUpdate) -> ObjectRead | None:
        record = self.objects.get(object_id)
        if not record:
            return None
        return _apply_patch(record, payload.model_dump(exclude_unset=True))

    def create_mark(self, assessment_id: UUID, payload: MarkCreate) -> MarkRead:
        object_id = payload.object_id
        if object_id is not None and payload.object_payload is not None:
            object_record = self.objects.get(object_id)
            if object_record is not None:
                object_record.properties = {
                    **(object_record.properties or {}),
                    **(payload.object_payload.properties or {}),
                }
                object_record.updated_at = utcnow()
        if object_id is None and payload.object_payload is not None:
            object_id = self.create_object(assessment_id, payload.object_payload).id
        assert object_id is not None
        record = MarkRead(
            assessment_id=assessment_id,
            object_id=object_id,
            kind=payload.kind,
            title=payload.title,
            note=payload.note,
            confidence=payload.confidence,
            source=payload.source,
        )
        self.marks[record.id] = record
        if payload.link_to_candidate_id:
            candidate = self.candidates.get(payload.link_to_candidate_id)
            if candidate:
                candidate.status = CandidateStatus.ACCEPTED
                candidate.updated_at = utcnow()
        return record

    def list_marks(self, assessment_id: UUID) -> list[MarkRead]:
        return [x for x in self.marks.values() if x.assessment_id == assessment_id]

    def get_mark(self, mark_id: UUID) -> MarkRead | None:
        return self.marks.get(mark_id)

    def update_mark(self, mark_id: UUID, payload: MarkUpdate) -> MarkRead | None:
        record = self.marks.get(mark_id)
        if not record:
            return None
        return _apply_patch(record, payload.model_dump(exclude_unset=True))

    def delete_mark(self, mark_id: UUID) -> bool:
        if mark_id not in self.marks:
            return False
        del self.marks[mark_id]
        relation_ids = [
            relation_id
            for relation_id, relation in self.relations.items()
            if relation.subject_id == mark_id or relation.object_id == mark_id
        ]
        for relation_id in relation_ids:
            del self.relations[relation_id]
        return True

    def create_check(self, assessment_id: UUID, payload: CheckCreate) -> CheckRecord:
        record = CheckRecord(assessment_id=assessment_id, **payload.model_dump())
        if record.is_group:
            record.is_checked = False
        if record.is_checked and record.status == CheckStatus.NOT_STARTED:
            record.status = CheckStatus.CHECKED_OK
        self.checks[record.id] = record
        return record

    def list_checks(self, assessment_id: UUID) -> list[CheckRecord]:
        return sorted(
            [x for x in self.checks.values() if x.assessment_id == assessment_id],
            key=lambda item: (item.sort_order, item.created_at),
        )

    def get_check(self, check_id: UUID) -> CheckRecord | None:
        return self.checks.get(check_id)

    def update_check_status(self, check_id: UUID, payload: CheckStatusUpdate) -> CheckRecord | None:
        check = self.checks.get(check_id)
        if not check:
            return None
        check.status = payload.status
        check.reason = payload.reason
        check.updated_at = utcnow()
        return check

    def update_check(self, check_id: UUID, payload: CheckUpdate) -> CheckRecord | None:
        record = self.checks.get(check_id)
        if not record:
            return None
        updated = _apply_patch(record, payload.model_dump(exclude_unset=True))
        if updated.is_group:
            updated.is_checked = False
        return updated

    def delete_check(self, check_id: UUID) -> bool:
        if check_id not in self.checks:
            return False
        to_delete = {check_id}
        changed = True
        while changed:
            changed = False
            for child in list(self.checks.values()):
                if child.parent_check_id in to_delete and child.id not in to_delete:
                    to_delete.add(child.id)
                    changed = True
        for nested_id in to_delete:
            self.checks.pop(nested_id, None)
        relation_ids = [
            relation_id
            for relation_id, relation in self.relations.items()
            if relation.subject_id in to_delete or relation.object_id in to_delete
        ]
        for relation_id in relation_ids:
            del self.relations[relation_id]
        return True

    def create_case(self, assessment_id: UUID, payload: CaseCreate) -> CaseRead:
        record = CaseRead(assessment_id=assessment_id, **payload.model_dump())
        self.cases[record.id] = record
        return record

    def list_cases(self, assessment_id: UUID) -> list[CaseRead]:
        return sorted(
            [x for x in self.cases.values() if x.assessment_id == assessment_id],
            key=lambda item: (item.created_at, str(item.id)),
        )

    def get_case(self, case_id: UUID) -> CaseRead | None:
        return self.cases.get(case_id)

    def update_case(self, case_id: UUID, payload: CaseUpdate) -> CaseRead | None:
        record = self.cases.get(case_id)
        if not record:
            return None
        return _apply_patch(record, payload.model_dump(exclude_unset=True))

    def delete_case(self, case_id: UUID) -> bool:
        if case_id not in self.cases:
            return False
        self.cases.pop(case_id, None)
        self.relations = {
            key: value
            for key, value in self.relations.items()
            if value.subject_id != case_id and value.object_id != case_id
        }
        return True

    def create_finding(self, assessment_id: UUID, payload: FindingCreate) -> FindingRead:
        record = FindingRead(assessment_id=assessment_id, **payload.model_dump())
        self.findings[record.id] = record
        return record

    def list_findings(self, assessment_id: UUID) -> list[FindingRead]:
        return [x for x in self.findings.values() if x.assessment_id == assessment_id]

    def get_finding(self, finding_id: UUID) -> FindingRead | None:
        return self.findings.get(finding_id)

    def update_finding(self, finding_id: UUID, payload: FindingUpdate) -> FindingRead | None:
        record = self.findings.get(finding_id)
        if not record:
            return None
        return _apply_patch(record, payload.model_dump(exclude_unset=True))

    def create_relation(self, assessment_id: UUID, payload: RelationCreate) -> RelationRead:
        record = RelationRead(assessment_id=assessment_id, **payload.model_dump())
        self.relations[record.id] = record
        return record

    def list_relations(self, assessment_id: UUID) -> list[RelationRead]:
        return sorted(
            [x for x in self.relations.values() if x.assessment_id == assessment_id],
            key=lambda item: (item.created_at, str(item.id)),
        )

    def get_relation(self, relation_id: UUID) -> RelationRead | None:
        return self.relations.get(relation_id)

    def update_relation(self, relation_id: UUID, payload: RelationUpdate) -> RelationRead | None:
        record = self.relations.get(relation_id)
        if not record:
            return None
        return _apply_patch(record, payload.model_dump(exclude_unset=True))

    def delete_relation(self, relation_id: UUID) -> bool:
        if relation_id not in self.relations:
            return False
        del self.relations[relation_id]
        return True

    def create_evidence(self, assessment_id: UUID, payload: EvidenceCreate) -> tuple[EvidenceRead, list[RelationRead]]:
        evidence = EvidenceRead(
            assessment_id=assessment_id,
            title=payload.title,
            evidence_type=payload.evidence_type,
            summary=payload.summary,
            content=payload.content,
            confidence=payload.confidence,
            source=payload.source,
            properties=payload.properties,
        )
        self.evidence[evidence.id] = evidence
        links: list[RelationRead] = []
        for link in payload.link_to:
            links.append(
                self.create_relation(
                    assessment_id,
                    RelationCreate(
                        subject_type="EVIDENCE",
                        subject_id=evidence.id,
                        predicate=link.predicate,
                        object_type=link.object_type,
                        object_id=link.object_id,
                        source=payload.source,
                    ),
                )
            )
        return evidence, links

    def list_evidence(self, assessment_id: UUID) -> list[EvidenceRead]:
        return [x for x in self.evidence.values() if x.assessment_id == assessment_id]

    def get_evidence(self, evidence_id: UUID) -> EvidenceRead | None:
        return self.evidence.get(evidence_id)

    def update_evidence(self, evidence_id: UUID, payload: EvidenceUpdate) -> EvidenceRead | None:
        record = self.evidence.get(evidence_id)
        if not record:
            return None
        return _apply_patch(record, payload.model_dump(exclude_unset=True))

    def accept_candidate(self, candidate_id: UUID, payload: CandidateAcceptRequest) -> dict:
        candidate = self.candidates.get(candidate_id)
        if not candidate:
            raise KeyError
        if candidate.status == CandidateStatus.ACCEPTED:
            return {"object_ids": [], "mark_ids": [], "relation_ids": [], "check_ids": [], "case_ids": [], "finding_ids": [], "evidence_ids": []}
        candidate_payload = payload.override_payload or candidate.proposed_payload
        created = {"object_ids": [], "mark_ids": [], "relation_ids": [], "check_ids": [], "case_ids": [], "finding_ids": [], "evidence_ids": []}
        if candidate.candidate_type == CandidateType.OBJECT:
            obj = self.create_object(
                candidate.assessment_id,
                ObjectCreate(
                    asset_id=candidate_payload.get("asset_id"),
                    type=candidate_payload.get("type", "UNKNOWN"),
                    kind=candidate_payload.get("kind", "UNKNOWN"),
                    name=candidate_payload.get("name", "Unnamed object"),
                    locator=candidate_payload.get("locator"),
                    range=candidate_payload.get("range"),
                    properties=candidate_payload.get("properties", {}),
                    source=candidate.source,
                ),
            )
            created["object_ids"].append(obj.id)
        elif candidate.candidate_type == CandidateType.MARK:
            object_payload = candidate_payload.get("object", {})
            obj = self.create_object(
                candidate.assessment_id,
                ObjectCreate(
                    asset_id=object_payload.get("asset_id"),
                    type=object_payload.get("type", "CALLSITE"),
                    kind=object_payload.get("kind", "UNKNOWN"),
                    name=object_payload.get("name", candidate_payload.get("title", "Mark object")),
                    locator=object_payload.get("locator"),
                    range=object_payload.get("range"),
                    properties=object_payload.get("properties", {}),
                    source=candidate.source,
                ),
            )
            mark = self.create_mark(
                candidate.assessment_id,
                MarkCreate(
                    object_id=obj.id,
                    kind=_coerce_mark_kind_value(candidate_payload.get("kind", "NOTE")),
                    title=candidate_payload.get("title", "Imported mark"),
                    note=candidate_payload.get("note"),
                    confidence=candidate.confidence,
                    source=candidate.source,
                ),
            )
            created["object_ids"].append(obj.id)
            created["mark_ids"].append(mark.id)
        elif candidate.candidate_type == CandidateType.CHECK:
            check = self.create_check(
                candidate.assessment_id,
                CheckCreate(
                    title=candidate_payload.get("title", "Imported check"),
                    description=candidate_payload.get("description", ""),
                    category=candidate_payload.get("category"),
                    check_type=candidate_payload.get("check_type"),
                    priority=candidate_payload.get("priority", "MEDIUM"),
                    status=CheckStatus(candidate_payload.get("status", "NOT_STARTED")),
                    reason=candidate_payload.get("reason"),
                    source=candidate.source,
                ),
            )
            created["check_ids"].append(check.id)
        elif candidate.candidate_type == CandidateType.CASE:
            case = self.create_case(
                candidate.assessment_id,
                CaseCreate(
                    title=candidate_payload.get("title", "Imported case"),
                    description=candidate_payload.get("description", ""),
                    severity_hint=candidate_payload.get("severity_hint"),
                    confidence=candidate_payload.get("confidence", candidate.confidence),
                ),
            )
            created["case_ids"].append(case.id)
        elif candidate.candidate_type == CandidateType.EVIDENCE:
            evidence, links = self.create_evidence(
                candidate.assessment_id,
                EvidenceCreate(
                    title=candidate_payload.get("title", "Imported evidence"),
                    evidence_type=candidate_payload.get("evidence_type", "NOTE"),
                    summary=candidate_payload.get("summary", ""),
                    content=candidate_payload.get("content", ""),
                    confidence=candidate_payload.get("confidence", candidate.confidence),
                    source=str(candidate.source),
                    properties=candidate_payload.get("properties", {}),
                    link_to=[],
                ),
            )
            created["evidence_ids"].append(evidence.id)
            created["relation_ids"].extend(link.id for link in links)
        candidate.status = CandidateStatus.ACCEPTED
        candidate.updated_at = utcnow()
        return created

    def convert_check_to_finding(self, check_id: UUID, payload: FindingCreate) -> FindingRead | None:
        check = self.checks.get(check_id)
        if not check or check.status not in {CheckStatus.FAILED, CheckStatus.CHECKED_WEAK}:
            return None
        finding = self.create_finding(check.assessment_id, payload)
        self.create_relation(
            check.assessment_id,
            RelationCreate(subject_type="FINDING", subject_id=finding.id, predicate="GENERATED_FROM", object_type="CHECK", object_id=check.id),
        )
        return finding


store = InMemoryStore()
