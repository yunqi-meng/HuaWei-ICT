import raw from "./motherboardCatalog.json";
import type { SourceInfo, SourceRef } from "./ladder";

export interface Chipset {
  id: string; name: string; codes: string[]; vendor: string; socket: string;
  release_text: string | null; positioning: string | null; chipset_power: string | null;
  typical_vrm: string | null; memory_support: string | null; cpu_pcie: string | null;
  chipset_pcie: string | null; sata: string | null; usb: string | null;
  overclock: string | null; note: string | null; is_preview: boolean; source_ref: SourceRef;
}
export interface Motherboard {
  id: string; name: string; brand: string; chipset: string; chipset_id: string;
  vendor: string; socket: string; form_factor: string | null; vrm: string | null;
  memory: string | null; memory_types: string[]; dimensions: string | null;
  power_connectors: string | null; audio: string | null; reference_price_cny: number | null;
  price_note: string | null; image: string | null; image_sha256: string | null;
  note: string | null; is_preview: boolean; has_specs: boolean; checked_at: string; source_ref: SourceRef;
}
interface MotherboardCatalog {
  schema_version: number; checked_at: string; source: SourceInfo;
  source_notes: { label: string; text: string }[]; chipsets: Chipset[]; motherboards: Motherboard[];
}
export const motherboardData = raw as unknown as MotherboardCatalog;
export const motherboards = motherboardData.motherboards;
export const chipsets = motherboardData.chipsets;
export const chipsetById = new Map(chipsets.map(c => [c.id, c]));
export function historicalPrice(board: Motherboard): string {
  return board.reference_price_cny != null ? `¥${board.reference_price_cny.toLocaleString("zh-CN")}（历史参考）` : board.price_note || "未提供";
}
