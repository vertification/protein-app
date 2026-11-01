// 편의점 행사(1+1·2+1·3+1·할인) 목록 수집 + 앱 메뉴와 상품명 맞추기
// 브라우저와 Node(20+) 양쪽에서 돌아가도록 fetch + 정규식만 씁니다.
(function (root) {
  const UA = { 'User-Agent': 'Mozilla/5.0 (protein20 promo bot; weekly)', 'Accept-Language': 'ko-KR,ko;q=0.9' };
  const txt = s => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  const num = s => Number(String(s).replace(/[^0-9]/g, '')) || null;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const monthEnd = () => { const d = new Date(Date.now() + 9 * 3600e3); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10); };
  const normType = t => { t = t.replace(/\s+/g, ''); return /^[123]\+1$/.test(t) ? t : /세일|할인|SALE/i.test(t) ? 'sale' : t; };

  // ---- CU: 매월 1+1·2+1 (기간 = 이번 달) ----
  async function cu(base = 'https://cu.bgfretail.com') {
    const out = []; const seen = new Set();
    for (let p = 1; p <= 80; p++) {
      const r = await fetch(base + '/event/plusAjax.do', { method: 'POST', headers: { ...UA, 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', Referer: base + '/event/plus.do' }, body: `pageIndex=${p}&listType=0&searchCondition=&user_id=` });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const h = await r.text(); const li = h.split('<li class="prod_list"').slice(1);
      if (!li.length) break; let fresh = 0;
      for (const x of li) {
        const n = txt((x.match(/class="name"[^>]*>([\s\S]*?)<\/div>/) || [])[1] || ''); const pr = num((x.match(/<strong>([\d,]+)<\/strong>/) || [])[1] || '');
        const t = txt((x.match(/class="badge"[\s\S]*?<span[^>]*>([^<]+)<\/span>/) || [])[1] || '');
        const id = n + t; if (!n || seen.has(id)) continue; seen.add(id); fresh++;
        out.push({ s: 'cu', pn: n, pr, t: normType(t), to: monthEnd() });
      }
      if (!fresh) break; await sleep(300);
    }
    return out;
  }
  // ---- 세븐일레븐: 1+1(pTab=1), 2+1(pTab=2) — 응답이 느려서 페이지마다 수 초 걸림 ----
  async function seven(base = 'https://www.7-eleven.co.kr') {
    const out = []; const seen = new Set();
    for (const tab of [1, 2]) {
      for (let p = 1; p <= 120; p++) {
        const r = await fetch(base + '/product/listMoreAjax.asp', { method: 'POST', headers: { ...UA, 'Content-Type': 'application/x-www-form-urlencoded', Referer: base + '/product/presentList.asp' }, body: `intPageSize=50&intCurrPage=${p}&cateCd1=&cateCd2=&cateCd3=&pTab=${tab}` });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const h = await r.text(); const li = h.split(/<ul class="tag_list_01">/).slice(1);
        if (!li.length) break; let fresh = 0;
        for (const x of li) {
          const t = txt((x.match(/<li class='ico_tag_\d+'>([^<]+)<\/li>/) || [])[1] || (tab === 4 ? '할인' : ''));
          const n = txt((x.match(/class=['"]name['"][^>]*>([\s\S]*?)<\/div>/) || [])[1] || '');
          const pr = num((x.match(/class=['"]price['"][^>]*>\s*<span>([\d,]+)<\/span>/) || [])[1] || '');
          const id = n + t; if (!n || seen.has(id)) continue; seen.add(id); fresh++;
          out.push({ s: 'seven', pn: n, pr, t: normType(t), to: monthEnd() });
        }
        if (!fresh) break; await sleep(300);
      }
    }
    return out;
  }
  // ---- 대체 경로: 펴늬(pyony.com) 정리 목록 — 공식 사이트가 해외·클라우드 접속을 막거나 구조가 바뀌었을 때 사용 ----
  async function pyony(store, base = 'https://pyony.com') {
    const out = []; const seen = new Set(); let end = monthEnd();
    for (let p = 1; p <= 40; p++) {
      const r = await fetch(`${base}/brands/${store}/?item=100&page=${p}`, { headers: UA }); if (!r.ok) throw new Error('펴늬 HTTP ' + r.status);
      const h = await r.text();
      if (p === 1) { const m = h.match(/(\d{4})년\s*(\d{1,2})월\s*행사/); if (m) end = new Date(Date.UTC(+m[1], +m[2], 0)).toISOString().slice(0, 10); }
      const cards = h.split('<div class="card ').slice(1).filter(c => c.startsWith('border-' + store));
      if (!cards.length) break; let fresh = 0;
      for (const x of cards) {
        const n = txt((x.match(/<strong>([\s\S]*?)<\/strong>/) || [])[1] || '');
        const pr = num((x.match(/fa-coins[^>]*><\/i>\s*([\d,]+)\s*원/) || [])[1] || '');
        const t = txt((x.match(new RegExp('<span class="badge bg-' + store + '[^"]*">([^<]+)</span>')) || [])[1] || '');
        const id = n + t; if (!n || seen.has(id)) continue; seen.add(id); fresh++;
        out.push({ s: store, pn: n, pr, t: normType(t), to: end, via: 'pyony' });
      }
      if (!fresh) break; await sleep(400);
    }
    return out;
  }
  // ---- 이마트24: 상품마다 행사 기간이 따로 있음 ----
  async function emart24(base = 'https://emart24.co.kr') {
    const out = []; const seen = new Set(); const y = kstToday().slice(0, 4);
    const day = s => { const m = s && s.match(/(\d{1,2})\.(\d{1,2})/); return m ? `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}` : null; };
    for (let p = 1; p <= 200; p++) {
      const r = await fetch(`${base}/goods/event?search=&category_seq=&base_category_seq=&align=&page=${p}`, { headers: UA });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const h = await r.text(); const it = h.split('<div class="itemWrap">').slice(1);
      if (!it.length) break; let fresh = 0;
      for (const x of it) {
        // 페이지마다 마크업이 조금씩 달라서(itemType/itemDate가 없는 버전도 있음) 머리 부분의 span 글자로 행사 종류를 찾음
        const head = x.split('itemSpImg')[0];
        const t = [...head.matchAll(/<span[^>]*>([^<]+)<\/span>/g)].map(m => txt(m[1])).find(v => /\d\s*\+\s*\d|세일|SALE|할인|골라/i.test(v)) || '';
        const dm = head.match(/(\d{1,2}\.\d{1,2})\s*~\s*(\d{1,2}\.\d{1,2})/) || [];
        const f = day(dm[1]), to = day(dm[2]);
        const n = txt((x.match(/class="itemtitle">[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/) || [])[1] || '');
        const pr = num((x.match(/class="price">([^<]+)</) || [])[1] || '');
        const id = n + t; if (!n || seen.has(id)) continue; seen.add(id); fresh++;
        out.push({ s: 'emart24', pn: n, pr, t: normType(t), from: f, to: to || monthEnd() });
      }
      if (!fresh) break; await sleep(300);
    }
    return out;
  }

  // ---- 상품명 맞추기 ----
  // 사이트 상품명은 "매일)셀렉스프로핏바나250"처럼 제조사 접두어가 붙고 뒤가 잘리는 경우가 많아서,
  // 글자 구성(사이트 이름 글자가 거의 다 앱 이름에 있는지 + 앱 이름 글자도 충분히 덮는지)과 용량 일치로 판단합니다.
  const SIZE = s => { s = s.toLowerCase().replace(/\s/g, ''); let m = s.match(/(\d+(?:\.\d+)?)(ml|l|g|kg|입|개입|구)(?![a-z])/) || s.match(/(\d{2,4})$/); if (!m) return null; let v = +m[1], u = m[2] || '?'; if (u === 'l') { v *= 1000; u = 'ml'; } if (u === 'kg') { v *= 1000; u = 'g'; } if (u === '개입' || u === '구') u = '입'; return { v, u }; };
  const sameSize = (a, b) => !a || !b || (a.v === b.v && (a.u === b.u || a.u === '?' || b.u === '?'));
  const ALIAS = [[/스트로베리/g, '딸기'], [/초콜릿|초코렛|쵸코/g, '초코'], [/오리지날/g, '오리지널'], [/닭가슴(?!살)/g, '닭가슴살']];
  function norm(s) {
    s = s.replace(/^[^)]{1,12}\)/, '').toLowerCase().replace(/\([^)]*\)/g, '').replace(/(\d+(?:\.\d+)?)\s*(ml|l|g|kg|입|개입|구)(?![a-z])/g, '').replace(/\d+$/, '').replace(/(팩|pet|캔|병|컵)$/, '');
    for (const [a, b] of ALIAS) s = s.replace(a, b);
    return s.replace(/[^0-9a-z가-힣]/g, '');
  }
  const bag = s => { const m = new Map(); for (const c of s) m.set(c, (m.get(c) || 0) + 1); return m; };
  function cover(a, b) { const A = bag(a), B = bag(b); let n = 0; A.forEach((v, c) => { n += Math.min(v, B.get(c) || 0); }); return [n / (a.length || 1), n / (b.length || 1)]; }
  // 앱 이름 첫 단어(브랜드) → 사이트 상품명 앞 "제조사)" 표기. 둘 다 있으면 맞아야 함 (베지밀 고단백 ≠ 매일 고단백)
  const MAKER = { '베지밀': ['정식품', '베지밀'], '셀렉스': ['매일', '셀렉스'], '테이크핏': ['남양', '테이크핏'], '얼티브': ['cj', '얼티브'], '오뚜기': ['오뚜기'], '뉴케어': ['대상', '뉴케어'],
    '더단백': ['빙그레'], '빙그레': ['빙그레'], '하이뮨': ['일동', '하이뮨'], '닥터유': ['오리온', '닥터유'], '하림': ['하림'], 'cj': ['cj'], '풍림': ['풍림'], '가농': ['가농'], '샘표': ['샘표', '질러'],
    '한성': ['한성'], '정화': ['정화'], '풀무원다논': ['풀무원', '다논'], '서울우유': ['서울'], '마이프로틴': ['마이프로틴'] };
  function score(appName, siteName, pb) {
    if (!sameSize(SIZE(appName), SIZE(siteName))) return 0;
    const first = appName.trim().split(/\s+/)[0].toLowerCase(); const pre = ((siteName.match(/^([^)]{1,12})\)/) || [])[1] || '').toLowerCase();
    if (pb && pre !== 'pb' && !siteName.toLowerCase().replace(/\s/g, '').includes(first)) return 0; // PB 상품은 PB 이름이 있어야 함
    if (pre && MAKER[first] && !MAKER[first].some(x => pre.includes(x))) return 0;
    const s = norm(siteName); if (s.length < 3) return 0;
    // 맛·종류(앱 이름의 마지막 단어) 앞 두 글자는 사이트 이름에 있어야 함 — "통살구이 페퍼"가 "통살구이"와 맞는 것 방지
    const toks = appName.replace(/\([^)]*\)/g, '').split(/\s+/).filter(w => w && !/^\d/.test(w)); const last = norm(toks[toks.length - 1] || '');
    if (toks.length > 1 && last.length >= 2 && cover(last.slice(0, 2), s)[0] < 1) return 0;
    let best = 0;
    for (const a of [norm(appName), norm(appName.replace(/^\S+\s/, ''))]) {
      const [sc, ac] = cover(s, a); // sc: 사이트 글자가 앱 이름에 있는 비율, ac: 앱 이름 글자가 덮인 비율
      if ((sc >= 0.9 && ac >= 0.7) || (sc === 1 && ac >= 0.6)) best = Math.max(best, (sc + ac) / 2);
    }
    return best;
  }
  const STORE_BRAND = { cu: 'cu', seven: 'seven', emart24: 'emart24' };
  function match(appBrands, promos, min = 0.8) {
    const res = [];
    for (const b of appBrands) {
      const list = promos.filter(p => STORE_BRAND[p.s] === b.id && /^[123]\+1$/.test(p.t)); // 자동 반영은 N+1 행사만
      for (const i of b.items) {
        if (i.ps == null) continue; let top = null, ts = 0;
        for (const p of list) { const sc = score(i.n, p.pn, i.pb); if (sc > ts) { ts = sc; top = p; } }
        if (top && ts >= min) res.push({ b: b.id, n: i.n, t: top.t, pn: top.pn, pr: top.pr, from: top.from || null, to: top.to, sc: Math.round(ts * 100) / 100 });
      }
    }
    return res;
  }
  const api = { cu, seven, pyony, emart24, match, score, norm, kstToday, monthEnd };
  if (typeof module !== 'undefined') module.exports = api; else root.PROMO = api;
})(typeof window !== 'undefined' ? window : globalThis);
