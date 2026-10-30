"""生成无本地数据、无密钥的源码包；存在同名包时拒绝覆盖。"""
import argparse
import hashlib
import json
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

ROOT = Path(__file__).resolve().parents[1]
EXCLUDED = {"node_modules", "dist", "__pycache__", ".git", ".venv", "artifacts", "uploads", "backups"}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default=str(ROOT / "artifacts" / "zhixiu-web-v1.0.0-source.zip"))
    args = parser.parse_args()
    output = Path(args.output).resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    secrets = []
    env = ROOT / ".env"
    if env.exists():
        for line in env.read_text(encoding="utf-8").splitlines():
            name, separator, value = line.partition("=")
            if separator and name in {"MAAS_API_KEY", "SECRET_KEY", "OBS_AK", "OBS_SK", "SMTP_PASSWORD"} and value.strip() and not value.startswith("dev-only"):
                secrets.append(value.strip().encode())
    files = []
    for path in ROOT.rglob("*"):
        relative = path.relative_to(ROOT)
        if not path.is_file() or any(part in EXCLUDED for part in relative.parts):
            continue
        if path.name.startswith(".env") and path.name != ".env.example":
            continue
        if path.name.endswith((".db", ".db-wal", ".db-shm", ".log", ".pyc", ".tsbuildinfo")):
            continue
        data = path.read_bytes()
        if any(secret in data for secret in secrets):
            raise RuntimeError("文件含本地密钥，拒绝打包：" + str(relative))
        files.append((relative.as_posix(), data))
    design = ROOT.parent / "电脑义诊系统_完整设计方案_V1.0.md"
    if design.exists():
        data = design.read_bytes()
        if any(secret in data for secret in secrets):
            raise RuntimeError("设计文件含本地密钥，拒绝打包")
        files.append(("docs/设计方案_V1.0.md", data))
    with ZipFile(output, "x", compression=ZIP_DEFLATED) as archive:
        for name, data in files:
            archive.writestr("zhixiu/" + name, data)
    with ZipFile(output) as archive:
        if archive.testzip() is not None:
            raise RuntimeError("源码包完整性校验失败")
        if any(secret in archive.read(name) for name in archive.namelist() for secret in secrets):
            raise RuntimeError("压缩包内容未通过密钥检查")
    print(json.dumps({"output": str(output), "files": len(files), "bytes": output.stat().st_size,
                      "sha256": hashlib.sha256(output.read_bytes()).hexdigest(), "secret_scan": "passed"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
