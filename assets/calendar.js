/* 年度行事曆：讀取頁面裡的活動清單（或指定的 Google 試算表 CSV），畫成 12 個月卡片，並標出本月與下一個活動。
 * 活動清單寫在 <script type="text/plain" id="events"> 裡，一行一個：  日期 | 活動名稱
 * 或在 [data-calendar] 加上 data-csv="你的CSV網址"，自動從 Google 試算表抓取（第 1 欄日期、第 2 欄活動名稱，略過第 1 列標題）。
 * 日期寫法：月/日 或 月/日-日（連續幾天） 或 月/日-月/日（跨月）。年份取自 data-year。
 * 活動顏色依名稱自動判斷：含「月會」＝義工月會、含「Bee Day」＝Bee Day、含「營會」「出遊」＝營會與出遊，其餘＝其他。
 */
(() => {
  const box = document.querySelector('[data-calendar]');
  const src = document.getElementById('events');
  if (!box) return;

  const Y = +box.dataset.year || new Date().getFullYear();
  const WD = '日一二三四五六';
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const kind = t => /月會/.test(t) ? 'meeting' : /bee\s*day/i.test(t) ? 'bee' : /營會|出遊/.test(t) ? 'camp' : 'other';

  // 簡易 CSV 行解析，支援雙引號包覆欄位
  const parseCSVLine = line => {
    const out = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          quoted = !quoted;
        }
      } else if (ch === ',' && !quoted) {
        out.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  };

  // 將 CSV 文字轉為「日期 | 活動名稱」行清單（略過第 1 列標題）
  const csvToEventLines = csvText => {
    const rows = csvText
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean);
    if (rows.length <= 1) return '';
    return rows
      .slice(1)
      .map(line => {
        const cols = parseCSVLine(line);
        const date = (cols[0] || '').trim();
        const title = (cols[1] || '').trim();
        return date && title ? `${date} | ${title}` : '';
      })
      .filter(Boolean)
      .join('\n');
  };

  const renderCalendar = rawText => {
    const ev = (rawText || '')
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && l[0] !== '#')
      .map(l => {
        const m = l.match(/^(\d{1,2})\/(\d{1,2})(?:\s*[-–~]\s*(?:(\d{1,2})\/)?(\d{1,2}))?\s*\|\s*(.+)$/);
        if (!m) return null;
        const mo = +m[1], d1 = +m[2], em = m[3] ? +m[3] : mo, d2 = m[4] ? +m[4] : d1;
        return { mo, d1, em, d2, t: m[5].trim(), k: kind(m[5]), s: new Date(Y, mo - 1, d1), e: new Date(Y, em - 1, d2) };
      })
      .filter(Boolean)
      .sort((a, b) => a.s - b.s || a.e - b.e);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const M = today.getFullYear() === Y ? today.getMonth() + 1 : 0; // 本月（不是這一年就不標）
    const single = x => x.mo === x.em && x.d1 === x.d2;
    const label = x => single(x)
      ? `${x.mo}/${x.d1}<small>${WD[x.s.getDay()]}</small>`
      : `${x.mo}/${x.d1}–${x.em === x.mo ? '' : x.em + '/'}${x.d2}`;

    const nx = ev.find(x => x.e >= today);
    let nextHTML = '';
    if (nx && today.getFullYear() <= Y) {
      const n = Math.round((nx.s - today) / 864e5);
      const when = n > 0 ? `還有 ${n} 天` : (nx.s.getTime() === today.getTime() ? '就是今天' : '進行中');
      nextHTML = `<div class="cal-next"><span>下一個活動</span><b>${label(nx)} ${esc(nx.t)}</b><small>${when}</small></div>`;
    }

    const grid = Array.from({ length: 12 }, (_, i) => {
      const l = ev.filter(x => x.mo === i + 1);
      return `<section class="cal-m${i + 1 === M ? ' now' : ''}"><h3>${i + 1} 月</h3>${l.length
        ? `<ul>${l.map(x => `<li class="ev ${x.k}${x.e < today ? ' past' : ''}"><span class="d">${label(x)}</span><span class="t">${esc(x.t)}</span></li>`).join('')}</ul>`
        : '<p class="none">—</p>'}</section>`;
    }).join('');

    const legend = [['meeting', '義工月會'], ['bee', 'Bee Day'], ['camp', '營會與出遊'], ['other', '其他']]
      .map(([k, n]) => `<li class="ev ${k}">${n}</li>`).join('');

    box.innerHTML = `${nextHTML}<div class="cal-grid">${grid}</div><ul class="cal-legend">${legend}</ul>`;
  };

  // 1. 先以 #events 現有內容渲染一次
  if (src) {
    renderCalendar(src.textContent);
  }

  // 2. 若有設定 data-csv，則從 Google 試算表抓取最新資料並重繪
  const csvUrl = (box.dataset.csv || '').trim();
  if (csvUrl) {
    fetch(csvUrl, { cache: 'no-store' })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then(csvText => {
        const lines = csvToEventLines(csvText);
        if (lines) {
          if (src) src.textContent = lines;
          renderCalendar(lines);
        }
      })
      .catch(err => {
        console.warn('無法從 Google 試算表載入活動，保留原本清單：', err);
      });
  }
})();
