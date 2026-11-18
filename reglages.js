/* Réglages : thème, accent, affichage, objectifs, sauvegarde des données */
(() => {
  const K = Kurso, T = KursoTheme, { h } = K;
  const root = document.getElementById('settings');

  /* ---------- Petits éléments ---------- */
  const section = (title, ...kids) => h('section', { class: 'set' }, h('h2', { class: 'section-title' }, title), ...kids);
  const seg = (items, current, onPick, label) => h('div', { class: 'chips chips--tight', role: 'group', 'aria-label': label },
    items.map(([val, text]) => h('button', {
      type: 'button', class: 'chip', 'aria-pressed': String(val === current), onclick: () => onPick(val)
    }, text)));

  /* ---------- Rendu ---------- */
  function render() {
    const s = T.get();
    const p = T.PRESETS[s.preset];
    const activeAccent = (s.accent || p.accent).toLowerCase();

    /* Thèmes */
    const themes = h('div', { class: 'theme-grid', role: 'radiogroup', 'aria-label': 'Thème' },
      Object.entries(T.PRESETS).map(([id, pr]) => {
        const v = T.compute({ preset: id, accent: '' }).vars;
        return h('button', {
          type: 'button', class: 'theme-card', role: 'radio', 'aria-checked': String(id === s.preset),
          onclick: () => { T.set({ preset: id, accent: '' }); render(); }
        },
          h('span', { class: 'tc__prev', style: `background:${v['--bg']};border-color:${v['--border']}` },
            h('span', { class: 'tc__side', style: `background:${v['--side']};border-color:${v['--divider']}` }),
            h('span', { class: 'tc__main' },
              h('span', { class: 'tc__line', style: `background:${v['--text']};width:60%` }),
              h('span', { class: 'tc__line', style: `background:${v['--muted']};width:85%` }),
              h('span', { class: 'tc__btn', style: `background:${v['--accent']}` }))),
          h('span', { class: 'tc__name' }, pr.name));
      }));

    /* Accent */
    const colorInput = h('input', {
      class: 'color', type: 'color', value: /^#[0-9a-f]{6}$/i.test(activeAccent) ? activeAccent : '#cccccc', 'aria-label': 'Couleur d’accent personnalisée'
    });
    colorInput.addEventListener('input', () => { T.set({ accent: colorInput.value }); swatchRefresh(); });
    const swatchBox = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Couleur d’accent' });
    function swatchRefresh() {
      const cur = (T.get().accent || T.PRESETS[T.get().preset].accent).toLowerCase();
      swatchBox.replaceChildren(
        ...T.ACCENTS.map(a => h('button', {
          type: 'button', class: 'swatch', role: 'radio', 'aria-checked': String(a.hex.toLowerCase() === cur), 'aria-label': a.name, title: a.name,
          style: 'background:' + a.hex, onclick: () => { T.set({ accent: a.hex }); colorInput.value = a.hex; swatchRefresh(); }
        })),
        colorInput,
        h('button', { type: 'button', class: 'btn btn--ghost btn--sm', onclick: () => { T.set({ accent: '' }); render(); } }, 'Couleur du thème'));
    }
    swatchRefresh();

    /* Taille du texte */
    const sizeOut = h('output', { class: 'note' }, s.size + ' %');
    const size = h('input', { type: 'range', min: '85', max: '130', step: '5', value: String(s.size), 'aria-label': 'Taille du texte', class: 'range' });
    size.addEventListener('input', () => { T.set({ size: +size.value }); sizeOut.textContent = size.value + ' %'; });

    /* Police */
    const font = h('select', { class: 'select', 'aria-label': 'Police' },
      Object.entries(T.FONTS).map(([k, f]) => h('option', { value: k, selected: k === s.font }, f.name)));
    font.addEventListener('change', () => T.set({ font: font.value }));

    /* Prénom et objectif */
    const name = h('input', { class: 'input', type: 'text', maxlength: '30', placeholder: 'Ex. Camille', value: s.name, autocomplete: 'given-name' });
    name.addEventListener('input', () => T.set({ name: name.value.trim() }));
    const goal = h('input', { class: 'input', type: 'number', min: '1', max: '500', value: String(s.goal) });
    goal.addEventListener('input', () => { const n = Math.round(+goal.value); if (n >= 1 && n <= 500) T.set({ goal: n }); });

    const motion = h('input', { type: 'checkbox', checked: s.motion });
    motion.addEventListener('change', () => T.set({ motion: motion.checked }));

    const importInput = h('input', { class: 'sr-only', type: 'file', accept: '.json,application/json' });
    importInput.addEventListener('change', () => { if (importInput.files[0]) doImport(importInput.files[0]); importInput.value = ''; });

    root.replaceChildren(
      section('Thème', themes),
      section('Couleur d’accent', h('p', { class: 'note note--block' }, 'Boutons, filtres actifs et onglets. Choisis une couleur ou la tienne.'), swatchBox),
      section('Affichage',
        h('div', { class: 'set__grid' },
          K.field('Police', font),
          h('div', { class: 'field' }, h('span', {}, 'Taille du texte'), h('div', { class: 'range-row' }, size, sizeOut)),
          h('div', { class: 'field' }, h('span', {}, 'Arrondis'), seg([['square', 'Angles droits'], ['normal', 'Normal'], ['round', 'Très arrondis']], s.radius, v => { T.set({ radius: v }); render(); }, 'Arrondis')),
          h('div', { class: 'field' }, h('span', {}, 'Densité des listes'), seg([['normal', 'Aérée'], ['compact', 'Compacte']], s.density, v => { T.set({ density: v }); render(); }, 'Densité')),
          h('div', { class: 'field' }, h('span', {}, 'Curseur'), seg([['cross', 'Croix'], ['custom', 'Point Kurso'], ['default', 'Classique']], s.cursor, v => { T.set({ cursor: v }); render(); }, 'Curseur'))),
        h('label', { class: 'check' }, motion, h('span', {}, 'Animations et transitions'))),
      section('Profil et objectifs',
        h('div', { class: 'set__grid' },
          K.field('Prénom (affiché sur l’accueil)', name),
          K.field('Objectif quotidien : cartes à réviser par jour', goal))),
      section('Données',
        h('p', { class: 'note note--block' }, 'Tout est gardé dans ce navigateur. Fais une sauvegarde de temps en temps (cours, fiches, tableaux, agenda, réglages) pour ne rien perdre ou changer d’ordinateur.'),
        h('div', { class: 'tools' },
          h('button', { class: 'btn btn--sm', type: 'button', id: 'export-all', onclick: doExport }, 'Exporter une sauvegarde'),
          h('label', { class: 'btn btn--ghost btn--sm' }, 'Importer une sauvegarde', importInput),
          h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: async () => { if (await K.confirmBox('Remettre le thème et l’affichage par défaut ? Tes cours et fiches ne sont pas touchés.', 'Réinitialiser')) { T.reset(); render(); K.toast('Apparence réinitialisée.'); } } }, 'Réinitialiser l’apparence'),
          h('button', { class: 'btn btn--danger btn--sm', type: 'button', onclick: doWipe }, 'Tout effacer'))));
  }

  /* ---------- Sauvegarde : export ---------- */
  const STORES = ['courses', 'fiches', 'boards', 'boardfiles', 'graphs'];
  const blobToDataUrl = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
  const dataUrlToBlob = url => {
    const [head, data] = url.split(',');
    const type = (head.match(/^data:([^;]*)/) || [])[1] || '';
    const bin = atob(data), arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type });
  };
  async function encode(v) {
    if (v instanceof Blob) return { __blob: await blobToDataUrl(v) };
    if (Array.isArray(v)) return Promise.all(v.map(encode));
    if (v && typeof v === 'object') {
      const out = {};
      for (const [k, x] of Object.entries(v)) out[k] = await encode(x);
      return out;
    }
    return v;
  }
  function decode(v) {
    if (Array.isArray(v)) return v.map(decode);
    if (v && typeof v === 'object') {
      if (typeof v.__blob === 'string') return dataUrlToBlob(v.__blob);
      const out = {};
      for (const [k, x] of Object.entries(v)) out[k] = decode(x);
      return out;
    }
    return v;
  }
  const lsKeys = () => { const k = []; try { for (let i = 0; i < localStorage.length; i++) { const n = localStorage.key(i); if (n && n.startsWith('kurso.')) k.push(n); } } catch (e) { /* ignoré */ } return k; };

  async function doExport() {
    try {
      const data = { app: 'kurso', version: 1, exportedAt: new Date().toISOString(), stores: {}, local: {} };
      for (const s of STORES) data.stores[s] = await encode(await K.db.all(s));
      lsKeys().forEach(k => { data.local[k] = localStorage.getItem(k); });
      const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
      const a = h('a', { href: url, download: 'kurso-sauvegarde-' + K.today() + '.json' });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      K.toast('Sauvegarde exportée.');
    } catch (e) { K.toast('Export impossible.'); }
  }

  /* ---------- Sauvegarde : import ---------- */
  async function doImport(file) {
    let data;
    try { data = JSON.parse(await file.text()); } catch (e) { K.toast('Ce fichier n’est pas une sauvegarde Kurso.'); return; }
    if (!data || data.app !== 'kurso' || !data.stores) { K.toast('Ce fichier n’est pas une sauvegarde Kurso.'); return; }
    const n = (data.stores.courses || []).length, m = (data.stores.fiches || []).length;
    if (!await K.confirmBox(`Importer ${K.plural(n, 'cours', 'cours')} et ${K.plural(m, 'fiche')} ? Les éléments portant le même identifiant seront remplacés, tes réglages aussi.`, 'Importer', 'Importer une sauvegarde')) return;
    try {
      for (const s of STORES) for (const rec of (data.stores[s] || [])) await K.db.put(s, await decode(rec));
      Object.entries(data.local || {}).forEach(([k, v]) => { if (k.startsWith('kurso.') && typeof v === 'string') { try { localStorage.setItem(k, v); } catch (e) { /* ignoré */ } } });
      K.toast('Sauvegarde importée.');
      setTimeout(() => location.reload(), 700);
    } catch (e) { K.toast('Import impossible : espace de stockage insuffisant ?'); }
  }

  /* ---------- Tout effacer ---------- */
  async function doWipe() {
    if (!await K.confirmBox('Supprimer tous tes cours, fiches, tableaux, tâches et réglages de ce navigateur ? Cette action est définitive. Pense à exporter une sauvegarde avant.', 'Tout effacer', 'Tout effacer')) return;
    try {
      for (const s of STORES) for (const rec of await K.db.all(s)) await K.db.del(s, rec.id);
      lsKeys().forEach(k => { try { localStorage.removeItem(k); } catch (e) { /* ignoré */ } });
      K.toast('Toutes les données ont été effacées.');
      setTimeout(() => location.reload(), 700);
    } catch (e) { K.toast('Suppression impossible.'); }
  }

  render();
})();
