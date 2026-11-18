/* Nœuds : Fichiers, Titres et notes reliés par des fils.
   Fond infini : clic gauche maintenu pour se déplacer, molette pour zoomer, pas de barre de défilement. */
(() => {
  const K = Kurso, { h } = K;
  const $ = id => document.getElementById(id);
  const view = $('view'), world = $('world'), nodesBox = $('nodes'), edgesSvg = $('edges'), hint = $('hint'), input = $('file-input');
  const MIME = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    one: 'application/onenote'
  };
  const IMG = ['png', 'jpg', 'jpeg'];
  const LABEL = { pdf: 'PDF', docx: 'Word', xlsx: 'Excel', pptx: 'PowerPoint', one: 'OneNote' };
  const COLORS = ['#f7e27a', '#f4a6b8', '#9fd8f0', '#b4e197', '#f6b87c', '#c9b3ec'];
  const MIN = { title: [180, 64], note: [150, 110], file: [170, 100] };
  const KMIN = 0.25, KMAX = 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const NS = 'http://www.w3.org/2000/svg';
  const svg = (tag, attrs = {}) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  };

  const els = new Map();    // id du nœud -> { el }
  const paths = new Map();  // id du fil -> { g, vis, hit, del }
  const urls = new Map();
  let graphs = [], graph = null, timer = null, zTop = 1, selEdge = null;

  /* ---------- Enregistrement ---------- */
  const err = () => K.toast('Enregistrement impossible : l’espace de stockage est peut-être plein.');
  const flush = () => {
    clearTimeout(timer);
    if (!graph) return Promise.resolve();
    graph.updatedAt = Date.now();
    return K.db.put('graphs', graph).catch(err);
  };
  const save = () => { clearTimeout(timer); timer = setTimeout(flush, 300); };
  const newGraph = name => ({ id: K.uid(), name, createdAt: Date.now(), updatedAt: Date.now(), nodes: [], edges: [], view: { x: 60, y: 60, k: 1 } });
  const locked = () => !!(graph && graph.locked);
  const deny = () => K.toast('Schéma verrouillé : déverrouille-le pour le modifier.');

  function update() {
    hint.hidden = graph.nodes.length > 0;
    const lb = $('lock-graph');
    lb.textContent = graph.locked ? 'Schéma verrouillé' : 'Verrouiller';
    lb.setAttribute('aria-pressed', String(!!graph.locked));
    $('del-graph').disabled = !!graph.locked;
    K.chips($('graphs'), graphs.map(g => ({ id: g.id, label: g.name, count: g.nodes.length })), graph.id, openGraph);
  }

  /* ---------- Vue (déplacement + zoom) ---------- */
  const applyView = () => {
    const v = graph.view;
    world.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.k})`;
    view.style.setProperty('--k', v.k);
    // La grille suit le fond pour donner l’impression d’un espace infini
    const g = 24 * v.k;
    view.style.backgroundSize = `${g}px ${g}px, auto`;
    view.style.backgroundPosition = `${v.x}px ${v.y}px, 0 0`;
    $('zoom-level').textContent = Math.round(v.k * 100) + ' %';
  };
  const toWorld = (cx, cy) => {
    const r = view.getBoundingClientRect(), v = graph.view;
    return { x: (cx - r.left - v.x) / v.k, y: (cy - r.top - v.y) / v.k };
  };
  const viewCenter = () => { const r = view.getBoundingClientRect(); return toWorld(r.left + r.width / 2, r.top + r.height / 2); };

  function zoomAt(cx, cy, factor) {
    const v = graph.view, r = view.getBoundingClientRect();
    const k = clamp(v.k * factor, KMIN, KMAX);
    if (k === v.k) return;
    const px = cx - r.left, py = cy - r.top;
    v.x = px - (px - v.x) * (k / v.k);
    v.y = py - (py - v.y) * (k / v.k);
    v.k = k;
    applyView(); save();
  }
  view.addEventListener('wheel', e => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0015)));
  }, { passive: false });

  view.addEventListener('pointerdown', e => {
    if (e.button !== 0 && e.button !== 1) return;
    if (e.target.closest('.nd, .nedge')) return;
    e.preventDefault();
    select(null);
    const sx = e.clientX, sy = e.clientY, ox = graph.view.x, oy = graph.view.y;
    view.setPointerCapture(e.pointerId);
    view.classList.add('is-panning');
    const move = ev => { graph.view.x = ox + ev.clientX - sx; graph.view.y = oy + ev.clientY - sy; applyView(); };
    const up = () => {
      view.classList.remove('is-panning');
      view.removeEventListener('pointermove', move);
      view.removeEventListener('pointerup', up);
      view.removeEventListener('pointercancel', up);
      save();
    };
    view.addEventListener('pointermove', move);
    view.addEventListener('pointerup', up);
    view.addEventListener('pointercancel', up);
  });

  function fit() {
    const r = view.getBoundingClientRect(), v = graph.view;
    if (!graph.nodes.length) { Object.assign(v, { x: 60, y: 60, k: 1 }); applyView(); save(); return; }
    const x1 = Math.min(...graph.nodes.map(n => n.x)), y1 = Math.min(...graph.nodes.map(n => n.y));
    const x2 = Math.max(...graph.nodes.map(n => n.x + n.w)), y2 = Math.max(...graph.nodes.map(n => n.y + n.h));
    const pad = 60;
    const k = clamp(Math.min((r.width - pad * 2) / (x2 - x1), (r.height - pad * 2) / (y2 - y1)), KMIN, 1);
    v.k = k;
    v.x = (r.width - (x2 - x1) * k) / 2 - x1 * k;
    v.y = (r.height - (y2 - y1) * k) / 2 - y1 * k;
    applyView(); save();
  }

  /* ---------- Fils ---------- */
  const nodeOf = id => graph.nodes.find(n => n.id === id);
  const portOut = n => ({ x: n.x + n.w, y: n.y + n.h / 2 });
  const portIn = n => ({ x: n.x, y: n.y + n.h / 2 });
  const curve = (a, b) => {
    const d = Math.max(60, Math.abs(b.x - a.x) / 2);
    return `M${a.x} ${a.y} C${a.x + d} ${a.y} ${b.x - d} ${b.y} ${b.x} ${b.y}`;
  };

  function select(id) {
    selEdge = id;
    paths.forEach((p, eid) => p.g.classList.toggle('is-selected', eid === id));
  }

  function drawEdge(ed) {
    const a = nodeOf(ed.a), b = nodeOf(ed.b);
    if (!a || !b) return;
    let p = paths.get(ed.id);
    if (!p) {
      const g = svg('g', { class: 'nedge' });
      const hit = svg('path', { class: 'nedge__hit' }), vis = svg('path', { class: 'nedge__line' });
      const del = svg('g', { class: 'nedge__del', role: 'button', 'aria-label': 'Supprimer le lien' });
      del.append(svg('circle', { r: 11 }), svg('path', { d: 'M-4 -4 L4 4 M4 -4 L-4 4' }));
      g.append(hit, vis, del);
      g.addEventListener('pointerdown', e => { e.stopPropagation(); select(ed.id); });
      del.addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); removeEdge(ed.id); });
      edgesSvg.append(g);
      paths.set(ed.id, p = { g, hit, vis, del });
      g.classList.toggle('is-selected', selEdge === ed.id);
    }
    const A = portOut(a), B = portIn(b), d = curve(A, B);
    p.hit.setAttribute('d', d); p.vis.setAttribute('d', d);
    p.del.setAttribute('transform', `translate(${(A.x + B.x) / 2} ${(A.y + B.y) / 2})`);
  }
  const drawEdges = () => graph.edges.forEach(drawEdge);

  function removeEdge(id) {
    if (locked()) return deny();
    graph.edges = graph.edges.filter(e => e.id !== id);
    const p = paths.get(id);
    if (p) { p.g.remove(); paths.delete(id); }
    if (selEdge === id) selEdge = null;
    save();
  }

  function connect(a, b) {
    if (a === b || graph.edges.some(e => e.a === a && e.b === b)) return false;
    const ed = { id: K.uid(), a, b };
    graph.edges.push(ed);
    drawEdge(ed); select(ed.id); save();
    return true;
  }

  // Tire un fil depuis un point de connexion ; relâcher sur un autre nœud crée le lien
  function dragWire(e, node, side) {
    e.preventDefault(); e.stopPropagation();
    if (locked()) return deny();
    const start = side === 'out' ? portOut(node) : portIn(node);
    const tmp = svg('path', { class: 'nedge__tmp' });
    edgesSvg.append(tmp);
    const port = e.currentTarget;
    port.setPointerCapture(e.pointerId);
    view.classList.add('is-wiring');
    const move = ev => {
      const w = toWorld(ev.clientX, ev.clientY);
      tmp.setAttribute('d', side === 'out' ? curve(start, w) : curve(w, start));
      nodesBox.querySelectorAll('.nd.is-target').forEach(x => x.classList.remove('is-target'));
      const t = targetNode(ev); if (t && t.id !== node.id) els.get(t.id).classList.add('is-target');
    };
    const up = ev => {
      port.removeEventListener('pointermove', move);
      port.removeEventListener('pointerup', up);
      port.removeEventListener('pointercancel', up);
      tmp.remove();
      view.classList.remove('is-wiring');
      nodesBox.querySelectorAll('.nd.is-target').forEach(x => x.classList.remove('is-target'));
      const t = targetNode(ev);
      if (ev.type === 'pointerup' && t && t.id !== node.id) {
        const ok = side === 'out' ? connect(node.id, t.id) : connect(t.id, node.id);
        if (!ok) K.toast('Ces deux éléments sont déjà reliés.');
      }
    };
    port.addEventListener('pointermove', move);
    port.addEventListener('pointerup', up);
    port.addEventListener('pointercancel', up);
    move(e);
  }
  function targetNode(ev) {
    const el = document.elementFromPoint(ev.clientX, ev.clientY);
    const nd = el && el.closest && el.closest('.nd');
    return nd ? graph.nodes.find(n => n.id === nd.dataset.id) : null;
  }

  /* ---------- Nœuds ---------- */
  const place = (n, el) => {
    el.style.cssText = `left:${n.x}px;top:${n.y}px;width:${n.w}px;height:${n.h}px;z-index:${n.z};--c:${n.color || ''}`;
  };
  const front = (n, el) => { if (n.z < zTop) { n.z = ++zTop; el.style.zIndex = n.z; save(); } };

  // Déplacement (barre du haut) ou redimensionnement (coin), corrigés du zoom
  function track(handle, n, el, mode) {
    handle.addEventListener('pointerdown', e => {
      if (e.button || e.target.closest('button, a')) return;
      e.preventDefault(); e.stopPropagation();
      if (locked()) return;
      const k = graph.view.k, sx = e.clientX, sy = e.clientY, ox = n.x, oy = n.y, ow = n.w, oh = n.h;
      const [mw, mh] = MIN[n.type];
      handle.setPointerCapture(e.pointerId);
      const move = ev => {
        const dx = (ev.clientX - sx) / k, dy = (ev.clientY - sy) / k;
        if (mode === 'move') { n.x = Math.round(ox + dx); n.y = Math.round(oy + dy); }
        else { n.w = Math.round(Math.max(mw, ow + dx)); n.h = Math.round(Math.max(mh, oh + dy)); }
        place(n, el); drawEdges();
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

  const KIND = { title: 'Titre', note: 'Note', file: 'Fichier' };

  function renderNode(n) {
    const el = h('div', { class: 'nd nd--' + n.type, 'data-id': n.id });
    const bar = h('div', { class: 'nd__bar', tabindex: '0', 'aria-label': (n.type === 'file' ? n.name : KIND[n.type]) + ' : déplacer avec les flèches du clavier' });
    const del = h('button', { class: 'it__btn', type: 'button', title: 'Retirer', 'aria-label': 'Retirer', onclick: () => removeNode(n) }, '×');
    let body;

    if (n.type === 'file') {
      const url = urls.get(n.fileId), office = !IMG.includes(n.ext) && n.ext !== 'pdf';
      const link = office
        ? h('a', { class: 'it__btn', href: url, download: n.name, title: 'Télécharger', 'aria-label': 'Télécharger ' + n.name }, '↓')
        : h('a', { class: 'it__btn', href: url, target: '_blank', rel: 'noopener', title: 'Ouvrir', 'aria-label': 'Ouvrir ' + n.name }, '↗');
      bar.append(h('span', { class: 'badge badge--' + n.ext }, n.ext.toUpperCase()), h('span', { class: 'it__name', title: n.name }, n.name), link, del);
      body = IMG.includes(n.ext)
        ? h('div', { class: 'nd__body' }, h('img', { src: url, alt: n.name, draggable: 'false' }))
        : h('div', { class: 'nd__body' }, h('div', { class: 'it__pdf' },
          h('strong', { class: 'it__kind' }, LABEL[n.ext] || n.ext.toUpperCase()), K.fmtSize(n.size)));
    } else {
      const color = h('button', {
        class: 'it__btn', type: 'button', title: 'Changer de couleur', 'aria-label': 'Changer de couleur',
        onclick: () => {
          if (locked()) return deny();
          const i = COLORS.indexOf(n.color);
          n.color = COLORS[(i + 1) % COLORS.length];
          place(n, el); save();
        }
      }, h('span', { class: 'it__dot' }));
      bar.append(h('span', { class: 'it__name' }, KIND[n.type]), color, del);
      if (n.type === 'title') {
        body = h('input', { class: 'nd__title', type: 'text', placeholder: 'Titre', 'aria-label': 'Titre', maxlength: '120' });
      } else {
        body = h('textarea', { class: 'nd__text', placeholder: 'Écris ici…', 'aria-label': 'Texte de la note', maxlength: '2000' });
      }
      body.value = n.text || '';
      body.addEventListener('input', () => { n.text = body.value; save(); });
      body.addEventListener('keydown', e => e.stopPropagation());
    }

    const pin = h('span', { class: 'nport nport--in', title: 'Entrée : dépose un fil ici', 'aria-hidden': 'true' });
    const pout = h('span', { class: 'nport nport--out', title: 'Sortie : tire un fil vers un autre élément', 'aria-hidden': 'true' });
    pin.addEventListener('pointerdown', e => dragWire(e, n, 'in'));
    pout.addEventListener('pointerdown', e => dragWire(e, n, 'out'));
    const rs = h('div', { class: 'it__rs', 'aria-hidden': 'true' });

    el.append(h('div', { class: 'nd__card' }, bar, body, rs), pin, pout);
    place(n, el);
    els.set(n.id, el);
    track(bar, n, el, 'move');
    track(rs, n, el, 'size');
    el.addEventListener('pointerdown', () => front(n, el), true);
    bar.addEventListener('keydown', e => {
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (!d || e.target !== bar) return;
      e.preventDefault();
      if (locked()) return deny();
      const s = e.shiftKey ? 40 : 10;
      n.x += d[0] * s; n.y += d[1] * s;
      place(n, el); drawEdges(); save();
    });
    nodesBox.append(el);
    return el;
  }

  async function removeNode(n) {
    if (locked()) return deny();
    if (n.type !== 'file' && (n.text || '').trim() && !(await K.confirmBox('Supprimer ce nœud et son texte ?'))) return;
    graph.edges.filter(e => e.a === n.id || e.b === n.id).forEach(e => removeEdge(e.id));
    graph.nodes = graph.nodes.filter(x => x !== n);
    els.get(n.id).remove(); els.delete(n.id);
    if (n.fileId) {
      URL.revokeObjectURL(urls.get(n.fileId)); urls.delete(n.fileId);
      K.db.del('boardfiles', n.fileId).catch(() => {});
    }
    update(); save();
  }

  function addNode(type) {
    if (locked()) return deny();
    const c = viewCenter(), i = graph.nodes.length % 6;
    const [w, hh] = type === 'title' ? [320, 80] : [220, 170];
    const n = {
      id: K.uid(), type, text: '', w, h: hh, z: ++zTop,
      color: type === 'title' ? COLORS[2] : COLORS[0],
      x: Math.round(c.x - w / 2 + i * 24), y: Math.round(c.y - hh / 2 + i * 24)
    };
    graph.nodes.push(n);
    renderNode(n).querySelector('input, textarea').focus();
    update(); save();
  }

  async function addFiles(list, at) {
    if (locked()) return deny();
    const base = at || viewCenter();
    let i = 0, bad = 0;
    for (const f of [...list]) {
      const ext = K.extOf(f.name);
      if (!MIME[ext] || !f.size || f.size > K.MAX_SIZE) { bad++; continue; }
      const fileId = K.uid(), blob = new Blob([f], { type: MIME[ext] });
      try { await K.db.put('boardfiles', { id: fileId, blob }); } catch (e) { err(); break; }
      urls.set(fileId, URL.createObjectURL(blob));
      const img = IMG.includes(ext);
      const n = {
        id: K.uid(), type: 'file', fileId, name: f.name, ext, size: f.size, z: ++zTop,
        w: img ? 240 : 200, h: img ? 190 : 120,
        x: Math.round(base.x - 100 + i * 26), y: Math.round(base.y - 60 + i * 26)
      };
      i++;
      graph.nodes.push(n);
      renderNode(n);
    }
    update(); save();
    if (bad) K.toast('Certains fichiers ont été ignorés : PDF, PNG, JPG, DOCX, XLSX, PPTX ou ONE, 25 Mo maximum.');
  }

  /* ---------- Schémas ---------- */
  async function openGraph(id) {
    await flush();
    const g = graphs.find(x => x.id === id) || graphs[0];
    urls.forEach(u => URL.revokeObjectURL(u)); urls.clear();
    nodesBox.replaceChildren(); els.clear();
    edgesSvg.replaceChildren(); paths.clear(); selEdge = null;
    graph = g;
    if (!g.view) g.view = { x: 60, y: 60, k: 1 };
    try { localStorage.setItem('kurso.graph', g.id); } catch (e) { /* ignoré */ }
    zTop = Math.max(1, ...g.nodes.map(n => n.z || 1));
    for (const n of g.nodes.filter(x => x.fileId)) {
      try { const f = await K.db.get('boardfiles', n.fileId); if (f) urls.set(n.fileId, URL.createObjectURL(f.blob)); } catch (e) { /* fichier absent */ }
    }
    g.nodes.forEach(renderNode);
    drawEdges();
    applyView();
    view.classList.toggle('is-locked', !!g.locked);
    update();
  }

  function nameDialog(g) {
    const { dlg, body } = K.makeDialog({ title: g ? 'Renommer le schéma' : 'Nouveau schéma', size: 'sm' });
    const name = h('input', { class: 'input', type: 'text', required: true, maxlength: '40', autocomplete: 'off', value: g ? g.name : '' });
    const form = h('form', { class: 'dlg__form' }, K.field('Nom', name),
      h('div', { class: 'dlg__actions' },
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => dlg.close() }, 'Annuler'),
        h('button', { class: 'btn btn--sm', type: 'submit' }, 'Enregistrer')));
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const n = name.value.trim();
      if (!n) return;
      if (g) { g.name = n; await flush(); update(); }
      else {
        const ng = newGraph(n);
        graphs.push(ng);
        await K.db.put('graphs', ng).catch(err);
        await openGraph(ng.id);
      }
      dlg.close();
    });
    body.append(form);
    K.showDialog(dlg);
    name.focus(); name.select();
  }

  async function deleteGraph() {
    if (!(await K.confirmBox(`Supprimer le schéma « ${graph.name} » et tout son contenu ?`))) return;
    clearTimeout(timer);
    const g = graph;
    g.nodes.forEach(n => { if (n.fileId) K.db.del('boardfiles', n.fileId).catch(() => {}); });
    await K.db.del('graphs', g.id).catch(err);
    graphs = graphs.filter(x => x !== g);
    graph = null;
    if (!graphs.length) { const ng = newGraph('Mon schéma'); graphs.push(ng); await K.db.put('graphs', ng).catch(err); }
    openGraph(graphs[0].id);
  }

  /* ---------- Branchements ---------- */
  input.addEventListener('change', () => { addFiles(input.files); input.value = ''; });
  $('add-title').addEventListener('click', () => addNode('title'));
  $('add-note').addEventListener('click', () => addNode('note'));
  $('new-graph').addEventListener('click', () => nameDialog());
  $('rename-graph').addEventListener('click', () => nameDialog(graph));
  $('del-graph').addEventListener('click', deleteGraph);
  $('fit').addEventListener('click', fit);
  $("lock-graph").addEventListener("click", () => { graph.locked = !graph.locked; view.classList.toggle("is-locked", !!graph.locked); update(); save(); });

  document.addEventListener('keydown', e => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selEdge && !e.target.closest('input, textarea, select, [contenteditable]')) {
      e.preventDefault(); removeEdge(selEdge);
    }
  });

  ['dragenter', 'dragover'].forEach(t => view.addEventListener(t, e => {
    if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); view.classList.add('is-over'); }
  }));
  ['dragleave', 'drop'].forEach(t => view.addEventListener(t, e => { e.preventDefault(); view.classList.remove('is-over'); }));
  view.addEventListener('drop', e => {
    if (!e.dataTransfer.files.length) return;
    addFiles(e.dataTransfer.files, toWorld(e.clientX, e.clientY));
  });
  addEventListener('pagehide', flush);

  K.fullscreen($('stage'), $('full-graph'));

  (async () => {
    try { graphs = (await K.db.all('graphs')).sort((a, b) => a.createdAt - b.createdAt); }
    catch (e) { hint.textContent = 'Le stockage du navigateur n’est pas disponible.'; return; }
    if (!graphs.length) { const g = newGraph('Mon schéma'); graphs.push(g); await K.db.put('graphs', g).catch(err); }
    let last = null;
    try { last = localStorage.getItem('kurso.graph'); } catch (e) { /* ignoré */ }
    openGraph(last);
  })();
})();
