# 本地运行、维护与服务接入

## 当前运行约定

按用户 2026-10-30 的最新要求，**暂不上线**。实际密钥只保存在项目根目录 `.env`；该文件被 Git 与 Docker 构建上下文排除，不应复制到截图、日志或交付包。

Python 3.12 与 Node 24 是容器构建环境。本地也验证过 Python 3.14、Node 24。

```powershell
# 在项目根目录运行；保留已有 .env，不要用示例覆盖真实配置。
cd apps/api
python -m pip install -r requirements.lock.txt
python -m app.seed
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

另一个终端：

```powershell
cd apps/web
npm ci
npm run dev -- --host 127.0.0.1
```

后台任务需单独启动 `cd apps/api; python -m app.worker`。站内通知与业务操作在同一数据库事务内保存，不依赖邮件 Worker 才能显示。

## Docker 两种数据层

默认 SQLite、本地私有附件，端口只绑定回环地址：

```powershell
docker compose -f infra/docker-compose.yml up --build -d
```

PostgreSQL + Redis：在终端环境变量或本地 `.env` 中设置 `POSTGRES_PASSWORD`，然后执行：

```powershell
docker compose -f infra/docker-compose.yml -f infra/docker-compose.postgres.yml up --build -d
```

可用 `API_PORT`、`WEB_PORT`、`POSTGRES_PORT`、`REDIS_PORT` 更换端口，默认依次为 8000、5173、15432、16379。数据库、附件存入命名持久卷。`docker compose down` 保留数据；不要对有用数据执行带 `--volumes` 的清理。

API 的 `/readyz` 检查数据库连通；`/healthz` 只表示进程存活。Web 代理支持 SSE；本地 Web 入口的这两个健康地址也代理到 API。

## 账号、排班和编审

开发种子账号密码见 README。生产初始化不使用演示账号：

```powershell
cd apps/api
python -m app.bootstrap --email owner@example.edu --name 义诊负责人
```

密码在终端交互输入。该命令仅允许创建首个管理员；后续用户先注册，再由管理员在系统管理页面分配角色。角色调整会撤销目标账号的已有登录会话。

调度流程为“创建场地 → 创建活动草稿与时段 → 添加值班人员 → 校验发布”。容量不能超过工位或完整覆盖时段的值班人数；人员排班不能重叠。停诊会取消尚未接诊的保留/确认预约、释放名额并通知用户，保留问题和维修历史。

知识流程为“草稿 → 提交 → 另一人审核 → 发布”。指南与流程均需适用环境及真实来源。作者不能审核自己的内容。普通版本更新保留旧会话引用；安全撤回会阻断正在执行、验证或暂停中的旧流程。复制旧版本会创建新草稿，必须重新审核。

案例候选不会复制联系人、用户描述、聊天和图片；自动去除邮箱与手机号仍不能代替人工脱敏。审核员接续候选为自己的草稿，完成技术与隐私复核后再送另一人审核。

## DeepSeek 与可选服务

本地已配置 `MODEL_PROVIDER=deepseek`、`MAAS_CHAT_MODEL=deepseek-flash`。服务端采用官方兼容接口；依据 [DeepSeek 首次调用文档](https://api-docs.deepseek.com/quick_start/agent_integrations/)，Flash 使用这个模型名。非思考模式配置参见 [Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode/)。密钥不会被发送到前端。

模型仅辅助口语归类、解释依据，以及用户明确同意后的截图识别。流程选项、风险门禁、预约和权限由服务器控制；引用不存在、结构异常、超时或模型不可用时回退。截图识别结果标记未确认，需用户核对后自行提交，不能直接当作故障结论。

未配置 embedding/rerank 模型时使用中文 BM25。配置兼容的向量服务后，在知识后台重建索引，Worker 保存模型标识与向量；不同模型的向量不会混用。未运行索引任务不能宣称向量检索已生效。

`OBS_ENABLED=true` 时使用配置的 S3 兼容私有端点与桶；访问仍通过后端对象权限校验，无公开永久链接。当前未提供真实 OBS 账号，因此该云端存储路径只做适配，实际兼容性须用目标桶验证。本地存储路径已做测试。

邮箱验证码在 SMTP 未配置时不会声称已发送；开发环境可返回测试验证码。生产设置 `REQUIRE_EMAIL_VERIFICATION=true` 并配置 SMTP。Worker 对邮件和索引任务重试，达到上限标记失败；管理员可查看并重新排队，不显示任务中的邮件内容或密钥。

## 备份、恢复与从 SQLite 迁移

在 API 目录执行：

```powershell
python -m app.maintenance backup ../../backups/2026-10-30
```

输出包含私有业务快照和可用的本地附件。目录必须不存在，避免覆盖。备份含联系人等敏感数据，只能保存到受限位置；`backups/` 默认不入库。

恢复前先将 `DATABASE_URL` 指向**新建空库**，关闭 `AUTO_SEED`，不要先启动 API 产生演示数据。执行：

```powershell
python -m app.maintenance restore ../../backups/2026-10-30
```

恢复程序拒绝覆盖有业务数据的库。恢复后的所有用户需重新登录；验证码、限流与待发送任务不恢复，避免重复发送旧通知。将备份中的 `files` 复制到新的私有目录并设置 `UPLOAD_DIR`，或使用备份时对应的 OBS 私有桶恢复策略。

SQLite → PostgreSQL 使用同一流程：先从 SQLite 导出快照，将环境变量切到新建 PostgreSQL 空库，再恢复。保留原 SQLite 库作为回滚来源；通过验收后才切换 Web 指向的新 API。结构升级采用幂等建表及增量加列，`schema_migrations` 记录应用版本，不执行删除列或清空数据。

## 验证和回滚

后端：`python -m unittest discover -s tests -q`。设置 `TEST_DATABASE_URL` 可对专用 PostgreSQL 测试库执行同一组测试；必须使用可丢弃的测试库。测试固定禁用真实模型，不消耗用户额度。

前端：`npm test`、`npm run build`。启动服务后执行 `python smoke.py`；可设置 `API_BASE_URL` 指向本地 API 或 Web 代理。开发回归评测执行 `python evaluate.py`；并发探测执行 `python load_check.py --url <本地只读 API>`。报告均位于被忽略的 `artifacts/`。

发布版本使用固定镜像标签。回滚时先停写、备份当前库，再切回先前镜像；非破坏式结构升级允许保留新增表。不要将程序回滚与自动覆盖数据库绑定。当前依用户要求不进行云上发布。

## 外部验收边界

正式上线仍须取得维修人员审核、真实组织排班与知识、隐私与留存规则、独立人工标注的 120 条评测集、浏览器视觉与无障碍验收。开发回归集和模拟数据不能当作真实业务成效、独立模型准确率或 CodeArts 使用证据。短信、小程序、原生客户端、远程控制和多组织运营保持原方案的后续阶段定位。
