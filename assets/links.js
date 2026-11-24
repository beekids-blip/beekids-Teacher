/* 連結集中管理：所有 Google 表單、試算表、文件、雲端資料夾的網址，都寫在同一份「連結設定」試算表。
 * 這支程式讀取那份試算表（發布成 CSV），把頁面上標了 data-link 的地方換成最新的網址。
 * 頁面上原本寫的網址會留著當備用：讀不到設定時，連結仍然能用。
 *
 * 用法：
 *   <a data-link="義工資料表" href="原本的網址">義工資料表</a>        把這個連結的網址換成設定裡的「義工資料表」
 *   <iframe data-link="出席請假表單" src="原本的網址"></iframe>       表單嵌入也一樣（Google 表單會自動補上 ?embedded=true）
 *   <div data-link-list="義工"></div>                                  把「分類」是「義工」的連結全部列成清單
 *   <div data-link-table></div>                                        列出所有連結（連結管理頁用）
 * 程式裡要用網址時： const url = await BeeLinks.get('學生資料CSV', '備用網址');
 */
(() => {
  const CSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR3P6p5UnGEkOSwMfRDNtmxhiTmpQigTBUe-CEWVKWLJNXDntJLeEE2XA3xpdi-iX_tMZsrdCT0RtAM/pub?output=csv';
  const EDIT = 'https://docs.google.com/spreadsheets/d/1eD7yaWNksm8p9IAGDDFbngBXXmD7TNprQU_9L_AOvaA/edit?usp=sharing';     // 「前往編輯」按鈕連到這裡（需要有權限才打得開）
  const TTL = 5 * 60 * 1000;                                                            // 快取 5 分鐘，換頁時不用重新讀取
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const safe = u => /^https?:\/\//i.test(u || '') ? u : '';                              // 只接受 http(s) 網址，擋掉 javascript: 之類

  function parse(t) {
    const rows = []; let r = [], f = '', q = false;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (q) { if (c === '"') { if (t[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true;
      else if (c === ',') { r.push(f); f = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; r.push(f); f = ''; rows.push(r); r = []; }
      else f += c;
    }
    if (f !== '' || r.length) { r.push(f); rows.push(r); }
    return rows;
  }
  function toList(rows) {                                                                // 依標題找欄位：代碼、名稱、網址、說明、分類
    const h = rows[0].map(x => x.trim()), c = n => h.indexOf(n);
    return rows.slice(1).map(r => ({
      code: (r[c('代碼')] || '').trim(), name: (r[c('名稱')] || '').trim(), url: safe((r[c('網址')] || '').trim()),
      note: (r[c('說明')] || '').trim(), group: (r[c('分類')] || '').trim(),
    })).filter(x => x.code && x.url);
  }

  let cache = null;
  try { const s = JSON.parse(sessionStorage.getItem('beelinks') || 'null'); if (s && Date.now() - s.t < TTL) cache = s.list; } catch (e) {}
  const ready = cache ? Promise.resolve(cache)
    : fetch(CSV, { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error(r.status); return r.text(); }).then(t => {
        const list = toList(parse(t));
        try { sessionStorage.setItem('beelinks', JSON.stringify({ t: Date.now(), list })); } catch (e) {}
        return list;
      }).catch(err => { console.warn('連結設定讀取失敗，使用頁面上原本的網址', err); return []; });

  window.BeeLinks = { ready, get: async (code, fallback = '') => ((await ready).find(x => x.code === code) || {}).url || fallback };

  const embed = u => /docs\.google\.com\/forms/.test(u) && !/embedded=true/.test(u) ? u.replace(/\?.*$/, '').replace(/#.*$/, '') + '?embedded=true' : u;
  const external = u => { try { return new URL(u).origin !== location.origin; } catch (e) { return false; } };

  ready.then(list => {
    if (!list.length) return;
    const by = new Map(list.map(x => [x.code, x]));
    document.querySelectorAll('[data-link]').forEach(el => {
      const x = by.get(el.dataset.link);
      if (!x) { console.warn('連結設定裡找不到代碼：' + el.dataset.link); return; }
      if (el.tagName === 'A') {
        el.href = x.url;
        if (external(x.url)) { el.target = '_blank'; el.rel = 'noopener'; }
        if (!el.textContent.trim()) el.textContent = x.name || x.code;
      } else if (el.tagName === 'IFRAME') el.src = embed(x.url);
    });
    document.querySelectorAll('[data-link-list]').forEach(el => {
      const g = el.dataset.linkList, items = list.filter(x => !g || x.group === g);
      el.innerHTML = items.length ? `<ul class="links">${items.map(x =>
        `<li><a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.name || x.code)}${x.note ? `<small>${esc(x.note)}</small>` : ''}</a></li>`).join('')}</ul>` : '';
    });
    document.querySelectorAll('[data-link-table]').forEach(el => {
      const groups = [...new Set(list.map(x => x.group || '未分類'))];
      el.innerHTML = groups.map(g => `<h3>${esc(g)}</h3><div class="lk-wrap"><table class="lk-table"><thead><tr><th>代碼</th><th>名稱</th><th>說明</th><th>連結</th></tr></thead><tbody>${
        list.filter(x => (x.group || '未分類') === g).map(x => `<tr><td><code>${esc(x.code)}</code></td><td>${esc(x.name)}</td><td>${esc(x.note)}</td><td><a href="${esc(x.url)}" target="_blank" rel="noopener">開啟</a></td></tr>`).join('')
      }</tbody></table></div>`).join('');
      document.querySelectorAll('[data-link-edit]').forEach(a => { a.href = EDIT; });
    });
  });
})();
