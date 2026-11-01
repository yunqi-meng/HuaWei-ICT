# 数据与图片核对记录（2026-11-01）

本次核对覆盖页面内置硬件资料、天梯与曲线、做工条目、产品图片、10 个开发演示排查流程及指南，以及当前本地 SQLite 的结构与关联一致性。明确错误已修改；缺少证据的内容留空或标为待核验。业务记录是否符合用户真实设备、联系方式或实际维修情况，需要当事人确认，本次没有据此改写用户业务内容。

## 数据来源与使用方式

- 唯一硬件数据文件：`apps/web/src/data/hardwareCatalog.json`，共 24 条芯片记录。API、硬件库、详情、对比、排行榜与天梯共用该文件。Docker 已包含该文件。
- 每条记录包含厂商规格来源、基准来源、核对日期和适用范围说明。未公开值使用 `null`，页面显示“未公开 / 待核验”，不按零分参与排名。
- 17 款收录了有来源的成绩：9 款桌面 CPU、8 款桌面 GPU。核对时 [Geekbench Processor Chart](https://browser.geekbench.com/processor-benchmarks) 与 [OpenCL Chart](https://browser.geekbench.com/opencl-benchmarks) 明确采用 **Geekbench 7**，因此使用 `gb7_single` / `gb7_multi` / `gb7_opencl`，不继续标作 GB6、Cinebench 或 3DMark。
- 成绩为用户提交结果的汇总快照，非本站实测、非实时排行。OpenCL 为计算基准，不代表游戏帧率。平台、内存、系统和散热等条件会影响结果。
- 天梯图由相同数据生成 SVG，支持原有缩放与拖动。显示原始分数，条形长度按该分类当前收录最高成绩归一至 1000。撤下来源不明的旧海报和任意倍数分组。项目“旗舰 / 高端”等分组为编辑分类，不是厂商等级，也不是测试结论。

## 主要纠正

| 范围 | 原问题 | 处理 |
| --- | --- | --- |
| 天梯与硬件库 | 同型号多处维护分数，数据口径不一致 | 共用一个带来源的目录；取消无来源的归一化分数 |
| 能耗曲线 | 没有测试记录支持功耗点与成绩的对应关系 | 全部撤下估算点，保留说明和待补充状态；不使用 TDP 推算曲线 |
| Apple M3 / M4 | 擅填固定 TDP、基础/加速频率及内存速率 | 官方未公开的字段留空，M4 明确为 10 核 CPU 配置 |
| Snapdragon 7 Gen 3 | 年份填为 2024、最高频率写成 2.6GHz | 按 [Qualcomm 发布资料](https://www.qualcomm.com/news/releases/2023/11/brand-new-snapdragon-7-series-mobile-platform-provides-remarkabl) 和产品资料改为 2023、2.63GHz；移除未核验跑分 |
| Snapdragon 8 Elite | 模糊核心类型与频率版本 | 明确原始 4.32GHz 版本、2 Prime + 6 Performance；不填估算 TDP |
| Dimensity 9400 | 把全大核架构写成混合大小核，内存速率不符 | 按 [MediaTek 产品资料](https://www.mediatek.com/products/smartphones/mediatek-dimensity-9400) 修正为 X925 + 3 X4 + 4 A720，LPDDR5X-10667 |
| Intel 桌面 CPU | 混用基础功耗、最大功耗和实测功耗；DDR4/DDR5 支持不完整 | 分别记录 PBP / MTP；13400F MTP 为 148W；补充可确认的双内存标准 |
| AMD 显卡 | RX 7900 XTX / RX 7800 XT 制程过度简化 | 修正为 5nm / 6nm；TBP 与整机电源推荐瓦数区分 |
| ROG Z890 EXTREME | 相数分组缺失，主板图实际为其他型号 | 按 [ASUS 官方产品页](https://rog.asus.com/us/motherboards/rog-maximus/rog-maximus-z890-extreme/) 修正分组与电流，替换官方对应型号产品图 |
| MPG Z890 CARBON WIFI | 供电与 PCB 层数不符，图片为整机 | 按 [MSI 官方资料](https://www.msi.com/Motherboard/MPG-Z890-CARBON-WIFI) 改为 20+1+1+1、主供电 110A、8 层 PCB；替换产品图 |
| TUF Z890-PLUS WIFI | SKU、供电与 PCB 层数不完整 | 明确 WIFI 型号，改为 16+1+2+1、80A、8 层 PCB，替换官方图 |
| MAG B850M MORTAR WIFI | 写成 80A、6 层 PCB | 按 [当前 MSI 官方页面](https://www.msi.com/Motherboard/MAG-B850M-MORTAR-WIFI) 记录 12+2+1、60A，撤下原不符描述；图片使用对应 B850M 型号 |
| ASUS RTX 5090 | “ROG STRIX RTX 5090 O32G”未能对应官方 SKU | 更换为 [ROG Astral RTX5090 O32G GAMING](https://rog.asus.com/us/graphics-cards/graphics-cards/rog-astral/rog-astral-rtx5090-o32g-gaming/)，描述四风扇及均热板，配官方图 |
| RTX 5090 FE | 错写涡轮散热 | 按 [NVIDIA 官方页面](https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5090/) 改为双贯流设计 |
| MSI RTX 5080 SUPRIM LIQUID | 缺少完整 SKU，供电相数没有依据 | 固定为 16G SUPRIM LIQUID SOC；按官方 PDF 写明 360mm 级冷排及实际外尺寸；移除未核验相数 |
| 笔记本 | 跨年份配置混用，MacBook 均热板缺证据 | MacBook 固定 16 英寸 2024 M4 Max；G16 固定 2024 GA605；ThinkPad 固定 X1 Carbon Gen 12；撤下未证实散热结论 |
| 做工评分 / 售价 / 保修 | 主观分数、过期报价、“3 年换新”等缺少证据 | 全部移除，展示公开事实与来源，不按供电相数做优劣排名 |

## 图片

原资源存在整机冒充主板、笔记本冒充显卡、实验装置冒充笔记本、动漫图、品牌 Logo、错型号海报、重复图片及缺图。本次将 29 个旧公开图片资源移入本地 `artifacts/data-audit/quarantined-images/`，不再随站点发布；Git 历史保留原文件。

新增 7 张官方产品图，已逐张查看：Z890 EXTREME、Z890 CARBON、TUF Z890-PLUS WIFI、B850M MORTAR、ROG Astral RTX5090、MSI RTX5080 SUPRIM LIQUID SOC、2024 款 16 英寸 MacBook Pro。`productImages.json` 记录每张图片的产品 ID、原始素材地址、产品页、核对日期及 SHA-256，自动检查禁止跨型号复用。

缺少可靠图片的条目显示“类别图标，非产品实拍”。官方图片仅用于说明产品外观，不能证明未公开的 PCB 层数或供电设计。

## 仍需补充的资料

- 5 个做工条目：B760M-AYW WIFI 无法确认完整 SKU；“RTX4070 SUPER 旗舰”不是具体型号；MateBook X Pro 与 Y9000P 缺少年份和配置；Redmi Book Pro 15 2023 锐龙版历史页面未取得完整可读规格。对应条目保留，规格不作推断。
- RX7800 XT 公开基准汇总存在同名多条目，Arc A770 汇总未明确 8GB / 16GB，暂不选取一个分数作为该条目的唯一结论。
- Apple 与手机芯片未取得本目录可采用的同版本成绩，暂不排名。缺失不代表性能为零。
- Ryzen 5 5600G 的旧官方完整规格页和历史 PDF 已失效。目前仅保留官方发布资料可确认的型号、年份与架构，以及有来源的基准成绩与其核心标识；其余规格等待新的可追溯资料。
- 没有同测试版本、同配置、明确测量方法和原始记录的功耗与成绩配对数据，因此当前所有分类都不提供能耗曲线。图表交互代码以独立测试夹具验证，夹具不进入生产目录。

## 排查流程、指南与本地数据库

10 个演示流程逐一验证结构与参考文章；原泛指 Windows 首页的来源改成对应 Microsoft 支持文章。网络步骤增加原配置记录与单位/校园配置限制，不再顺带把静态 IP 改成自动获取；音频后续改为系统疑难解答；结束应用前要求保存工作；取消自助重置应用、清空回收站及自动清理，改为只读检查后交人工确认。

移除伪造的“2026-10-20 人工审核日期”及统一“已人工审核”的页面/会话文案。开发演示指南的 `reviewed_at` 保持空值，显示待人工复核；核对官方文章不等于维修人员完成审核。

种子升级只针对“开发演示内容”记录，以新版本发布并保留旧版本及原正文；人工审核记录不被覆盖。增加幂等、历史保留和人工内容保护测试。本地使用 SQLite 一致性快照备份，文件位于 `artifacts/data-audit/database-backup-*.db`，该目录被 Git 忽略。

数据库只读检查通过：`integrity_check = ok`、外键错误 0、非法时段 0、负数/超额预约名额 0、名额计数与预约记录不符 0。未把演示场地、设备和账号资料当成真实校园事实，未删除用户记录。

## 验证与复查

```powershell
python tools/audit_project_data.py --database apps/api/zhixiu_dev.db
# apps/api 目录
python -m unittest discover -s tests -q
# apps/web 目录
npm test
npm run build
```

结果：数据检查无错误；后端 74 项测试通过，前端 35 项测试通过，TypeScript/Vite 构建通过。运行中的 API 返回数据与唯一目录一致；GPU 默认指标为 `gb7_opencl`、8 款已收录型号；前端和 7 张产品图 HTTP 均为 200。

已使用图片查看工具人工检查新增产品图，使用自动化组件测试验证缺图标注、详情展开、筛选选择和天梯/曲线交互逻辑。Tabbit 本次没有可用标签页，创建页面失败；系统执行策略随后拦截了浏览器启动，未完成实际浏览器截图、移动端视觉和最终缩放手感验收。这部分没有标为已通过。

离线检查工具检查结构、来源字段、数据一致性、资源文件及摘要，不能证明外部网页今后始终可访问，也不能替代逐项事实复核。后续新增数据时应重新核对官方页面，并补充测试版本、采集日期与限制说明。
