// 편의점 행사 자동 수집 → promo.json
// GitHub Actions(.github/workflows/promo.yml)가 매주 실행합니다. 직접 돌리려면: node scripts/promo.mjs
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const P = require('./promo-core.js');

const html = fs.readFileSync('index.html', 'utf8');
const m = html.match(/const DATA = (\[[\s\S]*?\]);\n/);
if (!m) { console.error('index.html에서 메뉴 데이터를 찾지 못했습니다.'); process.exit(1); }
const DATA = JSON.parse(m[1]);
const prev = (() => { try { return JSON.parse(fs.readFileSync('promo.json', 'utf8')); } catch { return { items: [], stores: {} }; } })();

const SRC = { cu: 'CU 행사상품 목록', seven: '세븐일레븐 행사상품 목록', emart24: '이마트24 행사상품 목록' };
const today = P.kstToday();
const stores = {}; let items = [];
for (const id of ['cu', 'seven', 'emart24']) {
  const b = DATA.find(x => x.id === id); if (!b) continue;
  try {
    let list = [], via = '';
    try { list = await P[id](); if (!list.length) throw new Error('목록이 비어 있음'); }
    catch (e) {
      console.log(`${id}: 공식 사이트 실패 (${e.message}) → 펴늬 정리 목록으로 시도`);
      list = await P.pyony(id); via = ' (펴늬 정리)'; if (!list.length) throw new Error(`공식(${e.message})·펴늬 모두 실패`);
    }
    const hit = P.match([b], list).map(x => ({ ...x, src: SRC[id] + via }));
    stores[id] = { ok: true, total: list.length, matched: hit.length, ...(via ? { via: 'pyony' } : {}) };
    items.push(...hit);
    console.log(`${id}: 행사 ${list.length}개, 앱 메뉴와 맞춘 것 ${hit.length}개`);
    hit.forEach(x => console.log(`   ${x.t}  ${x.n}  ←  ${x.pn} (${x.sc})`));
  } catch (e) {
    // 수집 실패: 지난번 자료 중 아직 기간이 남은 것은 유지
    const keep = (prev.items || []).filter(x => x.b === id && (!x.to || x.to >= today));
    stores[id] = { ok: false, error: String(e.message || e).slice(0, 200), kept: keep.length };
    items.push(...keep);
    console.log(`${id}: 수집 실패 (${e.message}) — 지난 자료 ${keep.length}개 유지`);
  }
}
stores.gs25 = { ok: false, error: 'GS25는 홈페이지에 행사 목록을 공개하지 않음' };
const out = { updated: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16) + '+09:00', stores, items };
fs.writeFileSync('promo.json', JSON.stringify(out, null, 1) + '\n');
console.log(`promo.json 저장: ${items.length}개`);

