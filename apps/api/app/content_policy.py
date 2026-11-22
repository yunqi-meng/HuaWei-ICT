"""开发示例可供本地体验；非开发环境只公开有双人审核记录的知识与流程。"""
from .config import get_settings


def reviewed_content_clause(alias: str) -> str:
    if alias not in {"v", "fv"}:
        raise ValueError("Unsupported content alias")
    if get_settings().app_env == "dev":
        return ""
    return (
        " AND EXISTS (SELECT 1 FROM content_submissions approved "
        f"WHERE approved.version_id={alias}.id AND approved.status='published' "
        "AND approved.reviewer_id IS NOT NULL AND approved.reviewer_id<>approved.author_id)"
    )
