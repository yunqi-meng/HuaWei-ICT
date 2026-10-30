"""离线导入原文为待编审草稿，不自动发布或执行文中的指令。"""
import argparse
from pathlib import Path
from .db import init_db, q_one
from .deps import user_roles
from .modules.knowledge.editorial import SubmissionIn, create


def main():
    parser = argparse.ArgumentParser()
    for field in ("file", "title", "category", "source-url", "source-title", "author-email"):
        parser.add_argument("--" + field, required=True)
    args = parser.parse_args()
    path = Path(args.file)
    if path.stat().st_size > 2 * 1024 * 1024:
        raise ValueError("导入文本最大 2 MB")
    init_db()
    author = q_one("SELECT * FROM users WHERE email=? AND is_active=1", (args.author_email.lower(),))
    if not author or not user_roles(author["id"]).intersection({"admin", "reviewer"}):
        raise ValueError("必须指定有编审权限的可用作者账号")
    draft = create(SubmissionIn(kind="guide", title=args.title, payload={
        "category": args.category, "content": path.read_text(encoding="utf-8"),
        "source_refs": [{"title": args.source_title, "url": args.source_url}],
        "applicability": {"os_family": "windows", "os_version_range": "11", "risk_level": "observe", "symptom_tags": [args.category]},
    }), author)
    print("已创建草稿：" + draft["id"] + "；请在知识后台复核后提交审核。")


if __name__ == "__main__":
    main()
