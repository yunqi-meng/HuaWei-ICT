# 知修 · 校园电脑义诊 Web V1 开发版

React + TypeScript + FastAPI，实现“描述故障 → 确认故障电脑与系统 → 按发布流程排障 → 用户验证 → 人工交接 → 预约 → 派单签到 → 维修验收 → 评价与知识候选”的业务链。

按用户最新要求：**暂不部署上线**。本地后端已接入 DeepSeek Flash；密钥仅存在被忽略的 `.env`，不在源码、前端或镜像内。完整操作说明见 [运行维护文档](docs/operations.md)，功能与外部验收边界见 [开发进度](docs/development-progress.md)。

完整产品与技术设计见 [电脑义诊系统完整设计方案 V1.0](docs/电脑义诊系统_完整设计方案_V1.0.md)。设计方案包含需求、架构、业务流程、数据与权限、排期和验收目标；当前实现与实测情况以开发进度记录为准。

## 已实现

| 范围 | 能力 |
|---|---|
| 用户与账号 | 注册登录、CSRF、邮箱验证、角色分配、停用、服务端注销、数据库/Redis 限流 |
| 设备与排障 | 设备增删改查、故障设备选择、系统确认、10 个开发示例流程、最终结果验证、暂停恢复、SSE、版本与消息幂等 |
| 模型与证据 | DeepSeek 受约束归类和解释、引用校验、中文 BM25、可选向量索引与融合排序、模型失败降级 |
| 图片 | 上传前预览/裁剪/遮挡、图片重编码去元数据、私有读取、对象权限、主人同意后的 DeepSeek 识别；识别结果需用户核对 |
| 人工工单 | 交接摘要更正、直接报修、派单、转交、等待状态、检查与维修记录、设备暂存与领取确认、实际结论验收、行政结单、复开、评价 |
| 活动预约 | 场地/工位、活动草稿、时段、排班冲突、发布校验、保留与刷新恢复、改期取消、协调建议、一次性签到、接诊结束、爽约、停诊通知 |
| 知识运营 | 文本导入、草稿、双人审核、不可变版本、索引任务、撤回、旧内容复制再审核、脱敏案例候选 |
| 运营与部署 | 站内通知、SMTP Outbox 重试、任务监控、审计、统计、SQLite/PostgreSQL、私有本地/OBS 兼容存储、Docker、依赖锁、可移植备份恢复、CI 配置 |

示例知识仅用于开发演示，不能把种子里的审核字段当作真实审核签字。向量模型、SMTP、OBS 没有真实配置时不伪装其已生效；默认文本检索为 BM25。正式人工评测、真实试点、赛事 CodeArts 使用证据与云端上线不属于已经取得的结果。

## 本地运行

后端建议 Python 3.12，前端建议 Node 24：

```powershell
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

后台任务：在 API 目录执行 `python -m app.worker`。已有本地 `.env` 时请保留，不要用示例覆盖密钥。

开发账号密码均为 `Demo1234!`：

| 角色 | 账号 |
|---|---|
| 普通用户 | user@demo.local |
| 维修志愿者 | staff@demo.local |
| 调度员 | dispatcher@demo.local |
| 编辑员 / 审核员 | editor@demo.local / reviewer@demo.local |
| 系统管理员 | admin@demo.local |

知识作者不能审核自己提交的内容，演示编审时需切换另一个账号。生产环境关闭种子，使用 `python -m app.bootstrap` 初始化首个管理员。

## Docker

```powershell
# SQLite + 本地私有图片
docker compose -f infra/docker-compose.yml up --build -d

# PostgreSQL + Redis：先设置本地 POSTGRES_PASSWORD
docker compose -f infra/docker-compose.yml -f infra/docker-compose.postgres.yml up --build -d
```

默认 Web 为 `http://127.0.0.1:5173`。端口冲突时可设置 `WEB_PORT`、`API_PORT`；数据库与附件使用持久卷。用户要求不上线，因此这些命令仅用于本地运行。

## 验证

```powershell
cd apps/api
python -m unittest discover -s tests -q
python evaluate.py
# 启动 API 后：
python smoke.py

cd ../web
npm test
npm run build
```

后端测试用临时 SQLite 库；`TEST_DATABASE_URL` 可指向专用、可丢弃的 PostgreSQL 测试库。测试强制禁用真实模型，避免消耗用户额度。开发回归集独立标识为开发集，不是最终人工标注的 120 条评测集，也不代表真实诊断准确率。

## 目录

- `apps/api/app/`：业务 API、Worker、导入、备份恢复和初始化工具。
- `apps/web/src/`：用户端、维修工作台及运营/知识/系统管理页面。
- `knowledge/reviewed-flows/`：10 个示例流程 JSON；命名沿用早期目录，实际审核状态以发布记录和人员复核为准。
- `infra/`：本地容器定义与 PostgreSQL 覆盖配置。
- `docs/`：进度、运行维护及演示说明。
- `.github/workflows/verify.yml`：SQLite/PostgreSQL 后端与前端检查工作流，尚未推送远程执行。

MIT 许可用于本项目代码；外部知识采用来源链接与原创说明，正式发布前仍需核对材料许可。不得公开真实联系人、附件、业务备份或任何服务密钥。
