    const { useState, useEffect, useMemo, useCallback, useRef } = React;

    // ── Deep Run Tracker overlay ──
    function drawDeepRunOverlay(ctx, w, h, data) {
      const barH = Math.round(h * 0.28);
      const barY = h - barH - Math.round(h * 0.04);
      const padX = Math.round(w * 0.05);
      const padR = w - padX;

      // Background
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(0, barY, w, barH);

      // Tournament name
      const nameS = Math.round(h * 0.018);
      ctx.font = nameS + 'px Oswald, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText(data.tournamentName || '', padX, barY + Math.round(barH * 0.10));

      // Position: "152nd of 8,000"
      const posS = Math.round(h * 0.032);
      ctx.font = '600 ' + posS + 'px Oswald, sans-serif';
      const posNum = data.placesLeft ? Number(data.placesLeft) : '?';
      const totalNum = data.totalEntries ? Number(data.totalEntries).toLocaleString() : '?';
      ctx.fillStyle = '#ffffff';
      const posText = posNum + (typeof posNum === 'number' ? ordinalSuffix(posNum) : '');
      const posWidth = ctx.measureText(posText).width;
      ctx.fillText(posText, padX, barY + Math.round(barH * 0.24));
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = Math.round(h * 0.022) + 'px Oswald, sans-serif';
      ctx.fillText(' of ' + totalNum, padX + posWidth, barY + Math.round(barH * 0.24));

      // Stack display
      if (data.stack) {
        ctx.fillStyle = '#22c55e';
        ctx.font = '600 ' + Math.round(h * 0.022) + 'px Oswald, sans-serif';
        ctx.fillText(formatChips(data.stack) + ' chips', padX, barY + Math.round(barH * 0.34));
      }

      // Progress bar
      const pbY = barY + Math.round(barH * 0.40);
      const pbH = Math.round(barH * 0.06);
      const pbW = padR - padX;
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.beginPath();
      ctx.roundRect(padX, pbY, pbW, pbH, pbH / 2);
      ctx.fill();
      if (data.totalEntries && data.placesLeft) {
        const pct = Math.max(0.02, 1 - (Number(data.placesLeft) - 1) / Number(data.totalEntries));
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.roundRect(padX, pbY, Math.round(pbW * pct), pbH, pbH / 2);
        ctx.fill();
      }

      // Mini stack history line chart
      const history = data.stackHistory || [];
      if (history.length >= 2) {
        const chartY = barY + Math.round(barH * 0.52);
        const chartH = Math.round(barH * 0.38);
        const chartW = pbW;
        const stacks = history.map(h => Number(h.stack) || 0);
        const maxS = Math.max(...stacks);
        const minS = Math.min(...stacks);
        const range = maxS - minS || 1;

        // Grid lines
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 3; i++) {
          const gy = chartY + chartH - (chartH * i / 3);
          ctx.beginPath(); ctx.moveTo(padX, gy); ctx.lineTo(padR, gy); ctx.stroke();
        }

        // Starting stack reference line
        if (data.startingStack) {
          const ssY = chartY + chartH - ((Number(data.startingStack) - minS) / range * chartH);
          ctx.strokeStyle = 'rgba(255,255,255,0.25)';
          ctx.setLineDash([4, 4]);
          ctx.beginPath(); ctx.moveTo(padX, ssY); ctx.lineTo(padR, ssY); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          ctx.font = Math.round(h * 0.012) + 'px Oswald, sans-serif';
          ctx.fillText('start', padR - ctx.measureText('start').width, ssY - 3);
        }

        // Line
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        stacks.forEach((s, i) => {
          const x = padX + (chartW * i / (stacks.length - 1));
          const y = chartY + chartH - ((s - minS) / range * chartH);
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.stroke();

        // Gradient fill under line
        const grad = ctx.createLinearGradient(0, chartY, 0, chartY + chartH);
        grad.addColorStop(0, 'rgba(34,197,94,0.25)');
        grad.addColorStop(1, 'rgba(34,197,94,0.02)');
        ctx.fillStyle = grad;
        ctx.lineTo(padR, chartY + chartH);
        ctx.lineTo(padX, chartY + chartH);
        ctx.closePath();
        ctx.fill();

        // Current value dot
        const lastX = padR;
        const lastY = chartY + chartH - ((stacks[stacks.length - 1] - minS) / range * chartH);
        ctx.fillStyle = '#22c55e';
        ctx.beginPath(); ctx.arc(lastX, lastY, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(lastX, lastY, 2, 0, Math.PI * 2); ctx.fill();

        // Y-axis labels (min/max)
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = Math.round(h * 0.011) + 'px Oswald, sans-serif';
        ctx.fillText(formatChips(maxS), padX, chartY - 3);
        ctx.fillText(formatChips(minS), padX, chartY + chartH + Math.round(h * 0.013));
      } else {
        // No history — show placeholder
        const phY = barY + Math.round(barH * 0.65);
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.font = Math.round(h * 0.016) + 'px Oswald, sans-serif';
        ctx.fillText('Post more updates to see your stack graph', padX, phY);
      }

      // Watermark
      const wms = Math.round(h * 0.014);
      ctx.font = wms + 'px Oswald, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText('snbwsop.com', Math.round(w * 0.03), Math.round(h * 0.03));
    }

    // ── Final Table Card overlay ──
    function drawFinalTableOverlay(ctx, w, h, data) {
      const barH = Math.round(h * 0.22);
      const barY = h - barH - Math.round(h * 0.04);
      const padX = Math.round(w * 0.05);

      // Background
      ctx.fillStyle = 'rgba(0,0,0,0.78)';
      ctx.fillRect(0, barY, w, barH);

      // Gold accent line at top of bar
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(0, barY, w, 3);

      // "FINAL TABLE" header
      const headerS = Math.round(h * 0.030);
      ctx.font = '600 ' + headerS + 'px Oswald, sans-serif';
      ctx.fillStyle = '#f59e0b';
      ctx.fillText('\u{1F3C6} FINAL TABLE', padX, barY + Math.round(barH * 0.20));

      // Event name + buyin
      const nameS = Math.round(h * 0.022);
      ctx.font = '600 ' + nameS + 'px Oswald, sans-serif';
      ctx.fillStyle = '#ffffff';
      const buyinStr = data.buyin ? '$' + Number(data.buyin).toLocaleString() + ' ' : '';
      ctx.fillText(buyinStr + (data.tournamentName || ''), padX, barY + Math.round(barH * 0.40));

      // Players remaining
      const plS = Math.round(h * 0.020);
      ctx.font = plS + 'px Oswald, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      const plText = data.placesLeft ? data.placesLeft + ' players remain' : '';
      const entText = data.totalEntries ? ' of ' + Number(data.totalEntries).toLocaleString() + ' entries' : '';
      ctx.fillText(plText + entText, padX, barY + Math.round(barH * 0.58));

      // Stack + 1st place prize
      const statsS = Math.round(h * 0.024);
      ctx.font = '600 ' + statsS + 'px Oswald, sans-serif';
      ctx.fillStyle = '#22c55e';
      const parts = [];
      if (data.stack) parts.push(formatChips(data.stack) + ' chips');
      if (data.firstPlacePrize) parts.push('1st: $' + Number(data.firstPlacePrize).toLocaleString());
      ctx.fillText(parts.join('  ·  '), padX, barY + Math.round(barH * 0.78));

      // BB count
      if (data.stack && data.bb) {
        const bbCount = (Number(data.stack) / Number(data.bb)).toFixed(1).replace(/\.0$/, '');
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = Math.round(h * 0.016) + 'px Oswald, sans-serif';
        ctx.fillText('(' + bbCount + 'bb)', padX, barY + Math.round(barH * 0.90));
      }

      // Watermark
      const wms = Math.round(h * 0.014);
      ctx.font = wms + 'px Oswald, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText('snbwsop.com', Math.round(w * 0.03), Math.round(h * 0.03));
    }

    // ── Next Event Countdown overlay ──
    function drawCountdownOverlay(ctx, w, h, data) {
      const barH = Math.round(h * 0.18);
      const barY = h - barH - Math.round(h * 0.04);
      const padX = Math.round(w * 0.05);

      // Background
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.fillRect(0, barY, w, barH);

      // "NEXT UP" label
      const labelS = Math.round(h * 0.016);
      ctx.font = '600 ' + labelS + 'px Oswald, sans-serif';
      ctx.fillStyle = '#22c55e';
      ctx.letterSpacing = '2px';
      ctx.fillText('NEXT UP', padX, barY + Math.round(barH * 0.18));
      ctx.letterSpacing = '0px';

      // Event name + buyin
      const nameS = Math.round(h * 0.026);
      ctx.font = '600 ' + nameS + 'px Oswald, sans-serif';
      ctx.fillStyle = '#ffffff';
      const buyinStr = data.buyin ? '$' + Number(data.buyin).toLocaleString() + ' ' : '';
      ctx.fillText(buyinStr + (data.tournamentName || ''), padX, barY + Math.round(barH * 0.42));

      // Venue
      const venueS = Math.round(h * 0.018);
      ctx.font = venueS + 'px Oswald, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText(data.venue || '', padX, barY + Math.round(barH * 0.60));

      // Countdown
      const countS = Math.round(h * 0.030);
      ctx.font = '600 ' + countS + 'px Oswald, sans-serif';
      ctx.fillStyle = '#22c55e';
      ctx.fillText('in ' + (data.timeUntil || '—'), padX, barY + Math.round(barH * 0.85));

      // Watermark
      const wms = Math.round(h * 0.014);
      ctx.font = wms + 'px Oswald, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText('snbwsop.com', Math.round(w * 0.03), Math.round(h * 0.03));
    }

    // ══════════════════════════════════════════════════════════
    // ── SOCIAL OVERLAY DRAWING FUNCTIONS ─────────────────────
    // ══════════════════════════════════════════════════════════

    // Shared helper: draw dark gradient background for standalone share images
    function drawShareBackground(ctx, w, h) {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#1a1a2e');
      grad.addColorStop(1, '#0f0f1a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      // Subtle felt texture lines
      ctx.strokeStyle = 'rgba(34,197,94,0.06)';
      ctx.lineWidth = 1;
      for (let y = 0; y < h; y += 40) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
    }

    // Shared helper: draw futurega.me watermark
    function drawWatermark(ctx, w, h, pos) {
      const wms = Math.round(h * 0.016);
      ctx.font = wms + 'px Oswald, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      if (pos === 'bottom-center') {
        ctx.textAlign = 'center';
        ctx.fillText('futurega.me', w / 2, Math.round(h * 0.96));
        ctx.textAlign = 'left';
      } else {
        ctx.fillText('futurega.me', Math.round(w * 0.04), Math.round(h * 0.96));
      }
    }

    // Shared helper: rounded rect (polyfill-safe)
    function roundedRect(ctx, x, y, w, h, r) {
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
      else {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
        ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
        ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
        ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
        ctx.closePath();
      }
    }

    // Shared helper: share or download a canvas
    async function shareOrDownloadCanvas(canvas, filename) {
      const dataUrl = canvas.toDataURL('image/png');
      try {
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], filename, { type: 'image/png' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file] });
          return;
        }
      } catch (e) {
        if (e.name === 'AbortError') return;
      }
      const a = document.createElement('a');
      a.href = dataUrl; a.download = filename; a.click();
    }

    // ══════════════════════════════════════════════════════════
    // ── SCHEDULE EXPORT FUNCTIONS (PDF + Image) ─────────────
    // ══════════════════════════════════════════════════════════

    // Venue color lookup for canvas (not CSS vars — returns hex)
    const VENUE_CANVAS_COLORS = {
      'WSOP': '#c0c0c0', 'IPO': '#1a6b3c', 'PERSONAL': '#4a9eff',
      'WYNN': '#8a3030', 'ARIA': '#5a3a9a', 'GOLDEN NUGGET': '#7a6520',
      'RESORTS WORLD': '#2a7a72', 'SOUTH POINT': '#5e4430',
      'ORLEANS': '#944828', 'MGM GRAND': '#2a6a3e', 'MGM NH': '#8a7020',
      'Turning Stone': '#8a6508', 'TCH': '#a0522d', 'PRS': '#909090', 'VEN': '#858585',
      'CAESARS': '#b8962e', 'HARD ROCK': '#1a9e9e'
    };
    function getVenueCanvasColor(venueName) {
      const info = getVenueInfo(venueName);
      return VENUE_CANVAS_COLORS[info.abbr] || '#808080';
    }

    // ── PDF Font Loader (fetches TTF from CDN, caches for session) ──
    let _pdfFontCache = null;
    async function loadPDFFonts() {
      if (_pdfFontCache) return _pdfFontCache;
      async function fetchFont(url) {
        const res = await fetch(url);
        if (!res.ok) throw new Error('Font fetch failed: ' + res.status);
        const buf = await res.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin);
      }
      const base = 'https://cdn.jsdelivr.net/fontsource/fonts/';
      const [lbReg, lbBold, osReg, osBold] = await Promise.all([
        fetchFont(base + 'libre-baskerville@latest/latin-400-normal.ttf'),
        fetchFont(base + 'libre-baskerville@latest/latin-700-normal.ttf'),
        fetchFont(base + 'oswald@latest/latin-400-normal.ttf'),
        fetchFont(base + 'oswald@latest/latin-700-normal.ttf'),
      ]);
      _pdfFontCache = { lbReg, lbBold, osReg, osBold };
      return _pdfFontCache;
    }

    // Generate schedule PDF — table layout via jspdf-autotable
    async function generateSchedulePDF(events, title, opts = {}) {
      const isLight = !!opts.light;
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

      // Load custom fonts — fall back to built-in fonts if CDN fails
      let FONT_DATE = 'times';
      let FONT_BODY = 'helvetica';
      try {
        const fonts = await Promise.race([
          loadPDFFonts(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Font load timeout')), 5000))
        ]);
        doc.addFileToVFS('LibreBaskerville-Regular.ttf', fonts.lbReg);
        doc.addFont('LibreBaskerville-Regular.ttf', 'LibreBaskerville', 'normal');
        doc.addFileToVFS('LibreBaskerville-Bold.ttf', fonts.lbBold);
        doc.addFont('LibreBaskerville-Bold.ttf', 'LibreBaskerville', 'bold');
        doc.addFileToVFS('Oswald-Regular.ttf', fonts.osReg);
        doc.addFont('Oswald-Regular.ttf', 'Oswald', 'normal');
        doc.addFileToVFS('Oswald-Bold.ttf', fonts.osBold);
        doc.addFont('Oswald-Bold.ttf', 'Oswald', 'bold');
        FONT_DATE = 'LibreBaskerville';
        FONT_BODY = 'Oswald';
      } catch (e) {
        console.warn('PDF custom fonts unavailable, using fallback:', e.message);
      }

      const pw = doc.internal.pageSize.width;
      const ph = doc.internal.pageSize.height;
      const mg = 10;

      // Theme colors
      const BG       = isLight ? [255, 255, 255] : [17, 17, 17];
      const BG_ALT   = isLight ? [245, 245, 245] : [26, 26, 26];
      const TEXT_PRI  = isLight ? [30, 30, 30]    : [232, 232, 232];
      const TEXT_MUT  = isLight ? [100, 100, 100] : [128, 128, 128];
      const TEXT_ACC  = isLight ? [80, 80, 80]    : [160, 160, 160];
      const LINE_CLR  = isLight ? [200, 200, 200] : [51, 51, 51];
      const LINE_HEAD = isLight ? [160, 160, 160] : [128, 128, 128];
      const LINE_FOOT = isLight ? [140, 140, 140] : [80, 80, 80];

      function hexRGB(hex) {
        hex = hex.replace('#', '');
        if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
        return [parseInt(hex.slice(0,2),16), parseInt(hex.slice(2,4),16), parseInt(hex.slice(4,6),16)];
      }

      const PDF_VENUE_COLORS_DARK = {
        'WSOP': '#e8e8e8', 'PRS': '#e8e8e8', 'IPO': '#1a6b3c', 'PERSONAL': '#4a9eff',
        'WYNN': '#8a3030', 'ARIA': '#5a3a9a', 'GOLDEN NUGGET': '#7a6520',
        'RESORTS WORLD': '#2a7a72', 'SOUTH POINT': '#5e4430', 'ORLEANS': '#944828',
        'MGM GRAND': '#2a6a3e', 'MGM NH': '#8a7020', 'Turning Stone': '#8a6508',
        'TCH': '#a0522d', 'VEN': '#7a6520', 'CAESARS': '#b8962e', 'HARD ROCK': '#1a9e9e'
      };
      const PDF_VENUE_COLORS_LIGHT = {
        'WSOP': '#555555', 'PRS': '#555555', 'IPO': '#14552f', 'PERSONAL': '#2a6ec0',
        'WYNN': '#7a2020', 'ARIA': '#4a2a8a', 'GOLDEN NUGGET': '#6a5510',
        'RESORTS WORLD': '#1a6a62', 'SOUTH POINT': '#4e3420', 'ORLEANS': '#843818',
        'MGM GRAND': '#1a5a2e', 'MGM NH': '#7a6010', 'Turning Stone': '#7a5508',
        'TCH': '#90421d', 'VEN': '#6a5510', 'CAESARS': '#a8861e', 'HARD ROCK': '#0a8e8e'
      };
      const PDF_VENUE_COLORS = isLight ? PDF_VENUE_COLORS_LIGHT : PDF_VENUE_COLORS_DARK;
      const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

      // Sort by date+time, filter out restarts
      const sorted = [...events].filter(e => !e.is_restart).sort((a, b) => {
        const da = new Date(`${a.date} ${(a.time && a.time !== 'TBD') ? a.time : '12:00 AM'}`);
        const db = new Date(`${b.date} ${(b.time && b.time !== 'TBD') ? b.time : '12:00 AM'}`);
        return da - db;
      });
      if (!sorted.length) return;

      // Date range string for title
      const fmtRange = (d) => {
        if (!d) return '';
        const dt = new Date(d);
        return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      };
      const firstDate = sorted[0].date;
      const lastDateStr = sorted[sorted.length - 1].date;
      const rangeStr = fmtRange(firstDate) + ' \u2013 ' + fmtRange(lastDateStr) + '  \u00B7  ' + sorted.length + ' events';

      // ── Buy-in range grouping — use provided ranges or defaults ──
      const BUYIN_RANGES = opts.buyinRanges || [
        { label: 'Up to $1,500', min: 0, max: 1500 },
        { label: 'Up to $3,000', min: 1501, max: 3000 },
        { label: '$5,000 \u2013 $10,000', min: 5000, max: 10000 },
        { label: '$25,000+', min: 25000, max: Infinity },
      ];

      // ── Build rows + metadata from a list of events ──
      function buildRowsFromEvents(evts) {
        const rows = [];
        const newDateRowIndices = new Set();
        const venueColors = [];
        let prevDate = '';
        for (const ev of evts) {
          const d = ev.date || '';
          const isNewDate = d !== prevDate;
          if (isNewDate) newDateRowIndices.add(rows.length);
          let dateStr = '';
          if (isNewDate) {
            const dateObj = new Date(d);
            dateStr = String(dateObj.getDate()).padStart(2, '0') + ' ' + MONTHS[dateObj.getMonth()];
            prevDate = d;
          }
          const venue = getVenueInfo(ev.venue);
          venueColors.push(hexRGB(PDF_VENUE_COLORS[venue.abbr] || '#808080'));
          const planned = ev.planned_entries || 1;
          const entriesStr = planned + (planned === 1 ? ' Entry' : ' Entries');
          rows.push([
            dateStr,
            ev.time || 'TBD',
            venue.longName || venue.abbr,
            ev.event_name || '',
            ev.buyin ? formatBuyin(ev.buyin, ev.venue) : '\u2014',
            entriesStr
          ]);
        }
        return { rows, newDateRowIndices, venueColors };
      }

      const { rows, newDateRowIndices, venueColors } = buildRowsFromEvents(sorted);

      // ── Page title (drawn in top margin of every page) ──
      function drawTitle() {
        doc.setFont(FONT_BODY, 'bold');
        doc.setFontSize(14);
        doc.setTextColor(...TEXT_PRI);
        doc.text(title || 'MY SCHEDULE', mg, 12);
        doc.setFont(FONT_BODY, 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...TEXT_MUT);
        doc.text(rangeStr, mg, 17);
      }

      // ── Background fill + title on page 1 ──
      doc.setFillColor(...BG);
      doc.rect(0, 0, pw, ph, 'F');
      drawTitle();

      // ── Draw a table section (reused for full list or per buy-in group) ──
      let currentPage = 1;

      function drawTableSection(sectionRows, sectionVenueColors, sectionDateIndices, startY) {
        doc.autoTable({
          startY: startY,
          margin: { top: 24, left: mg, right: mg, bottom: 14 },
          head: [['DATE', 'TIME', 'VENUE', 'EVENT', 'BUY-IN', 'ENTRIES']],
          body: sectionRows,
          showHead: 'everyPage',
          theme: 'plain',
          tableWidth: 'auto',

          styles: {
            fillColor: BG,
            textColor: TEXT_PRI,
            font: FONT_BODY,
            fontStyle: 'normal',
            fontSize: 7.5,
            cellPadding: { top: 1.8, bottom: 1.8, left: 1, right: 1 },
            lineWidth: 0,
            overflow: 'ellipsize',
            valign: 'middle',
          },

          headStyles: {
            fillColor: BG,
            textColor: TEXT_MUT,
            font: FONT_BODY,
            fontStyle: 'bold',
            fontSize: 6.5,
            cellPadding: { top: 1.5, bottom: 2.5, left: 1, right: 1 },
          },

          alternateRowStyles: {
            fillColor: BG_ALT,
          },

          columnStyles: {
            0: { cellWidth: 18 },
            1: { cellWidth: 20 },
            2: { cellWidth: 34, fontSize: 7 },
            3: { cellWidth: 'auto' },
            4: { cellWidth: 20 },
            5: { cellWidth: 20, fontSize: 7 },
          },

          didParseCell: function(data) {
            const col = data.column.index;
            if (data.section === 'head') {
              if (col === 0 || col === 3) data.cell.styles.halign = 'left';
              else if (col === 1 || col === 4) data.cell.styles.halign = 'right';
              else data.cell.styles.halign = 'center';
            }
            if (data.section === 'body') {
              if (col === 0) {
                data.cell.styles.font = FONT_DATE;
                data.cell.styles.fontStyle = 'bold';
              }
              if (col === 1) data.cell.styles.halign = 'right';
              if (col === 2) {
                data.cell.styles.halign = 'center';
                data.cell.styles.textColor = sectionVenueColors[data.row.index];
              }
              if (col === 4) {
                data.cell.styles.halign = 'right';
                data.cell.styles.fontStyle = 'bold';
                data.cell.styles.textColor = TEXT_ACC;
              }
              if (col === 5) {
                data.cell.styles.halign = 'center';
                data.cell.styles.textColor = TEXT_MUT;
              }
            }
          },

          willDrawCell: function(data) {
            const pageNum = doc.internal.getCurrentPageInfo().pageNumber;
            if (pageNum > currentPage) {
              currentPage = pageNum;
              doc.setFillColor(...BG);
              doc.rect(0, 0, pw, ph, 'F');
              drawTitle();
            }
            if (data.section === 'body' && data.column.index === 0
                && sectionDateIndices.has(data.row.index) && data.row.index > 0) {
              doc.setDrawColor(...LINE_CLR);
              doc.setLineWidth(0.3);
              doc.line(mg, data.cell.y, pw - mg, data.cell.y);
            }
          },

          didDrawCell: function(data) {
            if (data.section === 'head' && data.column.index === 5) {
              doc.setDrawColor(...LINE_HEAD);
              doc.setLineWidth(0.2);
              const bottomY = data.cell.y + data.cell.height;
              doc.line(mg, bottomY, pw - mg, bottomY);
            }
          },

          didDrawPage: function(data) {
            doc.setFont(FONT_BODY, 'normal');
            doc.setFontSize(6.5);
            doc.setTextColor(...TEXT_MUT);
            doc.text('Generated by futurega.me', mg, ph - 5);
            const pageStr = 'Page ' + currentPage;
            const pageStrW = doc.getTextWidth(pageStr);
            doc.text(pageStr, pw - mg - pageStrW, ph - 5);
          },
        });

        return doc.lastAutoTable.finalY || startY;
      }

      // ── Draw section subtotal line ──
      function drawSectionTotal(evts, afterY) {
        // Group by currency
        const SYMBOL_LABEL = { '$': 'USD', '€': 'EUR' };
        const byCurrency = {};
        for (const ev of evts) {
          const sym = currencySymbol(ev.venue || '');
          if (!byCurrency[sym]) byCurrency[sym] = 0;
          const buyin = Number(ev.buyin) || 0;
          const entries = ev.planned_entries || 1;
          byCurrency[sym] += buyin * entries;
        }
        const currencies = Object.entries(byCurrency).filter(([, total]) => total > 0);
        if (currencies.length === 0) return afterY;

        const cols = doc.lastAutoTable.columns || [];
        let buyinRight = pw - mg;
        if (cols.length > 4) {
          let colX = mg;
          for (let i = 0; i < 4; i++) colX += (cols[i].width || 0);
          buyinRight = colX + (cols[4].width || 0) - 1;
        }
        let footY = afterY + 6;
        if (footY > ph - 20) {
          doc.addPage();
          currentPage++;
          doc.setFillColor(...BG);
          doc.rect(0, 0, pw, ph, 'F');
          drawTitle();
          footY = 30;
        }
        doc.setDrawColor(...LINE_FOOT);
        doc.setLineWidth(0.3);
        doc.line(mg, footY, pw - mg, footY);

        for (let ci = 0; ci < currencies.length; ci++) {
          const [sym, total] = currencies[ci];
          const label = currencies.length > 1
            ? 'TOTAL MAXIMUM BUY-INS (' + (SYMBOL_LABEL[sym] || sym) + ')'
            : 'TOTAL MAXIMUM BUY-INS';
          doc.setFont(FONT_BODY, 'bold');
          doc.setFontSize(8);
          doc.setTextColor(...TEXT_ACC);
          doc.text(label, mg, footY + 5);
          doc.setTextColor(...TEXT_PRI);
          doc.text(sym + Number(total).toLocaleString(), buyinRight, footY + 5, { align: 'right' });
          if (ci < currencies.length - 1) footY += 6;
        }
        return footY + 5;
      }

      // ── Draw section header for buy-in groups ──
      function drawSectionHeader(label, count, y) {
        // Check if we need a new page (need ~20mm for header + first row)
        if (y > ph - 30) {
          doc.addPage();
          currentPage++;
          doc.setFillColor(...BG);
          doc.rect(0, 0, pw, ph, 'F');
          drawTitle();
          y = 28;
        }
        doc.setFont(FONT_BODY, 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...TEXT_PRI);
        doc.text(label, mg, y);
        const labelW = doc.getTextWidth(label);
        doc.setFont(FONT_BODY, 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...TEXT_MUT);
        doc.text('  ' + count + ' event' + (count !== 1 ? 's' : ''), mg + labelW + 1, y);
        doc.setDrawColor(...LINE_HEAD);
        doc.setLineWidth(0.3);
        doc.line(mg, y + 2, pw - mg, y + 2);
        return y + 6;
      }

      // ── Render table(s) ──
      if (opts.groupByBuyin) {
        // Group events by buy-in range
        const groups = BUYIN_RANGES.map(range => ({
          ...range,
          events: sorted.filter(ev => {
            const b = Number(ev.buyin) || 0;
            return b >= range.min && b <= range.max;
          })
        })).filter(g => g.events.length > 0);

        let y = 24;
        for (let gi = 0; gi < groups.length; gi++) {
          const group = groups[gi];
          y = drawSectionHeader(group.label, group.events.length, y);
          const { rows: gRows, newDateRowIndices: gDateIdx, venueColors: gVColors } = buildRowsFromEvents(group.events);
          y = drawTableSection(gRows, gVColors, gDateIdx, y);
          y = drawSectionTotal(group.events, y);
          // Add spacing before next group
          if (gi < groups.length - 1) y += 10;
        }
      } else {
        // Single table — original behavior
        drawTableSection(rows, venueColors, newDateRowIndices, 24);
        drawSectionTotal(sorted, doc.lastAutoTable.finalY || 24);
      }

      doc.save('my-schedule.pdf');
    }

    // Draw a single schedule page on canvas (1080x1920 story format) — table layout matching PDF
    function drawSchedulePage(ctx, w, h, pageEvents, pageNum, totalPages, title, opts) {
      const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      const isLight = !!(opts && opts.light);

      // Theme colors for canvas
      const cBG       = isLight ? '#ffffff' : '#111111';
      const cBG_ALT   = isLight ? '#f5f5f5' : '#1a1a1a';
      const cTEXT     = isLight ? '#1e1e1e' : '#e8e8e8';
      const cTEXT_MUT = isLight ? '#646464' : '#808080';
      const cTEXT_ACC = isLight ? '#505050' : '#a0a0a0';
      const cEVENT    = isLight ? 'rgba(0,0,0,0.85)' : 'rgba(255,255,255,0.9)';
      const cLINE     = isLight ? '#c8c8c8' : '#333333';
      const cLINE_HEAD= isLight ? '#a0a0a0' : '#808080';

      // Light-mode venue colors (darker for white bg)
      const CANVAS_VENUE_LIGHT = {
        'WSOP': '#555555', 'PRS': '#555555', 'IPO': '#14552f', 'PERSONAL': '#2a6ec0',
        'WYNN': '#7a2020', 'ARIA': '#4a2a8a', 'GOLDEN NUGGET': '#6a5510',
        'RESORTS WORLD': '#1a6a62', 'SOUTH POINT': '#4e3420', 'ORLEANS': '#843818',
        'MGM GRAND': '#1a5a2e', 'MGM NH': '#7a6010', 'Turning Stone': '#7a5508',
        'TCH': '#90421d', 'VEN': '#6a5510', 'CAESARS': '#a8861e', 'HARD ROCK': '#0a8e8e'
      };
      function getCanvasVenueColor(venueName) {
        const info = getVenueInfo(venueName);
        if (isLight) return CANVAS_VENUE_LIGHT[info.abbr] || '#646464';
        return VENUE_CANVAS_COLORS[info.abbr] || '#808080';
      }

      // Solid background (matching PDF)
      ctx.fillStyle = cBG;
      ctx.fillRect(0, 0, w, h);

      const pad = 60;
      const contentW = w - pad * 2;

      // ── Title area ──
      ctx.textAlign = 'left';
      ctx.font = '700 42px Oswald, sans-serif';
      ctx.fillStyle = cTEXT;
      ctx.fillText(title || 'MY SCHEDULE', pad, 80);

      // Subtitle: date range + event count
      const allDates = [...new Set(pageEvents.map(e => e.date))].sort();
      const fmtD = (d) => {
        const dt = new Date(d);
        return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      };
      const rangeStr = fmtD(allDates[0]) + ' \u2013 ' + fmtD(allDates[allDates.length - 1]);
      ctx.font = '400 24px Oswald, sans-serif';
      ctx.fillStyle = cTEXT_MUT;
      ctx.fillText(rangeStr, pad, 112);

      // ── Column definitions ──
      // DATE(100) TIME(110) VENUE(170) EVENT(flex) BUYIN(110) ENTRIES(100)
      const colDate = pad;
      const colTime = pad + 100;
      const colVenue = pad + 210;
      const colEvent = pad + 380;
      const colBuyin = pad + contentW - 210;
      const colEntries = pad + contentW - 100;
      const tableRight = pad + contentW;

      // ── Column header row ──
      const headerY = 155;
      ctx.font = '700 20px Oswald, sans-serif';
      ctx.fillStyle = cTEXT_MUT;
      ctx.textAlign = 'left';
      ctx.fillText('DATE', colDate, headerY);
      ctx.textAlign = 'right';
      ctx.fillText('TIME', colTime + 110, headerY);
      ctx.textAlign = 'center';
      ctx.fillText('VENUE', colVenue + 85, headerY);
      ctx.textAlign = 'left';
      ctx.fillText('EVENT', colEvent, headerY);
      ctx.textAlign = 'right';
      ctx.fillText('BUY-IN', colBuyin + 100, headerY);
      ctx.textAlign = 'center';
      ctx.fillText('ENTRIES', colEntries + 50, headerY);

      // Header underline
      ctx.strokeStyle = cLINE_HEAD;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(pad, headerY + 10);
      ctx.lineTo(tableRight, headerY + 10);
      ctx.stroke();

      // ── Table body ──
      const rowH = 52;
      let y = headerY + 28;
      let lastDate = '';

      for (let i = 0; i < pageEvents.length; i++) {
        const ev = pageEvents[i];
        const isNewDate = ev.date !== lastDate;

        // Date group separator line
        if (isNewDate && lastDate !== '') {
          ctx.strokeStyle = cLINE;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(pad, y - 4);
          ctx.lineTo(tableRight, y - 4);
          ctx.stroke();
        }

        // Alternating row background
        ctx.fillStyle = i % 2 === 0 ? cBG : cBG_ALT;
        ctx.fillRect(pad, y - 2, contentW, rowH);

        const textY = y + rowH * 0.62;

        // DATE column — only on first event of each date
        if (isNewDate) {
          const dateObj = new Date(ev.date);
          const dateStr = String(dateObj.getDate()).padStart(2, '0') + ' ' + MONTHS[dateObj.getMonth()];
          ctx.font = '700 24px "Georgia", "Times New Roman", serif';
          ctx.fillStyle = cTEXT;
          ctx.textAlign = 'left';
          ctx.fillText(dateStr, colDate, textY);
          lastDate = ev.date;
        }

        // TIME column
        ctx.font = '400 22px Oswald, sans-serif';
        ctx.fillStyle = cTEXT;
        ctx.textAlign = 'right';
        ctx.fillText(ev.time || 'TBD', colTime + 110, textY);

        // VENUE column — brand color
        const venue = getVenueInfo(ev.venue);
        const venueColor = getCanvasVenueColor(ev.venue);
        ctx.font = '400 20px Oswald, sans-serif';
        ctx.fillStyle = venueColor;
        ctx.textAlign = 'center';
        const venueName = venue.longName || venue.abbr;
        // Truncate venue if too wide
        let venueDisplay = venueName;
        const maxVenueW = 160;
        while (ctx.measureText(venueDisplay).width > maxVenueW && venueDisplay.length > 3) {
          venueDisplay = venueDisplay.slice(0, -4) + '\u2026';
        }
        ctx.fillText(venueDisplay, colVenue + 85, textY);

        // EVENT column — primary text, truncate with ellipsis
        ctx.font = '400 22px Oswald, sans-serif';
        ctx.fillStyle = cEVENT;
        ctx.textAlign = 'left';
        let eventName = ev.event_name || '';
        const maxEventW = colBuyin - colEvent - 15;
        while (ctx.measureText(eventName).width > maxEventW && eventName.length > 3) {
          eventName = eventName.slice(0, -4) + '\u2026';
        }
        ctx.fillText(eventName, colEvent, textY);

        // BUY-IN column — right-aligned, accent
        const buyinText = ev.buyin ? formatBuyin(ev.buyin, ev.venue) : '\u2014';
        ctx.font = '700 22px Oswald, sans-serif';
        ctx.fillStyle = cTEXT_ACC;
        ctx.textAlign = 'right';
        ctx.fillText(buyinText, colBuyin + 100, textY);

        // ENTRIES column — centered, muted
        const planned = ev.planned_entries || 1;
        const entriesStr = planned + (planned === 1 ? ' Entry' : ' Entries');
        ctx.font = '400 20px Oswald, sans-serif';
        ctx.fillStyle = cTEXT_MUT;
        ctx.textAlign = 'center';
        ctx.fillText(entriesStr, colEntries + 50, textY);

        y += rowH;
      }

      // ── Footer ──
      ctx.font = '400 20px Oswald, sans-serif';
      ctx.fillStyle = cTEXT_MUT;
      ctx.textAlign = 'left';
      ctx.fillText('Generated by futurega.me', pad, h - 50);
      if (totalPages > 1) {
        ctx.textAlign = 'right';
        ctx.fillText('Page ' + pageNum, tableRight, h - 50);
      }
      ctx.textAlign = 'left';

      drawWatermark(ctx, w, h, 'bottom-center');
    }

    // Generate array of schedule image canvases
    function generateScheduleImages(events, title, opts) {
      const sorted = [...events].filter(e => !e.is_restart).sort((a, b) => {
        const da = new Date(`${a.date} ${(a.time && a.time !== 'TBD') ? a.time : '12:00 AM'}`);
        const db = new Date(`${b.date} ${(b.time && b.time !== 'TBD') ? b.time : '12:00 AM'}`);
        return da - db;
      });

      // Paginate: ~28 events per 1080x1920 page (compact table rows)
      const perPage = 28;
      const pages = [];
      for (let i = 0; i < sorted.length; i += perPage) {
        pages.push(sorted.slice(i, i + perPage));
      }

      const canvases = [];
      for (let i = 0; i < pages.length; i++) {
        const canvas = document.createElement('canvas');
        canvas.width = 1080; canvas.height = 1920;
        const ctx = canvas.getContext('2d');
        drawSchedulePage(ctx, 1080, 1920, pages[i], i + 1, pages.length, title, opts);
        canvases.push(canvas);
      }
      return canvases;
    }

    // ── 1. Chip Stack Graph Over Time (Instagram Story 1080x1920) ──
    function drawChipStackStory(ctx, w, h, data) {
      // data: { tournamentName, stackHistory, startingStack, milestones, bb }
      drawShareBackground(ctx, w, h);

      const padX = Math.round(w * 0.08);
      const padR = w - padX;
      const history = (data.stackHistory || []).filter(u => u.stack && Number(u.stack) > 0);

      // Title section
      const titleY = Math.round(h * 0.06);
      ctx.font = '600 ' + Math.round(h * 0.014) + 'px Oswald, sans-serif';
      ctx.fillStyle = '#22c55e';
      ctx.letterSpacing = '3px';
      ctx.fillText('STACK TRACKER', padX, titleY);
      ctx.letterSpacing = '0px';

      ctx.font = '600 ' + Math.round(h * 0.024) + 'px Oswald, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(data.tournamentName || '', padX, titleY + Math.round(h * 0.035));

      // Green divider
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(padX, Math.round(h * 0.11), padR - padX, 2);

      if (history.length < 2) {
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = Math.round(h * 0.018) + 'px Oswald, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Need 2+ updates for stack graph', w / 2, h / 2);
        ctx.textAlign = 'left';
        drawWatermark(ctx, w, h, 'bottom-center');
        return;
      }

      // Chart area
      const chartTop = Math.round(h * 0.14);
      const chartBottom = Math.round(h * 0.78);
      const chartH = chartBottom - chartTop;
      const chartW = padR - padX;

      const stacks = history.map(u => Number(u.stack));
      const maxS = Math.max(...stacks) * 1.1;
      const minS = Math.min(0, ...stacks);
      const range = maxS - minS || 1;

      // BB scale on right (if bb data available)
      const bb = data.bb ? Number(data.bb) : null;

      // Y-axis grid lines and labels
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      const gridLines = 5;
      for (let i = 0; i <= gridLines; i++) {
        const gy = chartTop + chartH - (chartH * i / gridLines);
        const val = minS + (range * i / gridLines);
        ctx.beginPath(); ctx.moveTo(padX, gy); ctx.lineTo(padR, gy); ctx.stroke();

        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.font = Math.round(h * 0.012) + 'px Oswald, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(formatChips(Math.round(val)), padX - 8, gy + 4);

        if (bb && val > 0) {
          ctx.textAlign = 'left';
          ctx.fillStyle = 'rgba(255,255,255,0.25)';
          ctx.fillText(Math.round(val / bb) + 'bb', padR + 8, gy + 4);
        }
      }
      ctx.textAlign = 'left';

      // Starting stack reference line
      if (data.startingStack) {
        const ssVal = Number(data.startingStack);
        const ssY = chartTop + chartH - ((ssVal - minS) / range * chartH);
        if (ssY >= chartTop && ssY <= chartBottom) {
          ctx.strokeStyle = 'rgba(255,255,255,0.2)';
          ctx.setLineDash([6, 6]);
          ctx.beginPath(); ctx.moveTo(padX, ssY); ctx.lineTo(padR, ssY); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = 'rgba(255,255,255,0.3)';
          ctx.font = Math.round(h * 0.011) + 'px Oswald, sans-serif';
          ctx.fillText('Starting Stack', padX, ssY - 6);
        }
      }

      // Draw line chart
      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.beginPath();
      const points = [];
      stacks.forEach((s, i) => {
        const x = padX + (chartW * i / (stacks.length - 1));
        const y = chartTop + chartH - ((s - minS) / range * chartH);
        points.push({ x, y, stack: s, entry: history[i] });
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.stroke();

      // Gradient fill under line
      const grad = ctx.createLinearGradient(0, chartTop, 0, chartBottom);
      grad.addColorStop(0, 'rgba(34,197,94,0.30)');
      grad.addColorStop(1, 'rgba(34,197,94,0.02)');
      ctx.fillStyle = grad;
      ctx.lineTo(padR, chartBottom);
      ctx.lineTo(padX, chartBottom);
      ctx.closePath();
      ctx.fill();

      // Dot at each data point
      points.forEach((p, i) => {
        ctx.fillStyle = '#22c55e';
        ctx.beginPath(); ctx.arc(p.x, p.y, i === points.length - 1 ? 6 : 4, 0, Math.PI * 2); ctx.fill();
        if (i === points.length - 1) {
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
        }
      });

      // Milestone labels (ITM, Final Table, Deal)
      const labelSize = Math.round(h * 0.012);
      points.forEach(p => {
        const entry = p.entry;
        let label = null;
        let color = '#fbbf24';
        if (entry.is_final_table) { label = 'FINAL TABLE'; color = '#f59e0b'; }
        else if (entry.is_itm) { label = 'ITM'; color = '#22c55e'; }
        if (entry.is_busted) { label = 'BUST'; color = '#f87171'; }

        if (label) {
          ctx.font = '600 ' + labelSize + 'px Oswald, sans-serif';
          ctx.fillStyle = color;
          ctx.textAlign = 'center';
          ctx.fillText(label, p.x, p.y - 12);
          ctx.textAlign = 'left';
        }
      });

      // Time axis (X)
      const xLabelSize = Math.round(h * 0.010);
      ctx.font = xLabelSize + 'px Oswald, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      const showIndices = [0, Math.floor(history.length / 2), history.length - 1].filter((v, i, a) => a.indexOf(v) === i);
      showIndices.forEach(i => {
        if (!history[i] || !history[i].created_at) return;
        const d = new Date(history[i].created_at);
        const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const x = padX + (chartW * i / (history.length - 1));
        ctx.textAlign = 'center';
        ctx.fillText(timeStr, x, chartBottom + Math.round(h * 0.025));
      });
      ctx.textAlign = 'left';

      // Current stack display at bottom
      const currentStack = stacks[stacks.length - 1];
      const statY = Math.round(h * 0.85);
      ctx.font = '600 ' + Math.round(h * 0.040) + 'px Oswald, sans-serif';
      ctx.fillStyle = '#22c55e';
      ctx.textAlign = 'center';
      ctx.fillText(formatChips(currentStack), w / 2, statY);

      if (bb) {
        ctx.font = Math.round(h * 0.018) + 'px Oswald, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText((currentStack / bb).toFixed(1).replace(/\.0$/, '') + ' BB', w / 2, statY + Math.round(h * 0.03));
      }

      // Blinds level
      const lastEntry = history[history.length - 1];
      if (lastEntry.sb && lastEntry.bb) {
        ctx.font = Math.round(h * 0.014) + 'px Oswald, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillText('Blinds: ' + formatChips(lastEntry.sb) + '/' + formatChips(lastEntry.bb), w / 2, statY + Math.round(h * 0.055));
      }
      ctx.textAlign = 'left';

      drawWatermark(ctx, w, h, 'bottom-center');
    }

    // ── 2. Series Scorecard (1080x1080 square) ──
    function drawSeriesScorecard(ctx, w, h, data) {
      // data: { venueName, dateRange, eventsPlayed, cashCount, cashRate, totalInvested, totalCashed, netPL, roi, currentStreak, biggestCash, biggestCashEvent }
      drawShareBackground(ctx, w, h);

      const padX = Math.round(w * 0.08);
      const padR = w - padX;

      // Header
      ctx.font = '600 ' + Math.round(h * 0.016) + 'px Oswald, sans-serif';
      ctx.fillStyle = '#22c55e';
      ctx.letterSpacing = '3px';
      ctx.fillText('SERIES SCORECARD', padX, Math.round(h * 0.07));
      ctx.letterSpacing = '0px';

      ctx.font = '600 ' + Math.round(h * 0.032) + 'px Oswald, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(data.venueName || 'My Results', padX, Math.round(h * 0.12));

      if (data.dateRange) {
        ctx.font = Math.round(h * 0.016) + 'px Oswald, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText(data.dateRange, padX, Math.round(h * 0.155));
      }

      // Green divider
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(padX, Math.round(h * 0.175), padR - padX, 2);

      // Stats grid (2 columns)
      const statStartY = Math.round(h * 0.22);
      const statRowH = Math.round(h * 0.09);
      const colW = Math.round((padR - padX) / 2);

      const drawStat = (label, value, x, y, color) => {
        ctx.font = Math.round(h * 0.014) + 'px Oswald, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.letterSpacing = '1px';
        ctx.fillText(label.toUpperCase(), x, y);
        ctx.letterSpacing = '0px';
        ctx.font = '600 ' + Math.round(h * 0.030) + 'px Oswald, sans-serif';
        ctx.fillStyle = color || '#ffffff';
        ctx.fillText(value, x, y + Math.round(h * 0.038));
      };

      // Row 1: Events played / Cashes
      drawStat('EVENTS PLAYED', String(data.eventsPlayed || 0), padX, statStartY);
      drawStat('CASHES', (data.cashCount || 0) + ' (' + (data.cashRate || 0).toFixed(0) + '%)', padX + colW, statStartY);

      // Row 2: Total invested / Total cashed
      drawStat('INVESTED', formatBuyin(data.totalInvested || 0), padX, statStartY + statRowH);
      drawStat('CASHED', formatBuyin(data.totalCashed || 0), padX + colW, statStartY + statRowH);

      // Row 3: Net P&L (big, centered)
      const plY = statStartY + statRowH * 2 + Math.round(h * 0.02);
      ctx.font = Math.round(h * 0.014) + 'px Oswald, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.letterSpacing = '1px';
      ctx.textAlign = 'center';
      ctx.fillText('NET PROFIT / LOSS', w / 2, plY);
      ctx.letterSpacing = '0px';
      const pl = data.netPL || 0;
      ctx.font = '700 ' + Math.round(h * 0.055) + 'px Oswald, sans-serif';
      ctx.fillStyle = pl >= 0 ? '#22c55e' : '#f87171';
      ctx.fillText((pl >= 0 ? '+' : '') + formatBuyin(pl), w / 2, plY + Math.round(h * 0.06));

      // ROI
      const roi = data.roi || 0;
      ctx.font = '600 ' + Math.round(h * 0.022) + 'px Oswald, sans-serif';
      ctx.fillStyle = roi >= 0 ? 'rgba(34,197,94,0.7)' : 'rgba(248,113,113,0.7)';
      ctx.fillText((roi >= 0 ? '+' : '') + roi.toFixed(1) + '% ROI', w / 2, plY + Math.round(h * 0.095));
      ctx.textAlign = 'left';

      // Green divider
      const div2Y = plY + Math.round(h * 0.13);
      ctx.fillStyle = 'rgba(34,197,94,0.2)';
      ctx.fillRect(padX, div2Y, padR - padX, 1);

      // Streak
      const streakY = div2Y + Math.round(h * 0.04);
      if (data.currentStreak) {
        ctx.font = Math.round(h * 0.014) + 'px Oswald, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.letterSpacing = '1px';
        ctx.fillText('CURRENT STREAK', padX, streakY);
        ctx.letterSpacing = '0px';
        ctx.font = '600 ' + Math.round(h * 0.022) + 'px Oswald, sans-serif';
        ctx.fillStyle = '#fbbf24';
        ctx.fillText(data.currentStreak, padX, streakY + Math.round(h * 0.035));
      }

      // Biggest cash
      if (data.biggestCash) {
        const bcY = streakY + (data.currentStreak ? Math.round(h * 0.08) : 0);
        ctx.font = Math.round(h * 0.014) + 'px Oswald, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.letterSpacing = '1px';
        ctx.fillText('BIGGEST CASH', padX, bcY);
        ctx.letterSpacing = '0px';
        ctx.font = '600 ' + Math.round(h * 0.026) + 'px Oswald, sans-serif';
        ctx.fillStyle = '#fbbf24';
        ctx.fillText(formatBuyin(data.biggestCash), padX, bcY + Math.round(h * 0.035));
        if (data.biggestCashEvent) {
          ctx.font = Math.round(h * 0.014) + 'px Oswald, sans-serif';
          ctx.fillStyle = 'rgba(255,255,255,0.4)';
          ctx.fillText(data.biggestCashEvent, padX, bcY + Math.round(h * 0.06));
        }
      }

      drawWatermark(ctx, w, h, 'bottom-center');
    }

    // ── 3. Deep Run Tracker Standalone (1080x1080) ──
    function drawDeepRunStandalone(ctx, w, h, data) {
      // data: { tournamentName, stack, totalEntries, placesLeft, buyin }
      drawShareBackground(ctx, w, h);

      const padX = Math.round(w * 0.08);
      const padR = w - padX;

      // Header
      ctx.font = '600 ' + Math.round(h * 0.016) + 'px Oswald, sans-serif';
      ctx.fillStyle = '#22c55e';
      ctx.letterSpacing = '3px';
      ctx.fillText('DEEP RUN', padX, Math.round(h * 0.08));
      ctx.letterSpacing = '0px';

      ctx.font = '600 ' + Math.round(h * 0.028) + 'px Oswald, sans-serif';
      ctx.fillStyle = '#ffffff';
      const buyinStr = data.buyin ? '$' + Number(data.buyin).toLocaleString() + ' ' : '';
      ctx.fillText(buyinStr + (data.tournamentName || ''), padX, Math.round(h * 0.12));

      ctx.fillStyle = '#22c55e';
      ctx.fillRect(padX, Math.round(h * 0.145), padR - padX, 2);

      const total = Number(data.totalEntries) || 1;
      const left = Number(data.placesLeft) || total;
      const pctSurvived = Math.max(0.01, 1 - (left - 1) / total);
      const topPct = (pctSurvived * 100).toFixed(1);

      // Big position display
      const posY = Math.round(h * 0.28);
      ctx.textAlign = 'center';
      ctx.font = '700 ' + Math.round(h * 0.08) + 'px Oswald, sans-serif';
      ctx.fillStyle = '#ffffff';
      const posText = left + (typeof left === 'number' ? ordinalSuffix(left) : '');
      ctx.fillText(posText, w / 2, posY);

      ctx.font = Math.round(h * 0.024) + 'px Oswald, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText('of ' + total.toLocaleString() + ' entries', w / 2, posY + Math.round(h * 0.04));

      ctx.font = '600 ' + Math.round(h * 0.022) + 'px Oswald, sans-serif';
      ctx.fillStyle = '#22c55e';
      ctx.fillText('Top ' + topPct + '%', w / 2, posY + Math.round(h * 0.08));
      ctx.textAlign = 'left';

      // Horizontal field visualization bar
      const barY = Math.round(h * 0.48);
      const barH = Math.round(h * 0.04);
      const barW = padR - padX;

      // Background bar (eliminated field)
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      roundedRect(ctx, padX, barY, barW, barH, barH / 2);
      ctx.fill();

      // Remaining field
      const remainW = Math.max(barH, Math.round(barW * (left / total)));
      ctx.fillStyle = 'rgba(34,197,94,0.2)';
      roundedRect(ctx, padX, barY, remainW, barH, barH / 2);
      ctx.fill();

      // Player position marker
      const markerX = padX + Math.round(barW * pctSurvived);
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(markerX, barY + barH / 2, barH * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(markerX, barY + barH / 2, barH * 0.3, 0, Math.PI * 2);
      ctx.fill();

      // Labels on bar
      ctx.font = Math.round(h * 0.013) + 'px Oswald, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillText('1st', padR - ctx.measureText('1st').width, barY - 8);
      ctx.fillText(total.toLocaleString() + 'th', padX, barY - 8);

      // Stack display
      if (data.stack) {
        const stackY = Math.round(h * 0.62);
        ctx.textAlign = 'center';
        ctx.font = Math.round(h * 0.016) + 'px Oswald, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.letterSpacing = '1px';
        ctx.fillText('STACK', w / 2, stackY);
        ctx.letterSpacing = '0px';
        ctx.font = '600 ' + Math.round(h * 0.040) + 'px Oswald, sans-serif';
        ctx.fillStyle = '#22c55e';
        ctx.fillText(formatChips(data.stack), w / 2, stackY + Math.round(h * 0.05));
        ctx.textAlign = 'left';
      }

      drawWatermark(ctx, w, h, 'bottom-center');
    }

    // ── 4. Next Event Countdown Story (1080x1920) ──
    function drawCountdownStory(ctx, w, h, data) {
      // data: { tournamentName, buyin, venue, gameType, timeUntil, date, time }
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#0d1a12');
      grad.addColorStop(0.5, '#0f1f15');
      grad.addColorStop(1, '#0a0f0d');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Subtle diamond pattern for felt texture
      ctx.strokeStyle = 'rgba(34,197,94,0.04)';
      ctx.lineWidth = 1;
      for (let y = 0; y < h; y += 30) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      for (let x = 0; x < w; x += 30) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }

      const padX = Math.round(w * 0.10);

      // "NEXT UP" at top
      ctx.font = '600 ' + Math.round(h * 0.016) + 'px Oswald, sans-serif';
      ctx.fillStyle = '#22c55e';
      ctx.letterSpacing = '4px';
      ctx.textAlign = 'center';
      ctx.fillText('NEXT UP', w / 2, Math.round(h * 0.12));
      ctx.letterSpacing = '0px';

      // Green line
      const lineW = Math.round(w * 0.3);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect((w - lineW) / 2, Math.round(h * 0.14), lineW, 2);

      // Big countdown
      const countY = Math.round(h * 0.32);
      ctx.font = '700 ' + Math.round(h * 0.08) + 'px Oswald, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(data.timeUntil || '--', w / 2, countY);

      ctx.font = Math.round(h * 0.018) + 'px Oswald, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillText('until cards are in the air', w / 2, countY + Math.round(h * 0.04));

      // Divider
      ctx.fillStyle = 'rgba(34,197,94,0.3)';
      ctx.fillRect((w - lineW) / 2, Math.round(h * 0.42), lineW, 1);

      // Event details
      const detailY = Math.round(h * 0.50);
      if (data.buyin) {
        ctx.font = '700 ' + Math.round(h * 0.035) + 'px Oswald, sans-serif';
        ctx.fillStyle = '#22c55e';
        ctx.fillText('$' + Number(data.buyin).toLocaleString(), w / 2, detailY);
      }

      ctx.font = '600 ' + Math.round(h * 0.022) + 'px Oswald, sans-serif';
      ctx.fillStyle = '#ffffff';
      const nameLines = wrapText(ctx, data.tournamentName || '', w - padX * 2);
      nameLines.forEach((line, i) => {
        ctx.fillText(line, w / 2, detailY + Math.round(h * 0.045) + i * Math.round(h * 0.028));
      });

      const infoY = detailY + Math.round(h * 0.045) + nameLines.length * Math.round(h * 0.028) + Math.round(h * 0.02);
      if (data.venue) {
        ctx.font = Math.round(h * 0.018) + 'px Oswald, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText(data.venue, w / 2, infoY);
      }
      if (data.gameType) {
        ctx.font = Math.round(h * 0.016) + 'px Oswald, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillText(data.gameType, w / 2, infoY + Math.round(h * 0.028));
      }

      ctx.textAlign = 'left';
      drawWatermark(ctx, w, h, 'bottom-center');
    }

    // Text wrapping helper for canvas
    function wrapText(ctx, text, maxWidth) {
      const words = text.split(' ');
      const lines = [];
      let line = '';
      for (const word of words) {
        const test = line ? line + ' ' + word : word;
        if (ctx.measureText(test).width > maxWidth) {
          if (line) lines.push(line);
          line = word;
        } else {
          line = test;
        }
      }
      if (line) lines.push(line);
      return lines.length ? lines : [''];
    }

    // ── 5. Final Table Card Standalone (1080x1080) ──
    function drawFinalTableCard(ctx, w, h, data) {
      // data: { tournamentName, buyin, placesLeft, stack, firstPlacePrize, totalEntries, bb }
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#1a1510');
      grad.addColorStop(0.3, '#1a1a2e');
      grad.addColorStop(1, '#0f0f1a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Gold border glow
      ctx.strokeStyle = 'rgba(251,191,36,0.3)';
      ctx.lineWidth = 3;
      roundedRect(ctx, 20, 20, w - 40, h - 40, 20);
      ctx.stroke();

      // Inner border
      ctx.strokeStyle = 'rgba(251,191,36,0.12)';
      ctx.lineWidth = 1;
      roundedRect(ctx, 35, 35, w - 70, h - 70, 14);
      ctx.stroke();

      const padX = Math.round(w * 0.10);

      // Trophy / "FINAL TABLE" header
      const headerY = Math.round(h * 0.12);
      ctx.textAlign = 'center';

      // Gold gradient for header text
      const goldGrad = ctx.createLinearGradient(0, headerY - 50, 0, headerY + 20);
      goldGrad.addColorStop(0, '#fbbf24');
      goldGrad.addColorStop(0.5, '#f59e0b');
      goldGrad.addColorStop(1, '#d97706');

      ctx.font = '700 ' + Math.round(h * 0.050) + 'px Oswald, sans-serif';
      ctx.fillStyle = goldGrad;
      ctx.fillText('FINAL TABLE', w / 2, headerY);

      // Gold line
      const lineW = Math.round(w * 0.5);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect((w - lineW) / 2, headerY + Math.round(h * 0.02), lineW, 2);

      // Event name
      ctx.font = '600 ' + Math.round(h * 0.026) + 'px Oswald, sans-serif';
      ctx.fillStyle = '#ffffff';
      const buyStr = data.buyin ? '$' + Number(data.buyin).toLocaleString() + ' ' : '';
      const eventText = buyStr + (data.tournamentName || '');
      const eventLines = wrapText(ctx, eventText, w - padX * 2);
      eventLines.forEach((line, i) => {
        ctx.fillText(line, w / 2, Math.round(h * 0.22) + i * Math.round(h * 0.032));
      });

      // Stats section
      const statsY = Math.round(h * 0.36);
      const statGap = Math.round(h * 0.12);

      // Players remaining
      if (data.placesLeft) {
        ctx.font = Math.round(h * 0.014) + 'px Oswald, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.letterSpacing = '2px';
        ctx.fillText('PLAYERS REMAINING', w / 2, statsY);
        ctx.letterSpacing = '0px';
        ctx.font = '700 ' + Math.round(h * 0.055) + 'px Oswald, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(String(data.placesLeft), w / 2, statsY + Math.round(h * 0.06));
        if (data.totalEntries) {
          ctx.font = Math.round(h * 0.016) + 'px Oswald, sans-serif';
          ctx.fillStyle = 'rgba(255,255,255,0.4)';
          ctx.fillText('of ' + Number(data.totalEntries).toLocaleString() + ' entries', w / 2, statsY + Math.round(h * 0.085));
        }
      }

      // Stack
      if (data.stack) {
        const sY = statsY + statGap;
        ctx.font = Math.round(h * 0.014) + 'px Oswald, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.letterSpacing = '2px';
        ctx.fillText('MY STACK', w / 2, sY);
        ctx.letterSpacing = '0px';
        ctx.font = '700 ' + Math.round(h * 0.040) + 'px Oswald, sans-serif';
        ctx.fillStyle = '#22c55e';
        ctx.fillText(formatChips(data.stack), w / 2, sY + Math.round(h * 0.05));
        if (data.bb) {
          ctx.font = Math.round(h * 0.016) + 'px Oswald, sans-serif';
          ctx.fillStyle = 'rgba(255,255,255,0.4)';
          ctx.fillText((Number(data.stack) / Number(data.bb)).toFixed(1).replace(/\.0$/, '') + ' BB', w / 2, sY + Math.round(h * 0.075));
        }
      }

      // 1st place prize
      if (data.firstPlacePrize) {
        const pY = statsY + statGap * 2;
        ctx.font = Math.round(h * 0.014) + 'px Oswald, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.letterSpacing = '2px';
        ctx.fillText('FIRST PLACE', w / 2, pY);
        ctx.letterSpacing = '0px';
        ctx.font = '700 ' + Math.round(h * 0.045) + 'px Oswald, sans-serif';
        ctx.fillStyle = '#fbbf24';
        ctx.fillText('$' + Number(data.firstPlacePrize).toLocaleString(), w / 2, pY + Math.round(h * 0.055));
      }

      ctx.textAlign = 'left';

      // Watermark
      const wms = Math.round(h * 0.016);
      ctx.font = wms + 'px Oswald, sans-serif';
      ctx.fillStyle = 'rgba(251,191,36,0.3)';
      ctx.textAlign = 'center';
      ctx.fillText('futurega.me', w / 2, Math.round(h * 0.95));
      ctx.textAlign = 'left';
    }

    // ── 6. Series Wrap-Up Slides (Spotify Wrapped Style) ──
    // Each slide is 1080x1920

    function drawWrapSlide1(ctx, w, h, data) {
      // Slide 1: "Your [Venue] Series" with total events
      drawShareBackground(ctx, w, h);
      const padX = Math.round(w * 0.10);

      ctx.textAlign = 'center';

      // Top accent
      ctx.font = '600 ' + Math.round(h * 0.014) + 'px Oswald, sans-serif';
      ctx.fillStyle = '#22c55e';
      ctx.letterSpacing = '4px';
      ctx.fillText('SERIES WRAP', w / 2, Math.round(h * 0.10));
      ctx.letterSpacing = '0px';

      // Venue name big
      ctx.font = '700 ' + Math.round(h * 0.045) + 'px Oswald, sans-serif';
      ctx.fillStyle = '#ffffff';
      const venueLines = wrapText(ctx, data.venueName || 'Your Series', w - padX * 2);
      venueLines.forEach((line, i) => {
        ctx.fillText(line, w / 2, Math.round(h * 0.28) + i * Math.round(h * 0.05));
      });

      // Big number: events played
      ctx.font = '700 ' + Math.round(h * 0.14) + 'px Oswald, sans-serif';
      ctx.fillStyle = '#22c55e';
      ctx.fillText(String(data.eventsPlayed || 0), w / 2, Math.round(h * 0.52));

      ctx.font = '600 ' + Math.round(h * 0.024) + 'px Oswald, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText('events played', w / 2, Math.round(h * 0.57));

      // Date range
      if (data.dateRange) {
        ctx.font = Math.round(h * 0.016) + 'px Oswald, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillText(data.dateRange, w / 2, Math.round(h * 0.63));
      }

      ctx.textAlign = 'left';
      drawWatermark(ctx, w, h, 'bottom-center');
    }

    function drawWrapSlide2(ctx, w, h, data) {
      // Slide 2: Results breakdown
      drawShareBackground(ctx, w, h);

      ctx.textAlign = 'center';
      ctx.font = '600 ' + Math.round(h * 0.014) + 'px Oswald, sans-serif';
      ctx.fillStyle = '#22c55e';
      ctx.letterSpacing = '4px';
      ctx.fillText('THE NUMBERS', w / 2, Math.round(h * 0.10));
      ctx.letterSpacing = '0px';

      // Invested
      const row1Y = Math.round(h * 0.20);
      ctx.font = Math.round(h * 0.016) + 'px Oswald, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillText('INVESTED', w / 2, row1Y);
      ctx.font = '700 ' + Math.round(h * 0.035) + 'px Oswald, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(formatBuyin(data.totalInvested || 0), w / 2, row1Y + Math.round(h * 0.045));

      // Cashed
      const row2Y = Math.round(h * 0.32);
      ctx.font = Math.round(h * 0.016) + 'px Oswald, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillText('CASHED', w / 2, row2Y);
      ctx.font = '700 ' + Math.round(h * 0.035) + 'px Oswald, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(formatBuyin(data.totalCashed || 0), w / 2, row2Y + Math.round(h * 0.045));

      // Arrow down
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = Math.round(h * 0.030) + 'px sans-serif';
      ctx.fillText('\u2193', w / 2, Math.round(h * 0.43));

      // P&L (big)
      const plY = Math.round(h * 0.50);
      const pl = data.netPL || 0;
      ctx.font = Math.round(h * 0.016) + 'px Oswald, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillText('NET P&L', w / 2, plY);
      ctx.font = '700 ' + Math.round(h * 0.07) + 'px Oswald, sans-serif';
      ctx.fillStyle = pl >= 0 ? '#22c55e' : '#f87171';
      ctx.fillText((pl >= 0 ? '+' : '') + formatBuyin(pl), w / 2, plY + Math.round(h * 0.07));

      // ROI + cash rate
      ctx.font = '600 ' + Math.round(h * 0.020) + 'px Oswald, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      const roiStr = (data.roi || 0).toFixed(1) + '% ROI';
      const cashStr = (data.cashCount || 0) + '/' + (data.eventsPlayed || 0) + ' cashes (' + (data.cashRate || 0).toFixed(0) + '%)';
      ctx.fillText(roiStr + '  \u00b7  ' + cashStr, w / 2, plY + Math.round(h * 0.11));

      ctx.textAlign = 'left';
      drawWatermark(ctx, w, h, 'bottom-center');
    }

    function drawWrapSlide3(ctx, w, h, data) {
      // Slide 3: Biggest cash
      drawShareBackground(ctx, w, h);

      ctx.textAlign = 'center';
      ctx.font = '600 ' + Math.round(h * 0.014) + 'px Oswald, sans-serif';
      ctx.fillStyle = '#fbbf24';
      ctx.letterSpacing = '4px';
      ctx.fillText('BEST MOMENT', w / 2, Math.round(h * 0.10));
      ctx.letterSpacing = '0px';

      // Gold star effect
      ctx.font = Math.round(h * 0.06) + 'px sans-serif';
      ctx.fillText('*', w / 2, Math.round(h * 0.22));

      // Biggest cash amount
      ctx.font = '700 ' + Math.round(h * 0.08) + 'px Oswald, sans-serif';
      ctx.fillStyle = '#fbbf24';
      ctx.fillText(formatBuyin(data.biggestCash || 0), w / 2, Math.round(h * 0.38));

      ctx.font = Math.round(h * 0.018) + 'px Oswald, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillText('BIGGEST CASH', w / 2, Math.round(h * 0.42));

      // Event name
      if (data.biggestCashEvent) {
        ctx.font = '600 ' + Math.round(h * 0.020) + 'px Oswald, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        const lines = wrapText(ctx, data.biggestCashEvent, w * 0.7);
        lines.forEach((line, i) => {
          ctx.fillText(line, w / 2, Math.round(h * 0.48) + i * Math.round(h * 0.028));
        });
      }

      // Finish place
      if (data.biggestCashPlace) {
        ctx.font = Math.round(h * 0.016) + 'px Oswald, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillText('Finished ' + data.biggestCashPlace + ordinalSuffix(data.biggestCashPlace), w / 2, Math.round(h * 0.56));
      }

      ctx.textAlign = 'left';
      drawWatermark(ctx, w, h, 'bottom-center');
    }

    function drawWrapSlide4(ctx, w, h, data) {
      // Slide 4: Game breakdown — pie chart of variants played
      drawShareBackground(ctx, w, h);

      ctx.textAlign = 'center';
      ctx.font = '600 ' + Math.round(h * 0.014) + 'px Oswald, sans-serif';
      ctx.fillStyle = '#22c55e';
      ctx.letterSpacing = '4px';
      ctx.fillText('GAME MIX', w / 2, Math.round(h * 0.10));
      ctx.letterSpacing = '0px';

      const variants = data.gameBreakdown || []; // [{ name, count, profit }]
      if (variants.length === 0) {
        ctx.font = Math.round(h * 0.018) + 'px Oswald, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillText('No game data', w / 2, h / 2);
        ctx.textAlign = 'left';
        drawWatermark(ctx, w, h, 'bottom-center');
        return;
      }

      // Pie chart
      const colors = ['#22c55e', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];
      const total = variants.reduce((s, v) => s + v.count, 0);
      const cx = w / 2, cy = Math.round(h * 0.30);
      const radius = Math.round(w * 0.18);

      let angle = -Math.PI / 2;
      variants.forEach((v, i) => {
        const sweep = (v.count / total) * Math.PI * 2;
        ctx.fillStyle = colors[i % colors.length];
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, radius, angle, angle + sweep);
        ctx.closePath();
        ctx.fill();
        angle += sweep;
      });

      // Center hole (donut)
      ctx.fillStyle = '#14142a';
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 0.55, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = '700 ' + Math.round(h * 0.030) + 'px Oswald, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(String(total), cx, cy + Math.round(h * 0.01));
      ctx.font = Math.round(h * 0.012) + 'px Oswald, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText('events', cx, cy + Math.round(h * 0.03));

      // Legend
      const legendY = Math.round(h * 0.48);
      const legendRowH = Math.round(h * 0.04);
      const padX = Math.round(w * 0.12);

      variants.slice(0, 8).forEach((v, i) => {
        const y = legendY + i * legendRowH;
        const color = colors[i % colors.length];

        // Color dot
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(padX, y, 6, 0, Math.PI * 2);
        ctx.fill();

        // Name
        ctx.font = '600 ' + Math.round(h * 0.016) + 'px Oswald, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.fillText(v.name, padX + 18, y + 5);

        // Count + profit
        ctx.textAlign = 'right';
        ctx.font = Math.round(h * 0.014) + 'px Oswald, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText(v.count + 'x', w - padX - 80, y + 5);

        ctx.fillStyle = v.profit >= 0 ? '#22c55e' : '#f87171';
        ctx.fillText((v.profit >= 0 ? '+' : '') + formatBuyin(v.profit), w - padX, y + 5);
      });

      // Best performing variant
      const sorted = [...variants].sort((a, b) => b.profit - a.profit);
      if (sorted.length > 0 && sorted[0].profit > 0) {
        const bestY = Math.round(h * 0.82);
        ctx.textAlign = 'center';
        ctx.font = Math.round(h * 0.014) + 'px Oswald, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillText('BEST GAME', w / 2, bestY);
        ctx.font = '600 ' + Math.round(h * 0.022) + 'px Oswald, sans-serif';
        ctx.fillStyle = '#22c55e';
        ctx.fillText(sorted[0].name + ' (+' + formatBuyin(sorted[0].profit) + ')', w / 2, bestY + Math.round(h * 0.03));
      }

      ctx.textAlign = 'left';
      drawWatermark(ctx, w, h, 'bottom-center');
    }

    function drawWrapSlide5(ctx, w, h, data) {
      // Slide 5: Fun stats — events per day distribution
      drawShareBackground(ctx, w, h);

      ctx.textAlign = 'center';
      ctx.font = '600 ' + Math.round(h * 0.014) + 'px Oswald, sans-serif';
      ctx.fillStyle = '#22c55e';
      ctx.letterSpacing = '4px';
      ctx.fillText('FUN FACTS', w / 2, Math.round(h * 0.10));
      ctx.letterSpacing = '0px';

      const padX = Math.round(w * 0.10);
      const padR = w - padX;

      // Estimated total hours
      const estHours = (data.eventsPlayed || 0) * 5;
      const hoursY = Math.round(h * 0.20);
      ctx.font = '700 ' + Math.round(h * 0.06) + 'px Oswald, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('~' + estHours + 'h', w / 2, hoursY);
      ctx.font = Math.round(h * 0.016) + 'px Oswald, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillText('estimated hours at the felt', w / 2, hoursY + Math.round(h * 0.035));

      // Events per day bar chart
      const daysMap = data.eventsPerDay || {};
      const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const dayVals = dayNames.map(d => daysMap[d] || 0);
      const maxVal = Math.max(1, ...dayVals);

      const chartY = Math.round(h * 0.35);
      const chartH = Math.round(h * 0.25);
      const barW = Math.round((padR - padX) / dayNames.length * 0.6);
      const barGap = Math.round((padR - padX) / dayNames.length);

      ctx.font = Math.round(h * 0.014) + 'px Oswald, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillText('EVENTS BY DAY', w / 2, chartY - Math.round(h * 0.02));

      dayVals.forEach((v, i) => {
        const bx = padX + i * barGap + (barGap - barW) / 2;
        const bh = Math.round(chartH * (v / maxVal));
        const by = chartY + chartH - bh;

        // Bar
        ctx.fillStyle = v === maxVal ? '#22c55e' : 'rgba(34,197,94,0.4)';
        roundedRect(ctx, bx, by, barW, bh, 4);
        ctx.fill();

        // Value on top
        if (v > 0) {
          ctx.fillStyle = '#ffffff';
          ctx.font = '600 ' + Math.round(h * 0.013) + 'px Oswald, sans-serif';
          ctx.fillText(String(v), bx + barW / 2, by - 8);
        }

        // Day label
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.font = Math.round(h * 0.012) + 'px Oswald, sans-serif';
        ctx.fillText(dayNames[i], bx + barW / 2, chartY + chartH + Math.round(h * 0.025));
      });

      // Multi-entry stat
      if (data.multiEntryCount) {
        const meY = Math.round(h * 0.72);
        ctx.font = '700 ' + Math.round(h * 0.040) + 'px Oswald, sans-serif';
        ctx.fillStyle = '#f59e0b';
        ctx.fillText(String(data.multiEntryCount), w / 2, meY);
        ctx.font = Math.round(h * 0.016) + 'px Oswald, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillText('re-entries used', w / 2, meY + Math.round(h * 0.03));
      }

      ctx.textAlign = 'left';
      drawWatermark(ctx, w, h, 'bottom-center');
    }

    // ── 7. Milestone Image (1080x1080) ──
    function drawMilestoneImage(ctx, w, h, data) {
      // data: { type, title, description, value }
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#1a1a2e');
      grad.addColorStop(0.5, '#1a1520');
      grad.addColorStop(1, '#0f0f1a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Subtle sparkle lines
      ctx.strokeStyle = 'rgba(251,191,36,0.04)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 20; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        ctx.beginPath(); ctx.moveTo(x - 10, y); ctx.lineTo(x + 10, y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x, y - 10); ctx.lineTo(x, y + 10); ctx.stroke();
      }

      ctx.textAlign = 'center';

      // Icon area
      const icons = {
        'break-even': '*',
        'first-profit': '+',
        'career-high': '!',
        'game-best': '#'
      };
      ctx.font = Math.round(h * 0.08) + 'px sans-serif';
      ctx.fillStyle = '#fbbf24';
      ctx.fillText(icons[data.type] || '*', w / 2, Math.round(h * 0.22));

      // Title
      ctx.font = '700 ' + Math.round(h * 0.040) + 'px Oswald, sans-serif';
      ctx.fillStyle = '#fbbf24';
      const titleLines = wrapText(ctx, data.title || 'MILESTONE', w * 0.7);
      titleLines.forEach((line, i) => {
        ctx.fillText(line, w / 2, Math.round(h * 0.38) + i * Math.round(h * 0.05));
      });

      // Description
      ctx.font = Math.round(h * 0.020) + 'px Oswald, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      const descLines = wrapText(ctx, data.description || '', w * 0.7);
      const descY = Math.round(h * 0.38) + titleLines.length * Math.round(h * 0.05) + Math.round(h * 0.04);
      descLines.forEach((line, i) => {
        ctx.fillText(line, w / 2, descY + i * Math.round(h * 0.028));
      });

      // Value (if any)
      if (data.value) {
        const valY = Math.round(h * 0.68);
        ctx.font = '700 ' + Math.round(h * 0.06) + 'px Oswald, sans-serif';
        ctx.fillStyle = '#22c55e';
        ctx.fillText(data.value, w / 2, valY);
      }

      ctx.textAlign = 'left';

      // Gold watermark
      const wms = Math.round(h * 0.016);
      ctx.font = wms + 'px Oswald, sans-serif';
      ctx.fillStyle = 'rgba(251,191,36,0.3)';
      ctx.textAlign = 'center';
      ctx.fillText('futurega.me', w / 2, Math.round(h * 0.95));
      ctx.textAlign = 'left';
    }

    // ── 8. Instagram Poll Templates (1080x1920) ──

    function drawPollEventVsEvent(ctx, w, h, data) {
      // data: { event1: { name, buyin, time }, event2: { name, buyin, time } }
      drawShareBackground(ctx, w, h);

      const padX = Math.round(w * 0.08);

      ctx.textAlign = 'center';
      ctx.font = '600 ' + Math.round(h * 0.016) + 'px Oswald, sans-serif';
      ctx.fillStyle = '#22c55e';
      ctx.letterSpacing = '3px';
      ctx.fillText('HELP ME DECIDE', w / 2, Math.round(h * 0.08));
      ctx.letterSpacing = '0px';

      ctx.font = '600 ' + Math.round(h * 0.026) + 'px Oswald, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('Which event should I play?', w / 2, Math.round(h * 0.12));

      // Event 1 card
      const card1Y = Math.round(h * 0.20);
      const cardH = Math.round(h * 0.22);
      const cardW = w - padX * 2;

      ctx.fillStyle = 'rgba(34,197,94,0.08)';
      roundedRect(ctx, padX, card1Y, cardW, cardH, 12);
      ctx.fill();
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(padX, card1Y + 10, 4, cardH - 20);

      ctx.font = '700 ' + Math.round(h * 0.04) + 'px Oswald, sans-serif';
      ctx.fillStyle = '#22c55e';
      ctx.fillText('A', w / 2, card1Y + Math.round(cardH * 0.25));

      const e1 = data.event1 || {};
      if (e1.buyin) {
        ctx.font = '600 ' + Math.round(h * 0.024) + 'px Oswald, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('$' + Number(e1.buyin).toLocaleString(), w / 2, card1Y + Math.round(cardH * 0.48));
      }
      ctx.font = '600 ' + Math.round(h * 0.018) + 'px Oswald, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      const name1Lines = wrapText(ctx, e1.name || 'Event 1', cardW * 0.8);
      name1Lines.forEach((line, i) => {
        ctx.fillText(line, w / 2, card1Y + Math.round(cardH * 0.65) + i * Math.round(h * 0.024));
      });
      if (e1.time) {
        ctx.font = Math.round(h * 0.014) + 'px Oswald, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillText(e1.time, w / 2, card1Y + Math.round(cardH * 0.88));
      }

      // "VS" divider
      const vsY = card1Y + cardH + Math.round(h * 0.03);
      ctx.font = '700 ' + Math.round(h * 0.030) + 'px Oswald, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.fillText('VS', w / 2, vsY);

      // Event 2 card
      const card2Y = vsY + Math.round(h * 0.03);
      ctx.fillStyle = 'rgba(59,130,246,0.08)';
      roundedRect(ctx, padX, card2Y, cardW, cardH, 12);
      ctx.fill();
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(padX, card2Y + 10, 4, cardH - 20);

      ctx.font = '700 ' + Math.round(h * 0.04) + 'px Oswald, sans-serif';
      ctx.fillStyle = '#3b82f6';
      ctx.fillText('B', w / 2, card2Y + Math.round(cardH * 0.25));

      const e2 = data.event2 || {};
      if (e2.buyin) {
        ctx.font = '600 ' + Math.round(h * 0.024) + 'px Oswald, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('$' + Number(e2.buyin).toLocaleString(), w / 2, card2Y + Math.round(cardH * 0.48));
      }
      ctx.font = '600 ' + Math.round(h * 0.018) + 'px Oswald, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      const name2Lines = wrapText(ctx, e2.name || 'Event 2', cardW * 0.8);
      name2Lines.forEach((line, i) => {
        ctx.fillText(line, w / 2, card2Y + Math.round(cardH * 0.65) + i * Math.round(h * 0.024));
      });
      if (e2.time) {
        ctx.font = Math.round(h * 0.014) + 'px Oswald, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillText(e2.time, w / 2, card2Y + Math.round(cardH * 0.88));
      }

      // Poll instruction
      ctx.font = Math.round(h * 0.016) + 'px Oswald, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillText('Vote in poll above!', w / 2, Math.round(h * 0.82));

      ctx.textAlign = 'left';
      drawWatermark(ctx, w, h, 'bottom-center');
    }

    function drawPollOverUnder(ctx, w, h, data) {
      // data: { tournamentName, currentStack, bb }
      drawShareBackground(ctx, w, h);

      ctx.textAlign = 'center';
      ctx.font = '600 ' + Math.round(h * 0.016) + 'px Oswald, sans-serif';
      ctx.fillStyle = '#22c55e';
      ctx.letterSpacing = '3px';
      ctx.fillText('OVER / UNDER', w / 2, Math.round(h * 0.10));
      ctx.letterSpacing = '0px';

      ctx.font = '600 ' + Math.round(h * 0.020) + 'px Oswald, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText(data.tournamentName || '', w / 2, Math.round(h * 0.15));

      // Current stack display
      ctx.font = Math.round(h * 0.016) + 'px Oswald, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.fillText('CURRENT STACK', w / 2, Math.round(h * 0.30));

      ctx.font = '700 ' + Math.round(h * 0.08) + 'px Oswald, sans-serif';
      ctx.fillStyle = '#22c55e';
      ctx.fillText(formatChips(data.currentStack || 0), w / 2, Math.round(h * 0.40));

      if (data.bb) {
        ctx.font = Math.round(h * 0.020) + 'px Oswald, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.fillText((Number(data.currentStack) / Number(data.bb)).toFixed(1) + ' BB', w / 2, Math.round(h * 0.44));
      }

      ctx.font = '600 ' + Math.round(h * 0.022) + 'px Oswald, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText('End of day stack prediction?', w / 2, Math.round(h * 0.56));

      // Over/Under arrows
      const arrowY = Math.round(h * 0.66);
      ctx.font = '700 ' + Math.round(h * 0.04) + 'px Oswald, sans-serif';
      ctx.fillStyle = '#22c55e';
      ctx.fillText('OVER', w * 0.3, arrowY);
      ctx.fillStyle = '#f87171';
      ctx.fillText('UNDER', w * 0.7, arrowY);

      ctx.font = Math.round(h * 0.016) + 'px Oswald, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillText('Use the poll sticker!', w / 2, Math.round(h * 0.78));

      ctx.textAlign = 'left';
      drawWatermark(ctx, w, h, 'bottom-center');
    }

    // ── Milestone Detection ──
    function detectMilestones(trackingData, newEntry) {
      const milestones = [];

      // Calculate running totals with the new entry
      let totalBuyins = 0, totalCashes = 0, biggestCash = 0, biggestCashEvent = '';
      let previousPL = 0; // P&L before the new entry
      const gameBests = {};

      for (const e of trackingData) {
        const cost = (e.buyin || 0) * (e.num_entries || 1);
        totalBuyins += cost;
        if (e.cashed) {
          totalCashes += e.cash_amount || 0;
          if ((e.cash_amount || 0) > biggestCash) {
            biggestCash = e.cash_amount;
            biggestCashEvent = e.event_name;
          }
        }
        // Track per-game bests
        const game = e.game_variant || 'Unknown';
        if (e.cashed && e.cash_amount) {
          if (!gameBests[game] || e.cash_amount > gameBests[game]) {
            gameBests[game] = e.cash_amount;
          }
        }
      }
      previousPL = totalCashes - totalBuyins;

      // Add the new entry
      const newCost = (newEntry.buyin || 0) * (newEntry.numEntries || newEntry.num_entries || 1);
      totalBuyins += newCost;
      if (newEntry.cashed) {
        totalCashes += newEntry.cashAmount || newEntry.cash_amount || 0;
      }
      const newPL = totalCashes - totalBuyins;
      const newCashAmount = newEntry.cashAmount || newEntry.cash_amount || 0;

      // Milestone: Breaking even (P&L crosses from negative to >= 0)
      if (previousPL < 0 && newPL >= 0) {
        milestones.push({
          type: 'break-even',
          title: 'BREAK EVEN!',
          description: 'Your series P&L just crossed into the green!',
          value: '+' + formatBuyin(newPL)
        });
      }

      // Milestone: First profit (first time net positive with meaningful amount)
      if (previousPL <= 0 && newPL > 0 && trackingData.length > 0) {
        // Only if this isn't also the break-even milestone
        if (previousPL === 0 || !milestones.some(m => m.type === 'break-even')) {
          milestones.push({
            type: 'first-profit',
            title: 'IN THE GREEN!',
            description: 'First time with net positive results!',
            value: '+' + formatBuyin(newPL)
          });
        }
      }

      // Milestone: Career high cash
      if (newEntry.cashed && newCashAmount > biggestCash && biggestCash > 0) {
        milestones.push({
          type: 'career-high',
          title: 'NEW PERSONAL BEST!',
          description: 'Biggest cash of the series! Previous: ' + formatBuyin(biggestCash),
          value: formatBuyin(newCashAmount)
        });
      }

      // Game-specific personal best
      if (newEntry.cashed && newCashAmount > 0) {
        const game = newEntry.game_variant || 'Unknown';
        if (gameBests[game] && newCashAmount > gameBests[game]) {
          milestones.push({
            type: 'game-best',
            title: game.toUpperCase() + ' PB!',
            description: 'New personal best in ' + game + '! Previous: ' + formatBuyin(gameBests[game]),
            value: formatBuyin(newCashAmount)
          });
        }
      }

      return milestones;
    }

    // ── Compute series scorecard data from tracking entries ──
    function computeScorecardData(trackingData, venueName, tournaments) {
      let totalBuyins = 0, totalCashes = 0, eventsCashed = 0;
      let biggestCash = 0, biggestCashEvent = '';
      let streak = 0, streakType = null;

      // Sort by date
      const sorted = [...trackingData].sort((a, b) => {
        const da = a.date || ''; const db = b.date || '';
        return da.localeCompare(db);
      });

      for (const e of sorted) {
        totalBuyins += (e.buyin || 0) * (e.num_entries || 1);
        if (e.cashed) {
          totalCashes += e.cash_amount || 0;
          eventsCashed++;
          if ((e.cash_amount || 0) > biggestCash) {
            biggestCash = e.cash_amount;
            biggestCashEvent = e.event_name || '';
          }
        }
      }

      // Compute streak from most recent entries
      for (let i = sorted.length - 1; i >= 0; i--) {
        const e = sorted[i];
        const wasCash = !!e.cashed;
        if (streakType === null) {
          streakType = wasCash ? 'cash' : 'miss';
          streak = 1;
        } else if ((wasCash && streakType === 'cash') || (!wasCash && streakType === 'miss')) {
          streak++;
        } else {
          break;
        }
      }

      const streakText = streak > 1
        ? (streakType === 'cash' ? streak + ' cashes in a row' : streak + ' event cold streak')
        : (streakType === 'cash' ? '1 cash' : '1 miss');

      const profit = totalCashes - totalBuyins;
      const roi = totalBuyins > 0 ? ((profit / totalBuyins) * 100) : 0;
      const cashRate = sorted.length > 0 ? (eventsCashed / sorted.length * 100) : 0;

      // Date range
      let dateRange = '';
      if (sorted.length > 0) {
        dateRange = sorted[0].date + ' \u2014 ' + sorted[sorted.length - 1].date;
      }

      // Game breakdown
      const gameMap = {};
      for (const e of sorted) {
        const game = e.game_variant || 'NLH';
        if (!gameMap[game]) gameMap[game] = { name: game, count: 0, profit: 0 };
        gameMap[game].count++;
        const cost = (e.buyin || 0) * (e.num_entries || 1);
        const cash = e.cashed ? (e.cash_amount || 0) : 0;
        gameMap[game].profit += cash - cost;
      }
      const gameBreakdown = Object.values(gameMap).sort((a, b) => b.count - a.count);

      // Events per day of week
      const eventsPerDay = {};
      for (const e of sorted) {
        if (e.date) {
          const d = new Date(e.date);
          const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
          const dayName = dayNames[d.getDay()];
          eventsPerDay[dayName] = (eventsPerDay[dayName] || 0) + 1;
        }
      }

      // Multi-entry count
      const multiEntryCount = sorted.reduce((s, e) => s + Math.max(0, (e.num_entries || 1) - 1), 0);

      // Biggest cash place
      const biggestEntry = sorted.find(e => e.cashed && e.cash_amount === biggestCash);

      return {
        venueName: venueName || 'My Series',
        dateRange,
        eventsPlayed: sorted.length,
        cashCount: eventsCashed,
        cashRate,
        totalInvested: totalBuyins,
        totalCashed: totalCashes,
        netPL: profit,
        roi,
        currentStreak: streakText,
        biggestCash,
        biggestCashEvent,
        biggestCashPlace: biggestEntry?.finish_place,
        gameBreakdown,
        eventsPerDay,
        multiEntryCount
      };
    }

    // ══════════════════════════════════════════════════════════
    // ── END SOCIAL OVERLAY DRAWING FUNCTIONS ─────────────────
    // ══════════════════════════════════════════════════════════

    // ── Load card images for canvas drawing ──
    function loadCardImages(cards) {
      const unique = new Map();
      cards.forEach(c => { if (c.suit !== 'x') unique.set(c.rank + c.suit, true); });
      const result = new Map();
      const promises = [];
      unique.forEach((_, key) => {
        promises.push((async () => {
          // 1. Try existing DOM <img> elements (from CardRow — already loaded)
          const domImg = document.querySelector('img[alt="' + key + '"]');
          if (domImg && domImg.complete && domImg.naturalWidth > 0) {
            result.set(key, domImg);
            return;
          }
          // 2. Load via Image element (createImageBitmap crashes on iOS with SVG blobs)
          const url = '/cards/cards_gui_' + key + '.svg';
          try {
            const img = new Image();
            img.src = url;
            if (img.decode) await img.decode();
            else await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
            result.set(key, img);
          } catch (e) { /* card will render as placeholder */ }
        })());
      });
      return Promise.all(promises).then(() => result);
    }

    // ── Draw a single card on canvas ──
    function drawCanvasCard(ctx, img, x, y, cw, ch) {
      if (img) {
        ctx.drawImage(img, x, y, cw, ch);
      } else {
        // Unknown / face-down card — draw rounded rect with "?"
        const r = Math.round(cw * 0.08);
        ctx.fillStyle = 'rgba(80,80,80,0.9)';
        ctx.beginPath();
        if (ctx.roundRect) { ctx.roundRect(x, y, cw, ch, r); }
        else { ctx.moveTo(x+r,y); ctx.lineTo(x+cw-r,y); ctx.arcTo(x+cw,y,x+cw,y+r,r); ctx.lineTo(x+cw,y+ch-r); ctx.arcTo(x+cw,y+ch,x+cw-r,y+ch,r); ctx.lineTo(x+r,y+ch); ctx.arcTo(x,y+ch,x,y+ch-r,r); ctx.lineTo(x,y+r); ctx.arcTo(x,y,x+r,y,r); }
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();
        const qs = Math.round(ch * 0.35);
        ctx.font = '600 ' + qs + 'px Oswald, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.textAlign = 'center';
        ctx.fillText('?', x + cw / 2, y + ch / 2 + qs * 0.35);
        ctx.textAlign = 'left';
      }
    }

    // ── Draw a row of cards, returns total width drawn ──
    function drawCardRow(ctx, cards, images, x, y, cw, ch, gap) {
      cards.forEach((c, i) => {
        const cx = x + i * (cw + gap);
        const img = c.suit !== 'x' ? images.get(c.rank + c.suit) : null;
        drawCanvasCard(ctx, img, cx, y, cw, ch);
      });
      return cards.length * cw + Math.max(0, cards.length - 1) * gap;
    }

    // ── Hand History overlay ──
    function drawHandOverlay(ctx, w, h, handData, images) {
      const heroCards = parseCardNotation(handData.heroHand);
      const oppList = (handData.opponents || []).map(h => h ? parseCardNotation(h) : []);
      const oppWithCards = oppList.filter(c => c.length > 0);
      const boardCards = handData.boardCards ? parseCardNotation(handData.boardCards) : [];
      const hasBoard = handData.gameConfig.hasBoard && boardCards.length > 0;
      const hasOpponents = oppWithCards.length > 0;
      const results = Array.isArray(handData.handResult) ? handData.handResult : [];
      const result = results.length > 0 ? results[0]?.result : null;

      // Bar dimensions — expand for multiple opponents
      const baseBarPct = 0.28;
      const extraPerOpp = Math.max(0, oppWithCards.length - 1) * 0.06;
      const barH = Math.round(h * Math.min(baseBarPct + extraPerOpp, 0.50));
      const barY = h - barH - Math.round(h * 0.04);
      const padX = Math.round(w * 0.05);

      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(0, barY, w, barH);

      const gap = 6;
      const cardRatio = 2.5 / 3.5;
      const labelZone = Math.round(barH * 0.06);
      const resultZone = results.length ? Math.round(barH * 0.12) : Math.round(barH * 0.04);
      const cardZoneH = barH - labelZone - resultZone - Math.round(barH * 0.04);

      if (hasBoard) {
        const leftW = Math.round((w - padX * 2) * 0.45);
        const rightW = Math.round((w - padX * 2) * 0.45);
        const dividerX = padX + leftW + Math.round((w - padX * 2) * 0.10);

        const rowsNeeded = 1 + oppWithCards.length;
        const rowGap = Math.round(barH * 0.04);
        const perRowLabel = Math.round(barH * 0.06);
        const hvCardH = Math.min(Math.round((cardZoneH - (rowsNeeded - 1) * rowGap - rowsNeeded * perRowLabel) / rowsNeeded), 140);
        const hvCardW = Math.round(hvCardH * cardRatio);

        const boardCardH = Math.min(hvCardH * 1.1, 140);
        const boardCardW = Math.round(boardCardH * cardRatio);
        const boardTotalW = boardCards.length * boardCardW + Math.max(0, boardCards.length - 1) * gap;
        let finalBoardCardH = boardCardH, finalBoardCardW = boardCardW;
        if (boardTotalW > rightW) { finalBoardCardW = Math.floor((rightW - (boardCards.length - 1) * gap) / boardCards.length); finalBoardCardH = Math.round(finalBoardCardW / cardRatio); }

        const maxHVCards = Math.max(heroCards.length, ...oppWithCards.map(c => c.length));
        let finalHVCardH = hvCardH, finalHVCardW = hvCardW;
        const hvTotalW = maxHVCards * finalHVCardW + Math.max(0, maxHVCards - 1) * gap;
        if (hvTotalW > leftW) { finalHVCardW = Math.floor((leftW - (maxHVCards - 1) * gap) / maxHVCards); finalHVCardH = Math.round(finalHVCardW / cardRatio); }

        const contentTop = barY + labelZone;
        const lblS = Math.round(h * 0.014);
        let curY = contentTop;

        // HERO
        ctx.font = '600 ' + lblS + 'px Oswald, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.letterSpacing = '1px';
        ctx.fillText('HERO', padX, curY + Math.round(perRowLabel * 0.7));
        ctx.letterSpacing = '0px';
        drawCardRow(ctx, heroCards, images, padX, curY + perRowLabel, finalHVCardW, finalHVCardH, gap);
        const heroCardY = curY + perRowLabel;
        curY += perRowLabel + finalHVCardH + rowGap;

        // OPPONENTS
        let lastOppBottomY = heroCardY + finalHVCardH;
        oppWithCards.forEach((oCards, idx) => {
          ctx.font = '600 ' + lblS + 'px Oswald, sans-serif';
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.letterSpacing = '1px';
          ctx.fillText(oppWithCards.length > 1 ? 'OPP ' + (idx + 1) : 'OPP', padX, curY + Math.round(perRowLabel * 0.7));
          ctx.letterSpacing = '0px';
          drawCardRow(ctx, oCards, images, padX, curY + perRowLabel, finalHVCardW, finalHVCardH, gap);
          lastOppBottomY = curY + perRowLabel + finalHVCardH;
          curY += perRowLabel + finalHVCardH + rowGap;
        });

        // BOARD
        ctx.font = '600 ' + lblS + 'px Oswald, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.letterSpacing = '1px';
        ctx.fillText('BOARD', dividerX, contentTop + Math.round(perRowLabel * 0.7));
        ctx.letterSpacing = '0px';
        const boardMidY = hasOpponents ? (heroCardY + lastOppBottomY) / 2 : heroCardY + finalHVCardH / 2;
        const boardY = Math.round(boardMidY - finalBoardCardH / 2);
        drawCardRow(ctx, boardCards, images, dividerX, boardY, finalBoardCardW, finalBoardCardH, gap);

      } else {
        const rowsNeeded = 1 + oppWithCards.length;
        const rowGap = Math.round(barH * 0.04);
        const perRowLabel = Math.round(barH * 0.06);
        const maxCards = Math.max(heroCards.length, ...oppWithCards.map(c => c.length));
        const availW = w - padX * 2;

        let cardH = Math.min(Math.round((cardZoneH - (rowsNeeded - 1) * rowGap - rowsNeeded * perRowLabel) / rowsNeeded), 140);
        let cardW = Math.round(cardH * cardRatio);
        const totalW = maxCards * cardW + Math.max(0, maxCards - 1) * gap;
        if (totalW > availW) { cardW = Math.floor((availW - (maxCards - 1) * gap) / maxCards); cardH = Math.round(cardW / cardRatio); }

        const contentTop = barY + labelZone;
        const lblS = Math.round(h * 0.014);
        let curY = contentTop;

        // Hero centered
        const heroTotalW = heroCards.length * cardW + Math.max(0, heroCards.length - 1) * gap;
        const heroX = Math.round((w - heroTotalW) / 2);
        ctx.font = '600 ' + lblS + 'px Oswald, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.textAlign = 'center';
        ctx.letterSpacing = '1px';
        ctx.fillText('HERO', w / 2, curY + Math.round(perRowLabel * 0.7));
        ctx.letterSpacing = '0px';
        ctx.textAlign = 'left';
        drawCardRow(ctx, heroCards, images, heroX, curY + perRowLabel, cardW, cardH, gap);
        curY += perRowLabel + cardH + rowGap;

        // Opponents centered
        oppWithCards.forEach((oCards, idx) => {
          const oppTotalW = oCards.length * cardW + Math.max(0, oCards.length - 1) * gap;
          const oppX = Math.round((w - oppTotalW) / 2);
          ctx.font = '600 ' + lblS + 'px Oswald, sans-serif';
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          ctx.textAlign = 'center';
          ctx.letterSpacing = '1px';
          ctx.fillText(oppWithCards.length > 1 ? 'OPP ' + (idx + 1) : 'OPP', w / 2, curY + Math.round(perRowLabel * 0.7));
          ctx.letterSpacing = '0px';
          ctx.textAlign = 'left';
          drawCardRow(ctx, oCards, images, oppX, curY + perRowLabel, cardW, cardH, gap);
          curY += perRowLabel + cardH + rowGap;
        });
      }

      // Result text(s)
      if (results.length > 0) {
        const resS = Math.round(h * (results.length > 1 ? 0.015 : 0.020));
        ctx.font = '600 ' + resS + 'px Oswald, sans-serif';
        ctx.textAlign = 'center';
        const lineH = Math.round(resS * 1.3);
        const startY = barY + barH - Math.round(barH * 0.04) - (results.length * lineH);
        results.forEach((r, i) => {
          const res = r.result;
          ctx.fillStyle = res.color === 'green' ? '#4ade80' : res.color === 'red' ? '#f87171' : '#facc15';
          const prefix = results.length > 1 ? 'vs Opp ' + (r.index + 1) + ': ' : '';
          ctx.fillText(prefix + res.text, w / 2, startY + i * lineH);
        });
        ctx.textAlign = 'left';
      }

      // Game label top-right of bar
      const gameS = Math.round(h * 0.016);
      ctx.font = gameS + 'px Oswald, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.textAlign = 'right';
      ctx.fillText(handData.activeGame, w - padX, barY + Math.round(barH * 0.07));
      ctx.textAlign = 'left';

      // Watermark
      const wms = Math.round(h * 0.014);
      ctx.font = wms + 'px Oswald, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText('snbwsop.com', Math.round(w * 0.03), Math.round(h * 0.03));
    }

    // ── Standalone hand history image (square 1080×1080) ──
    function drawHandImageOverlay(ctx, w, h, handData, images, tournamentName) {
      const heroCards = parseCardNotation(handData.heroHand);
      const oppList = (handData.opponents || []).map(h => h ? parseCardNotation(h) : []);
      const oppWithCards = oppList.filter(c => c.length > 0);
      const boardCards = handData.boardCards ? parseCardNotation(handData.boardCards) : [];
      const hasBoard = handData.gameConfig.hasBoard && boardCards.length > 0;
      const results = Array.isArray(handData.handResult) ? handData.handResult : [];
      const padX = Math.round(w * 0.06);
      const gap = 8;
      const cardRatio = 2.5 / 3.5;

      // Tournament name at top
      const nameS = Math.round(h * 0.022);
      ctx.font = nameS + 'px Oswald, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.textAlign = 'center';
      ctx.fillText(tournamentName || '', w / 2, Math.round(h * 0.06));

      const gameS = Math.round(h * 0.028);
      ctx.font = '600 ' + gameS + 'px Oswald, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText(handData.activeGame, w / 2, Math.round(h * 0.10));
      ctx.textAlign = 'left';

      ctx.fillStyle = '#22c55e';
      ctx.fillRect(padX, Math.round(h * 0.12), w - padX * 2, 2);

      if (hasBoard) {
        const leftW = Math.round((w - padX * 2) * 0.42);
        const rightW = Math.round((w - padX * 2) * 0.42);
        const centerGap = Math.round((w - padX * 2) * 0.16);
        const rightX = padX + leftW + centerGap;
        const contentTop = Math.round(h * 0.18);
        const lblS = Math.round(h * 0.020);
        const rowLabelH = Math.round(h * 0.04);
        const oppGap = Math.round(h * 0.04);
        const maxCardH = Math.round(h * 0.18 / Math.max(1, 1 + oppWithCards.length * 0.5));

        const maxHVCards = Math.max(heroCards.length, ...oppWithCards.map(c => c.length), 1);
        let hvCardW = Math.floor((leftW - (maxHVCards - 1) * gap) / maxHVCards);
        let hvCardH = Math.round(hvCardW / cardRatio);
        if (hvCardH > maxCardH) { hvCardH = maxCardH; hvCardW = Math.round(hvCardH * cardRatio); }

        let bCardW = Math.floor((rightW - (boardCards.length - 1) * gap) / boardCards.length);
        let bCardH = Math.round(bCardW / cardRatio);
        if (bCardH > Math.round(h * 0.22)) { bCardH = Math.round(h * 0.22); bCardW = Math.round(bCardH * cardRatio); }

        // HERO
        ctx.font = '600 ' + lblS + 'px Oswald, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.letterSpacing = '2px';
        ctx.fillText('HERO', padX, contentTop);
        ctx.letterSpacing = '0px';
        const heroCardY = contentTop + rowLabelH;
        drawCardRow(ctx, heroCards, images, padX, heroCardY, hvCardW, hvCardH, gap);

        // OPPONENTS
        let curY = heroCardY + hvCardH + oppGap;
        let lastOppBottom = heroCardY + hvCardH;
        oppWithCards.forEach((oCards, idx) => {
          ctx.font = '600 ' + lblS + 'px Oswald, sans-serif';
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.letterSpacing = '2px';
          ctx.fillText(oppWithCards.length > 1 ? 'OPP ' + (idx + 1) : 'OPP', padX, curY);
          ctx.letterSpacing = '0px';
          drawCardRow(ctx, oCards, images, padX, curY + rowLabelH, hvCardW, hvCardH, gap);
          lastOppBottom = curY + rowLabelH + hvCardH;
          curY += rowLabelH + hvCardH + oppGap;
        });

        // BOARD
        ctx.font = '600 ' + lblS + 'px Oswald, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.letterSpacing = '2px';
        ctx.fillText('BOARD', rightX, contentTop);
        ctx.letterSpacing = '0px';
        const boardCenterY = oppWithCards.length > 0 ? (heroCardY + lastOppBottom) / 2 : heroCardY + hvCardH / 2;
        const boardY = Math.round(boardCenterY - bCardH / 2);
        drawCardRow(ctx, boardCards, images, rightX, Math.max(boardY, contentTop + rowLabelH), bCardW, bCardH, gap);

      } else {
        const contentTop = Math.round(h * 0.18);
        const lblS = Math.round(h * 0.020);
        const rowLabelH = Math.round(h * 0.04);
        const availW = w - padX * 2;
        const oppGap = Math.round(h * 0.04);
        const maxCardH = Math.round(h * 0.18 / Math.max(1, 1 + oppWithCards.length * 0.5));

        const maxCards = Math.max(heroCards.length, ...oppWithCards.map(c => c.length), 1);
        let cardW = Math.floor((availW - (maxCards - 1) * gap) / maxCards);
        let cardH = Math.round(cardW / cardRatio);
        if (cardH > maxCardH) { cardH = maxCardH; cardW = Math.round(cardH * cardRatio); }

        // HERO centered
        const heroTotalW = heroCards.length * cardW + Math.max(0, heroCards.length - 1) * gap;
        const heroX = Math.round((w - heroTotalW) / 2);
        ctx.font = '600 ' + lblS + 'px Oswald, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.textAlign = 'center';
        ctx.letterSpacing = '2px';
        ctx.fillText('HERO', w / 2, contentTop);
        ctx.letterSpacing = '0px';
        ctx.textAlign = 'left';
        drawCardRow(ctx, heroCards, images, heroX, contentTop + rowLabelH, cardW, cardH, gap);

        // Opponents centered
        let curY = contentTop + rowLabelH + cardH + oppGap;
        oppWithCards.forEach((oCards, idx) => {
          const oppTotalW = oCards.length * cardW + Math.max(0, oCards.length - 1) * gap;
          const oppX = Math.round((w - oppTotalW) / 2);
          ctx.font = '600 ' + lblS + 'px Oswald, sans-serif';
          ctx.fillStyle = 'rgba(255,255,255,0.5)';
          ctx.textAlign = 'center';
          ctx.letterSpacing = '2px';
          ctx.fillText(oppWithCards.length > 1 ? 'OPP ' + (idx + 1) : 'OPP', w / 2, curY);
          ctx.letterSpacing = '0px';
          ctx.textAlign = 'left';
          drawCardRow(ctx, oCards, images, oppX, curY + rowLabelH, cardW, cardH, gap);
          curY += rowLabelH + cardH + oppGap;
        });
      }

      // Result text(s)
      if (results.length > 0) {
        const resS = Math.round(h * (results.length > 1 ? 0.022 : 0.028));
        ctx.font = '600 ' + resS + 'px Oswald, sans-serif';
        ctx.textAlign = 'center';
        const lineH = Math.round(resS * 1.3);
        const startY = Math.round(h * 0.88) - Math.max(0, results.length - 1) * lineH / 2;
        results.forEach((r, i) => {
          const res = r.result;
          ctx.fillStyle = res.color === 'green' ? '#4ade80' : res.color === 'red' ? '#f87171' : '#facc15';
          const prefix = results.length > 1 ? 'vs Opp ' + (r.index + 1) + ': ' : '';
          ctx.fillText(prefix + res.text, w / 2, startY + i * lineH);
        });
        ctx.textAlign = 'left';
      }

      // Watermark bottom
      const wms = Math.round(h * 0.016);
      ctx.font = wms + 'px Oswald, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.textAlign = 'center';
      ctx.fillText('snbwsop.com', w / 2, Math.round(h * 0.95));
      ctx.textAlign = 'left';
    }


    window.drawDeepRunOverlay = drawDeepRunOverlay;
    window.drawFinalTableOverlay = drawFinalTableOverlay;
    window.drawCountdownOverlay = drawCountdownOverlay;
    window.drawShareBackground = drawShareBackground;
    window.drawWatermark = drawWatermark;
    window.roundedRect = roundedRect;
    window.VENUE_CANVAS_COLORS = VENUE_CANVAS_COLORS;
    window.getVenueCanvasColor = getVenueCanvasColor;
    window.drawSchedulePage = drawSchedulePage;
    window.generateScheduleImages = generateScheduleImages;
    window.drawChipStackStory = drawChipStackStory;
    window.drawSeriesScorecard = drawSeriesScorecard;
    window.drawDeepRunStandalone = drawDeepRunStandalone;
    window.drawCountdownStory = drawCountdownStory;
    window.wrapText = wrapText;
    window.drawFinalTableCard = drawFinalTableCard;
    window.drawWrapSlide1 = drawWrapSlide1;
    window.drawWrapSlide2 = drawWrapSlide2;
    window.drawWrapSlide3 = drawWrapSlide3;
    window.drawWrapSlide4 = drawWrapSlide4;
    window.drawWrapSlide5 = drawWrapSlide5;
    window.drawMilestoneImage = drawMilestoneImage;
    window.drawPollEventVsEvent = drawPollEventVsEvent;
    window.drawPollOverUnder = drawPollOverUnder;
    window.detectMilestones = detectMilestones;
    window.computeScorecardData = computeScorecardData;
    window.loadCardImages = loadCardImages;
    window.drawCanvasCard = drawCanvasCard;
    window.drawCardRow = drawCardRow;
    window.drawHandOverlay = drawHandOverlay;
    window.drawHandImageOverlay = drawHandImageOverlay;
