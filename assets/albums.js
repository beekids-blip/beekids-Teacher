(() => {
  const container = document.querySelector('[data-albums]');
  if (!container) return;

  const csvUrl = (container.getAttribute('data-csv') || '').trim();
  const fallbackText = (document.getElementById('albums')?.textContent || '').trim();

  function parseCsv(text) {
    const rows = [];
    let row = [], field = '', inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else {
          field += ch;
        }
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(field);
        field = '';
        rows.push(row);
        row = [];
      } else {
        field += ch;
      }
    }
    if (field !== '' || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows.filter(r => r.some(cell => String(cell || '').trim() !== ''));
  }

  // 將 CSV 轉成與原本「日期 | 活動名稱 | 相簿網址 | 封面圖 | 簡介 | 標籤」相容的物件陣列
  function rowsToAlbums(rows) {
    if (!rows.length) return [];
    const headers = rows[0].map(h => String(h || '').trim());
    const hasHeader = headers.some(h => /日期|活動|名稱|相簿|網址|封面|簡介|標籤|date|title|url/i.test(h));
    const idx = (names, fallbackIndex) => {
      if (!hasHeader) return fallbackIndex;
      const found = headers.findIndex(h => names.some(n => h.includes(n)));
      return found >= 0 ? found : fallbackIndex;
    };

    const iDate = idx(['日期'], 0);
    const iTitle = idx(['活動', '名稱'], 1);
    const iUrl = idx(['相簿', '網址', '連結'], 2);
    const iCover = idx(['封面', '圖片'], 3);
    const iDesc = idx(['簡介', '說明'], 4);
    const iTags = idx(['標籤', '分類'], 5);

    const dataRows = hasHeader ? rows.slice(1) : rows;
    return dataRows.map(r => ({
      date: String(r[iDate] || '').trim(),
      title: String(r[iTitle] || '').trim(),
      url: String(r[iUrl] || '').trim(),
      cover: String(r[iCover] || '').trim(),
      desc: String(r[iDesc] || '').trim(),
      tags: String(r[iTags] || '').trim(),
    })).filter(item => item.date || item.title);
  }

  function parsePlainText(raw) {
    return raw
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        const parts = line.split('|').map(s => s.trim());
        return {
          date: parts[0] || '',
          title: parts[1] || '',
          url: parts[2] || '',
          cover: parts[3] || '',
          desc: parts[4] || '',
          tags: parts[5] || '',
        };
      });
  }

  async function loadAlbums() {
    if (csvUrl) {
      try {
        const res = await fetch(csvUrl, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const text = await res.text();
        const items = rowsToAlbums(parseCsv(text));
        if (items.length) return items;
      } catch (err) {
        console.warn('活動紀錄 CSV 讀取失敗，改用頁面備援清單：', err);
      }
    }
    return parsePlainText(fallbackText);
  }

  // 這裡把 items 交給你原本用來渲染 container 的函式，例如 renderAlbums(container, items)
  loadAlbums().then(items => {
    window.__BEE_ALBUMS__ = items;
    container.dispatchEvent(new CustomEvent('albums:loaded', { detail: items }));
  });
})();
