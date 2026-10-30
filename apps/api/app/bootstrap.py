"""生产首个管理员初始化；密码交互输入，不写入脚本、参数或日志。"""
import argparse
import getpass
import re
from .db import init_db, q_one, tx
from .security import hash_password, new_id, utcnow


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--email", required=True)
    p.add_argument("--name", required=True)
    args = p.parse_args()
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", args.email):
        p.error("邮箱格式不正确")
    password = getpass.getpass("管理员密码（至少 12 字符）：")
    if len(password) < 12 or len(password.encode()) > 72 or password != getpass.getpass("再次输入密码："):
        p.error("密码长度不符合要求或两次输入不同")
    hashed = hash_password(password)
    init_db()
    with tx() as conn:
        if q_one("SELECT user_id FROM user_roles WHERE role='admin'", (), conn):
            raise RuntimeError("已有管理员，请使用现有管理员管理账号")
        uid = new_id("usr")
        conn.execute("INSERT INTO users(id,email,password_hash,display_name,email_verified,created_at) VALUES (?,?,?,?,1,?)",
                     (uid, args.email.lower(), hashed, args.name, utcnow().isoformat()))
        for role in ("user", "admin"):
            conn.execute("INSERT INTO user_roles VALUES (?,?,?)", (new_id("uro"), uid, role))
    print("首个管理员已创建；请登录后分配维修、调度和知识审核角色。")


if __name__ == "__main__":
    main()
