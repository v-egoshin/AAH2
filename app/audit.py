from datetime import datetime, timezone


audit_events: list[dict] = []


def record(event: str, payload: dict):
    audit_events.append({"event": event, "payload": payload, "at": datetime.now(timezone.utc).isoformat()})
