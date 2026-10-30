"""生成新增开发演示流程；不表示已取得维修人员审核。"""
import json
from pathlib import Path

CATALOG = [
    ("camera-permission", "摄像头权限检查", "app", ["摄像头打不开", "摄像头权限", "摄像头不能用"],
     "https://support.microsoft.com/en-us/windows/privacy/windows-camera-microphone-and-privacy",
     "查看摄像头权限", "打开 设置 → 隐私和安全性 → 摄像头，查看摄像头访问以及目标应用的权限。只为你信任且确实要使用摄像头的应用开启权限。", "确认目标应用获得权限后重新打开该应用，查看能否显示画面。", "可在同一页面关闭刚才开启的权限。"),
    ("microphone-permission", "麦克风权限与输入选择", "audio", ["麦克风不能用", "麦克风没声音", "录不到声音"],
     "https://support.microsoft.com/en-us/windows/hardware/drivers/fix-microphone-problems",
     "检查目标应用的麦克风权限", "打开 设置 → 隐私和安全性 → 麦克风，查看目标应用是否获准访问。只为你信任且要使用麦克风的应用开启权限。", "回到该应用进行录音测试，确认能录入并回放声音。", "可在同一页面关闭刚才开启的权限。"),
    ("bluetooth-connection", "蓝牙连接基础检查", "app", ["蓝牙连不上", "蓝牙无法连接", "蓝牙找不到"],
     "https://support.microsoft.com/en-us/windows/hardware/bluetooth/fix-bluetooth-problems-in-windows",
     "查看蓝牙开关与外设状态", "打开 设置 → 蓝牙和设备，查看蓝牙是否开启；确认外设有电，并按外设说明进入配对状态。不删除现有配对，不修改驱动。", "在设备列表中找到目标外设并按设备说明连接，观察能否正常使用。", "若刚才开启了蓝牙，可按需要恢复原开关状态。"),
    ("mouse-connection", "有线鼠标连接检查", "app", ["鼠标没反应", "有线鼠标不动", "鼠标不能用"],
     "https://support.microsoft.com/en-us/windows/hardware/input-devices/mouse-and-keyboard-problems-in-windows",
     "检查鼠标连接", "确认是普通 USB 有线鼠标且接口没有破损或发热。将鼠标直接连接到电脑上另一个完好的 USB 接口，暂不通过扩展坞。不要插拔正在传输数据的存储设备。", "移动鼠标并点击空白区域，确认指针与按键恢复。", "需要时可将鼠标接回原接口。"),
    ("storage-observation", "存储空间不足的只读检查", "performance", ["磁盘空间不足", "c盘满了", "c 盘满了", "硬盘空间不够"],
     "https://support.microsoft.com/en-us/windows/experience/storage-filemanagement/free-up-drive-space-in-windows",
     "查看磁盘剩余空间", "打开 文件资源管理器 → 此电脑，记录系统盘剩余空间；再打开 设置 → 系统 → 存储，查看占用分类。本流程只查看，不删除文件或启用自动清理。", "能记录剩余空间与主要占用类别，并交给维修员确认适合的清理方式。", None),
]


def main():
    root = Path(__file__).parent / "reviewed-flows"
    for key, title, category, keywords, url, step_title, instruction, expected, rollback in CATALOG:
        options = {"worked": {"label": "验证后确认已恢复", "outcome": "resolved"},
                   "still_fail": {"label": "仍未恢复或无法操作", "outcome": "handoff", "reason": "基础检查未恢复，需现场确认"}}
        if key == "storage-observation":
            options = {"recorded": {"label": "已记录占用，请人工确认清理方式", "outcome": "handoff", "reason": "不自动删除用户文件，需核对备份和占用情况"}}
        data = {"key": key, "title": title, "category": category, "version_no": 1,
                "reviewer": "开发演示内容；上线前须人工审核", "symptom_keywords": keywords,
                "risk_keywords": [], "source_refs": [{"title": "Microsoft Support：" + title, "url": url}],
                "graph": {"entry": "check", "applicability": {"os_family": "windows", "os_version_range": "11"}, "nodes": {
                    "check": {"type": "action" if rollback else "observe", "title": step_title,
                              "why": "先验证基础环境，避免无依据地更改驱动或删除数据。", "instruction": instruction,
                              "expected_observation": expected, "risk_level": "reversible" if rollback else "observe",
                              "rollback": rollback, "stop_conditions": ["出现异常发热、破损、焦味，或设备受学校/单位策略管理"], "options": options}}}}
        (root / f"{key}.json").write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
