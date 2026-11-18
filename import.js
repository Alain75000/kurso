/* Importer : dépôt de fichiers .png .pdf .txt puis popup d’informations par fichier */
(() => {
  const K = Kurso, { h } = K;
  const $ = id => document.getElementById(id);
  const input = $('file-input'), drop = $('dropzone'), sel = $('default-subject'), status = $('status');
  let busy = false;

  sel.replaceChildren(
    h('option', { value: '' }, 'Sans matière'),
    ...K.subjects.list().map(s => h('option', { value: s.id }, s.name)));

  async function renderRecent() {
    let courses = [];
    try { courses = await K.db.all('courses'); } catch (e) { return; }
    const last = courses.sort((a, b) => b.addedAt - a.addedAt).slice(0, 5);
    const open = async rec => {
      const r = await K.courseDialog({ record: rec });
      if (r.action === 'saved' || r.action === 'deleted') renderRecent();
    };
    $('recent').replaceChildren(last.length
      ? h('div', { class: 'list' }, last.map(c => K.courseRow(c, open)))
      : h('div', { class: 'empty' }, 'Rien d’importé pour l’instant.'));
  }

  async function handle(fileList) {
    const files = [...fileList];
    if (busy || !files.length) return;
    const ok = [], bad = [];
    files.forEach(f => {
      if (!K.FORMATS[K.extOf(f.name)]) bad.push(`« ${f.name} » : format non pris en charge (PNG, PDF ou TXT uniquement).`);
      else if (f.size === 0) bad.push(`« ${f.name} » : le fichier est vide.`);
      else if (f.size > K.MAX_SIZE) bad.push(`« ${f.name} » : fichier trop lourd (${K.fmtSize(f.size)}, maximum ${K.fmtSize(K.MAX_SIZE)}).`);
      else ok.push(f);
    });

    status.replaceChildren(bad.length ? h('ul', {}, bad.map(b => h('li', {}, b))) : null);

    busy = true;
    let saved = 0;
    for (let i = 0; i < ok.length; i++) {
      const r = await K.courseDialog({ file: ok[i], progress: { i: i + 1, n: ok.length }, defaultSubject: sel.value });
      if (r.action === 'saved') saved++;
      else if (r.action === 'closed') break; // fermeture de la fenêtre : on arrête la série
    }
    busy = false;

    if (saved) {
      status.append(h('p', { class: 'msg--ok' }, `${saved} ${saved > 1 ? 'cours ajoutés' : 'cours ajouté'}. `,
        h('a', { href: 'cours.html' }, 'Voir dans Mes cours')));
      renderRecent();
    }
    input.value = '';
  }

  input.addEventListener('change', () => handle(input.files));
  ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('is-over'); }));
  ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('is-over'); }));
  drop.addEventListener('drop', e => handle(e.dataTransfer.files));

  renderRecent();
})();
