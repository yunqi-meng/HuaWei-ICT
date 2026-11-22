# 本地运行、维护与服务接入

## 当前运行约定

按用户 2026-10-30 的最新要求，**暂不上线**。实际密钥只保存在项目根目录 `.env`；该文件被 Git 与 Docker 构建上下文排除，不应复制到截图、日志或交付包。

Python 3.12 与 Node 24 是容器构建环境。本地也验证过 Python 3.14、Node 24。

```powershell
# 在项目根目录运行；保留已有 .env，不要用示例覆盖真实配置。
cd apps/api
python -m pip install -r requirements.lock.txt
# 可选：仅需要演示数据时执行；普通启动不再自动种子化。
python -m app.seed
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

另一个终端：

```powershell
cd apps/web
npm ci
npm run dev -- --host 127.0.0.1
```

手动分终端启动时，后台任务需另行启动 `cd apps/api; python -m app.worker`。站内通知与业务操作在同一数据库事务内保存，不依赖邮件 Worker 才能显示。

Windows 下双击根目录 `启动项目.bat`，同时启动 API、Worker 和 Web，检查服务就绪后自动打开网页。重复启动会直接打开已运行的页面，不重复创建进程。双击 `停止项目.bat` 停止这组服务；重复停止也可直接执行。无需管理员权限，可从任意工作目录调用。

服务在后台运行，日志保存在 `artifacts/local-services/`；启动失败时回收此次已启动的服务。停止时核对 PID、进程创建时间和可执行文件路径，仅停止本项目记录的服务。Python 优先使用项目根目录或 API 目录中的 `.venv`，其次使用 PATH 中的 Python。

```powershell
# 在项目根目录执行；不启动服务，仅检查依赖。
powershell -NoProfile -ExecutionPolicy Bypass -File tools/local-services.ps1 -Action Check
# 查看一键入口所管理的服务状态。
powershell -NoProfile -ExecutionPolicy Bypass -File tools/local-services.ps1 -Action Status
# 自定义本地端口；Vite 的 API 代理随 API 端口设置。
powershell -NoProfile -ExecutionPolicy Bypass -File tools/local-services.ps1 -Action Start -ApiPort 18000 -WebPort 15173
```

默认优先使用 API 8000 / Web 5173；默认端口占用时，自动在其后 30 个端口中选择可用端口，网页地址会显示在启动输出中并自动打开，前端代理随 API 地址设置。若显式指定 `-ApiPort`、`-WebPort`，则严格使用指定端口，冲突时提示错误。

两个 BAT 入口都支持把参数继续传给管理脚本，例如 `启动项目.bat -NoBrowser -ApiPort 18000 -WebPort 15173`。自动化调用可设置环境变量 `ZHIXIU_NO_PAUSE=1` 禁止失败时等待按键；失败会保留非零退出码。

一键入口检查并提示缺失的依赖，不自动安装 Python/Node 或修改本地密钥；首次使用仍需执行上述依赖安装命令。无重载子进程，修改后端代码后需要停止并重新启动。默认关闭 `AUTO_SEED`；演示数据仅通过开发环境显式 `python -m app.seed` 写入。关闭自动种子不会删除已有账号、知识、活动或用户记录。

2026-11-11 隔离实测：两个 BAT 入口启动/停止成功；占用默认端口时自动使用 API 8001 / Web 5174，前端代理与 Worker 实际任务通过；重复启动不增加进程、重复停止成功；从不同工作目录调用及日志路径含空格均通过。验证期间保留原有预览服务，其他 Python 进程仍存活；结果见 `artifacts/start-stop-validation.json`。

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

`APP_ENV` 非 `dev` 时，公开指南、知识检索和固定排障流程必须关联 `content_submissions` 中作者与审核者不同的已发布记录；种子中的 reviewer 文本、手填审核日期、自动采集标记不构成审核凭据。原开发库切换为正式环境后，未经过该流程的内容会被隔离，关联的固定流程会话转人工。请先用编辑后台复制已有版本为草稿，再由实际维修人员完成复核与发布。

模型继续排查和建议验证时必须有有效检索引用；未知或类型错误的引用导致本次模型输出被拒绝。无来源时使用现有固定澄清/回退或转人工，不把无引用操作当作可靠步骤。引用 ID 校验不等于语义事实核验。

向量功能未启用时索引任务明确使用 BM25；向量功能已启用但服务失败或响应异常时，Worker 保留任务载荷、按退避策略重试，五次失败后可从系统管理后台重试。此前已经误标为完成的历史任务不会被自动重放，避免不必要的外部调用；可重新提交相关知识索引任务。

需要验证已配置的真实模型链路时，可从项目根目录执行 `python tools/verify_live_rag.py --live`。该命令会产生少量真实对话、向量及重排调用费用，使用隔离临时数据库，只复制公共知识，不修改原业务库；报告写入 `artifacts/live-rag-validation.json`。没有 `--live` 参数时不会发出请求。

## 正式使用前检查与真实数据准备

```powershell
cd apps/api
python -m app.readiness --output ../../artifacts/readiness.json
```

该命令只读检查配置、演示账号、审核记录和失败任务，不发送邮件、不调用模型；有已知阻塞项时返回退出码 1。系统管理页也显示同一结果。服务状态中的“已配置”不能当作实际投递、OBS 读写或模型响应成功。

本地演示与真实运营建议使用独立数据库。准备正式空库时关闭 `AUTO_SEED`，使用随机 `SECRET_KEY`、HTTPS 与 `COOKIE_SECURE=true`，按实际联系要求配置 SMTP；需要 OBS 时再配置并验证读写。使用 `app.bootstrap` 在终端交互初始化真实首管理员；现有开发库及附件可按下文备份保留，无需删除。

实际组织需提供场地、工位、维修人员和值班安排，由后台按“草稿 → 排班 → 发布”录入。现有 83 篇知识、10 条流程不能由程序代签审核；正式 120 条独立案例、对照实验、真实试点、浏览器验收和外部服务验证也须附实际证据。来源快照中的待补硬件参数和预告型号继续保留标识，不用估算填充缺失事实。

案例候选不会复制联系人、用户描述、聊天和图片；自动去除邮箱与手机号仍不能代替人工脱敏。审核员接续候选为自己的草稿，完成技术与隐私复核后再送另一人审核。

## DeepSeek 与可选服务

本地已配置 `MODEL_PROVIDER=deepseek`、`MAAS_CHAT_MODEL=deepseek-flash`。服务端采用官方兼容接口；依据 [DeepSeek 首次调用文档](https://api-docs.deepseek.com/quick_start/agent_integrations/)，Flash 使用这个模型名。非思考模式配置参见 [Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode/)。密钥不会被发送到前端。

排障问答默认由 DeepSeek 逐步决策：每轮把症状、已尝试步骤和知识库检索结果发送给模型，模型返回结构化下一步，服务器强制校验标题、操作、选项、风险等级与引用。只允许低风险、可逆的图形界面操作；命令、注册表、驱动安装/更新/卸载、卸载软件、格式化、分区、BIOS、拆机等输出直接丢弃并回退。模型不可用、输出不合法或连续失败两次时，会话回退到已审核流程或转人工。

模型生成的步骤标注“AI 生成·未经人工核对”，不使用审核流程的发布状态；用户确认恢复后才记为解决。风险门禁、暂停/恢复、转人工和权限仍由服务器控制。模型只辅助排障、解释依据，以及用户明确同意后的截图识别，不执行任何远程操作。引用不存在、结构异常、超时或模型不可用时回退。截图识别结果标记未确认，需用户核对后自行提交，不能直接当作故障结论。

未配置 embedding/rerank 模型时使用中文 BM25。配置兼容的向量服务后，在知识后台重建索引，Worker 保存模型标识与向量；不同模型的向量不会混用。未运行索引任务不能宣称向量检索已生效。

向量化与对话模型可分别指向不同服务（`EMBEDDING_BASE_URL`、`EMBEDDING_API_KEY` 不配置时回退 `MAAS_BASE_URL`、`MAAS_API_KEY`）。当前使用云端硅基流动的 OpenAI 兼容接口：

```ini
MAAS_EMBEDDING_MODEL=BAAI/bge-m3
EMBEDDING_BASE_URL=https://api.siliconflow.cn
EMBEDDING_API_KEY=<仅在本地 .env 填写>
MAAS_RERANK_MODEL=BAAI/bge-reranker-v2-m3
RERANK_BASE_URL=https://api.siliconflow.cn
```

重排默认复用向量化服务的地址与密钥，可用 `RERANK_BASE_URL`、`RERANK_API_KEY` 单独覆盖。未配置重排时自动跳过；配置后重排结果作为第三路排名参与 RRF 融合，不直接覆盖关键词与向量结果，避免单次模型误判推翻高相关文档。

完全离线时可改用本机 Ollama：`EMBEDDING_BASE_URL=http://127.0.0.1:11434`、`MAAS_EMBEDDING_MODEL=bge-m3:latest`，知识正文不会离开本机；Ollama 不提供 `/v1/rerank`，需将 `MAAS_RERANK_MODEL` 留空。修改 embedding 模型后必须重新执行索引任务；模型标识不一致的旧向量会被跳过，不会被混用。

`OBS_ENABLED=true` 时使用配置的 S3 兼容私有端点与桶；访问仍通过后端对象权限校验，无公开永久链接。当前未提供真实 OBS 账号，因此该云端存储路径只做适配，实际兼容性须用目标桶验证。本地存储路径已做测试。

邮箱验证码在 SMTP 未配置时不会声称已发送；开发环境可返回测试验证码。生产设置 `REQUIRE_EMAIL_VERIFICATION=true` 并配置 SMTP。Worker 对邮件和索引任务重试，达到上限标记失败；管理员可查看并重新排队，不显示任务中的邮件内容或密钥。

## LangChain RAG 与官方资料采集

排障 RAG 的检索、提示词、模型调用与输出解析由 LangChain LCEL（`langchain-core`）编排，见 `apps/api/app/modules/knowledge/rag.py`。会话状态、风险门禁、引用校验与安全过滤仍由项目代码控制；检索仍是项目内的 BM25 + bge-m3 向量 + bge-reranker 三路融合。模型排障检索不按症状分类强制过滤，避免“打印机显示在线”被误归为显示类而漏检。

官方资料采集（当前为 Microsoft 中文支持，写入时标注“自动采集（未人工复核）”）：

```powershell
python tools/collect_knowledge.py --limit 120           # 只抓取，生成 artifacts/collected_knowledge.json
python tools/collect_knowledge.py --publish --from-file # 发布到知识库并构建向量索引
```

采集来源为厂商官方支持页面，保留原始链接与抓取时间。自动采集内容未经过双人审核，只用于本地演示；正式使用前必须由领域人员复核时效、适用系统与转载许可。文章版权归原厂商，本项目不声明转载授权。

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
