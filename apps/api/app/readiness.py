"""只读的正式使用前检查；不调用模型、不发送邮件、不修改业务数据。"""
import argparse
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .config import get_settings
from .db import q_one


def inspect_readiness():
    s = get_settings()
    count = lambda sql, params=(): q_one(sql, params)["n"]
    reviewed = ("EXISTS (SELECT 1 FROM content_submissions a WHERE a.version_id=v.id "
                "AND a.status='published' AND a.reviewer_id IS NOT NULL AND a.reviewer_id<>a.author_id)")
    counts = {
        "active_demo_accounts": count("SELECT COUNT(*) AS n FROM users WHERE is_active=1 AND email LIKE '%@demo.local'"),
        "published_guides": count("SELECT COUNT(*) AS n FROM knowledge_versions WHERE status='published'"),
        "guides_without_dual_review": count("SELECT COUNT(*) AS n FROM knowledge_versions v WHERE status='published' AND NOT " + reviewed),
        "flows_without_dual_review": count("SELECT COUNT(*) AS n FROM flow_versions v WHERE status='published' AND NOT " + reviewed),
        "reviewed_flows": count("SELECT COUNT(*) AS n FROM flow_versions v WHERE status='published' AND " + reviewed),
        "failed_jobs": count("SELECT COUNT(*) AS n FROM outbox WHERE status='failed'"),
        "future_service_events": count("SELECT COUNT(*) AS n FROM service_events WHERE status='published' AND service_date>=?",
                                       (datetime.now(timezone(timedelta(hours=8))).date().isoformat(),)),
    }
    blockers = []
    if s.app_env == "dev":
        blockers.append("当前仍是开发环境；正式运行需 APP_ENV=production、HTTPS 与 Secure Cookie。")
    if not s.cookie_secure:
        blockers.append("正式运行需要启用 COOKIE_SECURE 并通过 HTTPS 访问；本地 HTTP 开发可保持关闭。")
    if s.auto_seed:
        blockers.append("AUTO_SEED 尚未关闭。")
    if s.secret_key.startswith("dev-only") or len(s.secret_key) < 32:
        blockers.append("仍使用默认或过短的会话密钥。")
    if counts["active_demo_accounts"]:
        blockers.append("存在启用的演示账号；建立真实管理员后停用演示账号，或使用独立空库初始化。")
    if counts["guides_without_dual_review"] or counts["flows_without_dual_review"]:
        blockers.append("存在未经双人审核的发布内容；非开发环境已禁止公开与检索这些内容。")
    if not counts["reviewed_flows"]:
        blockers.append("尚无经双人审核的排障流程。")
    if counts["failed_jobs"]:
        blockers.append("存在失败的后台任务，需要处理或重试。")
    if s.require_email_verification and not (s.smtp_host and s.smtp_from):
        blockers.append("要求邮箱验证，但 SMTP_HOST / SMTP_FROM 尚未配置完整。")
    if s.obs_enabled and not all((s.obs_endpoint, s.obs_bucket, s.obs_ak, s.obs_sk)):
        blockers.append("OBS 已启用但配置不完整。")
    return {
        "type": "configuration_and_database_readiness_not_external_acceptance",
        "counts": counts, "blockers": blockers,
        "services": {
            "email": "configured_unverified" if s.smtp_host and s.smtp_from else "not_configured",
            "storage": "obs_unverified" if s.obs_enabled else "private_local",
            "model": "configured_unverified" if s.maas_enabled and s.maas_base_url and s.maas_api_key and s.maas_chat_model else "disabled_or_incomplete",
        },
        "external_evidence_required": [
            "场地、人员、排班已由实际服务组织确认；未来活动数量不代表真实性已核验。",
            "维修人员实际完成知识审核，不能由程序生成审核签名。",
            "120 条独立人工标注案例、对照实验与真实试点反馈。",
            "所需外部服务联调、浏览器视觉和无障碍验收。",
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    report = inspect_readiness()
    text = json.dumps(report, ensure_ascii=False, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text + "\n", encoding="utf-8")
    print(text)
    raise SystemExit(1 if report["blockers"] else 0)


if __name__ == "__main__":
    main()
