/* WW Video Toolkit — gallery frontend */
'use strict';

// ── FNV-64 + S4PE filename helpers (mirrors fnv.py) ───────────────────────────
function fnv64(text) {
  const P = 0x00000100000001B3n;
  const O = 0xCBF29CE484222325n;
  const M = 0xFFFFFFFFFFFFFFFFn;
  let h = O;
  for (const b of new TextEncoder().encode(text.toLowerCase())) {
    h ^= BigInt(b);
    h = (h * P) & M;
  }
  return h;
}

function computeS4PENames(author, filename) {
  const a = (author || 'Author').replace(/\s+/g, '');
  const f = (filename || '').replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9]/g, '');
  const base = `${a}:VIDEO_${f}`;
  const aviH  = fnv64(base);
  const wwH   = fnv64(base + '_WW.OBJ.TUNING');
  const aviHex = aviH.toString(16).toUpperCase().padStart(16, '0');
  const wwHex  = wwH.toString(16).toUpperCase().padStart(16, '0');
  return {
    avi: `S4_376840D7_00000000_${aviHex}____AVI.avi`,
    dds: `S4_00B2D882_00000000_${aviHex}____IMG.dds`,
    xml: `S4_5B02819E_00000000_${wwHex}____XML.xml`,
  };
}

// ── Thumbnail generator ────────────────────────────────────────────────────────

const TSTYLES = {
  dark:    { bg1:'#0c0c0f', bg2:'#1a1a24', accent:'#e8a030', accent2:'#f0c060', text:'#e8e4dc', sub:'#8a8598' },
  red:     { bg1:'#0f0808', bg2:'#1f1010', accent:'#e05050', accent2:'#f08080', text:'#f0e0e0', sub:'#a08080' },
  purple:  { bg1:'#0d0812', bg2:'#1a1028', accent:'#a060f0', accent2:'#c090ff', text:'#e8e0f8', sub:'#8878a8' },
  teal:    { bg1:'#071212', bg2:'#0d2020', accent:'#30c8b0', accent2:'#60e8d0', text:'#d8f0ee', sub:'#60a090' },
  minimal: { bg1:'#080808', bg2:'#111111', accent:'#ffffff', accent2:'#cccccc', text:'#ffffff', sub:'#888888' },
};

// WW logo SVG paths (same as original toolkit)
const WW_SVG = (w, h) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 723 250" width="${w}" height="${h}">
  <path fill="#B28BFF" fill-opacity="0.85" fill-rule="evenodd" d="M427.2,101.509 C427.2,62.339 411.282,26.686 385.559,0.30 L344.369,48.967 C355.452,63.5 361.992,80.299 361.992,99.5 C361.992,145.950 320.810,183.991 270.0,183.991 C219.189,183.991 178.7,145.937 178.7,98.987 C178.7,80.278 184.547,62.981 195.630,48.942 L154.440,0.0 C128.717,26.659 112.997,62.315 112.997,101.491 C112.997,171.970 167.163,250.9 269.997,250.9 C371.314,250.9 427.2,171.979 427.2,101.509 Z"/>
  <path fill="#B28BFF" fill-opacity="0.85" fill-rule="evenodd" d="M314.2,101.509 C314.2,62.339 298.282,26.686 272.559,0.30 L231.369,48.967 C242.452,63.5 248.992,80.299 248.992,99.5 C248.992,145.950 207.810,183.991 157.0,183.991 C106.189,183.991 65.7,145.937 65.7,98.987 C65.7,80.278 71.547,62.981 82.630,48.942 L41.440,0.0 C15.717,26.659 0.2,62.315 0.2,101.491 C0.2,171.970 54.163,250.9 156.997,250.9 C258.314,250.9 314.2,171.979 314.2,101.509 Z"/>
  <path fill="#DEC8FF" fill-opacity="0.85" fill-rule="evenodd" d="M617.777,178.451 L617.765,59.510 C627.314,62.433 635.780,66.909 643.151,72.695 L680.25,31.963 C658.199,12.690 639.244,0.8 590.2,0.8 C540.759,0.8 521.760,12.635 499.921,31.824 L536.817,72.380 C544.195,66.617 552.671,62.228 562.231,59.381 L562.222,178.451 C562.222,178.451 569.702,185.185 590.841,185.185 C611.980,185.185 617.777,178.451 617.777,178.451 Z"/>
  <path fill="#B28BFF" fill-opacity="0.85" fill-rule="evenodd" d="M722.156,125.8 C722.156,92.36 708.924,62.26 687.272,39.588 L652.600,80.780 C661.929,92.597 667.434,107.154 667.434,122.900 C667.434,162.415 632.769,194.437 590.0,194.437 C547.230,194.437 512.565,162.404 512.565,122.884 C512.565,107.136 518.70,92.577 527.399,80.759 L492.727,39.561 C471.75,62.2 457.843,92.16 457.843,124.992 C457.843,184.318 503.437,250.8 589.997,250.8 C675.281,250.8 722.156,184.326 722.156,125.8 Z"/>
</svg>`;

let _thumbBg = null;   // loaded background Image object

function renderThumb() {
  const canvas = document.getElementById('thumb-canvas');
  if (!canvas) return;

  const S    = parseInt(document.getElementById('th-size')?.value || 128);
  canvas.width  = S;
  canvas.height = S;
  const ctx  = canvas.getContext('2d');
  const st   = TSTYLES[document.getElementById('th-style')?.value || 'purple'] || TSTYLES.purple;
  const opa  = (parseInt(document.getElementById('th-opacity')?.value || 60)) / 100;
  const title      = document.getElementById('edit-title')?.value  || 'Video';
  const author     = document.getElementById('edit-author')?.value || '';
  const showWM     = document.getElementById('th-show-wm')?.checked     !== false;
  const showTitle  = document.getElementById('th-show-title')?.checked  !== false;
  const showAuthor = document.getElementById('th-show-author')?.checked !== false;

  // Background
  if (_thumbBg) {
    // Crop source frame to square
    const ir = _thumbBg.width / _thumbBg.height;
    let sx = 0, sy = 0, sw = _thumbBg.width, sh = _thumbBg.height;
    if (ir > 1) { sw = _thumbBg.height; sx = (_thumbBg.width - sw) / 2; }
    else        { sh = _thumbBg.width;  sy = (_thumbBg.height - sh) / 2; }
    ctx.drawImage(_thumbBg, sx, sy, sw, sh, 0, 0, S, S);

    // Subtle style-colour tint — opacity slider goes 0 → 25% max so image stays visible
    ctx.fillStyle = st.bg1;
    ctx.globalAlpha = opa * 0.25;
    ctx.fillRect(0, 0, S, S);
    ctx.globalAlpha = 1;
  } else {
    // No source image — solid theme gradient
    const grd = ctx.createLinearGradient(0, 0, S, S);
    grd.addColorStop(0, st.bg2);
    grd.addColorStop(1, st.bg1);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, S, S);
  }

  // Top accent bar
  const barH = Math.max(4, Math.round(S * 0.055));
  ctx.fillStyle = st.accent;
  ctx.fillRect(0, 0, S, barH);

  // Bottom gradient — opacity slider scales how tall and opaque it is
  // at 0 % it's a thin hint; at 100 % it covers ~60 % of the canvas
  const stripH = Math.round(S * (0.25 + opa * 0.35));
  const gBot = ctx.createLinearGradient(0, S - stripH, 0, S);
  gBot.addColorStop(0,   'rgba(0,0,0,0)');
  gBot.addColorStop(0.5, st.bg1 + Math.round((0.55 + opa * 0.35) * 255).toString(16).padStart(2,'0'));
  gBot.addColorStop(1,   st.bg1 + 'f5');
  ctx.fillStyle = gBot;
  ctx.fillRect(0, S - stripH, S, stripH);

  // WW watermark
  if (showWM) {
    const wmW = Math.round(S * 0.32);
    const wmH = Math.round(wmW * 250 / 723);
    const wmX = S - wmW - Math.round(S * 0.04);
    const wmY = Math.round(S * 0.04);
    const blob = new Blob([WW_SVG(wmW, wmH)], { type: 'image/svg+xml' });
    const url  = URL.createObjectURL(blob);
    const img  = new Image();
    img.onload = () => {
      ctx.globalAlpha = 0.75;
      ctx.drawImage(img, wmX, wmY, wmW, wmH);
      ctx.globalAlpha = 1;
      URL.revokeObjectURL(url);
      _drawThumbText(ctx, S, st, title, author, showTitle, showAuthor);
    };
    img.src = url;
  } else {
    _drawThumbText(ctx, S, st, title, author, showTitle, showAuthor);
  }
}

function _drawThumbText(ctx, S, st, title, author, showTitle, showAuthor) {
  if (showTitle) {
    const tsz = Math.max(8, Math.round(S * 0.115));
    ctx.font = `700 ${tsz}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = st.text;
    let t = title;
    while (ctx.measureText(t).width > S - Math.round(S * 0.1) && t.length > 1) t = t.slice(0, -1);
    if (t.length < title.length) t = t.trimEnd() + '…';
    const hasAuth = showAuthor && author && S >= 128;
    const titleY  = S - Math.round(S * (hasAuth ? 0.18 : 0.09));
    ctx.fillText(t, S / 2, titleY);
    if (hasAuth) {
      const asz = Math.max(6, Math.round(S * 0.078));
      ctx.font = `400 ${asz}px sans-serif`;
      ctx.fillStyle = st.sub;
      let a = author;
      while (ctx.measureText(a).width > S - Math.round(S * 0.12) && a.length > 1) a = a.slice(0, -1);
      if (a.length < author.length) a = a.trimEnd() + '…';
      ctx.fillText(a, S / 2, titleY + Math.round(asz * 1.35));
    }
  } else if (showAuthor && author && S >= 128) {
    const asz = Math.max(6, Math.round(S * 0.078));
    ctx.font = `400 ${asz}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = st.sub;
    let a = author;
    while (ctx.measureText(a).width > S - Math.round(S * 0.12) && a.length > 1) a = a.slice(0, -1);
    if (a.length < author.length) a = a.trimEnd() + '…';
    ctx.fillText(a, S / 2, S - Math.round(S * 0.09));
  }
}

function downloadThumb() {
  const canvas = document.getElementById('thumb-canvas');
  if (!canvas) return;
  const titleSlug = (document.getElementById('edit-title')?.value || 'thumbnail')
    .replace(/[^a-z0-9]/gi, '_').toLowerCase();
  canvas.toBlob(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = titleSlug + '_icon.png';
    a.click();
    URL.revokeObjectURL(a.href);
  }, 'image/png');
}

function saveThumbToServer() {
  const id = parseInt(document.getElementById('edit-id')?.value);
  if (!id) return Promise.reject(new Error('No video selected'));
  const canvas = document.getElementById('thumb-canvas');
  if (!canvas) return Promise.reject(new Error('No canvas'));

  return new Promise((resolve, reject) => {
    canvas.toBlob(async blob => {
      const fd = new FormData();
      fd.append('thumbnail', blob, 'icon.png');
      try {
        const res  = await fetch(`/api/videos/${id}/thumbnail`, { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || res.statusText);
        // Update gallery card thumb
        const idx = state.videos.findIndex(v => v.id === id);
        if (idx !== -1) {
          state.videos[idx].thumbnail_url = data.url + '?t=' + Date.now();
          updateCard(state.videos[idx]);
          const tEl = document.getElementById('edit-thumb');
          if (tEl) { tEl.src = data.url + '?t=' + Date.now(); tEl.style.display = 'block'; }
        }
        resolve(data);
      } catch (e) {
        reject(e);
      }
    }, 'image/png');
  });
}

// ── State ──────────────────────────────────────────────────────────────────────
const state = {
  videos: [],
  selected: new Set(),
  filters: { status: '', orientation: '', q: '' },
  pollTimers: {},   // vid_id → setInterval handle
  editId: null,
  settings: {},     // cached settings (populated on load + save)
};

// ── API helpers ────────────────────────────────────────────────────────────────
async function api(method, url, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const r = await fetch(url, opts);
  if (!r.ok) {
    const t = await r.text();
    throw new Error(t || r.statusText);
  }
  return r.json();
}

const GET  = (url)        => api('GET', url);
const PUT  = (url, body)  => api('PUT', url, body);
const POST = (url, body)  => api('POST', url, body);
const DEL  = (url)        => api('DELETE', url);

// ── Toast ──────────────────────────────────────────────────────────────────────
function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// ── Render helpers ─────────────────────────────────────────────────────────────
function badgeHtml(status) {
  const labels = {
    pending:  'Pending',
    queued:   'Queued',
    encoding: 'Encoding',
    done:     'Done',
    error:    'Error',
  };
  return `<span class="badge badge-${status}">${labels[status] || status}</span>`;
}

function progressPct(step) {
  // 8 steps total
  return Math.round((step / 8) * 100);
}

function durationFmt(sec) {
  if (!sec) return '';
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ── Gallery render ─────────────────────────────────────────────────────────────
function filteredVideos() {
  const { status, orientation, q } = state.filters;
  return state.videos.filter(v => {
    if (status && v.status !== status) return false;
    if (orientation && !v.orientations.includes(orientation)) return false;
    if (q) {
      const lq = q.toLowerCase();
      if (!v.title.toLowerCase().includes(lq) && !v.author.toLowerCase().includes(lq)) return false;
    }
    return true;
  });
}

function renderGallery() {
  const gallery = document.getElementById('gallery');
  const empty   = document.getElementById('gallery-empty');
  const vids    = filteredVideos();

  // Remove existing cards (keep empty placeholder)
  gallery.querySelectorAll('.card').forEach(c => c.remove());

  if (!vids.length) {
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';

  vids.forEach(v => {
    const card = buildCard(v);
    gallery.appendChild(card);
  });

  updateStats();
}

function buildCard(v) {
  const card = document.createElement('div');
  card.className = 'card' + (state.selected.has(v.id) ? ' selected' : '');
  card.dataset.id = v.id;

  const pct = progressPct(v.progress_step);

  // Checkbox
  const chk = document.createElement('div');
  chk.className = 'card-checkbox' + (state.selected.has(v.id) ? ' checked' : '');
  chk.addEventListener('click', e => { e.stopPropagation(); toggleSelect(v.id); });
  card.appendChild(chk);

  // Thumb
  if (v.thumbnail_url) {
    const img = document.createElement('img');
    img.className = 'card-thumb';
    img.src = v.thumbnail_url;
    img.alt = v.title;
    img.loading = 'lazy';
    card.appendChild(img);
  } else {
    const ph = document.createElement('div');
    ph.className = 'card-thumb-placeholder';
    ph.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
      <polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
    </svg>`;
    card.appendChild(ph);
  }

  // Encode button (not shown for done/encoding/queued)
  if (v.status === 'pending' || v.status === 'error') {
    const encBtn = document.createElement('button');
    encBtn.className = 'card-encode-btn';
    encBtn.textContent = v.status === 'error' ? 'Retry' : 'Encode';
    encBtn.addEventListener('click', e => { e.stopPropagation(); encodeVideo(v.id); });
    card.appendChild(encBtn);
  }

  // Body
  const body = document.createElement('div');
  body.className = 'card-body';
  body.innerHTML = `
    <div class="card-title" title="${esc(v.title)}">${esc(v.title) || '<em>Untitled</em>'}</div>
    <div class="card-author">${esc(v.author) || '<em>No author</em>'}</div>
    <div class="card-meta">
      ${badgeHtml(v.status)}
      ${v.duration_sec ? `<span style="font-size:11px;color:var(--text2)">${durationFmt(v.duration_sec)}</span>` : ''}
    </div>
  `;
  card.appendChild(body);

  // Progress bar for encoding
  if (v.status === 'encoding' || v.status === 'queued') {
    const prog = document.createElement('div');
    prog.className = 'card-progress';
    prog.innerHTML = `<div class="card-progress-fill" style="width:${pct}%"></div>`;
    card.appendChild(prog);
  }

  // Click → open edit modal
  card.addEventListener('click', () => openEditModal(v.id));

  return card;
}

function updateCard(v) {
  const existing = document.querySelector(`.card[data-id="${v.id}"]`);
  if (!existing) return;
  const fresh = buildCard(v);
  existing.replaceWith(fresh);
}

// ── Selection ──────────────────────────────────────────────────────────────────
function toggleSelect(id) {
  if (state.selected.has(id)) state.selected.delete(id);
  else state.selected.add(id);
  updateSelectionUI();
  renderGallery();
}

function updateSelectionUI() {
  const count = state.selected.size;
  document.getElementById('sel-count').textContent = count;
  document.getElementById('btn-encode-selected').disabled = count === 0;
  document.getElementById('btn-delete-selected').disabled = count === 0;
}

// ── Stats ──────────────────────────────────────────────────────────────────────
function updateStats() {
  const all = state.videos;
  document.getElementById('stat-total').textContent   = all.length;
  document.getElementById('stat-done').textContent    = all.filter(v => v.status === 'done').length;
  document.getElementById('stat-pending').textContent = all.filter(v => v.status === 'pending').length;
}

// ── Load / reload ──────────────────────────────────────────────────────────────
async function loadVideos() {
  const { status, orientation, q } = state.filters;
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  // We filter client-side for status/orientation so polling updates work smoothly
  try {
    state.videos = await GET('/api/videos?' + params.toString());
    renderGallery();
    // Restart polling for any active encodes
    state.videos.forEach(v => {
      if (v.status === 'encoding' || v.status === 'queued') startPoll(v.id);
    });
  } catch (e) {
    toast('Failed to load videos: ' + e.message, 'error');
  }
}

// ── Polling ────────────────────────────────────────────────────────────────────
function startPoll(id) {
  if (state.pollTimers[id]) return;
  state.pollTimers[id] = setInterval(() => pollStatus(id), 2000);
}

function stopPoll(id) {
  clearInterval(state.pollTimers[id]);
  delete state.pollTimers[id];
}

async function pollStatus(id) {
  try {
    const s = await GET(`/api/videos/${id}/status`);
    // Update the video in state
    const idx = state.videos.findIndex(v => v.id === id);
    if (idx !== -1) {
      Object.assign(state.videos[idx], {
        status: s.status,
        progress_step: s.progress_step,
        progress_msg: s.progress_msg,
        error_msg: s.error_msg,
        has_package: s.has_package,
        package_url: s.package_url,
      });
      updateCard(state.videos[idx]);
    }
    if (state.editId === id) updateEditModalStatus(s);

    if (s.status !== 'encoding' && s.status !== 'queued') {
      stopPoll(id);
      if (s.status === 'done') {
        toast(`"${state.videos[idx]?.title || id}" encoded successfully!`, 'success');
        if (idx !== -1) {
          // Re-fetch full record to get package_url
          const full = await GET(`/api/videos/${id}`);
          state.videos[idx] = full;
          updateCard(full);
          if (state.editId === id) { populateEditModal(full); updateFilenamePanel(full); }
        }
      }
    }
  } catch (_) { /* ignore transient errors */ }
}

// ── Encode ─────────────────────────────────────────────────────────────────────
async function encodeVideo(id, mode = 'auto') {
  try {
    await POST(`/api/videos/${id}/encode`, { mode });
    const idx = state.videos.findIndex(v => v.id === id);
    if (idx !== -1) state.videos[idx].status = 'queued';
    renderGallery();
    startPoll(id);
    const label = mode === 'rebuild' ? 'Rebuild queued' : 'Encode queued';
    toast(label, 'info');
  } catch (e) {
    toast('Failed to queue: ' + e.message, 'error');
  }
}

// ── Upload ─────────────────────────────────────────────────────────────────────
async function ingestPaths(paths) {
  if (!paths.length) { toast('No .mp4 paths found', 'error'); return; }
  try {
    const res = await POST('/api/ingest-paths', { paths });
    (res.videos || []).forEach(v => state.videos.unshift(v));
    if (res.added) renderGallery();
    const msg = res.added
      ? `Added ${res.added} video${res.added !== 1 ? 's' : ''}${res.skipped ? ` (${res.skipped} already in library)` : ''}`
      : `Already in library (${res.skipped} skipped)`;
    toast(msg, res.added ? 'success' : 'info');
  } catch (e) {
    toast('Import failed: ' + e.message, 'error');
  }
}

// ── Edit modal ─────────────────────────────────────────────────────────────────
function openEditModal(id) {
  const v = state.videos.find(v => v.id === id);
  if (!v) return;
  state.editId = id;
  populateEditModal(v);
  document.getElementById('edit-modal').style.display = 'flex';

  // Load the source preview frame as the icon background automatically
  if (v.thumbnail_url) {
    const img = new Image();
    img.onload  = () => { _thumbBg = img; renderThumb(); };
    img.onerror = () => { _thumbBg = null; renderThumb(); };
    img.src = v.thumbnail_url + '?t=' + Date.now();   // cache-bust after icon saves
  } else {
    _thumbBg = null;
    renderThumb();
  }

  if (v.status === 'encoding' || v.status === 'queued') startPoll(id);
}

function populateEditModal(v) {
  document.getElementById('edit-id').value          = v.id;
  document.getElementById('edit-modal-title').textContent = v.title || v.display_name || 'Edit Video';
  document.getElementById('edit-hash-name').value    = v.hash_name    || '';
  document.getElementById('edit-display-name').value = v.display_name || '';
  document.getElementById('edit-title').value        = v.title        || '';
  document.getElementById('edit-author').value       = v.author;
  document.getElementById('edit-desc').value        = v.description;
  document.getElementById('edit-duration').value    = v.duration_sec || '';
  document.getElementById('edit-res').value         = v.resolution || '480x272';
  document.getElementById('edit-fps').value         = String(v.fps || 30);
  document.getElementById('edit-asr').value         = String(v.audio_rate || 44100);
  document.getElementById('edit-ratemode').value    = v.rate_mode || 'cqp';
  document.getElementById('edit-quant').value       = v.quant || 18;
  document.getElementById('edit-quant-hint').textContent = v.quant || 18;
  document.getElementById('edit-cbr').value         = v.cbr_kbps || 500;

  // Rate mode toggle
  const isCbr = (v.rate_mode === 'cbr');
  document.getElementById('edit-quant-wrap').style.display = isCbr ? 'none' : 'flex';
  document.getElementById('edit-cbr-wrap').style.display   = isCbr ? 'flex' : 'none';

  // Thumbnail
  const thumb = document.getElementById('edit-thumb');
  if (v.thumbnail_url) { thumb.src = v.thumbnail_url; thumb.style.display = 'block'; }
  else                  { thumb.style.display = 'none'; }

  // Orient chips
  const active = (v.orientations || '').split(',').map(s => s.trim());
  document.querySelectorAll('#edit-orients .chip').forEach(c => {
    c.classList.toggle('active', active.includes(c.dataset.val));
  });

  updateEditModalStatus({
    status: v.status,
    progress_step: v.progress_step,
    progress_msg: v.progress_msg,
    error_msg: v.error_msg,
    has_package: v.has_package,
    package_url: v.package_url,
  });

  updateFilenamePanel(v);
}

function updateEditModalStatus(s) {
  document.getElementById('edit-status-badge').innerHTML = badgeHtml(s.status);

  const progressWrap  = document.getElementById('edit-progress-wrap');
  const errorBox      = document.getElementById('edit-error-box');
  if (s.status === 'encoding' || s.status === 'queued') {
    progressWrap.style.display = 'block';
    document.getElementById('edit-progress-bar').style.width = progressPct(s.progress_step) + '%';
    document.getElementById('edit-progress-label').textContent = s.progress_msg || '';
    errorBox.style.display = 'none';
  } else {
    progressWrap.style.display = 'none';
  }

  if (s.status === 'error') {
    errorBox.textContent = s.error_msg || 'Unknown error';
    errorBox.style.display = 'block';
  } else {
    errorBox.style.display = 'none';
  }

  // Mod folder button — only show when a Mods dir is configured in settings
  const modBtn = document.getElementById('edit-openmod-btn');
  if (modBtn) modBtn.style.display = (state.settings?.pkg_output_dir || '').trim() ? 'flex' : 'none';

  // Disable encode btn while already running
  const encBtn = document.getElementById('edit-encode-btn');
  encBtn.disabled = (s.status === 'encoding' || s.status === 'queued');
  encBtn.textContent = s.status === 'error' ? 'Save & Retry' : 'Save & Encode';
}

// ── Output filenames panel ─────────────────────────────────────────────────────
function updateFilenamePanel(v) {
  // v can be a full video object (from DB) or null to just recompute from form
  const author   = document.getElementById('edit-author')?.value    || '';
  // hash_name field takes priority; fall back to the stored value or filename stem
  const hashName = document.getElementById('edit-hash-name')?.value || '';
  const cur      = v || state.videos.find(x => x.id === state.editId);
  const fallback = cur?.hash_name || cur?.filename?.replace(/\.[^.]+$/, '') || '';
  const names    = computeS4PENames(author, hashName || fallback);

  const set = (elId, text) => {
    const el = document.getElementById(elId);
    if (el) el.textContent = text || '—';
  };
  const setSaved = (elId, ts) => {
    const el = document.getElementById(elId);
    if (!el) return;
    if (ts) {
      el.textContent = 'saved ' + ts;
      el.className = 'fn-saved fresh';
      // fade back to dim after 4 s if it was just now refreshed
      setTimeout(() => el.classList.remove('fresh'), 4000);
    } else {
      el.textContent = 'not saved';
      el.className = 'fn-saved';
    }
  };

  set('fn-avi', names.avi);
  set('fn-dds', names.dds);
  set('fn-xml', names.xml);
  set('fn-pkg', v?.has_package ? (v.filename?.replace(/\.[^.]+$/, '') + '.package') : '—');

  if (v) {
    setSaved('fn-avi-saved', v.avi_saved);
    setSaved('fn-dds-saved', v.dds_saved);
    setSaved('fn-xml-saved', v.xml_saved);
    setSaved('fn-pkg-saved', v.pkg_saved);
  }
}

function collectEditForm() {
  const orients = [...document.querySelectorAll('#edit-orients .chip.active')]
    .map(c => c.dataset.val).join(',') || 'BISEXUAL';
  return {
    hash_name:    document.getElementById('edit-hash-name').value.trim(),
    display_name: document.getElementById('edit-display-name').value.trim(),
    title:        document.getElementById('edit-title').value.trim(),
    author:       document.getElementById('edit-author').value.trim(),
    description: document.getElementById('edit-desc').value.trim(),
    duration_sec: parseInt(document.getElementById('edit-duration').value) || 0,
    resolution:  document.getElementById('edit-res').value,
    fps:         parseInt(document.getElementById('edit-fps').value),
    audio_rate:  parseInt(document.getElementById('edit-asr').value),
    rate_mode:   document.getElementById('edit-ratemode').value,
    quant:       parseInt(document.getElementById('edit-quant').value),
    cbr_kbps:    parseInt(document.getElementById('edit-cbr').value),
    orientations: orients,
  };
}

async function saveEdit() {
  const id = parseInt(document.getElementById('edit-id').value);
  const data = collectEditForm();
  try {
    const updated = await PUT(`/api/videos/${id}`, data);
    const idx = state.videos.findIndex(v => v.id === id);
    if (idx !== -1) state.videos[idx] = updated;
    renderGallery();
    toast('Saved', 'success');
    return true;
  } catch (e) {
    toast('Save failed: ' + e.message, 'error');
    return false;
  }
}

// ── Scan modal ─────────────────────────────────────────────────────────────────
async function runScan() {
  const folder = document.getElementById('scan-path').value.trim();
  if (!folder) { toast('Enter a folder path', 'error'); return; }
  try {
    const res = await POST('/api/scan', { folder });
    closeModal('scan-modal');
    res.videos.forEach(v => state.videos.unshift(v));
    renderGallery();
    toast(`Scanned: ${res.added} added, ${res.skipped} skipped`, 'success');
  } catch (e) {
    toast('Scan failed: ' + e.message, 'error');
  }
}

// ── Modal helpers ──────────────────────────────────────────────────────────────
function closeModal(id) {
  document.getElementById(id).style.display = 'none';
  if (id === 'edit-modal') {
    state.editId = null;
    _thumbBg = null;
    // Reset the bg file picker so it doesn't carry over
    const bgInput = document.getElementById('th-bg');
    if (bgInput) bgInput.value = '';
  }
}

// ── Escape ─────────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Encode-mode confirmation dialog ───────────────────────────────────────────
// Returns 'full', 'rebuild', or null (cancelled).
function confirmEncodeMode(vid) {
  return new Promise(resolve => {
    // Build a small inline prompt inside a modal-style overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal-backdrop';
    overlay.style.cssText = 'display:flex;z-index:400';

    const res  = vid.resolution  || '?';
    const ares = vid.avi_resolution || '?';
    const changed = [];
    if (vid.resolution  !== vid.avi_resolution)  changed.push(`Resolution: ${ares} → ${res}`);
    if (vid.fps         !== vid.avi_fps)          changed.push(`FPS: ${vid.avi_fps} → ${vid.fps}`);
    if (vid.audio_rate  !== vid.avi_audio_rate)   changed.push(`Audio: ${vid.avi_audio_rate} → ${vid.audio_rate} Hz`);
    if (vid.rate_mode   !== vid.avi_rate_mode)    changed.push(`Rate mode: ${vid.avi_rate_mode} → ${vid.rate_mode}`);
    if (vid.rate_mode === 'cqp' && vid.quant     !== vid.avi_quant)    changed.push(`Quant: ${vid.avi_quant} → ${vid.quant}`);
    if (vid.rate_mode === 'cbr' && vid.cbr_kbps  !== vid.avi_cbr_kbps) changed.push(`Bitrate: ${vid.avi_cbr_kbps} → ${vid.cbr_kbps} kbps`);

    overlay.innerHTML = `
      <div class="modal" style="max-width:420px">
        <div class="modal-header">
          <h2>Encode settings changed</h2>
        </div>
        <div class="modal-body">
          <p style="margin-bottom:12px;color:var(--text2)">
            The AVI for <strong style="color:var(--text)">${esc(vid.title)}</strong>
            was encoded with different settings:
          </p>
          <ul class="changed-list">
            ${changed.map(c => `<li>${esc(c)}</li>`).join('')}
          </ul>
          <p style="margin-top:14px;color:var(--text2)">What would you like to do?</p>
        </div>
        <div class="modal-footer" style="justify-content:space-between">
          <button class="btn btn-outline" id="_enc_cancel">Cancel</button>
          <div style="display:flex;gap:8px">
            <button class="btn btn-outline" id="_enc_rebuild" title="Keep existing AVI, only redo XML / DDS / .package">↻ Rebuild only</button>
            <button class="btn btn-accent"  id="_enc_full">⚡ Full re-encode</button>
          </div>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    const cleanup = (val) => { overlay.remove(); resolve(val); };
    overlay.querySelector('#_enc_cancel').onclick  = () => cleanup(null);
    overlay.querySelector('#_enc_rebuild').onclick = () => cleanup('rebuild');
    overlay.querySelector('#_enc_full').onclick    = () => cleanup('full');
    overlay.addEventListener('click', e => { if (e.target === overlay) cleanup(null); });
  });
}


// ── Settings modal ─────────────────────────────────────────────────────────────
function _updatePkgPreview() {
  const prefix  = document.getElementById('cfg-pkg-prefix').value.trim();
  const naming  = document.getElementById('cfg-pkg-naming').value;
  const counter = parseInt(document.getElementById('cfg-pkg-counter').value) || 1;
  const isCounter = naming === 'counter';

  document.getElementById('cfg-counter-wrap').style.display = isCounter ? 'flex' : 'none';

  let stem = '';
  if (isCounter) {
    const n = String(counter).padStart(3, '0');
    stem = prefix ? `${prefix}-${n}` : n;
  } else {
    stem = prefix ? `${prefix}-video_title` : 'video_title';
  }
  document.getElementById('cfg-pkg-preview').textContent = stem + '.package';
}

async function openSettings() {
  try {
    const cfg = await GET('/api/settings');
    state.settings = cfg;
    document.getElementById('cfg-author').value       = cfg.author       || '';
    document.getElementById('cfg-res').value          = cfg.resolution   || '480x272';
    document.getElementById('cfg-fps').value          = String(cfg.fps   || 30);
    document.getElementById('cfg-asr').value          = String(cfg.audio_rate || 44100);
    document.getElementById('cfg-ratemode').value     = cfg.rate_mode    || 'cqp';
    document.getElementById('cfg-quant').value        = cfg.quant        || 18;
    document.getElementById('cfg-quant-hint').textContent = cfg.quant    || 18;
    document.getElementById('cfg-cbr').value          = cfg.cbr_kbps     || 500;
    document.getElementById('cfg-pkg-prefix').value   = cfg.pkg_prefix   || '';
    document.getElementById('cfg-pkg-naming').value   = cfg.pkg_naming   || 'title';
    document.getElementById('cfg-pkg-counter').value  = cfg.pkg_counter  || 1;
    document.getElementById('cfg-pkg-dir').value      = cfg.pkg_output_dir || '';
    document.getElementById('cfg-path-ffmpeg').value   = cfg.path_ffmpeg   || '';
    document.getElementById('cfg-path-nihav').value    = cfg.path_nihav    || '';
    document.getElementById('cfg-path-sx').value       = cfg.path_sx       || '';
    document.getElementById('cfg-path-quickbms').value = cfg.path_quickbms || '';
    document.getElementById('cfg-path-bms').value      = cfg.path_bms      || '';
    document.getElementById('cfg-path-texconv').value  = cfg.path_texconv  || '';

    const isCbr = cfg.rate_mode === 'cbr';
    document.getElementById('cfg-quant-wrap').style.display = isCbr ? 'none' : 'flex';
    document.getElementById('cfg-cbr-wrap').style.display   = isCbr ? 'flex' : 'none';

    const active = (cfg.orientations || '').split(',').map(s => s.trim());
    document.querySelectorAll('#cfg-orients .chip').forEach(c => {
      c.classList.toggle('active', active.includes(c.dataset.val));
    });

    _updatePkgPreview();
    document.getElementById('settings-modal').style.display = 'flex';
  } catch (e) {
    toast('Failed to load settings: ' + e.message, 'error');
  }
}

function collectSettings() {
  const orients = [...document.querySelectorAll('#cfg-orients .chip.active')]
    .map(c => c.dataset.val).join(',') || 'BISEXUAL';
  return {
    author:          document.getElementById('cfg-author').value.trim(),
    resolution:      document.getElementById('cfg-res').value,
    fps:             parseInt(document.getElementById('cfg-fps').value),
    audio_rate:      parseInt(document.getElementById('cfg-asr').value),
    rate_mode:       document.getElementById('cfg-ratemode').value,
    quant:           parseInt(document.getElementById('cfg-quant').value),
    cbr_kbps:        parseInt(document.getElementById('cfg-cbr').value),
    orientations:    orients,
    pkg_prefix:      document.getElementById('cfg-pkg-prefix').value.trim(),
    pkg_naming:      document.getElementById('cfg-pkg-naming').value,
    pkg_counter:     parseInt(document.getElementById('cfg-pkg-counter').value) || 1,
    pkg_output_dir:  document.getElementById('cfg-pkg-dir').value.trim(),
    path_ffmpeg:     document.getElementById('cfg-path-ffmpeg').value.trim(),
    path_nihav:      document.getElementById('cfg-path-nihav').value.trim(),
    path_sx:         document.getElementById('cfg-path-sx').value.trim(),
    path_quickbms:   document.getElementById('cfg-path-quickbms').value.trim(),
    path_bms:        document.getElementById('cfg-path-bms').value.trim(),
    path_texconv:    document.getElementById('cfg-path-texconv').value.trim(),
  };
}

async function saveSettings() {
  try {
    const payload = collectSettings();
    await PUT('/api/settings', payload);
    state.settings = payload;   // keep cache in sync
    toast('Defaults saved', 'success');
    return true;
  } catch (e) {
    toast('Save failed: ' + e.message, 'error');
    return false;
  }
}


// ── Wire up events ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  // Load initial data
  loadVideos();
  GET('/api/settings').then(cfg => { state.settings = cfg; }).catch(() => {});

  // ── Sidebar filters ────────────────────────────────────────────────────────
  document.getElementById('filter-search').addEventListener('input', function() {
    state.filters.q = this.value.trim();
    renderGallery();
  });

  document.getElementById('filter-status').addEventListener('click', e => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    document.querySelectorAll('#filter-status .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.filters.status = btn.dataset.val;
    renderGallery();
  });

  document.getElementById('filter-orient').addEventListener('click', e => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    document.querySelectorAll('#filter-orient .filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.filters.orientation = btn.dataset.val;
    renderGallery();
  });

  // ── Batch actions ──────────────────────────────────────────────────────────
  document.getElementById('btn-select-all').addEventListener('click', () => {
    const ids = filteredVideos().map(v => v.id);
    if (state.selected.size === ids.length) {
      state.selected.clear();
    } else {
      ids.forEach(id => state.selected.add(id));
    }
    updateSelectionUI();
    renderGallery();
  });

  document.getElementById('btn-encode-selected').addEventListener('click', async () => {
    const ids = [...state.selected].filter(id => {
      const v = state.videos.find(v => v.id === id);
      return v && v.status !== 'encoding' && v.status !== 'queued';
    });
    if (!ids.length) return;
    try {
      const res = await POST('/api/videos/batch-encode', { ids });
      res.queued.forEach(id => {
        const idx = state.videos.findIndex(v => v.id === id);
        if (idx !== -1) state.videos[idx].status = 'queued';
        startPoll(id);
      });
      renderGallery();
      toast(`Queued ${res.queued.length} encode(s)`, 'info');
      state.selected.clear();
      updateSelectionUI();
    } catch (e) {
      toast('Batch encode failed: ' + e.message, 'error');
    }
  });

  document.getElementById('btn-delete-selected').addEventListener('click', async () => {
    const ids = [...state.selected];
    if (!ids.length) return;
    const n = ids.length;
    if (!confirm(`Delete ${n} video${n > 1 ? 's' : ''}?\n\nThis removes the entry and all generated files (AVI, DDS, XML, .package). The original source file is NOT deleted.`)) return;

    let deleted = 0, failed = 0;
    for (const id of ids) {
      try {
        await DEL(`/api/videos/${id}`);
        state.videos = state.videos.filter(v => v.id !== id);
        state.selected.delete(id);
        deleted++;
      } catch {
        failed++;
      }
    }
    updateSelectionUI();
    renderGallery();
    if (failed) toast(`Deleted ${deleted}, failed ${failed}`, 'error');
    else        toast(`Deleted ${deleted} video${deleted > 1 ? 's' : ''}`, 'success');
  });

  // ── Settings modal ─────────────────────────────────────────────────────────
  document.getElementById('btn-settings').addEventListener('click', openSettings);

  document.getElementById('cfg-ratemode').addEventListener('change', function() {
    const isCbr = this.value === 'cbr';
    document.getElementById('cfg-quant-wrap').style.display = isCbr ? 'none' : 'flex';
    document.getElementById('cfg-cbr-wrap').style.display   = isCbr ? 'flex' : 'none';
  });

  // Package naming live preview
  ['cfg-pkg-prefix', 'cfg-pkg-naming', 'cfg-pkg-counter'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', _updatePkgPreview);
    document.getElementById(id)?.addEventListener('change', _updatePkgPreview);
  });

  document.getElementById('cfg-quant').addEventListener('input', function() {
    document.getElementById('cfg-quant-hint').textContent = this.value;
  });

  document.querySelectorAll('#cfg-orients .chip').forEach(c => {
    c.addEventListener('click', () => c.classList.toggle('active'));
  });

  document.getElementById('cfg-save-btn').addEventListener('click', async () => {
    const ok = await saveSettings();
    if (ok) closeModal('settings-modal');
  });

  document.getElementById('cfg-apply-btn').addEventListener('click', async () => {
    const ok = await saveSettings();
    if (!ok) return;
    try {
      const res = await POST('/api/settings/apply-defaults');
      toast(`Defaults applied to ${res.updated} pending video(s)`, 'success');
      await loadVideos();   // refresh cards to show updated settings
    } catch (e) {
      toast('Apply failed: ' + e.message, 'error');
    }
  });

  // ── Add Videos → opens Scan Folder modal (no file copy) ──────────────────
  document.getElementById('btn-add').addEventListener('click', () => {
    document.getElementById('scan-modal').style.display = 'flex';
  });

  // ── Scan folder ────────────────────────────────────────────────────────────
  document.getElementById('btn-scan').addEventListener('click', () => {
    document.getElementById('scan-modal').style.display = 'flex';
  });
  document.getElementById('btn-scan-confirm').addEventListener('click', runScan);
  document.getElementById('scan-path').addEventListener('keydown', e => {
    if (e.key === 'Enter') runScan();
  });

  // ── Thumbnail generator controls ───────────────────────────────────────────
  ['th-style', 'th-size'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', renderThumb);
  });

  document.getElementById('th-opacity')?.addEventListener('input', function() {
    const el = document.getElementById('th-opacity-val');
    if (el) el.textContent = this.value + '%';
    renderThumb();
  });

  ['th-show-wm', 'th-show-title', 'th-show-author'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', renderThumb);
  });

  document.getElementById('edit-openfolder-btn')?.addEventListener('click', async () => {
    try {
      const id = parseInt(document.getElementById('edit-id')?.value) || null;
      await POST('/api/open-folder', id ? { id } : {});
    } catch (e) {
      toast('Could not open folder: ' + e.message, 'error');
    }
  });

  document.getElementById('edit-openmod-btn')?.addEventListener('click', async () => {
    try {
      await POST('/api/open-mod-folder');
    } catch (e) {
      toast(e.message, 'error');   // surfaces "No Mods folder configured" etc.
    }
  });



  // Re-render thumb when title or author changes in the form
  ['edit-title', 'edit-author'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', renderThumb);
  });

  // ── Edit modal events ──────────────────────────────────────────────────────
  document.getElementById('edit-ratemode').addEventListener('change', function() {
    const isCbr = this.value === 'cbr';
    document.getElementById('edit-quant-wrap').style.display = isCbr ? 'none' : 'flex';
    document.getElementById('edit-cbr-wrap').style.display   = isCbr ? 'flex' : 'none';
  });

  document.getElementById('edit-quant').addEventListener('input', function() {
    document.getElementById('edit-quant-hint').textContent = this.value;
  });

  document.querySelectorAll('#edit-orients .chip').forEach(c => {
    c.addEventListener('click', () => c.classList.toggle('active'));
  });

  // Live: re-render S4PE filenames when author or hash name changes
  document.getElementById('edit-author')?.addEventListener('input',    () => updateFilenamePanel(null));
  document.getElementById('edit-hash-name')?.addEventListener('input', () => updateFilenamePanel(null));

  // Save XML — write XML file from current metadata
  document.getElementById('edit-save-xml-btn').addEventListener('click', async () => {
    const id = parseInt(document.getElementById('edit-id').value);
    // Persist metadata first so the XML reflects latest values
    await saveEdit();
    try {
      const v = await POST(`/api/videos/${id}/save-xml`);
      const idx = state.videos.findIndex(x => x.id === id);
      if (idx !== -1) state.videos[idx] = v;
      updateFilenamePanel(v);
      toast('XML saved', 'success');
    } catch (e) { toast('Save XML failed: ' + e.message, 'error'); }
  });

  // Save DDS — save the current canvas (128×128 icon) then run texconv
  document.getElementById('edit-save-dds-btn').addEventListener('click', async () => {
    const id = parseInt(document.getElementById('edit-id').value);
    try {
      // Always capture the canvas as the icon source before converting
      await saveThumbToServer();
      const v = await POST(`/api/videos/${id}/save-dds`);
      const idx = state.videos.findIndex(x => x.id === id);
      if (idx !== -1) state.videos[idx] = v;
      updateFilenamePanel(v);
      toast('DDS saved', 'success');
    } catch (e) { toast('Save DDS failed: ' + e.message, 'error'); }
  });

  // Rebuild Package — assemble .package from existing files
  document.getElementById('edit-rebuild-btn').addEventListener('click', async () => {
    const id = parseInt(document.getElementById('edit-id').value);
    try {
      const v = await POST(`/api/videos/${id}/rebuild-package`);
      const idx = state.videos.findIndex(x => x.id === id);
      if (idx !== -1) { state.videos[idx] = v; updateCard(v); }
      updateFilenamePanel(v);
      toast('Package rebuilt', 'success');
    } catch (e) { toast('Rebuild failed: ' + e.message, 'error'); }
  });

  // Encode AVI — VP6 pipeline with smart re-encode prompt
  document.getElementById('edit-encode-btn').addEventListener('click', async () => {
    const id  = parseInt(document.getElementById('edit-id').value);
    const vid = state.videos.find(v => v.id === id);

    if (vid && vid.avi_exists && vid.avi_settings_changed) {
      const choice = await confirmEncodeMode(vid);
      if (choice === null) return;
      await encodeVideo(id, choice);
    } else {
      await encodeVideo(id, 'auto');
    }
  });

  // ── Debug package ──────────────────────────────────────────────────────────
  document.getElementById('edit-debug-btn')?.addEventListener('click', async () => {
    const id = parseInt(document.getElementById('edit-id').value);
    const variant = await new Promise(resolve => {
      const choice = prompt(
        'Build a stripped test package to isolate the game crash.\n\n' +
        'Enter a variant:\n' +
        '  xml_only — only the XML tuning (no AVI, no DDS)\n' +
        '  no_avi   — XML + DDS only\n' +
        '  no_dds   — XML + AVI only\n' +
        '  full     — all three resources (same as Save .package)\n\n' +
        'Start with "xml_only". If the game loads → the issue is in the AVI or DDS.',
        'xml_only'
      );
      resolve(choice);
    });
    if (!variant) return;
    try {
      const res = await POST(`/api/videos/${id}/debug-package`, { variant });
      toast(`Debug package saved: ${res.filename}  (${res.resources} resource(s)) — ${res.hint}`, 'info');
    } catch (e) {
      toast('Debug package failed: ' + e.message, 'error');
    }
  });

  // ── Drag and drop ──────────────────────────────────────────────────────────
  let dragCounter = 0;
  const overlay = document.getElementById('drop-overlay');

  document.addEventListener('dragenter', e => {
    e.preventDefault();
    dragCounter++;
    if ([...e.dataTransfer.items].some(i => i.kind === 'file')) {
      overlay.classList.add('active');
    }
  });

  document.addEventListener('dragleave', () => {
    dragCounter--;
    if (dragCounter <= 0) { dragCounter = 0; overlay.classList.remove('active'); }
  });

  document.addEventListener('dragover', e => e.preventDefault());

  document.addEventListener('drop', async e => {
    e.preventDefault();
    dragCounter = 0;
    overlay.classList.remove('active');
    // Extract file:// URIs from the drop (Windows Explorer → Chrome/Edge)
    const uriList = e.dataTransfer.getData('text/uri-list') || '';
    const paths = uriList.split(/\r?\n/)
      .map(l => l.trim())
      .filter(l => l && !l.startsWith('#'))
      .map(uri => uri.startsWith('file:///') ? decodeURIComponent(uri.slice(8)) : uri)
      .filter(p => p.toLowerCase().endsWith('.mp4'));
    if (paths.length) {
      await ingestPaths(paths);
    } else {
      toast('Drag .mp4 files from Explorer, or paste paths with Ctrl+V', 'info');
    }
  });

  // ── Modal close buttons ────────────────────────────────────────────────────
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });

  // Close on backdrop click
  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', e => {
      if (e.target === backdrop) closeModal(backdrop.id);
    });
  });

  // ── Escape key ─────────────────────────────────────────────────────────────
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      ['edit-modal', 'scan-modal', 'settings-modal'].forEach(id => {
        if (document.getElementById(id).style.display !== 'none') closeModal(id);
      });
    }
  });

  // ── Clipboard paste — file paths ───────────────────────────────────────────
  // Ctrl+V anywhere on the page (outside an input/textarea) reads the clipboard
  // text, extracts any lines ending in .mp4, and ingests them as new videos.
  document.addEventListener('paste', async e => {
    const active = document.activeElement?.tagName;
    if (active === 'INPUT' || active === 'TEXTAREA') return;   // let inputs keep normal paste

    const text = (e.clipboardData || window.clipboardData).getData('text');
    if (!text) return;

    // Accept paths separated by newlines, semicolons, or the Windows
    // Explorer "copy as path" format (quoted paths).
    const paths = text
      .split(/[\r\n;]+/)
      .map(s => s.trim().replace(/^["']|["']$/g, ''))   // strip surrounding quotes
      .filter(s => s.toLowerCase().endsWith('.mp4') && s.length > 4);

    if (!paths.length) return;
    e.preventDefault();

    try {
      const res = await POST('/api/ingest-paths', { paths });
      if (res.added === 0) {
        toast(`No new videos found (${res.skipped} already in library)`, 'info');
        return;
      }
      res.videos.forEach(v => state.videos.unshift(v));
      renderGallery();
      const msg = res.skipped
        ? `Added ${res.added} video(s), ${res.skipped} already in library`
        : `Added ${res.added} video(s) from clipboard`;
      toast(msg, 'success');
    } catch (e) {
      toast('Clipboard import failed: ' + e.message, 'error');
    }
  });
});
