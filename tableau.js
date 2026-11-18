/* Tableau : tableaux libres avec fichiers (PDF, PNG, JPG, DOCX, XLSX, PPTX, ONE) déplaçables, verrouillables, et post-it */
(() => {
  const K = Kurso, { h } = K;
  const $ = id => document.getElementById(id);
  const wrap = $('board'), surface = $('surface'), hint = $('hint'), input = $('file-input');
  const SW = 2400, SH = 1600; // taille de la surface
  const MIME = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    one: 'application/onenote'
  };
  const IMG = ['png', 'jpg', 'jpeg'];
  const LABEL = { pdf: 'PDF', docx: 'Word', xlsx: 'Excel', pptx: 'PowerPoint', one: 'OneNote' };
  const els = new Map(); // id de l’élément -> noeud DOM
  const COLORS = [
    { hex: '#f7e27a', name: 'jaune' }, { hex: '#f4a6b8', name: 'rose' }, { hex: '#9fd8f0', name: 'bleu' },
    { hex: '#b4e197', name: 'vert' }, { hex: '#f6b87c', name: 'orange' }, { hex: '#c9b3ec', name: 'violet' }
  ];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const urls = new Map();
  let boards = [], board = null, timer = null, zTop = 1;

  /* ---------- Enregistrement (léger : les fichiers sont dans leur propre table) ---------- */
  const err = () => K.toast('Enregistrement impossible : l’espace de stockage est peut-être plein.');
  const flush = () => {
    clearTimeout(timer);
    if (!board) return Promise.resolve();
    board.updatedAt = Date.now();
    return K.db.put('boards', board).catch(err);
  };
  const save = () => { clearTimeout(timer); timer = setTimeout(flush, 300); };
  const newBoard = name => ({ id: K.uid(), name, createdAt: Date.now(), updatedAt: Date.now(), items: [] });

  function update() {
    hint.hidden = board.items.length > 0;
    const lb = $('lock-board');
    lb.textContent = board.locked ? 'Tableau verrouillé' : 'Verrouiller le tableau';
    lb.setAttribute('aria-pressed', String(!!board.locked));
    $('del-board').disabled = !!board.locked;
    K.chips($('boards'), boards.map(b => ({ id: b.id, label: b.name, count: b.items.length })), board.id, openBoard);
  }

  /* ---------- Éléments du tableau ---------- */
  const place = (it, el) => {
    const c = (COLORS.find(k => k.hex === it.color) || COLORS[0]).hex;
    el.style.cssText = `left:${it.x}px;top:${it.y}px;width:${it.w}px;height:${it.h}px;z-index:${it.z};--c:${c}`;
  };
  const locked = it => !!(board && (board.locked || it.locked));
  const deny = () => K.toast('Élément verrouillé : déverrouille-le pour le modifier.');
  const front = (it, el) => { if (it.z < zTop) { it.z = ++zTop; el.style.zIndex = it.z; save(); } };

  // Déplacement (poignée = barre du haut) ou redimensionnement (coin)
  function track(handle, it, el, mode) {
    handle.addEventListener('pointerdown', e => {
      if (e.button || e.target.closest('button, a')) return;
      e.preventDefault();
      if (locked(it)) return;
      const sx = e.clientX, sy = e.clientY, ox = it.x, oy = it.y, ow = it.w, oh = it.h;
      handle.setPointerCapture(e.pointerId);
      const move = ev => {
        const dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (mode === 'move') { it.x = clamp(ox + dx, 0, SW - it.w); it.y = clamp(oy + dy, 0, SH - it.h); }
        else { it.w = clamp(ow + dx, 150, SW - it.x); it.h = clamp(oh + dy, 110, SH - it.y); }
        place(it, el);
      };
      const up = () => {
        ['pointermove', 'pointerup', 'pointercancel'].forEach(t => handle.removeEventListener(t, t === 'pointermove' ? move : up));
        save();
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    });
  }

  // Applique l’état de verrouillage (global ou individuel) à un élément
  function applyLock(it, el) {
    const on = locked(it), own = !!it.locked, g = !!board.locked;
    el.classList.toggle('is-locked', on);
    const b = el.querySelector('.it__lock');
    b.textContent = on ? '' : '';
    b.disabled = g;
    const t = g ? 'Tableau verrouillé' : own ? 'Déverrouiller' : 'Verrouiller';
    b.title = t; b.setAttribute('aria-label', t); b.setAttribute('aria-pressed', String(on));
    const ta = el.querySelector('textarea');
    if (ta) ta.readOnly = on;
    el.querySelector('.it__bar').setAttribute('aria-label', (it.type === 'note' ? 'Post-it' : it.name) + (on ? ' : verrouillé' : ' : déplacer avec les flèches du clavier'));
  }
  const applyAll = () => board.items.forEach(it => { const el = els.get(it.id); if (el) applyLock(it, el); });

  function renderItem(it) {
    const isNote = it.type === 'note';
    const el = h('div', { class: 'it it--' + it.type });
    const bar = h('div', { class: 'it__bar', tabindex: '0', 'aria-label': (isNote ? 'Post-it' : it.name) + ' : déplacer avec les flèches du clavier' });
    const del = h('button', { class: 'it__btn', type: 'button', title: 'Retirer', 'aria-label': 'Retirer', onclick: () => removeItem(it, el) }, '×');
    const lock = h('button', {
      class: 'it__btn it__lock', type: 'button',
      onclick: () => { it.locked = !it.locked; applyLock(it, el); save(); }
    });
    let body;

    if (isNote) {
      body = h('textarea', { class: 'it__text', placeholder: 'Écris ici…', 'aria-label': 'Texte du post-it', maxlength: '2000' });
      body.value = it.text || '';
      body.addEventListener('input', () => { it.text = body.value; save(); });
      const color = h('button', {
        class: 'it__btn', type: 'button', title: 'Changer de couleur', 'aria-label': 'Changer de couleur',
        onclick: () => {
          if (locked(it)) return deny();
          const i = COLORS.findIndex(k => k.hex === it.color);
          it.color = COLORS[(i + 1) % COLORS.length].hex;
          place(it, el); save();
        }
      }, h('span', { class: 'it__dot' }));
      bar.append(h('span', { class: 'it__name' }), color, lock, del);
    } else {
      const url = urls.get(it.fileId);
      const office = !IMG.includes(it.ext) && it.ext !== 'pdf';
      const link = office
        ? h('a', { class: 'it__btn', href: url, download: it.name, title: 'Télécharger', 'aria-label': 'Télécharger ' + it.name }, '↓')
        : h('a', { class: 'it__btn', href: url, target: '_blank', rel: 'noopener', title: 'Ouvrir', 'aria-label': 'Ouvrir ' + it.name }, '↗');
      bar.append(h('span', { class: 'it__name', title: it.name }, it.name), link, lock, del);
      if (it.ext === 'pdf') {
        body = h('div', { class: 'it__body it__body--pdf' },
          h('iframe', { class: 'it__frame', src: url + '#view=FitH', title: it.name }),
          h('div', { class: 'it__shield', title: 'Clique pour interagir avec le PDF' }));
      } else if (IMG.includes(it.ext)) {
        body = h('div', { class: 'it__body' }, h('img', { src: url, alt: it.name, draggable: 'false' }));
      } else {
        body = h('div', { class: 'it__body' }, h('div', { class: 'it__pdf' },
          h('span', { class: 'badge badge--' + it.ext }, it.ext.toUpperCase()),
          h('strong', { class: 'it__kind' }, LABEL[it.ext] || it.ext.toUpperCase()),
          K.fmtSize(it.size),
          h('a', { class: 'btn btn--ghost btn--sm', href: url, download: it.name }, 'Télécharger')));
      }
    }

    el.append(bar, body, h('div', { class: 'it__rs', 'aria-hidden': 'true' }));
    place(it, el);
    els.set(it.id, el);
    applyLock(it, el);
    track(bar, it, el, 'move');
    track(el.lastChild, it, el, 'size');
    el.addEventListener('pointerdown', () => front(it, el), true);
    const shield = el.querySelector('.it__shield');
    if (shield) shield.addEventListener('click', () => { shield.hidden = true; });
    el.addEventListener('focusout', () => { if (shield && !el.contains(document.activeElement)) shield.hidden = false; });
    el.addEventListener('pointerleave', () => { if (shield) shield.hidden = false; });
    bar.addEventListener('keydown', e => {
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (!d || e.target !== bar) return;
      e.preventDefault();
      if (locked(it)) return deny();
      const s = e.shiftKey ? 40 : 10;
      it.x = clamp(it.x + d[0] * s, 0, SW - it.w); it.y = clamp(it.y + d[1] * s, 0, SH - it.h);
      place(it, el); save();
    });
    surface.append(el);
    return el;
  }

  async function removeItem(it, el) {
    if (locked(it)) return deny();
    if (it.type === 'note' && (it.text || '').trim() && !(await K.confirmBox('Supprimer ce post-it et son texte ?'))) return;
    board.items = board.items.filter(i => i !== it);
    els.delete(it.id);
    el.remove();
    if (it.fileId) {
      URL.revokeObjectURL(urls.get(it.fileId)); urls.delete(it.fileId);
      K.db.del('boardfiles', it.fileId).catch(() => {});
    }
    update(); save();
  }

  function addNote(color) {
    if (board.locked) return deny();
    const n = board.items.length % 8;
    const it = {
      id: K.uid(), type: 'note', color, text: '', w: 200, h: 200, z: ++zTop,
      x: clamp(wrap.scrollLeft + 40 + n * 26, 0, SW - 200), y: clamp(wrap.scrollTop + 40 + n * 26, 0, SH - 200)
    };
    board.items.push(it);
    renderItem(it).querySelector('textarea').focus();
    update(); save();
  }

  async function addFiles(list, at) {
    if (board.locked) return deny();
    const base = at || { x: wrap.scrollLeft + 40, y: wrap.scrollTop + 40 };
    let i = 0, bad = 0;
    for (const f of [...list]) {
      const ext = K.extOf(f.name);
      if (!MIME[ext] || !f.size || f.size > K.MAX_SIZE) { bad++; continue; }
      const fileId = K.uid(), blob = new Blob([f], { type: MIME[ext] });
      try { await K.db.put('boardfiles', { id: fileId, blob }); } catch (e) { err(); break; }
      urls.set(fileId, URL.createObjectURL(blob));
      const it = {
        id: K.uid(), type: 'file', fileId, name: f.name, ext, size: f.size, w: 220, h: 250, z: ++zTop,
        x: clamp(base.x + i * 26, 0, SW - 220), y: clamp(base.y + i * 26, 0, SH - 250)
      };
      i++;
      board.items.push(it);
      renderItem(it);
    }
    update(); save();
    if (bad) K.toast('Certains fichiers ont été ignorés : PDF, PNG, JPG, DOCX, XLSX, PPTX ou ONE, 25 Mo maximum.');
  }

  /* ---------- Tableaux ---------- */
  async function openBoard(id) {
    await flush();
    const b = boards.find(x => x.id === id) || boards[0];
    urls.forEach(u => URL.revokeObjectURL(u)); urls.clear();
    surface.replaceChildren(); els.clear();
    board = b;
    try { localStorage.setItem('kurso.board', b.id); } catch (e) { /* ignoré */ }
    zTop = Math.max(1, ...b.items.map(i => i.z || 1));
    for (const it of b.items.filter(i => i.fileId)) {
      try { const f = await K.db.get('boardfiles', it.fileId); if (f) urls.set(it.fileId, URL.createObjectURL(f.blob)); } catch (e) { /* fichier absent */ }
    }
    b.items.forEach(renderItem);
    update();
    wrap.scrollTo(0, 0);
  }

  function nameDialog(b) {
    const { dlg, body } = K.makeDialog({ title: b ? 'Renommer le tableau' : 'Nouveau tableau', size: 'sm' });
    const name = h('input', { class: 'input', type: 'text', required: true, maxlength: '40', autocomplete: 'off', value: b ? b.name : '' });
    const form = h('form', { class: 'dlg__form' }, K.field('Nom', name),
      h('div', { class: 'dlg__actions' },
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => dlg.close() }, 'Annuler'),
        h('button', { class: 'btn btn--sm', type: 'submit' }, 'Enregistrer')));
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const n = name.value.trim();
      if (!n) return;
      if (b) { b.name = n; await flush(); update(); }
      else {
        const nb = newBoard(n);
        boards.push(nb);
        await K.db.put('boards', nb).catch(err);
        await openBoard(nb.id);
      }
      dlg.close();
    });
    body.append(form);
    K.showDialog(dlg);
    name.focus(); name.select();
  }

  async function deleteBoard() {
    if (!(await K.confirmBox(`Supprimer le tableau « ${board.name} » et tout son contenu ?`))) return;
    clearTimeout(timer);
    const b = board;
    b.items.forEach(it => { if (it.fileId) K.db.del('boardfiles', it.fileId).catch(() => {}); });
    await K.db.del('boards', b.id).catch(err);
    boards = boards.filter(x => x !== b);
    board = null;
    if (!boards.length) { const nb = newBoard('Mon tableau'); boards.push(nb); await K.db.put('boards', nb).catch(err); }
    openBoard(boards[0].id);
  }

  /* ---------- Branchements ---------- */
  COLORS.forEach(c => $('palette').append(h('button', {
    class: 'swatch swatch--note', type: 'button', style: 'background:' + c.hex,
    title: 'Post-it ' + c.name, 'aria-label': 'Ajouter un post-it ' + c.name, onclick: () => addNote(c.hex)
  })));
  input.addEventListener('change', () => { addFiles(input.files); input.value = ''; });
  $('new-board').addEventListener('click', () => nameDialog());
  $('rename-board').addEventListener('click', () => nameDialog(board));
  $('del-board').addEventListener('click', deleteBoard);
  $('lock-board').addEventListener('click', () => { board.locked = !board.locked; applyAll(); update(); save(); });

  ['dragenter', 'dragover'].forEach(t => wrap.addEventListener(t, e => {
    if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); wrap.classList.add('is-over'); }
  }));
  ['dragleave', 'drop'].forEach(t => wrap.addEventListener(t, e => { e.preventDefault(); wrap.classList.remove('is-over'); }));
  wrap.addEventListener('drop', e => {
    if (!e.dataTransfer.files.length) return;
    const r = surface.getBoundingClientRect();
    addFiles(e.dataTransfer.files, { x: e.clientX - r.left, y: e.clientY - r.top });
  });
  addEventListener('pagehide', flush);

  // Plein écran + déplacement au clic gauche maintenu (la barre de défilement est masquée)
  K.fullscreen($('stage'), $('full-board'));
  K.dragScroll(wrap, t => t.closest('.it'));

  (async () => {
    try { boards = (await K.db.all('boards')).sort((a, b) => a.createdAt - b.createdAt); }
    catch (e) { hint.textContent = 'Le stockage du navigateur n’est pas disponible.'; return; }
    if (!boards.length) { const b = newBoard('Mon tableau'); boards.push(b); await K.db.put('boards', b).catch(err); }
    let last = null;
    try { last = localStorage.getItem('kurso.board'); } catch (e) { /* ignoré */ }
    openBoard(last);
  })();
})();
