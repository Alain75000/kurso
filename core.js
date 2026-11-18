/* ==========================================================
   Kurso – noyau commun : stockage, matières, popups, outils
   Les cours et fiches sont gardés dans le navigateur (IndexedDB),
   les matières dans localStorage.
   ========================================================== */
(() => {
  'use strict';

  /* ---------- Outils ---------- */
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const params = () => new URLSearchParams(location.search);
  const plural = (n, one, many) => `${n} ${n > 1 ? (many || one + 's') : one}`;
  const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  const fmtSize = n => {
    if (n < 1024) return n + ' o';
    const k = n / 1024;
    if (k < 1024) return k.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' Ko';
    return (k / 1024).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' Mo';
  };
  const fmtDate = v => {
    if (!v) return '';
    const d = typeof v === 'string' ? new Date(v + 'T12:00:00') : new Date(v);
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  };
  const today = () => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  };

  /* Création d’éléments sans innerHTML (les titres saisis restent du texte) */
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) {
      if (kid == null || kid === false) continue;
      el.append(kid.nodeType ? kid : document.createTextNode(kid));
    }
    return el;
  }

  /* ---------- Formats acceptés ---------- */
  const FORMATS = {
    png: { mime: 'image/png', label: 'Image PNG' },
    pdf: { mime: 'application/pdf', label: 'Document PDF' },
    txt: { mime: 'text/plain', label: 'Texte brut (.txt)' }
  };
  const MAX_SIZE = 25 * 1024 * 1024;
  const extOf = name => (String(name).includes('.') ? name.split('.').pop() : '').toLowerCase();

  /* ---------- Stockage IndexedDB ---------- */
  let dbPromise;
  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open('kurso', 3);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('courses')) d.createObjectStore('courses', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('fiches')) d.createObjectStore('fiches', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('boards')) d.createObjectStore('boards', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('boardfiles')) d.createObjectStore('boardfiles', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('graphs')) d.createObjectStore('graphs', { keyPath: 'id' });
      };
      req.onsuccess = () => { req.result.onversionchange = () => req.result.close(); resolve(req.result); };
      req.onerror = () => reject(req.error);
    });
    return dbPromise;
  }
  function run(store, mode, fn) {
    return openDb().then(d => new Promise((resolve, reject) => {
      const t = d.transaction(store, mode);
      const req = fn(t.objectStore(store));
      t.oncomplete = () => resolve(req && req.result);
      t.onerror = t.onabort = () => reject(t.error);
    }));
  }
  const db = {
    all: s => run(s, 'readonly', st => st.getAll()),
    get: (s, id) => run(s, 'readonly', st => st.get(id)),
    put: (s, rec) => run(s, 'readwrite', st => st.put(rec)),
    del: (s, id) => run(s, 'readwrite', st => st.delete(id))
  };

  /* ---------- Matières ---------- */
  const COLORS = [
    { hex: '#8fa8d8', name: 'Bleu' }, { hex: '#d89f8f', name: 'Corail' },
    { hex: '#c9b27c', name: 'Ambre' }, { hex: '#7fc1b8', name: 'Turquoise' },
    { hex: '#a6c48a', name: 'Vert' }, { hex: '#b295d6', name: 'Violet' },
    { hex: '#d68fb1', name: 'Rose' }, { hex: '#9aa0a6', name: 'Gris' }
  ];
  const DEFAULT_SUBJECTS = [
    { id: 'maths', name: 'Maths', color: '#8fa8d8' },
    { id: 'francais', name: 'Français', color: '#d68fb1' },
    { id: 'histoire', name: 'Histoire-Géo', color: '#c9b27c' },
    { id: 'physique', name: 'Physique-Chimie', color: '#7fc1b8' },
    { id: 'svt', name: 'SVT', color: '#a6c48a' },
    { id: 'anglais', name: 'Anglais', color: '#b295d6' }
  ];
  const MASTERY = {
    todo: { label: 'À apprendre', short: 'À apprendre' },
    learning: { label: 'En cours d’apprentissage', short: 'En cours' },
    done: { label: 'Maîtrisé', short: 'Maîtrisé' }
  };
  const NO_SUBJECT = { id: '', name: 'Sans matière', color: '#6f6f6f' };

  let subjects = (() => {
    try {
      const a = JSON.parse(localStorage.getItem('kurso.subjects'));
      if (Array.isArray(a)) return a;
    } catch (e) { /* stockage indisponible : on garde les matières par défaut */ }
    return DEFAULT_SUBJECTS.map(s => ({ ...s }));
  })();
  const saveSubjects = () => { try { localStorage.setItem('kurso.subjects', JSON.stringify(subjects)); } catch (e) { /* ignoré */ } };

  const Subjects = {
    list: () => subjects.slice(),
    get: id => subjects.find(s => s.id === id) || NO_SUBJECT,
    add(name, color) { const s = { id: 'm-' + uid(), name, color }; subjects.push(s); saveSubjects(); return s; },
    update(id, patch) { const s = subjects.find(x => x.id === id); if (s) { Object.assign(s, patch); saveSubjects(); } },
    remove(id) { subjects = subjects.filter(s => s.id !== id); saveSubjects(); }
  };
  const matchSubject = (rec, id) => {
    if (id === 'all') return true;
    if (id === '') return !subjects.some(s => s.id === rec.subjectId);
    return rec.subjectId === id;
  };
  const dot = (s, big) => h('span', { class: 'dot' + (big ? ' dot--lg' : ''), style: 'background:' + s.color, 'aria-hidden': 'true' });

  /* Pastilles de filtre par matière */
  function subjectItems(records, active) {
    const items = [{ id: 'all', label: 'Toutes', count: records.length }];
    subjects.forEach(s => {
      const n = records.filter(r => r.subjectId === s.id).length;
      if (n || s.id === active) items.push({ id: s.id, label: s.name, count: n, color: s.color });
    });
    const none = records.filter(r => matchSubject(r, '')).length;
    if (none || active === '') items.push({ id: '', label: NO_SUBJECT.name, count: none, color: NO_SUBJECT.color });
    return items;
  }
  function chips(el, items, active, onChange) {
    el.replaceChildren(...items.map(it => h('button', {
      type: 'button', class: 'chip', 'aria-pressed': String(it.id === active), onclick: () => onChange(it.id)
    }, it.color ? dot(it) : null, it.label, h('span', { class: 'chip__n' }, String(it.count)))));
  }

  /* ---------- Notifications ---------- */
  let toastBox;
  function toast(msg) {
    if (!toastBox) {
      toastBox = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    }
    // En plein écran, seul l’élément affiché est visible : les notifications doivent y être.
    const host = document.fullscreenElement || document.body;
    if (toastBox.parentNode !== host) host.append(toastBox);
    const t = h('div', { class: 'toast' }, msg);
    toastBox.append(t);
    setTimeout(() => t.remove(), 3000);
  }

  /* ---------- Plein écran (API native, ou repli CSS si le navigateur la refuse) ---------- */
  function fullscreen(el, btn, onChange) {
    const on = () => document.fullscreenElement === el || el.classList.contains('is-pseudo-full');
    const sync = () => {
      btn.setAttribute('aria-pressed', String(on()));
      btn.textContent = on() ? '⤡ Quitter le plein écran' : '⤢ Plein écran';
      if (onChange) onChange(on());
    };
    const off = () => {
      el.classList.remove('is-pseudo-full');
      if (document.fullscreenElement === el) document.exitFullscreen().catch(() => {});
      sync();
    };
    btn.addEventListener('click', async () => {
      if (on()) return off();
      try {
        if (!el.requestFullscreen) throw new Error('indisponible');
        await el.requestFullscreen();
      } catch (e) { el.classList.add('is-pseudo-full'); }
      sync();
    });
    document.addEventListener('fullscreenchange', sync);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && el.classList.contains('is-pseudo-full')) off(); });
    sync();
  }

  /* ---------- Déplacement de la vue au clic gauche maintenu (le fond d’un conteneur défilable) ---------- */
  function dragScroll(box, ignore) {
    box.addEventListener('pointerdown', e => {
      if (e.button !== 0 && e.button !== 1) return;
      if (ignore(e.target)) return;
      e.preventDefault();
      const sx = e.clientX, sy = e.clientY, ox = box.scrollLeft, oy = box.scrollTop;
      box.setPointerCapture(e.pointerId);
      box.classList.add('is-panning');
      const move = ev => { box.scrollLeft = ox - (ev.clientX - sx); box.scrollTop = oy - (ev.clientY - sy); };
      const up = () => {
        box.classList.remove('is-panning');
        box.removeEventListener('pointermove', move);
        box.removeEventListener('pointerup', up);
        box.removeEventListener('pointercancel', up);
      };
      box.addEventListener('pointermove', move);
      box.addEventListener('pointerup', up);
      box.addEventListener('pointercancel', up);
    });
  }

  /* ---------- Popups (balise <dialog>) ---------- */
  function makeDialog({ title, size = 'wide', onClose }) {
    const id = 't' + uid();
    const body = h('div', { class: 'dlg__content' });
    const dlg = h('dialog', { class: 'dlg' + (size === 'wide' ? '' : ' dlg--' + size), 'aria-labelledby': id },
      h('header', { class: 'dlg__head' },
        h('h2', { class: 'dlg__title', id }, title),
        h('button', { type: 'button', class: 'dlg__x', 'aria-label': 'Fermer', onclick: () => dlg.close() }, '×')),
      body);
    dlg.addEventListener('close', () => { dlg.remove(); if (onClose) onClose(); });
    return { dlg, body };
  }
  function showDialog(dlg) { document.body.append(dlg); dlg.showModal(); }

  function confirmBox(message, okLabel = 'Supprimer', title = 'Confirmation') {
    return new Promise(resolve => {
      let ok = false;
      const { dlg, body } = makeDialog({ title, size: 'sm', onClose: () => resolve(ok) });
      body.append(h('div', { class: 'dlg__pad' },
        h('p', { class: 'dlg__text' }, message),
        h('div', { class: 'dlg__actions' },
          h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => dlg.close() }, 'Annuler'),
          h('button', { class: 'btn btn--danger-solid btn--sm', type: 'button', onclick: () => { ok = true; dlg.close(); } }, okLabel))));
      showDialog(dlg);
    });
  }

  const field = (label, control) => h('label', { class: 'field' }, h('span', {}, label), control);

  /* ---------- Popup : informations d’un cours ---------- */
  function previewNode(ext, blob, url, title) {
    if (ext === 'png') return h('img', { src: url, alt: 'Aperçu de ' + title });
    if (ext === 'pdf') return h('iframe', { src: url, title: 'Aperçu de ' + title });
    const pre = h('pre', { class: 'preview__text' }, 'Chargement…');
    blob.text().then(t => { pre.textContent = !t ? '(fichier vide)' : t.length > 5000 ? t.slice(0, 5000) + '\n…' : t; });
    return pre;
  }

  /* Renvoie { action: 'saved' | 'deleted' | 'skipped' | 'closed', record } */
  function courseDialog({ record = null, file = null, progress = null, defaultSubject = '' } = {}) {
    return new Promise(resolve => {
      const isNew = !record;
      const ext = isNew ? extOf(file.name) : record.ext;
      const fileName = isNew ? file.name : record.name;
      const size = isNew ? file.size : record.size;
      const blob = isNew ? new Blob([file], { type: FORMATS[ext].mime }) : record.blob;
      const url = URL.createObjectURL(blob);
      let result = { action: 'closed' };

      const { dlg, body } = makeDialog({
        title: isNew ? 'Nouveau cours' : 'Informations du cours',
        onClose: () => { URL.revokeObjectURL(url); resolve(result); }
      });

      const cur = isNew ? defaultSubject : record.subjectId;
      const title = h('input', { class: 'input', type: 'text', required: true, maxlength: '120', autocomplete: 'off', value: isNew ? fileName.replace(/\.[^.]+$/, '') : record.title });
      const subject = h('select', { class: 'select' },
        h('option', { value: '', selected: !subjects.some(s => s.id === cur) }, NO_SUBJECT.name),
        subjects.map(s => h('option', { value: s.id, selected: s.id === cur }, s.name)));
      const chapter = h('input', { class: 'input', type: 'text', maxlength: '80', autocomplete: 'off', placeholder: 'Ex. Les fonctions affines', value: isNew ? '' : record.chapter || '' });
      const date = h('input', { class: 'input', type: 'date', value: isNew ? today() : record.date || today() });
      const desc = h('textarea', { class: 'textarea', maxlength: '600', placeholder: 'Ce que contient ce cours, en quelques mots' }, isNew ? '' : record.description || '');
      const curMastery = isNew ? 'todo' : (record.mastery || 'todo');
      const mastery = h('select', { class: 'select' },
        Object.entries(MASTERY).map(([k, m]) => h('option', { value: k, selected: k === curMastery }, m.label)));
      const fav = h('input', { type: 'checkbox', checked: !isNew && !!record.fav });
      const favRow = h('label', { class: 'check' }, fav, h('span', {}, 'Cours favori ★'));
      const notes = h('textarea', { class: 'textarea', maxlength: '2000', placeholder: 'Astuces, points à retenir, questions à poser au prof…' }, isNew ? '' : record.notes || '');
      const error = h('p', { class: 'msg--error', role: 'alert', hidden: true });
      const showError = msg => { error.textContent = msg; error.hidden = false; };

      const save = h('button', { class: 'btn btn--sm', type: 'submit' }, 'Enregistrer');
      const actions = isNew
        ? h('div', { class: 'dlg__actions' },
            progress ? h('span', { class: 'note spacer' }, `Fichier ${progress.i} sur ${progress.n}`) : null,
            h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => { result = { action: 'skipped' }; dlg.close(); } }, 'Ignorer ce fichier'),
            save)
        : h('div', { class: 'dlg__actions' },
            h('button', { class: 'btn btn--danger btn--sm spacer', type: 'button', onclick: onDelete }, 'Supprimer'),
            h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => dlg.close() }, 'Annuler'),
            save);

      const info = h('dl', { class: 'info' },
        h('dt', {}, 'Fichier'), h('dd', {}, fileName),
        h('dt', {}, 'Format'), h('dd', {}, FORMATS[ext].label),
        h('dt', {}, 'Taille'), h('dd', {}, fmtSize(size)),
        h('dt', {}, 'Ajouté le'), h('dd', {}, isNew ? 'À l’enregistrement' : fmtDate(record.addedAt)));

      const tools = isNew ? null : h('div', { class: 'dlg__tools' },
        h('a', { class: 'btn btn--ghost btn--sm', href: url, download: fileName }, 'Télécharger'),
        h('a', { class: 'btn btn--ghost btn--sm', href: 'revisions.html?cours=' + record.id }, 'Créer une fiche de révision'),
        h('a', { class: 'btn btn--ghost btn--sm', href: 'agenda.html?matiere=' + encodeURIComponent(record.subjectId || '') + '&titre=' + encodeURIComponent(record.title) }, 'Planifier un contrôle'));

      const form = h('form', { class: 'dlg__form' },
        field('Titre', title),
        field('Matière', subject),
        h('div', { class: 'row2' }, field('Chapitre ou thème', chapter), field('Date du cours', date)),
        field('Description', desc),
        h('div', { class: 'row2' }, field('Niveau de maîtrise', mastery), h('div', { class: 'field' }, h('span', {}, 'Favori'), favRow)),
        field('Notes personnelles', notes),
        info, tools, error, actions);

      form.addEventListener('submit', async e => {
        e.preventDefault();
        const t = title.value.trim();
        if (!t) { showError('Donne un titre à ce cours.'); title.focus(); return; }
        save.disabled = true;
        const rec = isNew
          ? { id: uid(), addedAt: Date.now(), name: fileName, ext, mime: FORMATS[ext].mime, size, blob }
          : { ...record };
        Object.assign(rec, {
          title: t, subjectId: subject.value, chapter: chapter.value.trim(), date: date.value, description: desc.value.trim(),
          mastery: mastery.value, fav: fav.checked, notes: notes.value.trim()
        });
        try {
          await db.put('courses', rec);
          result = { action: 'saved', record: rec };
          dlg.close();
        } catch (err) {
          save.disabled = false;
          showError('Enregistrement impossible : l’espace de stockage du navigateur est peut-être plein.');
        }
      });

      async function onDelete() {
        const ok = await confirmBox(`Supprimer « ${record.title} » ? Le fichier sera retiré de ta bibliothèque.`);
        if (!ok) return;
        try {
          await db.del('courses', record.id);
          result = { action: 'deleted', record };
          dlg.close();
        } catch (err) { showError('Suppression impossible.'); }
      }

      body.append(h('div', { class: 'dlg__grid' },
        h('div', { class: 'preview' + (ext === 'txt' ? ' preview--text' : '') }, previewNode(ext, blob, url, isNew ? fileName : record.title)),
        form));
      if (!isNew) dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
      showDialog(dlg);
      title.focus();
    });
  }

  /* ---------- Popup : matière ---------- */
  function subjectDialog(subject) {
    return new Promise(resolve => {
      let result = { action: 'closed' };
      let color = subject ? subject.color : COLORS[subjects.length % COLORS.length].hex;
      const { dlg, body } = makeDialog({ title: subject ? 'Modifier la matière' : 'Nouvelle matière', size: 'md', onClose: () => resolve(result) });

      const name = h('input', { class: 'input', type: 'text', required: true, maxlength: '40', autocomplete: 'off', placeholder: 'Ex. Espagnol', value: subject ? subject.name : '' });
      const swatches = h('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Couleur de la matière' },
        COLORS.map(c => {
          const b = h('button', {
            type: 'button', class: 'swatch', role: 'radio', 'aria-checked': String(c.hex === color), 'aria-label': c.name, style: 'background:' + c.hex,
            onclick: () => { color = c.hex; swatches.querySelectorAll('.swatch').forEach(x => x.setAttribute('aria-checked', String(x === b))); }
          });
          return b;
        }));
      const error = h('p', { class: 'msg--error', role: 'alert', hidden: true });

      const form = h('form', { class: 'dlg__form' },
        field('Nom', name),
        h('div', { class: 'field' }, h('span', {}, 'Couleur'), swatches),
        error,
        h('div', { class: 'dlg__actions' },
          subject ? h('button', { class: 'btn btn--danger btn--sm spacer', type: 'button', onclick: onDelete }, 'Supprimer') : null,
          h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => dlg.close() }, 'Annuler'),
          h('button', { class: 'btn btn--sm', type: 'submit' }, 'Enregistrer')));

      form.addEventListener('submit', e => {
        e.preventDefault();
        const n = name.value.trim();
        if (!n) { error.textContent = 'Donne un nom à cette matière.'; error.hidden = false; return; }
        if (subject) Subjects.update(subject.id, { name: n, color });
        else Subjects.add(n, color);
        result = { action: 'saved' };
        dlg.close();
      });

      async function onDelete() {
        const ok = await confirmBox(`Supprimer la matière « ${subject.name} » ? Ses cours et ses fiches restent là, simplement sans matière.`);
        if (!ok) return;
        Subjects.remove(subject.id);
        result = { action: 'deleted' };
        dlg.close();
      }

      body.append(form);
      showDialog(dlg);
      name.focus();
    });
  }

  /* ---------- Lignes réutilisables ---------- */
  function courseRow(rec, onOpen) {
    const s = Subjects.get(rec.subjectId);
    return h('button', { class: 'row', type: 'button', onclick: () => onOpen && onOpen(rec) },
      h('span', { class: 'badge badge--' + rec.ext }, rec.ext.toUpperCase()),
      h('span', {},
        h('span', { class: 'row__title' }, rec.fav ? h('span', { class: 'star', title: 'Favori', 'aria-label': 'Favori' }, '★ ') : null, rec.title),
        h('span', { class: 'row__sub' }, dot(s), s.name + (rec.chapter ? ', ' + rec.chapter : ''),
          rec.mastery && rec.mastery !== 'todo' ? h('span', { class: 'tag tag--' + rec.mastery }, MASTERY[rec.mastery].short) : null)),
      h('span', { class: 'row__meta' }, fmtSize(rec.size)),
      h('span', { class: 'row__meta' }, fmtDate(rec.date || rec.addedAt)));
  }
  function ficheRow(f) {
    const s = Subjects.get(f.subjectId);
    return h('a', { class: 'row', href: 'fiche.html?id=' + f.id },
      h('span', { class: 'badge badge--fiche' }, 'Fiche'),
      h('span', {},
        h('span', { class: 'row__title' }, f.title),
        h('span', { class: 'row__sub' }, dot(s), s.name)),
      h('span', { class: 'row__meta' }, (() => {
        if (!window.Kurso || !Kurso.study) return '';
        const st = Kurso.study.ficheStats(f);
        return st.due ? plural(st.due, 'carte') + ' due' + (st.due > 1 ? 's' : '') : '';
      })()),
      h('span', { class: 'row__meta' }, fmtDate(f.updatedAt)));
  }

  /* ---------- Fiche automatique à partir d’un texte ---------- */
  function extractFiche(text) {
    const clean = s => s.replace(/^(?:[-*•]|\d+[.)])\s+/, '').trim();
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l && !/^[-=_]{3,}$/.test(l));
    const points = [], defs = [], qas = [];
    for (let i = 0; i < lines.length; i++) {
      const l = clean(lines[i]);
      const qm = l.match(/^Q\s*:\s*(.+)$/i);
      if (qm) {
        const nx = lines[i + 1] && lines[i + 1].match(/^R\s*:\s*(.*)$/i);
        qas.push({ q: qm[1], a: nx ? nx[1] : '' });
        if (nx) i++;
        continue;
      }
      if (/\?$/.test(l)) {
        const next = lines[i + 1] && clean(lines[i + 1]);
        if (next && !/\?$/.test(next)) { qas.push({ q: l, a: next }); i++; }
        else qas.push({ q: l, a: '' });
        continue;
      }
      // « terme : définition » (6 mots max pour le terme), ou « terme = définition » / « terme - définition » (3 mots max)
      const m = l.match(/^([^:=]{2,50}?)\s*(:|=|\s-\s|\s–\s)\s*(.{3,})$/);
      if (m) {
        const words = m[1].trim().split(/\s+/).length;
        if (words <= (m[2] === ':' ? 6 : 3)) { defs.push({ t: m[1].trim(), d: m[3].trim() }); continue; }
      }
      points.push(l);
    }
    return { points, defs, qas };
  }

  window.Kurso = {
    h, uid, params, plural, norm, fmtSize, fmtDate, today,
    FORMATS, MAX_SIZE, extOf, MASTERY,
    db, subjects: Subjects, COLORS, matchSubject, subjectItems, chips, dot,
    toast, fullscreen, dragScroll, makeDialog, showDialog, confirmBox, field,
    courseDialog, subjectDialog, courseRow, ficheRow, extractFiche
  };
})();
