import { describe,it,expect } from 'vitest';
import raw from './socpkCatalog.json';
import { socpkSets,atPower,comparisonCSV,pointsCSV,type SocpkSnapshot } from './benchmarkSets';
const snapshot=raw as unknown as SocpkSnapshot;
const sets=socpkSets(snapshot);
describe('SOCPK 来源和测试口径',()=>{
  it('每条可见曲线都能定位到同版本源数据，SPEC 核心和测试分开',()=>{
    for(const set of sets){
      expect(set.sourceUrl).toMatch(/^https:\/\/www\.socpk\.com\/chart\//);
      expect(new Set(set.rows.map(r=>r.id)).size).toBe(set.rows.length);
      expect(set.rows.length).toBeGreaterThan(0);
      const source=snapshot.pages.find(p=>p.source_url===set.sourceUrl)!;
      expect(set.version).toBe(source.version);
      for(const row of set.rows){
        const origin=source.series.find(s=>row.id.endsWith(':'+s.id))!;
        expect(origin).toBeTruthy();
        expect(row.score).toBeGreaterThan(0);
        if(set.mode==='curve'){
          expect(row.points.length).toBeGreaterThanOrEqual(2);
          expect(row.points.map(p=>[p.power,p.score])).toEqual(origin.points);
          expect(atPower(row,row.points[0].power-0.0001)).toBeNull();
          expect(atPower(row,row.points.at(-1)!.power+0.0001)).toBeNull();
        }
      }
    }
    expect(sets.find(s=>s.id==='spec26-int')!.rows[0].name).toContain('·');
    expect(sets.find(s=>s.id==='spec26-int')!.metric).not.toBe(sets.find(s=>s.id==='spec26-fp')!.metric);
  });
  it('多核分表以 suite 识别 GB6 / GB7，不根据 slug 猜测版本',()=>{
    const page=snapshot.pages.find(p=>p.slug==='mobile-soc-efficiency-gb7')!;
    for(const suite of ['GB6','GB7']){
      const set=sets.find(s=>s.id===`cpu-${suite.toLowerCase()}`)!;
      expect(set.rows.length).toBe(page.series.filter(s=>s.meta.suite===suite&&s.points.length>=2).length);
      for(const row of set.rows)expect(page.series.find(s=>row.id.endsWith(':'+s.id))!.meta.suite).toBe(suite);
    }
  });
  it('排名保留源分数与单位，零值 / 未提供的列不冒充零分成绩',()=>{
    const gb=sets.find(s=>s.id==='socpk-gb6-0')!;
    const source=snapshot.pages.find(p=>p.slug==='geekbench-6')!;
    for(const row of gb.rows)expect(row.score).toBe(source.series.find(s=>row.id.endsWith(':'+s.id))!.points[0]);
    expect(sets.find(s=>s.id==='socpk-gfx-0')!.unit).toBe('fps');
    const laptop=sets.find(s=>s.id==='laptop-peak')!;
    expect(laptop.legacy).toBe(false);expect(laptop.rows).toHaveLength(37);
    expect(laptop.rows[0].score).toBe(laptop.rows[0].points.at(-1)!.score);
  });
  it('CSV 带来源与空值，并防止型号字段被当作表格公式',()=>{
    const set=sets.find(s=>s.id==='cpu-gb6')!;
    const row={...set.rows[0],name:'=DANGEROUS("x")'};
    const csv=comparisonCSV(set,[row],9999);
    expect(csv).toContain("'=DANGEROUS");expect(csv).toContain(set.sourceUrl);expect(csv).toContain('"",""');expect(csv).not.toContain('NaN');
    const original=pointsCSV(set,[set.rows[0]]);
    expect(original.split('\r\n')).toHaveLength(set.rows[0].points.length+1);
    expect(original).toContain(set.version);
  });
});
