import { useState } from "react";

export function useCompareSelection<T extends { id: string; name: string }>(group?: (item: T) => string) {
  const [selected, setSelected] = useState<T[]>([]);
  const [error, setError] = useState("");
  function toggle(item: T) {
    setError("");
    if (selected.some(s => s.id === item.id)) {
      setSelected(selected.filter(s => s.id !== item.id));
    } else if (selected.length >= 4) {
      setError("最多对比 4 款，请先移除一个型号。");
    } else if (group && selected.length && group(selected[0]) !== group(item)) {
      setError("请选择同类硬件；清空已选后可切换类型。");
    } else {
      setSelected([...selected, item]);
    }
  }
  function clear() { setSelected([]); setError(""); }
  return { selected, error, toggle, clear };
}
