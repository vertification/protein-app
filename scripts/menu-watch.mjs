// 신메뉴 감시: 공식 홈페이지 메뉴 이름을 앱 메뉴(index.html의 DATA)와 비교 → menuwatch.json
// GitHub Actions(.github/workflows/menu-watch.yml)가 매주 실행하고, 새로 보인 메뉴가 있으면 이슈를 엽니다.
// 맥도날드·버거킹은 공식 영양 데이터가 있어 새 메뉴를 index.html에 바로 추가하고 menu_add.json에 기록합니다
// (가격은 비공개라 '가격 직접 입력'으로 들어감 → 앱의 '가격 고치기'로 입력).
// 직접 돌리려면: node scripts/menu-watch.mjs   (KFC·롯데리아는 자바스크립트로만 메뉴가 그려져 제외)
import fs from 'node:fs';

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36' };
const get = async (url, opt = {}) => { const r = await fetch(url, { ...opt, headers: { ...UA, ...(opt.headers || {}) }, signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.text(); };
const all = (s, re) => [...s.matchAll(re)].map(m => m[1].replace(/&amp;/g, '&').trim()).filter(Boolean);
const num = s => { const m = String(s ?? '').match(/[\d.]+/); return m ? Number(m[0]) : null; };
const bkCall = async tr => {
  const msg = JSON.stringify({ header: { result: true, error_code: '', error_text: '', info_text: '', message_version: '', login_session_id: '', trcode: tr, cd_call_chnn: '01' }, body: {} });
  return JSON.parse(await get(`https://www.burgerking.co.kr/burgerking/${tr}.json`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'message=' + encodeURIComponent(msg) }));
};
const mcList = async () => JSON.parse(await get('https://www.mcdonalds.co.kr/api/v1/kor/product/nutrition')).resultObject.list.filter(x => !/세트|해피밀|콤보/.test(x.menuGroup || ''));

// 공식 홈페이지별 메뉴 이름 가져오기
const SRC = {
  mc: async () => (await mcList()).map(x => x.menuName),
  bk: async () => { const out = []; const walk = o => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') { if (o.menuNm) out.push(o.menuNm); Object.values(o).forEach(walk); } }; walk((await bkCall('BKR0632')).body); return out; },
  mt: async () => (await Promise.all(['CG0005', 'CG0004', 'CG0002', 'new'].map(c => get('https://momstouch.co.kr/menu/new.php?s_sect1=' + c))))
    .flatMap(h => all(h, /<\/span>([^<>]{2,40})<\/h3>/g)),
  sw: async () => (await Promise.all(['sandwich', 'unit', 'salad', 'grain_salad', 'morning'].map(c => get('https://www.subway.co.kr/menuList/' + c))))
    .flatMap(h => all(h, /<strong class="tit">([^<]{2,40})<\/strong>/g)),
  pp: async () => all(await get('https://popeyes.co.kr/menu'), /<p class="subject">([^<]{2,60})<\/p>/g),
};
// 공식 영양 데이터 → 앱 메뉴 항목 (맥도날드·버거킹만). 단위: g, kcal, mg
const NUT = {
  mc: async () => new Map((await mcList()).filter(x => x.menuGroup !== '음료').map(x => {
    const f = Object.fromEntries(String(x.nutritionFacts || '').split(',').map(p => p.split(';')).filter(p => p.length === 2).map(([k, v]) => [k.trim(), num(v)]));
    return [x.menuName, { w: f['중량'], k: f['열량'], p: f['단백질'], na: f['나트륨'], s: f['당'], f: f['포화지방'], id: 'mc-auto-' + x.plu, src: '맥도날드 공식 영양정보 API' }];
  })),
  bk: async () => new Map(((await bkCall('BKR0347')).body.allNutrientList || []).map(x =>
    [x.menuNm, { w: num(x.weight), k: num(x.calory), p: num(x.protein), na: num(x.natrium), s: num(x.sugars), f: num(x.satufat), src: '버거킹 공식 영양정보(BKR0347)' }])),
};
const NAME = { mc: '맥도날드', bk: '버거킹', mt: '맘스터치', sw: '써브웨이', pp: '파파이스' };
// 세트·음료·소스처럼 앱이 따로 다루지 않는 이름
const SKIP = /세트|콤보|팩$|박스|버켓|소스|카푸치노|아이스티|탄산수|추가$|비츠$|믹스$|코카|콜라|스프라이트|환타|사이다|커피|아메리카노|라떼|에이드|주스|생수|미네랄|소스$|시즈닝|케첩|잼$|티$|음료|쉐이크|플로트|아이스크림|선데이|맥플러리|콘$|\(L\)|\(R\)|\(M\)/;
const norm = s => s.replace(/\([^)]*\)/g, '').replace(/[\s®™()[\]·,.\-/&+'’]|세트|단품|버거$/g, '').toLowerCase();

const html = fs.readFileSync('index.html', 'utf8');
const m = html.match(/const DATA = (\[[\s\S]*?\]);\n/);
if (!m) { console.error('index.html에서 메뉴 데이터를 찾지 못했습니다.'); process.exit(1); }
const DATA = JSON.parse(m[1]);
const first = !fs.existsSync('menuwatch.json'); // 첫 실행은 기준만 저장(지금 없는 이름을 알림으로 보내지 않음)
const prev = (() => { try { return JSON.parse(fs.readFileSync('menuwatch.json', 'utf8')); } catch { return { brands: {} }; } })();

const brands = {}; const fresh = [];
for (const [id, fn] of Object.entries(SRC)) {
  const app = (DATA.find(b => b.id === id)?.items || []).map(i => norm(i.n));
  try {
    const names = [...new Set((await fn()).map(s => s.replace(/\s+/g, ' ').trim()))];
    if (!names.length) throw new Error('메뉴 이름을 하나도 못 읽음(홈페이지 구조가 바뀌었을 수 있음)');
    const missing = names.filter(n => !SKIP.test(n)).filter(n => { const k = norm(n); return k.length >= 2 && !app.some(a => a.includes(k) || k.includes(a)); });
    const before = new Set(prev.brands?.[id]?.missing || []);
    const added = missing.filter(n => !before.has(n));
    brands[id] = { ok: true, total: names.length, missing };
    if (!first) added.forEach(n => fresh.push({ b: id, n }));
    console.log(`${NAME[id]}: 홈페이지 ${names.length}개, 앱에 없는 이름 ${missing.length}개${added.length ? ` (이번에 새로 보임 ${added.length}개: ${added.join(', ')})` : ''}`);
  } catch (e) {
    brands[id] = { ok: false, error: String(e.message || e).slice(0, 200), missing: prev.brands?.[id]?.missing || [] };
    console.log(`${NAME[id]}: 실패 (${e.message})`);
  }
}

// ---------- 자동 추가 (맥도날드·버거킹, 새로 보인 이름 중 공식 영양값이 있는 것) ----------
const kstDay = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const addLog = (() => { try { return JSON.parse(fs.readFileSync('menu_add.json', 'utf8')); } catch { return []; } })();
const auto = [];
for (const b of Object.keys(NUT)) {
  const want = fresh.filter(x => x.b === b); if (!want.length) continue;
  let nut; try { nut = await NUT[b](); } catch (e) { console.log(`${NAME[b]} 영양 데이터 실패 (${e.message}) — 알림만`); continue; }
  const brand = DATA.find(x => x.id === b); if (!brand) continue;
  for (const x of want) {
    const v = nut.get(x.n);
    if (!v || !(v.p > 0) || !(v.k > 0)) { x.why = '공식 영양값 없음'; continue; }
    const id = v.id || `${b}-auto-${kstDay.replace(/-/g, '')}-${brand.items.length}`;
    if (brand.items.some(i => i.id === id || i.n === x.n)) continue;
    const item = { c: '신메뉴', n: x.n, w: v.w ?? '', k: v.k, p: v.p, na: v.na ?? '', s: v.s ?? '', f: v.f ?? '', fl: '', ps: null, pd: null, ask: true,
      ns: '매장가 미확인 · 메뉴 상세의 가격 고치기로 입력', nd: '배달가 미확인', nsrc: v.src, auto: kstDay, id };
    brand.items.push(item); addLog.push({ b, item }); auto.push({ b, n: x.n, p: v.p }); x.auto = true;
  }
}
if (auto.length) {
  fs.writeFileSync('index.html', html.replace(m[0], () => 'const DATA = ' + JSON.stringify(DATA) + ';\n'));
  fs.writeFileSync('menu_add.json', JSON.stringify(addLog, null, 1) + '\n');
  console.log(`자동 추가 ${auto.length}개: ${auto.map(a => `${NAME[a.b]} ${a.n}(단백질 ${a.p}g)`).join(', ')}`);
}

const kst = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16) + '+09:00';
fs.writeFileSync('menuwatch.json', JSON.stringify({ updated: kst, brands, fresh }, null, 1) + '\n');
// 이슈 본문 (새로 보인 메뉴가 있을 때만 워크플로가 사용)
if (fresh.length) fs.writeFileSync('menuwatch-issue.md',
  `공식 홈페이지에 앱에 없는 메뉴가 새로 보입니다 (${kst}).\n\n` +
  [auto.length ? `**앱에 자동 추가함** (공식 영양값, 가격은 앱에서 '가격 고치기'로 입력)\n` + auto.map(a => `- ${NAME[a.b]} ${a.n} · 단백질 ${a.p}g`).join('\n') : '',
   ...Object.keys(NAME).map(id => { const f = fresh.filter(x => x.b === id && !x.auto); return f.length ? `**${NAME[id]}** (직접 확인 필요)\n` + f.map(x => `- ${x.n}${x.why ? ` (${x.why})` : ''}`).join('\n') : ''; })].filter(Boolean).join('\n\n') +
  `\n\n직접 확인할 메뉴는 영양정보·가격을 찾아 \`build_data3.py\`의 신메뉴 블록에 넣으면 됩니다. 세트·음료·이름만 바뀐 메뉴일 수도 있어요. (KFC·롯데리아는 자동 감시 대상이 아님)\n`);
