from fastapi.responses import JSONResponse
from starlette.requests import Request


class DomainError(Exception):
    def __init__(self, error: str, message: str, details: dict | None = None, status_code: int = 400):
        self.error = error
        self.message = message
        self.details = details or {}
        self.status_code = status_code


async def domain_error_handler(_: Request, exc: DomainError):
    return JSONResponse(status_code=exc.status_code, content={"error": exc.error, "message": exc.message, "details": exc.details})
