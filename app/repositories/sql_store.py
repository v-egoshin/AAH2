import re
from uuid import UUID, uuid4

from app.db.mark_kind_catalog_model import MarkKindCatalogORM
from app.db.models import (
    AssessmentORM,
    AssetORM,
    CandidateORM,
    CaseORM,
    CheckORM,
    EvidenceORM,
    FindingORM,
    ImportBatchORM,
    MarkORM,
    ObjectORM,
    RelationORM,
)
from app.db.session import get_session
from app.models.enums import CandidateStatus, CandidateType, CheckStatus
from app.repositories.errors import DuplicateNameError
from app.schemas.asset import AssetCreate, AssetRead, AssetUpdate
from app.schemas.assessment import AssessmentCreate, AssessmentRead, AssessmentUpdate
from app.schemas.case_finding import CaseCreate, CaseRead, CaseUpdate, FindingCreate, FindingRead, FindingUpdate
from app.schemas.domain import CandidateAcceptRequest, CandidateRead, CandidateUpdate, ImportBatchRead, ImportBatchUpdate, ImportCreate
from app.schemas.mark_kind_catalog import (
    MarkKindCatalogEntryRead,
    MarkKindCatalogRead,
    MarkKindCatalogReplace,
    default_builtin_entries,
)
from app.schemas.relation_evidence import EvidenceCreate, EvidenceRead, EvidenceUpdate, RelationCreate, RelationRead, RelationUpdate
from app.schemas.workflow import CheckCreate, CheckRecord, CheckStatusUpdate, CheckUpdate, MarkCreate, MarkUpdate, ObjectCreate, ObjectUpdate


class SqlStore:
    def _assessment_to_schema(self, record: AssessmentORM) -> AssessmentRead:
        return AssessmentRead.model_validate(
            {
                "id": record.id,
                "title": record.title,
                "description": record.description,
                "status": record.status,
                "metadata": record.metadata_json,
                "created_at": record.created_at,
                "updated_at": record.updated_at,
            }
        )

    def _asset_to_schema(self, record: AssetORM) -> AssetRead:
        return AssetRead.model_validate(
            {
                "id": record.id,
                "assessment_id": record.assessment_id,
                "type": record.type,
                "name": record.name,
                "locator": record.locator,
                "version_ref": record.version_ref,
                "metadata": record.metadata_json,
                "created_at": record.created_at,
                "updated_at": record.updated_at,
            }
        )

    def _import_to_schema(self, record: ImportBatchORM) -> ImportBatchRead:
        return ImportBatchRead.model_validate(
            {
                "id": record.id,
                "assessment_id": record.assessment_id,
                "asset_id": record.asset_id,
                "source_type": record.source_type,
                "source_name": record.source_name,
                "tool_name": record.tool_name,
                "tool_version": record.tool_version,
                "status": record.status,
                "summary": record.summary,
                "created_at": record.created_at,
                "updated_at": record.updated_at,
            }
        )

    def _candidate_to_schema(self, record: CandidateORM) -> CandidateRead:
        return CandidateRead.model_validate(
            {
                "id": record.id,
                "assessment_id": record.assessment_id,
                "import_batch_id": record.import_batch_id,
                "candidate_type": record.candidate_type,
                "proposed_object_type": record.proposed_object_type,
                "proposed_payload": record.proposed_payload,
                "confidence": record.confidence,
                "status": record.status,
                "dedupe_key": record.dedupe_key,
                "duplicate_of_id": record.duplicate_of_id,
                "validation_errors": record.validation_errors,
                "source": record.source,
                "created_at": record.created_at,
                "updated_at": record.updated_at,
            }
        )

    def _object_to_schema(self, record: ObjectORM):
        from app.schemas.domain import ObjectRead

        return ObjectRead.model_validate(
            {
                "id": record.id,
                "assessment_id": record.assessment_id,
                "asset_id": record.asset_id,
                "type": record.type,
                "kind": record.kind,
                "name": record.name,
                "locator": record.locator,
                "range": record.range_json,
                "properties": record.properties_json,
                "source": record.source,
                "created_at": record.created_at,
                "updated_at": record.updated_at,
            }
        )

    def _mark_to_schema(self, record: MarkORM):
        from app.schemas.domain import MarkRead

        return MarkRead.model_validate(
            {
                "id": record.id,
                "assessment_id": record.assessment_id,
                "object_id": record.object_id,
                "kind": record.kind,
                "title": record.title,
                "note": record.note,
                "confidence": record.confidence,
                "status": record.status,
                "source": record.source,
                "is_dead_end": bool(record.is_dead_end),
                "created_at": record.created_at,
            }
        )

    _MARK_KIND_KEY_RE = re.compile(r"^[A-Z][A-Z0-9_]*$")

    @staticmethod
    def _normalize_import_mark_kind(raw: object) -> str:
        base = raw if isinstance(raw, str) else str(raw or "NOTE")
        key = base.strip().upper()[:64]
        if not key or not SqlStore._MARK_KIND_KEY_RE.match(key):
            return "NOTE"
        return key

    def _seed_mark_kind_catalog_if_empty(self, db, assessment_id_str: str) -> None:
        count = (
            db.query(MarkKindCatalogORM)
            .filter(MarkKindCatalogORM.assessment_id == assessment_id_str)
            .count()
        )
        if count > 0:
            return
        for row in default_builtin_entries():
            db.add(
                MarkKindCatalogORM(
                    id=str(uuid4()),
                    assessment_id=assessment_id_str,
                    kind_key=row["kind_key"],
                    display_label=row["display_label"],
                    enabled=row["enabled"],
                    sort_order=row["sort_order"],
                    color=row["color"],
                    is_builtin=row["is_builtin"],
                ),
            )

    def _assert_mark_kind_enabled(self, db, assessment_id_str: str, kind: str) -> None:
        row = (
            db.query(MarkKindCatalogORM)
            .filter(
                MarkKindCatalogORM.assessment_id == assessment_id_str,
                MarkKindCatalogORM.kind_key == kind,
            )
            .first()
        )
        if row is None:
            msg = f"Unknown mark kind: {kind}"
            raise ValueError(msg)
        if not row.enabled:
            msg = f"Mark kind is disabled: {kind}"
            raise ValueError(msg)

    def _catalog_row_to_read(self, record: MarkKindCatalogORM) -> MarkKindCatalogEntryRead:
        return MarkKindCatalogEntryRead(
            id=UUID(record.id),
            kind_key=record.kind_key,
            display_label=record.display_label,
            enabled=bool(record.enabled),
            sort_order=record.sort_order,
            color=record.color,
            is_builtin=bool(record.is_builtin),
        )

    def get_mark_kind_catalog(self, assessment_id: UUID) -> MarkKindCatalogRead | None:
        with get_session() as db:
            aid = str(assessment_id)
            if db.get(AssessmentORM, aid) is None:
                return None
            self._seed_mark_kind_catalog_if_empty(db, aid)
            db.commit()
            rows = (
                db.query(MarkKindCatalogORM)
                .filter(MarkKindCatalogORM.assessment_id == aid)
                .order_by(MarkKindCatalogORM.sort_order.asc(), MarkKindCatalogORM.kind_key.asc())
                .all()
            )
            return MarkKindCatalogRead(entries=[self._catalog_row_to_read(row) for row in rows])

    def replace_mark_kind_catalog(self, assessment_id: UUID, payload: MarkKindCatalogReplace) -> MarkKindCatalogRead | None:
        with get_session() as db:
            aid = str(assessment_id)
            if db.get(AssessmentORM, aid) is None:
                return None
            db.query(MarkKindCatalogORM).filter(MarkKindCatalogORM.assessment_id == aid).delete(synchronize_session=False)
            for entry in payload.entries:
                db.add(
                    MarkKindCatalogORM(
                        id=str(uuid4()),
                        assessment_id=aid,
                        kind_key=entry.kind_key,
                        display_label=entry.display_label,
                        enabled=entry.enabled,
                        sort_order=entry.sort_order,
                        color=entry.color,
                        is_builtin=entry.is_builtin,
                    ),
                )
            db.commit()
        result = self.get_mark_kind_catalog(assessment_id)
        if result is None:
            msg = "Failed to load catalog after replace"
            raise RuntimeError(msg)
        return result

    def _check_to_schema(self, record: CheckORM) -> CheckRecord:
        return CheckRecord.model_validate(
            {
                "id": record.id,
                "assessment_id": record.assessment_id,
                "title": record.title,
                "description": record.description,
                "category": record.category,
                "check_type": record.check_type,
                "parent_check_id": record.parent_check_id,
                "sort_order": record.sort_order,
                "is_group": record.is_group,
                "is_checked": record.is_checked,
                "priority": record.priority,
                "status": record.status,
                "reason": record.reason,
                "source": record.source,
                "created_at": record.created_at,
                "updated_at": record.updated_at,
            }
        )

    def _case_to_schema(self, record: CaseORM) -> CaseRead:
        return CaseRead.model_validate(
            {
                "id": record.id,
                "assessment_id": record.assessment_id,
                "asset_id": record.asset_id,
                "title": record.title,
                "description": record.description,
                "status": record.status,
                "severity_hint": record.severity_hint,
                "confidence": record.confidence,
                "context_before_lines": getattr(record, "context_before_lines", 10),
                "context_after_lines": getattr(record, "context_after_lines", 10),
                "created_at": record.created_at,
                "updated_at": record.updated_at,
            }
        )

    def _finding_to_schema(self, record: FindingORM) -> FindingRead:
        return FindingRead.model_validate(
            {
                "id": record.id,
                "assessment_id": record.assessment_id,
                "title": record.title,
                "severity": record.severity,
                "status": record.status,
                "finding_type": record.finding_type,
                "description": record.description,
                "impact": record.impact,
                "recommendation": record.recommendation,
                "created_at": record.created_at,
                "updated_at": record.updated_at,
            }
        )

    def _relation_to_schema(self, record: RelationORM) -> RelationRead:
        return RelationRead.model_validate(
            {
                "id": record.id,
                "assessment_id": record.assessment_id,
                "subject_type": record.subject_type,
                "subject_id": record.subject_id,
                "predicate": record.predicate,
                "object_type": record.object_type,
                "object_id": record.object_id,
                "confidence": record.confidence,
                "status": record.status,
                "source": record.source,
                "evidence_summary": record.evidence_summary,
                "properties": record.properties_json,
                "created_at": record.created_at,
                "updated_at": record.updated_at,
            }
        )

    def _evidence_to_schema(self, record: EvidenceORM) -> EvidenceRead:
        return EvidenceRead.model_validate(
            {
                "id": record.id,
                "assessment_id": record.assessment_id,
                "title": record.title,
                "evidence_type": record.evidence_type,
                "summary": record.summary,
                "content": record.content,
                "confidence": record.confidence,
                "source": record.source,
                "properties": record.properties_json,
                "created_at": record.created_at,
                "updated_at": record.updated_at,
            }
        )

    def create_assessment(self, payload: AssessmentCreate) -> AssessmentRead:
        title = (payload.title or "").strip()
        with get_session() as db:
            existing = db.query(AssessmentORM).filter(AssessmentORM.title == title).first()
            if existing is not None:
                raise DuplicateNameError("Assessment", title)
            record = AssessmentORM(title=title, description=payload.description)
            db.add(record)
            db.commit()
            db.refresh(record)
            return self._assessment_to_schema(record)

    def list_assessments(self) -> list[AssessmentRead]:
        with get_session() as db:
            return [self._assessment_to_schema(record) for record in db.query(AssessmentORM).all()]

    def get_assessment(self, assessment_id: UUID) -> AssessmentRead | None:
        with get_session() as db:
            record = db.get(AssessmentORM, str(assessment_id))
            return None if record is None else self._assessment_to_schema(record)

    def update_assessment(self, assessment_id: UUID, payload: AssessmentUpdate) -> AssessmentRead | None:
        with get_session() as db:
            record = db.get(AssessmentORM, str(assessment_id))
            if record is None:
                return None
            changes = payload.model_dump(exclude_unset=True)
            new_title = changes.get("title")
            if new_title is not None:
                new_title = new_title.strip()
                clash = (
                    db.query(AssessmentORM)
                    .filter(AssessmentORM.title == new_title, AssessmentORM.id != record.id)
                    .first()
                )
                if clash is not None:
                    raise DuplicateNameError("Assessment", new_title)
                changes["title"] = new_title
            for key, value in changes.items():
                setattr(record, "metadata_json" if key == "metadata" else key, value)
            db.commit()
            db.refresh(record)
            return self._assessment_to_schema(record)

    def delete_assessment(self, assessment_id: UUID) -> bool:
        assessment_key = str(assessment_id)
        with get_session() as db:
            record = db.get(AssessmentORM, assessment_key)
            if record is None:
                return False
            db.query(RelationORM).filter(RelationORM.assessment_id == assessment_key).delete(synchronize_session=False)
            db.query(EvidenceORM).filter(EvidenceORM.assessment_id == assessment_key).delete(synchronize_session=False)
            db.query(FindingORM).filter(FindingORM.assessment_id == assessment_key).delete(synchronize_session=False)
            db.query(CaseORM).filter(CaseORM.assessment_id == assessment_key).delete(synchronize_session=False)
            db.query(CheckORM).filter(CheckORM.assessment_id == assessment_key).delete(synchronize_session=False)
            db.query(MarkORM).filter(MarkORM.assessment_id == assessment_key).delete(synchronize_session=False)
            db.query(ObjectORM).filter(ObjectORM.assessment_id == assessment_key).delete(synchronize_session=False)
            db.query(CandidateORM).filter(CandidateORM.assessment_id == assessment_key).delete(synchronize_session=False)
            db.query(ImportBatchORM).filter(ImportBatchORM.assessment_id == assessment_key).delete(synchronize_session=False)
            db.query(AssetORM).filter(AssetORM.assessment_id == assessment_key).delete(synchronize_session=False)
            db.delete(record)
            db.commit()
            return True

    def create_asset(self, assessment_id: UUID, payload: AssetCreate) -> AssetRead:
        name = (payload.name or "").strip()
        with get_session() as db:
            existing = (
                db.query(AssetORM)
                .filter(AssetORM.assessment_id == str(assessment_id), AssetORM.name == name)
                .first()
            )
            if existing is not None:
                raise DuplicateNameError("Asset", name, scope=f"assessment {assessment_id}")
            record = AssetORM(
                assessment_id=str(assessment_id),
                type=payload.type,
                name=name,
                locator=payload.locator,
                version_ref=payload.version_ref,
                metadata_json=payload.metadata,
            )
            db.add(record)
            db.commit()
            db.refresh(record)
            return self._asset_to_schema(record)

    def list_assets(self, assessment_id: UUID) -> list[AssetRead]:
        with get_session() as db:
            rows = db.query(AssetORM).filter(AssetORM.assessment_id == str(assessment_id)).all()
            return [self._asset_to_schema(record) for record in rows]

    def get_asset(self, asset_id: UUID) -> AssetRead | None:
        with get_session() as db:
            record = db.get(AssetORM, str(asset_id))
            return None if record is None else self._asset_to_schema(record)

    def update_asset(self, asset_id: UUID, payload: AssetUpdate) -> AssetRead | None:
        with get_session() as db:
            record = db.get(AssetORM, str(asset_id))
            if record is None:
                return None
            changes = payload.model_dump(exclude_unset=True)
            new_name = changes.get("name")
            if new_name is not None:
                new_name = new_name.strip()
                clash = (
                    db.query(AssetORM)
                    .filter(
                        AssetORM.assessment_id == record.assessment_id,
                        AssetORM.name == new_name,
                        AssetORM.id != record.id,
                    )
                    .first()
                )
                if clash is not None:
                    raise DuplicateNameError("Asset", new_name, scope=f"assessment {record.assessment_id}")
                changes["name"] = new_name
            for key, value in changes.items():
                setattr(record, "metadata_json" if key == "metadata" else key, value)
            db.commit()
            db.refresh(record)
            return self._asset_to_schema(record)

    def delete_asset(self, asset_id: UUID) -> bool:
        asset_key = str(asset_id)
        with get_session() as db:
            record = db.get(AssetORM, asset_key)
            if record is None:
                return False
            import_ids = {row.id for row in db.query(ImportBatchORM.id).filter(ImportBatchORM.asset_id == asset_key).all()}
            object_ids = {row.id for row in db.query(ObjectORM.id).filter(ObjectORM.asset_id == asset_key).all()}
            mark_ids = {
                row.id
                for row in db.query(MarkORM.id).filter(MarkORM.object_id.in_(object_ids)).all()
            } if object_ids else set()
            target_ids = {asset_key, *import_ids, *object_ids, *mark_ids}
            if target_ids:
                db.query(RelationORM).filter(
                    (RelationORM.subject_id.in_(target_ids))
                    | (RelationORM.object_id.in_(target_ids))
                ).delete(synchronize_session=False)
            if import_ids:
                db.query(CandidateORM).filter(CandidateORM.import_batch_id.in_(import_ids)).delete(synchronize_session=False)
                db.query(ImportBatchORM).filter(ImportBatchORM.id.in_(import_ids)).delete(synchronize_session=False)
            if mark_ids:
                db.query(MarkORM).filter(MarkORM.id.in_(mark_ids)).delete(synchronize_session=False)
            if object_ids:
                db.query(ObjectORM).filter(ObjectORM.id.in_(object_ids)).delete(synchronize_session=False)
            db.delete(record)
            db.commit()
            return True

    def create_import(self, assessment_id: UUID, payload: ImportCreate):
        with get_session() as db:
            batch = ImportBatchORM(
                assessment_id=str(assessment_id),
                asset_id=str(payload.asset_id) if payload.asset_id else None,
                source_type=payload.source.source_type,
                source_name=payload.source.source_name,
                tool_name=payload.source.tool_name,
                tool_version=payload.source.tool_version,
            )
            db.add(batch)
            db.flush()
            created: list[CandidateORM] = []
            for candidate in payload.candidates:
                record = CandidateORM(
                    assessment_id=str(assessment_id),
                    import_batch_id=batch.id,
                    candidate_type=candidate.candidate_type,
                    proposed_object_type=candidate.proposed_object_type,
                    proposed_payload=candidate.proposed_payload,
                    confidence=candidate.confidence,
                    source=candidate.source,
                )
                db.add(record)
                created.append(record)
            db.flush()
            batch.summary = {"candidates_created": len(created), "duplicates": 0, "errors": 0}
            db.commit()
            db.refresh(batch)
            return self._import_to_schema(batch), [self._candidate_to_schema(record) for record in created]

    def list_imports(self, assessment_id: UUID) -> list[ImportBatchRead]:
        with get_session() as db:
            rows = db.query(ImportBatchORM).filter(ImportBatchORM.assessment_id == str(assessment_id)).all()
            return [self._import_to_schema(record) for record in rows]

    def get_import(self, import_batch_id: UUID) -> ImportBatchRead | None:
        with get_session() as db:
            record = db.get(ImportBatchORM, str(import_batch_id))
            return None if record is None else self._import_to_schema(record)

    def update_import(self, import_batch_id: UUID, payload: ImportBatchUpdate) -> ImportBatchRead | None:
        with get_session() as db:
            record = db.get(ImportBatchORM, str(import_batch_id))
            if record is None:
                return None
            for key, value in payload.model_dump(exclude_unset=True).items():
                setattr(record, key, str(value) if key == "asset_id" and value is not None else value)
            db.commit()
            db.refresh(record)
            return self._import_to_schema(record)

    def list_candidates(self, assessment_id: UUID) -> list[CandidateRead]:
        with get_session() as db:
            rows = db.query(CandidateORM).filter(CandidateORM.assessment_id == str(assessment_id)).all()
            return [self._candidate_to_schema(record) for record in rows]

    def get_candidate(self, candidate_id: UUID) -> CandidateRead | None:
        with get_session() as db:
            record = db.get(CandidateORM, str(candidate_id))
            return None if record is None else self._candidate_to_schema(record)

    def update_candidate(self, candidate_id: UUID, payload: CandidateUpdate) -> CandidateRead | None:
        with get_session() as db:
            record = db.get(CandidateORM, str(candidate_id))
            if record is None:
                return None
            for key, value in payload.model_dump(exclude_unset=True).items():
                setattr(record, key, str(value) if key == "duplicate_of_id" and value is not None else value)
            db.commit()
            db.refresh(record)
            return self._candidate_to_schema(record)

    def reject_candidate(self, candidate_id: UUID) -> CandidateRead | None:
        return self.update_candidate(candidate_id, CandidateUpdate(status=CandidateStatus.REJECTED))

    def create_object(self, assessment_id: UUID, payload: ObjectCreate):
        with get_session() as db:
            record = ObjectORM(
                assessment_id=str(assessment_id),
                asset_id=str(payload.asset_id) if payload.asset_id else None,
                type=payload.type,
                kind=payload.kind,
                name=payload.name,
                locator=payload.locator,
                range_json=payload.range,
                properties_json=payload.properties,
                source=payload.source,
            )
            db.add(record)
            db.commit()
            db.refresh(record)
            return self._object_to_schema(record)

    def list_objects(self, assessment_id: UUID):
        with get_session() as db:
            rows = db.query(ObjectORM).filter(ObjectORM.assessment_id == str(assessment_id)).all()
            return [self._object_to_schema(record) for record in rows]

    def get_object(self, object_id: UUID):
        with get_session() as db:
            record = db.get(ObjectORM, str(object_id))
            return None if record is None else self._object_to_schema(record)

    def update_object(self, object_id: UUID, payload: ObjectUpdate):
        with get_session() as db:
            record = db.get(ObjectORM, str(object_id))
            if record is None:
                return None
            changes = payload.model_dump(exclude_unset=True)
            for key, value in changes.items():
                if key == "asset_id":
                    setattr(record, key, str(value) if value is not None else None)
                elif key == "range":
                    record.range_json = value
                elif key == "properties":
                    record.properties_json = value
                else:
                    setattr(record, key, value)
            db.commit()
            db.refresh(record)
            return self._object_to_schema(record)

    def create_mark(self, assessment_id: UUID, payload: MarkCreate):
        with get_session() as db:
            self._seed_mark_kind_catalog_if_empty(db, str(assessment_id))
            self._assert_mark_kind_enabled(db, str(assessment_id), payload.kind)
            object_id = str(payload.object_id) if payload.object_id else None
            if object_id is not None and payload.object_payload is not None:
                existing_object = db.get(ObjectORM, object_id)
                if existing_object is not None:
                    existing_object.properties_json = {
                        **(existing_object.properties_json or {}),
                        **(payload.object_payload.properties or {}),
                    }
            if object_id is None and payload.object_payload is not None:
                created_object = ObjectORM(
                    assessment_id=str(assessment_id),
                    asset_id=str(payload.object_payload.asset_id) if payload.object_payload.asset_id else None,
                    type=payload.object_payload.type,
                    kind=payload.object_payload.kind,
                    name=payload.object_payload.name,
                    locator=payload.object_payload.locator,
                    range_json=payload.object_payload.range,
                    properties_json=payload.object_payload.properties,
                    source=payload.object_payload.source,
                )
                db.add(created_object)
                db.flush()
                object_id = created_object.id
            record = MarkORM(
                assessment_id=str(assessment_id),
                object_id=object_id,
                kind=payload.kind,
                title=payload.title,
                note=payload.note,
                confidence=payload.confidence,
                source=payload.source,
            )
            db.add(record)
            if payload.link_to_candidate_id:
                candidate = db.get(CandidateORM, str(payload.link_to_candidate_id))
                if candidate is not None:
                    candidate.status = CandidateStatus.ACCEPTED
            db.commit()
            db.refresh(record)
            return self._mark_to_schema(record)

    def list_marks(self, assessment_id: UUID):
        with get_session() as db:
            rows = db.query(MarkORM).filter(MarkORM.assessment_id == str(assessment_id)).all()
            return [self._mark_to_schema(record) for record in rows]

    def get_mark(self, mark_id: UUID):
        with get_session() as db:
            record = db.get(MarkORM, str(mark_id))
            return None if record is None else self._mark_to_schema(record)

    def update_mark(self, mark_id: UUID, payload: MarkUpdate):
        with get_session() as db:
            record = db.get(MarkORM, str(mark_id))
            if record is None:
                return None
            updates = payload.model_dump(exclude_unset=True)
            if "kind" in updates:
                self._seed_mark_kind_catalog_if_empty(db, record.assessment_id)
                self._assert_mark_kind_enabled(db, record.assessment_id, updates["kind"])
            for key, value in updates.items():
                setattr(record, key, value)
            db.commit()
            db.refresh(record)
            return self._mark_to_schema(record)

    def delete_mark(self, mark_id: UUID) -> bool:
        with get_session() as db:
            record = db.get(MarkORM, str(mark_id))
            if record is None:
                return False
            db.query(RelationORM).filter(
                (RelationORM.subject_id == str(mark_id)) | (RelationORM.object_id == str(mark_id)),
            ).delete(synchronize_session=False)
            db.delete(record)
            db.commit()
            return True

    def create_check(self, assessment_id: UUID, payload: CheckCreate) -> CheckRecord:
        with get_session() as db:
            record = CheckORM(assessment_id=str(assessment_id), **payload.model_dump())
            if record.is_group:
                record.is_checked = False
            if record.is_checked and record.status == CheckStatus.NOT_STARTED:
                record.status = CheckStatus.CHECKED_OK
            db.add(record)
            db.commit()
            db.refresh(record)
            return self._check_to_schema(record)

    def list_checks(self, assessment_id: UUID) -> list[CheckRecord]:
        with get_session() as db:
            rows = (
                db.query(CheckORM)
                .filter(CheckORM.assessment_id == str(assessment_id))
                .order_by(CheckORM.sort_order.asc(), CheckORM.created_at.asc())
                .all()
            )
            return [self._check_to_schema(record) for record in rows]

    def get_check(self, check_id: UUID) -> CheckRecord | None:
        with get_session() as db:
            record = db.get(CheckORM, str(check_id))
            return None if record is None else self._check_to_schema(record)

    def update_check_status(self, check_id: UUID, payload: CheckStatusUpdate) -> CheckRecord | None:
        with get_session() as db:
            record = db.get(CheckORM, str(check_id))
            if record is None:
                return None
            record.status = payload.status
            record.reason = payload.reason
            db.commit()
            db.refresh(record)
            return self._check_to_schema(record)

    def update_check(self, check_id: UUID, payload: CheckUpdate) -> CheckRecord | None:
        with get_session() as db:
            record = db.get(CheckORM, str(check_id))
            if record is None:
                return None
            for key, value in payload.model_dump(exclude_unset=True).items():
                setattr(record, key, value)
            if record.is_group:
                record.is_checked = False
            db.commit()
            db.refresh(record)
            return self._check_to_schema(record)

    def delete_check(self, check_id: UUID) -> bool:
        with get_session() as db:
            record = db.get(CheckORM, str(check_id))
            if record is None:
                return False
            to_delete = {str(check_id)}
            changed = True
            while changed:
                changed = False
                child_ids = {
                    row.id
                    for row in db.query(CheckORM.id).filter(CheckORM.parent_check_id.in_(to_delete)).all()
                    if row.id not in to_delete
                }
                if child_ids:
                    to_delete.update(child_ids)
                    changed = True
            db.query(RelationORM).filter(
                (RelationORM.subject_id.in_(to_delete))
                | (RelationORM.object_id.in_(to_delete))
            ).delete(synchronize_session=False)
            db.query(CheckORM).filter(CheckORM.id.in_(to_delete)).delete(synchronize_session=False)
            db.commit()
            return True

    def create_case(self, assessment_id: UUID, payload: CaseCreate) -> CaseRead:
        with get_session() as db:
            values = payload.model_dump()
            values["asset_id"] = str(values["asset_id"])
            title = (values.get("title") or "").strip()
            values["title"] = title
            existing = (
                db.query(CaseORM)
                .filter(CaseORM.assessment_id == str(assessment_id), CaseORM.title == title)
                .first()
            )
            if existing is not None:
                raise DuplicateNameError("Case", title, scope=f"assessment {assessment_id}")
            record = CaseORM(assessment_id=str(assessment_id), **values)
            db.add(record)
            db.commit()
            db.refresh(record)
            return self._case_to_schema(record)

    def list_cases(self, assessment_id: UUID) -> list[CaseRead]:
        with get_session() as db:
            rows = (
                db.query(CaseORM)
                .filter(CaseORM.assessment_id == str(assessment_id))
                .order_by(CaseORM.created_at.asc(), CaseORM.id.asc())
                .all()
            )
            return [self._case_to_schema(record) for record in rows]

    def get_case(self, case_id: UUID) -> CaseRead | None:
        with get_session() as db:
            record = db.get(CaseORM, str(case_id))
            return None if record is None else self._case_to_schema(record)

    def update_case(self, case_id: UUID, payload: CaseUpdate) -> CaseRead | None:
        with get_session() as db:
            record = db.get(CaseORM, str(case_id))
            if record is None:
                return None
            changes = payload.model_dump(exclude_unset=True)
            new_title = changes.get("title")
            if new_title is not None:
                new_title = new_title.strip()
                clash = (
                    db.query(CaseORM)
                    .filter(
                        CaseORM.assessment_id == record.assessment_id,
                        CaseORM.title == new_title,
                        CaseORM.id != record.id,
                    )
                    .first()
                )
                if clash is not None:
                    raise DuplicateNameError("Case", new_title, scope=f"assessment {record.assessment_id}")
                changes["title"] = new_title
            for key, value in changes.items():
                setattr(record, key, str(value) if key == "asset_id" and value is not None else value)
            db.commit()
            db.refresh(record)
            return self._case_to_schema(record)

    def delete_case(self, case_id: UUID) -> bool:
        case_key = str(case_id)
        with get_session() as db:
            record = db.get(CaseORM, case_key)
            if record is None:
                return False
            db.query(RelationORM).filter(
                (RelationORM.subject_id == case_key) | (RelationORM.object_id == case_key),
            ).delete(synchronize_session=False)
            db.delete(record)
            db.commit()
            return True

    def create_finding(self, assessment_id: UUID, payload: FindingCreate) -> FindingRead:
        with get_session() as db:
            record = FindingORM(assessment_id=str(assessment_id), **payload.model_dump())
            db.add(record)
            db.commit()
            db.refresh(record)
            return self._finding_to_schema(record)

    def list_findings(self, assessment_id: UUID) -> list[FindingRead]:
        with get_session() as db:
            rows = db.query(FindingORM).filter(FindingORM.assessment_id == str(assessment_id)).all()
            return [self._finding_to_schema(record) for record in rows]

    def get_finding(self, finding_id: UUID) -> FindingRead | None:
        with get_session() as db:
            record = db.get(FindingORM, str(finding_id))
            return None if record is None else self._finding_to_schema(record)

    def update_finding(self, finding_id: UUID, payload: FindingUpdate) -> FindingRead | None:
        with get_session() as db:
            record = db.get(FindingORM, str(finding_id))
            if record is None:
                return None
            for key, value in payload.model_dump(exclude_unset=True).items():
                setattr(record, key, value)
            db.commit()
            db.refresh(record)
            return self._finding_to_schema(record)

    def create_relation(self, assessment_id: UUID, payload: RelationCreate) -> RelationRead:
        with get_session() as db:
            record = RelationORM(
                assessment_id=str(assessment_id),
                subject_type=payload.subject_type,
                subject_id=str(payload.subject_id),
                predicate=payload.predicate,
                object_type=payload.object_type,
                object_id=str(payload.object_id),
                confidence=payload.confidence,
                status=payload.status,
                source=payload.source,
                evidence_summary=payload.evidence_summary,
                properties_json=payload.properties,
            )
            db.add(record)
            db.commit()
            db.refresh(record)
            return self._relation_to_schema(record)

    def list_relations(self, assessment_id: UUID) -> list[RelationRead]:
        with get_session() as db:
            rows = (
                db.query(RelationORM)
                .filter(RelationORM.assessment_id == str(assessment_id))
                .order_by(RelationORM.created_at.asc(), RelationORM.id.asc())
                .all()
            )
            return [self._relation_to_schema(record) for record in rows]

    def get_relation(self, relation_id: UUID) -> RelationRead | None:
        with get_session() as db:
            record = db.get(RelationORM, str(relation_id))
            return None if record is None else self._relation_to_schema(record)

    def update_relation(self, relation_id: UUID, payload: RelationUpdate) -> RelationRead | None:
        with get_session() as db:
            record = db.get(RelationORM, str(relation_id))
            if record is None:
                return None
            changes = payload.model_dump(exclude_unset=True)
            for key, value in changes.items():
                if key == "properties":
                    record.properties_json = value
                elif key in {"subject_id", "object_id"}:
                    setattr(record, key, str(value) if value is not None else None)
                else:
                    setattr(record, key, value)
            db.commit()
            db.refresh(record)
            return self._relation_to_schema(record)

    def delete_relation(self, relation_id: UUID) -> bool:
        with get_session() as db:
            record = db.get(RelationORM, str(relation_id))
            if record is None:
                return False
            db.delete(record)
            db.commit()
            return True

    def create_evidence(self, assessment_id: UUID, payload: EvidenceCreate) -> tuple[EvidenceRead, list[RelationRead]]:
        with get_session() as db:
            evidence = EvidenceORM(
                assessment_id=str(assessment_id),
                title=payload.title,
                evidence_type=payload.evidence_type,
                summary=payload.summary,
                content=payload.content,
                confidence=payload.confidence,
                source=payload.source,
                properties_json=payload.properties,
            )
            db.add(evidence)
            db.flush()
            links: list[RelationORM] = []
            for link in payload.link_to:
                relation = RelationORM(
                    assessment_id=str(assessment_id),
                    subject_type="EVIDENCE",
                    subject_id=evidence.id,
                    predicate=link.predicate,
                    object_type=link.object_type,
                    object_id=str(link.object_id),
                    source=payload.source,
                )
                db.add(relation)
                links.append(relation)
            db.commit()
            db.refresh(evidence)
            return self._evidence_to_schema(evidence), [self._relation_to_schema(relation) for relation in links]

    def list_evidence(self, assessment_id: UUID) -> list[EvidenceRead]:
        with get_session() as db:
            rows = db.query(EvidenceORM).filter(EvidenceORM.assessment_id == str(assessment_id)).all()
            return [self._evidence_to_schema(record) for record in rows]

    def get_evidence(self, evidence_id: UUID) -> EvidenceRead | None:
        with get_session() as db:
            record = db.get(EvidenceORM, str(evidence_id))
            return None if record is None else self._evidence_to_schema(record)

    def update_evidence(self, evidence_id: UUID, payload: EvidenceUpdate) -> EvidenceRead | None:
        with get_session() as db:
            record = db.get(EvidenceORM, str(evidence_id))
            if record is None:
                return None
            changes = payload.model_dump(exclude_unset=True)
            for key, value in changes.items():
                if key == "properties":
                    record.properties_json = value
                else:
                    setattr(record, key, value)
            db.commit()
            db.refresh(record)
            return self._evidence_to_schema(record)

    def accept_candidate(self, candidate_id: UUID, payload: CandidateAcceptRequest) -> dict:
        with get_session() as db:
            candidate = db.get(CandidateORM, str(candidate_id))
            if candidate is None:
                raise KeyError
            if candidate.status == CandidateStatus.ACCEPTED:
                return {"object_ids": [], "mark_ids": [], "relation_ids": [], "check_ids": [], "case_ids": [], "finding_ids": [], "evidence_ids": []}
            proposed = payload.override_payload or candidate.proposed_payload
            created = {"object_ids": [], "mark_ids": [], "relation_ids": [], "check_ids": [], "case_ids": [], "finding_ids": [], "evidence_ids": []}
            if candidate.candidate_type == CandidateType.OBJECT:
                obj = ObjectORM(
                    assessment_id=candidate.assessment_id,
                    asset_id=proposed.get("asset_id"),
                    type=proposed.get("type", "UNKNOWN"),
                    kind=proposed.get("kind", "UNKNOWN"),
                    name=proposed.get("name", "Unnamed object"),
                    locator=proposed.get("locator"),
                    range_json=proposed.get("range"),
                    properties_json=proposed.get("properties", {}),
                    source=candidate.source,
                )
                db.add(obj)
                db.flush()
                created["object_ids"].append(obj.id)
            elif candidate.candidate_type == CandidateType.MARK:
                object_payload = proposed.get("object", {})
                obj = ObjectORM(
                    assessment_id=candidate.assessment_id,
                    asset_id=object_payload.get("asset_id"),
                    type=object_payload.get("type", "CALLSITE"),
                    kind=object_payload.get("kind", "UNKNOWN"),
                    name=object_payload.get("name", proposed.get("title", "Mark object")),
                    locator=object_payload.get("locator"),
                    range_json=object_payload.get("range"),
                    properties_json=object_payload.get("properties", {}),
                    source=candidate.source,
                )
                db.add(obj)
                db.flush()
                mark = MarkORM(
                    assessment_id=candidate.assessment_id,
                    object_id=obj.id,
                    kind=self._normalize_import_mark_kind(proposed.get("kind", "NOTE")),
                    title=proposed.get("title", "Imported mark"),
                    note=proposed.get("note"),
                    confidence=candidate.confidence,
                    source=candidate.source,
                )
                db.add(mark)
                db.flush()
                created["object_ids"].append(obj.id)
                created["mark_ids"].append(mark.id)
            elif candidate.candidate_type == CandidateType.CHECK:
                check = CheckORM(
                    assessment_id=candidate.assessment_id,
                    title=proposed.get("title", "Imported check"),
                    description=proposed.get("description", ""),
                    category=proposed.get("category"),
                    check_type=proposed.get("check_type"),
                    priority=proposed.get("priority", "MEDIUM"),
                    status=CheckStatus(proposed.get("status", "NOT_STARTED")),
                    reason=proposed.get("reason"),
                    source=candidate.source,
                )
                db.add(check)
                db.flush()
                created["check_ids"].append(check.id)
            elif candidate.candidate_type == CandidateType.CASE:
                case = CaseORM(
                    assessment_id=candidate.assessment_id,
                    title=proposed.get("title", "Imported case"),
                    description=proposed.get("description", ""),
                    severity_hint=proposed.get("severity_hint"),
                    confidence=proposed.get("confidence", candidate.confidence),
                )
                db.add(case)
                db.flush()
                created["case_ids"].append(case.id)
            elif candidate.candidate_type == CandidateType.EVIDENCE:
                evidence = EvidenceORM(
                    assessment_id=candidate.assessment_id,
                    title=proposed.get("title", "Imported evidence"),
                    evidence_type=proposed.get("evidence_type", "NOTE"),
                    summary=proposed.get("summary", ""),
                    content=proposed.get("content", ""),
                    confidence=proposed.get("confidence", candidate.confidence),
                    source=candidate.source,
                    properties_json=proposed.get("properties", {}),
                )
                db.add(evidence)
                db.flush()
                created["evidence_ids"].append(evidence.id)
            candidate.status = CandidateStatus.ACCEPTED
            db.commit()
            return created

    def convert_check_to_finding(self, check_id: UUID, payload: FindingCreate) -> FindingRead | None:
        with get_session() as db:
            check = db.get(CheckORM, str(check_id))
            if check is None or check.status not in {CheckStatus.FAILED, CheckStatus.CHECKED_WEAK}:
                return None
            finding = FindingORM(assessment_id=check.assessment_id, **payload.model_dump())
            db.add(finding)
            db.flush()
            relation = RelationORM(
                assessment_id=check.assessment_id,
                subject_type="FINDING",
                subject_id=finding.id,
                predicate="GENERATED_FROM",
                object_type="CHECK",
                object_id=check.id,
            )
            db.add(relation)
            db.commit()
            db.refresh(finding)
            return self._finding_to_schema(finding)
