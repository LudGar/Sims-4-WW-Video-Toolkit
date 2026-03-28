// ── FNV-64 ──
function fnv64(str) {
    const P = 0x00000100000001b3n,
        O = 0xcbf29ce484222325n,
        M = 0xFFFFFFFFFFFFFFFFn;
    let h = O;
    for (const b of new TextEncoder().encode(str.toLowerCase())) {
        h ^= BigInt(b);
        h = (h * P) & M;
    }
    return h;
}

// ── FILE NAME LIVE UPDATE ──
document.getElementById('vid-filename').addEventListener('input', function() {
    const raw = this.value.trim();
    const title = raw.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Za-z])([0-9])/g, '$1 $2')
        .replace(/([0-9])([A-Za-z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
    const tEl = document.getElementById('vid-title');
    if (!tEl._manual) tEl.value = title;
    updateFileNames();
    renderThumb();
    saveState();
});
document.getElementById('vid-title').addEventListener('input', function() {
    this._manual = !!this.value;
    updateFileNames();
    renderThumb();
    saveState();
});
document.getElementById('vid-author').addEventListener('input', function() {
    updateFileNames();
    renderThumb();
    saveState();
});


function getBaseId() {
    const author = document.getElementById('vid-author').value.trim() || 'YourName';
    const filename = document.getElementById('vid-filename').value.trim() || 'VideoName';
    const cleanFile = filename.replace(/[^a-zA-Z0-9]/g, '');
    const base = `${author}:VIDEO_${cleanFile}`;
    return {
        author,
        filename,
        cleanFile,
        base
    };
}

function updateFileNames() {
    const {
        base
    } = getBaseId();
    const names = [
        ['fn-avi', base],
        ['fn-img', base],
        ['fn-ww', base + '_WW.OBJ.TUNING'],
        ['fn-ia', base + '_CE.PASSTHROUGH.INTERACTION'],
        ['fn-ex', base + '_CE.ExitCondition'],
    ];
    names.forEach(([id, name]) => {
        const h = fnv64(name),
            hex = h.toString(16).toUpperCase().padStart(16, '0');
        const el = document.getElementById(id);
        if (el) el.textContent = hex;
    });
    buildBat();
}

// ── DURATION ──
['dur-min', 'dur-sec'].forEach(id => document.getElementById(id).addEventListener('input', () => {
    updateDur();
    buildBat();
    saveState();
}));

function updateDur() {
    const t = (parseInt(document.getElementById('dur-min').value) || 0) * 60 + (parseInt(document.getElementById('dur-sec').value) || 0);
    document.getElementById('dur-total').textContent = t + ' second' + (t === 1 ? '' : 's') + ' total';
}

function setDur(m, s) {
    document.getElementById('dur-min').value = m;
    document.getElementById('dur-sec').value = s;
    updateDur();
    buildBat();
    saveState();
}

// ── ORIENTATIONS ──
document.querySelectorAll('.orient-opt').forEach(el => {
    el.addEventListener('click', () => {
        el.classList.toggle('on');
        updateOrientSummary();
        buildBat();
        saveState();
    });
});
const tagField = document.getElementById('tag-field');
tagField.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const v = this.value.trim().replace(/,/g, '').toUpperCase().replace(/\s+/g, '_');
        if (v) addTag(v);
        this.value = '';
    } else if (e.key === 'Backspace' && this.value === '') {
        const chips = document.querySelectorAll('#tag-wrap .chip');
        if (chips.length) chips[chips.length - 1].remove();
        updateOrientSummary();
        buildBat();
    }
});
tagField.addEventListener('blur', function() {
    const v = this.value.trim().replace(/,/g, '').toUpperCase().replace(/\s+/g, '_');
    if (v) {
        addTag(v);
        this.value = '';
    }
});
document.getElementById('tag-wrap').addEventListener('click', () => tagField.focus());

function addTag(val) {
    if (!val) return;
    const ex = [...document.querySelectorAll('#tag-wrap .chip')].map(c => c.dataset.val);
    if (ex.includes(val)) return;
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.dataset.val = val;
    chip.innerHTML = val + '<button class="chip-del" onclick="this.closest(\'.chip\').remove();updateOrientSummary();buildBat();">&times;</button>';
    document.getElementById('tag-wrap').insertBefore(chip, tagField);
    updateOrientSummary();
    buildBat();
}

function updateOrientSummary() {
    const all = getAllOrients();
    const el = document.getElementById('orient-summary');
    el.innerHTML = all.length ? all.map(v => `<span class="os-chip">${v}</span>`).join('') : '<span class="os-empty">No tags selected</span>';
}

function getAllOrients() {
    const s = [...document.querySelectorAll('.orient-opt.on')].map(e => e.dataset.val);
    const t = [...document.querySelectorAll('#tag-wrap .chip')].map(c => c.dataset.val);
    return [...s, ...t];
}

// ── BAT GENERATOR ──
function getBatRes() {
    const el = document.getElementById('b-res');
    return el.value === 'custom' ? (document.getElementById('b-cres').value.trim() || '480x272') : el.value;
}

function generateBat() {
    const res = getBatRes();
    const fps = document.getElementById('b-fps').value;
    const asr = document.getElementById('b-asr').value;
    const scaleRes = res.replace('x', ':');
    const rateMode = document.getElementById('b-ratemode').value;
    const quant = rateMode === 'cbr' ? null : document.getElementById('b-quant').value;
    const cbr = document.getElementById('b-cbr').value;
    const rateParam = rateMode === 'cbr' ? `bitrate=${parseInt(cbr)*1000}` : `quant=${quant}`;
    const inf = 'MP4';

    // ── Video detail fields for XML ──
    const _v = id => {
        const e = document.getElementById(id);
        return e ? e.value.trim() : '';
    };
    const gTitle = _v('vid-title');
    const gAuthor = _v('vid-author');
    const gDesc = _v('vid-desc');

    const gFilename = _v('vid-filename');
    const gPrefix = gAuthor.replace(/\s+/g, '');
    const gClean = gFilename.replace(/[^a-zA-Z0-9]/g, '');
    const gBase = gPrefix + ':VIDEO_' + gClean;
    const gOrients = getAllOrients().join(',') || 'BISEXUAL';
    const gDur = (parseInt(document.getElementById('dur-min')?.value || 0) * 60 +
        parseInt(document.getElementById('dur-sec')?.value || 0));

    const gWW = fnv64(gBase + '_WW.OBJ.TUNING');
    const gIA = fnv64(gBase + '_CE.PASSTHROUGH.INTERACTION');
    const gEX = fnv64(gBase + '_CE.ExitCondition');
    const hWW = gWW.toString(16).toUpperCase().padStart(16, '0');
    const hIA = gIA.toString(16).toUpperCase().padStart(16, '0');
    const hEX = gEX.toString(16).toUpperCase().padStart(16, '0');
    const dWW = gWW.toString(10);
    const dIA = gIA.toString(10);
    const dEX = gEX.toString(10);
    const fnWW = 'S4_5B02819E_00000000_' + hWW + '____XML.xml';
    const fnIA = 'S4_E882D22F_00000000_' + hIA + '____XML.xml';
    const fnEX = 'S4_7DF2169C_00000000_' + hEX + '____XML.xml';
    const gAVI = fnv64(gBase);
    const hAVI = gAVI.toString(16).toUpperCase().padStart(16, '0');
    const fnAVI = 'S4_376840D7_00000000_' + hAVI + '____AVI.avi';
    const fnIMG = 'S4_00B2D882_00000000_' + hAVI + '____IMG.dds';
    const gIcon = '00B2D882:00000000:' + hAVI;

    const ex = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const nWW = ex(gBase + '_WW.OBJ.TUNING');
    const nIA = ex(gBase + '_CE.PASSTHROUGH.INTERACTION');
    const nEX = ex(gBase + '_CE.ExitCondition');

    // echo-redirect XML builder (cmd.exe safe, no PowerShell needed)
    const xmlToBat = (lines, outPath) => {
        const esc = s => s.replace(/\^/g, '^^').replace(/</g, '^<').replace(/>/g, '^>').replace(/&/g, '^&').replace(/\|/g, '^|');
        const echoes = lines.map(l => l.trim() ? 'echo ' + esc(l) : 'echo.');
        return '(\r\n' + echoes.join('\r\n') + '\r\n) > "' + outPath + '"';
    };

    const buildXmlWW = () => xmlToBat([
        '<I c="WickedVideoChannel" i="object_state" m="wickedwhims.sex.features.porn_watching.tv._ts4_channel_video" n="' + nWW + '" s="' + dWW + '">',
        '',
        '   <T n="video_raw_display_name">' + ex(gTitle) + '</T>',
        ...(gDesc ? ['   <T n="video_raw_display_description">' + ex(gDesc) + '</T>'] : []),
        '   <T n="video_author">' + ex(gAuthor) + '</T>',
        '   <T n="video_display_icon">' + ex(gIcon) + '</T>',
        '   <T n="video_orientations">' + gOrients + '</T>',
        '   <T n="video_duration">' + gDur + '</T>',
        '   <T n="affordance">13310387700104523747</T>',
        '   <U n="new_client_state">',
        '      <V n="video_playlist" t="apply_new_value">',
        '         <V n="apply_new_value" t="start_video">',
        '            <U n="start_video">',
        '               <L n="clip_list">',
        '                 <T p="">376840D7:00000000:' + hAVI + '</T></L></U></V></V>',
        '',
        '      <V n="autonomy_modifiers" t="apply_new_value">',
        '         <V n="apply_new_value" t="apply_statistic_modifiers">',
        '            <U n="apply_statistic_modifiers">',
        '               <U n="periodic_statistic_change">',
        '                  <T n="interval">60</T>',
        '                  <L n="operations">',
        '                     <U><T n="amount">-1</T><T n="stat">16633</T></U></L></U></U></V></V>',
        '',
        '      <V n="broadcaster" t="apply_new_value">',
        '         <V n="apply_new_value" t="start_broadcaster">',
        '            <U n="start_broadcaster">',
        '               <L n="broadcaster_types">',
        '                  <U><T n="item">74334</T></U></L></U></V></V></U>',
        '',
        '   <V n="_display_data" t="enabled">',
        '      <U n="enabled">',
        '         <V n="instance_display_description" t="enabled"><T n="enabled">0x9865B978</T></V>',
        '         <V n="instance_display_icon" t="disabled"/>',
        '         <V n="instance_display_name" t="enabled"><T n="enabled">0x34407B57</T></V></U></V>',
        '',
        '   <L n="buff_weight_multipliers">',
        '      <U><T n="key">34527</T><T n="value">1</T></U>',
        '      <U><T n="key">34526</T><T n="value">1</T></U>',
        '      <U><T n="key">34525</T><T n="value">1</T></U>',
        '      <U><T n="key">34524</T><T n="value">1</T></U>',
        '      <U><T n="key">34523</T><T n="value">0</T></U></L>',
        '',
        '   <V n="value" t="integral"><T n="integral">604</T></V></I>',
    ], '.\\OUT\\' + fnWW);

    const buildXmlIA = () => xmlToBat([
        '<I c="ImmediateSuperInteraction" i="interaction" m="interactions.base.immediate_interaction" n="' + nIA + '" s="' + dIA + '">',
        '',
        '   <T n="display_name">0xA410004C</T>',
        '   <V n="display_tooltip" t="enabled">',
        '   <T n="enabled">0xA410004D</T></V>',
        '   <V n="outcome" t="single">',
        '      <U n="single">',
        '         <U n="actions">',
        '            <L n="basic_extras">',
        '               <V t="loot">',
        '                  <U n="loot">',
        '                     <L n="loot_list">',
        '                        <T>13785909837673828001</T></L>',
        '',
        '                     <U n="success_chance">',
        '                        <T n="base_chance">100</T></U>',
        '',
        '                     <V n="timing" t="at_beginning">',
        '                        <U n="at_beginning" /></V></U></V></L>',
        '',
        '            <L n="continuation">',
        '               <U><T n="affordance">10226610056</T>',
        '                  <E n="target">Object</E></U></L></U></U></V>',
        '',
        '   <V n="pie_menu_icon" t="enabled">',
        '      <V n="enabled" t="resource_key">',
        '         <U n="resource_key">',
        '            <T n="key">00B2D882:00000000:' + hAVI + '</T></U></V></V>',
        '',
        '   <T n="pie_menu_priority">0</T>',
        '   <L n="test_globals">',
        '      <V t="test_set_reference">',
        '         <T n="test_set_reference">15610208496863675011</T></V></L>',
        '',
        '   <L n="tests">',
        '      <L><V t="test_set_reference">',
        '            <T n="test_set_reference">15610207397352046897</T></V>',
        '         <V t="test_set_reference">',
        '            <T n="test_set_reference">15610207397352046905</T></V>',
        '         <V t="test_set_reference">',
        '            <T n="test_set_reference">15610207397352046905</T></V></L></L></I>',
    ], '.\\OUT\\' + fnIA);

    const buildXmlEX = () => xmlToBat([
        '<I c="ExitCondition" i="snippet" m="snippets" n="' + nEX + '" s="' + dEX + '">',
        '   <U n="value">',
        '      <L n="conditions">',
        '         <V t="time_based">',
        '            <U n="time_based">',
        '               <T n="max_time">' + gDur + '</T>',
        '               <T n="min_time">' + gDur + '</T></U></V></L>',
        '      <E n="interaction_action">EXIT_NATURALLY</E></U></I>',
    ], '.\\OUT\\' + fnEX);

    const xmlReady = !!(gTitle && gPrefix && gClean); // asset ID comes from runtime INST_ID prompt
    const xmlBlock = xmlReady ?
        buildXmlWW() + '\r\n' + buildXmlIA() + '\r\n' + buildXmlEX() :
        'echo WARNING: Fill in Video Details ^& VP6 Instance ID in Studio tab first';

    return `@echo off\r\nsetlocal enabledelayedexpansion\r\ncd /d "%~dp0"\r\n\r\n:: VP6_SIMS4_WW.bat - WickedWhims Video Toolkit\r\n:: ${res} @ ${fps}fps | ${rateParam}\r\n:: Outputs -> OUT\\\r\n\r\necho.\r\necho ============================================================\r\necho  VP6_SIMS4_WW  ${res} @ ${fps}fps  ${rateParam}\r\necho ============================================================\r\necho.\r\n\r\n:: Create directories\r\nif not exist ".\\TMP"            mkdir "TMP"\r\nif not exist ".\\TMP\\Y4M"       mkdir "TMP\\Y4M"\r\nif not exist ".\\TMP\\WAV"       mkdir "TMP\\WAV"\r\nif not exist ".\\TMP\\FINAL"     mkdir "TMP\\FINAL"\r\nif not exist ".\\OUT"             mkdir "OUT"\r\nif not exist ".\\ICO"             mkdir "ICO"\r\n\r\n:: ============================================================\r\n:: ENCODE: skips if .avi already exists in OUT\\\r\n:: ============================================================\r\n:: Collect MP4 filenames first (safe - no goto inside loop)\r\nfor %%f in (${inf}\\*.mp4) do (\r\n    set "filename=%%~nf"\r\n    set "mp4file=%%f"\r\n)\r\n:: Now check outside the loop (goto is safe here)\r\nif not defined filename goto :post_encode\r\nif exist "OUT\\!filename!.avi" (\r\n    echo   SKIP: !filename!.avi already in OUT\\ - skipping encode\r\n    goto :post_encode\r\n)\r\n:: Encode\r\necho Encoding: !filename!\r\nmkdir "TMP\\FINAL\\!filename!" 2>nul\r\necho   [1/5] Y4M...\r\ntools\\FFMPEG\\ffmpeg -hide_banner -loglevel warning -y -i "!mp4file!" -vf "scale=${scaleRes}" -r ${fps} -pix_fmt yuv420p -f yuv4mpegpipe ".\\TMP\\Y4M\\!filename!.Y4M"\r\nif errorlevel 1 (echo FAILED step 1 & exit /b 1)\r\necho   [2/5] WAV...\r\ntools\\FFMPEG\\ffmpeg -hide_banner -loglevel warning -y -i "!mp4file!" -acodec pcm_s16le -ar ${asr} -ac 2 ".\\TMP\\WAV\\!filename!.WAV"\r\nif errorlevel 1 (echo FAILED step 2 & exit /b 1)\r\necho   [3/5] EA audio stream...\r\ntools\\sx\\sx -sndstream -eaxa_blk -fps${fps} "TMP\\WAV\\!filename!.WAV" -= ".\\TMP\\FINAL\\!filename!\\!filename!.asf"\r\nif errorlevel 1 (echo FAILED step 3 & exit /b 1)\r\necho   [4/5] VP6 encode...\r\ntools\\VP6\\nihav-encoder --input "TMP\\Y4M\\!filename!.Y4M" --output ".\\TMP\\FINAL\\!filename!\\!filename!.VP6" --output-format ea --ostream0 timebase=1/${fps},encoder=vp6,version=vp61,${rateParam}\r\nif not exist ".\\TMP\\FINAL\\!filename!\\!filename!.VP6" (echo FAILED step 4 & exit /b 1)\r\necho   [5/5] QuickBMS mux...\r\ntools\\quickbms\\quickbms.exe -o tools\\quickbms\\eavp6_muxer.bms ".\\TMP\\FINAL\\!filename!" ".\\OUT"\r\nif errorlevel 1 (echo FAILED step 5 & exit /b 1)\r\n:: Rename .vp6 -> S4PE-named AVI\r\nfor %%g in (OUT\\*.vp6 OUT\\*.ASF.vp6) do (\r\n    ren "%%g" "${fnAVI}"\r\n)\r\necho   Done: ${fnAVI}\r\n:post_encode\r\n\r\necho.\r\necho Cleaning up TMP...\r\nif exist "TMP" rmdir /s /q TMP\r\n\r\n:: ============================================================\r\n:: Get VP6 Instance ID from user\r\n:: ============================================================\r\necho.\r\necho ============================================================\r\necho  STEP: Import the .avi into S4PE\r\necho  - Open S4PE (no .package needed)\r\necho  - Import OUT\\${fnAVI}\r\necho    Type: 376840D7   Group: 00000000\r\necho  - Instance ID pre-computed: ${hAVI}\r\necho  (filename already contains the ID)\r\nset INST_ID=${hAVI}\r\necho Using pre-computed Instance ID: ${hAVI}\r\necho.\r\n:: ============================================================\r\n:: XML tuning files -> OUT\\\r\n:: ============================================================\r\necho.\r\necho Writing XML files to OUT\\...\r\n${xmlBlock}\r\necho   ${fnWW}\r\necho   ${fnIA}\r\necho   ${fnEX}\r\necho.\r\n\r\n:: ============================================================\r\n:: ICO PNG -> DDS\r\n:: ============================================================\r\nif not exist "tools\\texconv\\texconv.exe" (\r\n    echo Skipping DDS - texconv not found\r\n) else if not exist "ICO\\*.png" (\r\n    echo No PNGs in ICO\\ - skipping DDS\r\n) else (\r\n    echo Converting ICOs to DDS...\r\n    for %%f in (ICO\\*.png) do (\r\n        echo   texconv: %%~nf\r\n        tools\\texconv\\texconv.exe -f DXT5 -y -o ".\\\\OUT" "%%f"\r\n        if errorlevel 1 (echo   FAILED: %%~nf) else (\r\n            ren ".\\\\OUT\\\\%%~nf.DDS" "${fnIMG}"\r\n            echo   OK: ${fnIMG}\r\n        )\r\n    )\r\n)\r\n\r\necho.\r\n:skip_xml\r\necho ============================================================\r\necho  DONE!\r\necho  OUT\\ contains:\r\necho    .avi  -> S4PE type 376840D7 group 00000000\r\necho    .DDS  -> S4PE type 00B2D882 group 00000000\r\necho    .xml  -> import by type (5B02819E / E882D22F / 7DF2169C)\r\necho ============================================================\r\necho.\r\n\r\nendlocal\r\npause`;
}

function buildBat() {
    const q = parseInt(document.getElementById('b-quant')?.value || 18);
    const label = q <= 15 ? 'max quality' : q <= 30 ? 'high quality' : q <= 45 ? 'balanced' : q <= 55 ? 'smaller file' : 'min quality';
    const hint = document.getElementById('quant-hint');
    if (hint) hint.textContent = `quant ${q} — ${label}`;
    const prev = document.getElementById('bat-preview');
    if (prev) prev.textContent = generateBat();
}

function downloadBat() {
    const c = generateBat();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([c], {
        type: 'text/plain'
    }));
    a.download = 'VP6_SIMS4_WW.bat';
    a.click();
    URL.revokeObjectURL(a.href);
}

function copyBat() {
    navigator.clipboard.writeText(generateBat()).then(() => {
        const b = document.getElementById('bat-copy-btn'),
            o = b.textContent;
        b.textContent = 'Copied!';
        b.style.color = 'var(--green)';
        setTimeout(() => {
            b.textContent = o;
            b.style.color = '';
        }, 2000);
    });
}

// ── ENCODER CONTROLS ──
document.getElementById('b-quant').addEventListener('input', buildBat);
document.getElementById('b-cbr').addEventListener('change', buildBat);
document.getElementById('b-ratemode').addEventListener('change', function() {
    const cbr = this.value === 'cbr';
    document.getElementById('cbr-wrap').style.display = cbr ? 'flex' : 'none';
    document.getElementById('quant-wrap').style.display = cbr ? 'none' : 'flex';
    buildBat();
    saveState();
});
document.getElementById('b-res').addEventListener('change', function() {
    document.getElementById('b-cres-wrap').style.display = this.value === 'custom' ? 'flex' : 'none';
    buildBat();
    saveState();
});
['b-fps', 'b-asr', 'b-cres', 'b-quant', 'b-cbr'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => {
        buildBat();
        saveState();
    });
});

// ── THUMBNAIL ──
let _thumbBg = null;
const TSTYLES = {
    dark: {
        bg1: '#0c0c0f',
        bg2: '#1a1a24',
        accent: '#e8a030',
        accent2: '#f0c060',
        text: '#e8e4dc',
        sub: '#8a8598'
    },
    red: {
        bg1: '#0f0808',
        bg2: '#1f1010',
        accent: '#e05050',
        accent2: '#f08080',
        text: '#f0e0e0',
        sub: '#a08080'
    },
    purple: {
        bg1: '#0d0812',
        bg2: '#1a1028',
        accent: '#a060f0',
        accent2: '#c090ff',
        text: '#e8e0f8',
        sub: '#8878a8'
    },
    teal: {
        bg1: '#071212',
        bg2: '#0d2020',
        accent: '#30c8b0',
        accent2: '#60e8d0',
        text: '#d8f0ee',
        sub: '#60a090'
    },
    minimal: {
        bg1: '#080808',
        bg2: '#111111',
        accent: '#ffffff',
        accent2: '#cccccc',
        text: '#ffffff',
        sub: '#888888'
    },
};

function renderThumb() {
    const canvas = document.getElementById('thumb-canvas');
    if (!canvas) return;
    const sizeEl = document.getElementById('th-size');
    const S = parseInt(sizeEl ? sizeEl.value : '128') || 128;
    canvas.width = S;
    canvas.height = S;
    const ctx = canvas.getContext('2d');
    const stEl = document.getElementById('th-style');
    const st = TSTYLES[stEl ? stEl.value : 'dark'] || TSTYLES.dark;
    const _opa = document.getElementById('th-opacity');
    const opacity = (parseInt(_opa ? _opa.value : '60') || 60) / 100;
    const _ttl = document.getElementById('vid-title');
    const title = (_ttl ? _ttl.value : '') || 'Video';
    const _aut = document.getElementById('vid-author');
    const author = _aut ? _aut.value : '';

    // Background
    if (_thumbBg) {
        const ir = _thumbBg.width / _thumbBg.height;
        let sx = 0,
            sy = 0,
            sw = _thumbBg.width,
            sh = _thumbBg.height;
        if (ir > 1) {
            sw = _thumbBg.height;
            sx = (_thumbBg.width - sw) / 2;
        } else {
            sh = _thumbBg.width;
            sy = (_thumbBg.height - sh) / 2;
        }
        ctx.drawImage(_thumbBg, sx, sy, sw, sh, 0, 0, S, S);
        ctx.fillStyle = st.bg1;
        ctx.globalAlpha = opacity;
        ctx.fillRect(0, 0, S, S);
        ctx.globalAlpha = 1;
    } else {
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

    // Bottom gradient strip
    const stripH = Math.round(S * 0.38);
    const gBot = ctx.createLinearGradient(0, S - stripH, 0, S);
    gBot.addColorStop(0, 'rgba(0,0,0,0)');
    gBot.addColorStop(0.4, st.bg1 + 'cc');
    gBot.addColorStop(1, st.bg1 + 'ff');
    ctx.fillStyle = gBot;
    ctx.fillRect(0, S - stripH, S, stripH);

    // Watermark (WW logo SVG)
    const showWM = document.getElementById('th-show-wm')?.checked !== false;
    const showTitle = document.getElementById('th-show-title')?.checked !== false;
    const showAuthor = document.getElementById('th-show-author')?.checked !== false;

    if (showWM) {
        const wmW = Math.round(S * 0.32);
        const wmH = Math.round(wmW * 250 / 723);
        const wmX = S - wmW - Math.round(S * 0.04);
        const wmY = Math.round(S * 0.04);
        const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 723 250" width="${wmW}" height="${wmH}">
      <path fill="#B28BFF" fill-opacity="0.85" fill-rule="evenodd" d="M427.2,101.509 C427.2,62.339 411.282,26.686 385.559,0.30 L344.369,48.967 C355.452,63.5 361.992,80.299 361.992,99.5 C361.992,145.950 320.810,183.991 270.0,183.991 C219.189,183.991 178.7,145.937 178.7,98.987 C178.7,80.278 184.547,62.981 195.630,48.942 L154.440,0.0 C128.717,26.659 112.997,62.315 112.997,101.491 C112.997,171.970 167.163,250.9 269.997,250.9 C371.314,250.9 427.2,171.979 427.2,101.509 Z"/>
      <path fill="#B28BFF" fill-opacity="0.85" fill-rule="evenodd" d="M314.2,101.509 C314.2,62.339 298.282,26.686 272.559,0.30 L231.369,48.967 C242.452,63.5 248.992,80.299 248.992,99.5 C248.992,145.950 207.810,183.991 157.0,183.991 C106.189,183.991 65.7,145.937 65.7,98.987 C65.7,80.278 71.547,62.981 82.630,48.942 L41.440,0.0 C15.717,26.659 0.2,62.315 0.2,101.491 C0.2,171.970 54.163,250.9 156.997,250.9 C258.314,250.9 314.2,171.979 314.2,101.509 Z"/>
      <path fill="#DEC8FF" fill-opacity="0.85" fill-rule="evenodd" d="M617.777,178.451 L617.765,59.510 C627.314,62.433 635.780,66.909 643.151,72.695 L680.25,31.963 C658.199,12.690 639.244,0.8 590.2,0.8 C540.759,0.8 521.760,12.635 499.921,31.824 L536.817,72.380 C544.195,66.617 552.671,62.228 562.231,59.381 L562.222,178.451 C562.222,178.451 569.702,185.185 590.841,185.185 C611.980,185.185 617.777,178.451 617.777,178.451 Z"/>
      <path fill="#B28BFF" fill-opacity="0.85" fill-rule="evenodd" d="M722.156,125.8 C722.156,92.36 708.924,62.26 687.272,39.588 L652.600,80.780 C661.929,92.597 667.434,107.154 667.434,122.900 C667.434,162.415 632.769,194.437 590.0,194.437 C547.230,194.437 512.565,162.404 512.565,122.884 C512.565,107.136 518.70,92.577 527.399,80.759 L492.727,39.561 C471.75,62.2 457.843,92.16 457.843,124.992 C457.843,184.318 503.437,250.8 589.997,250.8 C675.281,250.8 722.156,184.326 722.156,125.8 Z"/>
    </svg>`;
        const blob = new Blob([svgStr], {
            type: 'image/svg+xml'
        });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
            ctx.globalAlpha = 0.75;
            ctx.drawImage(img, wmX, wmY, wmW, wmH);
            ctx.globalAlpha = 1;
            URL.revokeObjectURL(url);
            // Draw text on top after watermark loads
            _drawThumbText(ctx, S, st, title, author, showTitle, showAuthor);
        };
        img.src = url;
    } else {
        _drawThumbText(ctx, S, st, title, author, showTitle, showAuthor);
    }
}

function _drawThumbText(ctx, S, st, title, author, showTitle, showAuthor) {
    if (showTitle) {
        const titleSz = Math.max(8, Math.round(S * 0.115));
        ctx.font = `700 ${titleSz}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = st.text;
        let t = title;
        while (ctx.measureText(t).width > S - Math.round(S * 0.1) && t.length > 1) t = t.slice(0, -1);
        if (t.length < title.length) t = t.trimEnd() + '…';
        const hasAuthor = showAuthor && author && S >= 128;
        const titleY = S - Math.round(S * (hasAuthor ? 0.18 : 0.09));
        ctx.fillText(t, S / 2, titleY);
        if (hasAuthor) {
            const authSz = Math.max(6, Math.round(S * 0.078));
            ctx.font = `400 ${authSz}px sans-serif`;
            ctx.fillStyle = st.sub;
            let a = author;
            while (ctx.measureText(a).width > S - Math.round(S * 0.12) && a.length > 1) a = a.slice(0, -1);
            if (a.length < author.length) a = a.trimEnd() + '…';
            ctx.fillText(a, S / 2, titleY + Math.round(authSz * 1.35));
        }
    } else if (showAuthor && author && S >= 128) {
        const authSz = Math.max(6, Math.round(S * 0.078));
        ctx.font = `400 ${authSz}px sans-serif`;
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
    const c = document.getElementById('thumb-canvas');
    if (!c) return;
    const t = (document.getElementById('vid-title')?.value || 'thumbnail').replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const a = document.createElement('a');
    a.href = c.toDataURL('image/png');
    a.download = t + '_thumb.png';
    a.click();
}

['vid-title', 'vid-author'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', renderThumb);
});
['th-show-title', 'th-show-author', 'th-show-wm'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => {
        renderThumb();
        saveState();
    });
});
['th-style', 'th-size'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', () => {
        renderThumb();
        saveState();
    });
});
const _thOp = document.getElementById('th-opacity');
if (_thOp) _thOp.addEventListener('input', function() {
    const ov = document.getElementById('th-opacity-val');
    if (ov) ov.textContent = this.value + '%';
    renderThumb();
    saveState();
});
document.getElementById('th-bg').addEventListener('change', function() {
    if (!this.files || !this.files[0]) {
        _thumbBg = null;
        renderThumb();
        return;
    }
    const r = new FileReader();
    r.onload = e => {
        const img = new Image();
        img.onload = () => {
            _thumbBg = img;
            renderThumb();
        };
        img.src = e.target.result;
    };
    r.readAsDataURL(this.files[0]);
});

// ── LOCALSTORAGE ──
const LS_KEY = 'ww_toolkit_v2';
const SAVE_IDS = ['vid-filename', 'vid-title', 'vid-author', 'vid-desc', 'dur-min', 'dur-sec', 'b-res', 'b-fps', 'b-quant', 'b-cbr', 'b-ratemode', 'b-asr', 'b-cres',
    'th-style', 'th-size', 'th-opacity'
];

function saveState() {
    try {
        const d = {};
        // Save checkbox states too
        SAVE_IDS.forEach(id => {
            const el = document.getElementById(id);
            if (el) d[id] = el.value;
        });
        d._orients = [...document.querySelectorAll('.orient-opt.on')].map(e => e.dataset.val);
        d._tags = [...document.querySelectorAll('#tag-wrap .chip')].map(c => c.dataset.val);
        ['th-show-title', 'th-show-author', 'th-show-wm'].forEach(id => {
            const el = document.getElementById(id);
            if (el) d[id] = el.checked;
        });
        d._title_manual = document.getElementById('vid-title')._manual || false;
        localStorage.setItem(LS_KEY, JSON.stringify(d));
    } catch (e) {}
}

function loadState() {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return;
        const d = JSON.parse(raw);
        SAVE_IDS.forEach(id => {
            const el = document.getElementById(id);
            if (el && d[id] !== undefined) el.value = d[id];
        });
        if (d._title_manual) document.getElementById('vid-title')._manual = true;
        ['th-show-title', 'th-show-author', 'th-show-wm'].forEach(id => {
            const el = document.getElementById(id);
            if (el && d[id] !== undefined) el.checked = d[id];
        });
        document.querySelectorAll('.orient-opt').forEach(el => {
            el.classList.toggle('on', (d._orients || []).includes(el.dataset.val));
        });
        (d._tags || []).forEach(v => addTag(v));
    } catch (e) {}
}
SAVE_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', saveState);
});
document.querySelectorAll('.orient-opt').forEach(el => el.addEventListener('click', saveState));

// ── INIT ──
loadState();
// Restore rate mode UI
(function() {
    const rm = document.getElementById('b-ratemode');
    if (rm) {
        const cbr = rm.value === 'cbr';
        const cw = document.getElementById('cbr-wrap');
        const qw = document.getElementById('quant-wrap');
        if (cw) cw.style.display = cbr ? 'flex' : 'none';
        if (qw) qw.style.display = cbr ? 'none' : 'flex';
    }
})();
// Restore custom res visibility
(function() {
    const r = document.getElementById('b-res');
    if (r && r.value === 'custom') {
        const w = document.getElementById('b-cres-wrap');
        if (w) w.style.display = 'flex';
    }
})();
const _fn = document.getElementById('vid-filename');
if (_fn && _fn.value) _fn.dispatchEvent(new Event('input'));
updateFileNames();
updateDur();
updateOrientSummary();
buildBat();
renderThumb();
