// 신메뉴 감시: 공식 홈페이지 메뉴 이름을 앱 메뉴(index.html의 DATA)와 비교 → menuwatch.json
// GitHub Actions(.github/workflows/menu-watch.yml)가 매주 실행하고, 새로 보인 메뉴가 있으면 이슈를 엽니다.
// 직접 돌리려면: node scripts/menu-watch.mjs   (KFC·롯데리아는 자바스크립트로만 메뉴가 그려져 제외)
import fs from 'node:fs';

const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36' };
const get = async (url, opt = {}) => { const r = await fetch(url, { ...opt, headers: { ...UA, ...(opt.headers || {}) }, signal: AbortSignal.timeout(30000) }); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.text(); };
const all = (s, re) => [...s.matchAll(re)].map(m => m[1].replace(/&amp;/g, '&').trim()).filter(Boolean);

// 공식 홈페이지별 메뉴 이름 가져오기
const SRC = {
  mc: async () => JSON.parse(await get('https://www.mcdonalds.co.kr/api/v1/kor/product/nutrition')).resultObject.list
    .filter(x => !/세트|해피밀/.test(x.menuGroup || '')).map(x => x.menuName),
  bk: async () => {
    const msg = JSON.stringify({ header: { result: true, error_code: '', error_text: '', info_text: '', message_version: '', login_session_id: '', trcode: 'BKR0632', cd_call_chnn: '01' }, body: {} });
    const j = JSON.parse(await get('https://www.burgerking.co.kr/burgerking/BKR0632.json', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'message=' + encodeURIComponent(msg) }));
    const out = []; const walk = o => { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') { if (o.menuNm) out.push(o.menuNm); Object.values(o).forEach(walk); } }; walk(j.body); return out;
  },
  mt: async () => (await Promise.all(['CG0005', 'CG0004', 'CG0002', 'new'].map(c => get('https://momstouch.co.kr/menu/new.php?s_sect1=' + c))))
    .flatMap(h => all(h, /<\/span>([^<>]{2,40})<\/h3>/g)),
  sw: async () => (await Promise.all(['sandwich', 'unit', 'salad', 'grain_salad', 'morning'].map(c => get('https://www.subway.co.kr/menuList/' + c))))
    .flatMap(h => all(h, /<strong class="tit">([^<]{2,40})<\/strong>/g)),
  pp: async () => all(await get('https://popeyes.co.kr/menu'), /<p class="subject">([^<]{2,60})<\/p>/g),
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
const kst = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16) + '+09:00';
fs.writeFileSync('menuwatch.json', JSON.stringify({ updated: kst, brands, fresh }, null, 1) + '\n');
// 이슈 본문 (새로 보인 메뉴가 있을 때만 워크플로가 사용)
if (fresh.length) fs.writeFileSync('menuwatch-issue.md',
  `공식 홈페이지에 앱에 없는 메뉴가 새로 보입니다 (${kst}).\n\n` +
  Object.keys(NAME).map(id => { const f = fresh.filter(x => x.b === id); return f.length ? `**${NAME[id]}**\n` + f.map(x => `- ${x.n}`).join('\n') : ''; }).filter(Boolean).join('\n\n') +
  `\n\n영양정보·가격을 찾아 \`build_data3.py\`의 신메뉴 블록에 넣으면 됩니다. 세트·음료·이름만 바뀐 메뉴일 수도 있어요. (KFC·롯데리아는 자동 감시 대상이 아님)\n`);
