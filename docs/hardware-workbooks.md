# 硬件工作簿接入（2026-11-07）

## 页面入口

- `/hardware/catalog`：全量 CPU / GPU 规格库。支持型号、品牌、平台、有无参考成绩筛选；分页展示；最多 4 款同类型硬件并排对比。
- `/hardware/motherboards`：品牌主板资料。支持厂商、插槽、芯片组、品牌、内存、板型、参数完整性筛选；最多 4 款主板并排对比。
- `/hardware/motherboards?view=chipsets`：芯片组总表。区分芯片组本身功耗与板卡供电，默认隐藏表内预告型号。
- `/hardware/ladder`：只对有对应参考成绩的型号排序，缺失跑分的型号仍可在全量规格库查询。

入口已连接到硬件二级导航、原硬件数据库及做工资料页。现有 Geekbench 数据、SOCPK 曲线和产品资料保留。

## 来源和覆盖范围

| 工作簿 | 录入范围 | 来源时点（按表内标注） |
|---|---|---|
| CPU天梯图_综合全世代.xlsx | 1,007 款 CPU，其中 242 款具备完整 CPU-Z 成绩，765 款仅提供规格索引 | 2026-08-20 |
| 显卡天梯图_综合全世代.xlsx | 497 款显卡，其中 197 款有 Time Spy 参考成绩、300 款缺失该项跑分 | 2025-08 |
| 电脑主板全表_V2_芯片组与品牌主板(1).xlsx | 54 个芯片组、299 款代表主板；231 款有规格与内嵌图片，68 款保留待补参数状态 | 2026-11 |

导入日期与来源时点分别记录。原工作簿没有被改写；每份来源保留 SHA-256，每个型号保留文件名、工作表、原始行号；主板图片按 OOXML 行锚点关联，并保留文件校验值。程序仅读取数据，不执行工作簿中的文字或脚本提示。

来源为用户提供的参考资料，没有逐条在线核验。主板参数与缩略图按表内 ZOL 转录资料展示，未标注为厂商官方图片；价格明确标注历史参考，来源的“即将上市”等备注不解释为当前状态。5 个 900 系预告芯片组保留“预告·未确认”状态，不生成虚构主板产品。

## 字段修正

- CPU 不再丢弃缺少跑分的型号；保留混合核心说明、MTP/cTDP 等功耗原文。单独提取明确的标称基值，未明确的范围不猜测为单值。
- GPU 缺少 Time Spy 时保存 `null`，不再用理论性能分乘以系数生成跑分。理论分和性能倍率独立保存。
- 显卡表 N 列是显存带宽（GB/s），O 列是显存速度（Gbps），不再误作显存位宽。表中没有位宽数据，因此不填造该字段。
- Workstation 显卡保留独立平台，不再归并进桌面显卡。
- 主板未给出的音频、供电、内存等字段保持为空，不从芯片组“典型值”补填具体板卡参数。
- 芯片组能力是平台参考上限，实际板卡接口和 CPU 兼容性仍应查看该主板支持列表。

## 数据文件与接口

- `apps/web/src/data/ladderCatalog.json`：CPU / GPU 共享目录，schema 2。
- `apps/web/src/data/motherboardCatalog.json`：芯片组与主板目录，schema 1。
- `apps/web/public/images/motherboards/workbook/`：231 张原表缩略图，按内容哈希命名。
- API：`GET /api/v1/ladder/overview`、`/ladder/cpus`、`/ladder/gpus`、`/ladder/rankings`。
- 主板 API：`GET /api/v1/hardware/motherboards/overview`、`/hardware/motherboards`、`/hardware/motherboards/{id}`、`/hardware/chipsets`；`POST /api/v1/hardware/motherboards/compare`。

CPU / GPU 查询支持 `offset`、`limit`。CPU 可设 `ranked_only=true`；GPU 的兼容参数 `measured_only=true` 表示“表内有 Time Spy 参考成绩”，不表示本站测量。主板查询支持 `q/vendor/socket/chipset/brand/memory/has_specs/offset/limit`。芯片组预告需显式设置 `include_preview=true`。

API 镜像复制清单已补齐两个目录文件，Web 镜像沿用现有 public 资源复制流程。应用运行不需要 Excel 解析依赖。

## 重新导入

在项目根目录运行，替换下面的本地资料路径：

```powershell
python -m pip install -r tools/requirements.txt
python tools/excel_to_ladder.py --cpu "D:/资料/CPU天梯图_综合全世代.xlsx" --gpu "D:/资料/显卡天梯图_综合全世代.xlsx" --motherboards "D:/资料/电脑主板全表_V2_芯片组与品牌主板(1).xlsx" --checked-at 2026-11-07
python tools/audit_project_data.py
python -m unittest discover -s tools/tests -q
```

脚本支持 `--output-dir` 和 `--image-dir`。重新导入会更新生成的 JSON 和对应图片，不修改源表，也不删除目录中其他文件。原始工作簿留在使用者本机，不作为 Web 静态资源发布。

## 本轮验证

| 检查 | 结果 |
|---|---|
| 后端完整测试（隔离 SQLite，外部模型禁用） | 97/97 通过 |
| 前端完整测试 | 51/51 通过 |
| 新页面后续针对性复查 | 7/7 通过 |
| Excel 导入器临时工作簿测试 | 4/4 通过 |
| TypeScript + Vite 生产构建 | 通过 |
| 离线数据、行关联、图片校验和与流程审计 | `errors: []` |
| Tabbit 实际浏览器 | 桌面主板筛选、图片、历史参考价对比、GPU 带宽/速度/缺失跑分验证通过，无页面脚本异常；390px 宽度无页面横向溢出 |

桌面对比截图已检查。Tabbit 在窄屏模拟后的截图调用超时，未取得窄屏截图，因此窄屏结果只包含实际浏览器 DOM/布局与图片加载检查。测试浏览器与服务使用独立临时数据库，没有改写既有业务库，也没有调用付费模型。

全量 CPU/GPU 数据块约 995 kB（gzip 约 50 kB），按现有页面懒加载；Vite 会提示单个数据块超过 500 kB。当前没有拆分同一目录的多个副本；后续数据继续增长时可改为服务端分页获取。

本轮没有重新运行 Docker 构建、PostgreSQL 或线上部署。已有未提交改动均在原基础上保留。
