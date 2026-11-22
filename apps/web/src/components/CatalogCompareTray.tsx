export default function CatalogCompareTray<T extends { id: string; name: string }>({ selected, toggle, clear, compare }: {
  selected: T[]; toggle: (item: T) => void; clear: () => void; compare: () => void;
}) {
  if (!selected.length) return null;
  return <aside className="compare-tray catalog-compare-tray" aria-label="已选对比型号">
    <strong>已选 {selected.length} / 4</strong>
    <div className="catalog-selected">{selected.map(item => <button className="chip-option selected" key={item.id}
      aria-label={`移除 ${item.name}`} onClick={() => toggle(item)}>{item.name} ×</button>)}</div>
    <button className="btn btn-primary" disabled={selected.length < 2} onClick={compare}>对比所选</button>
    <button className="text-button" onClick={clear}>清空选择</button>
  </aside>;
}
