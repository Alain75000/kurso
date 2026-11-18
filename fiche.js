/* Fiche de révision : édition, cartes de révision, export, impression */
(() => {
  const K = Kurso, { h } = K;
  const $ = id => document.getElementById(id);

  const SECTIONS = [
    { key: 'points', title: 'Points clés', add: 'Ajouter un point', empty: 'Note ici l’essentiel à retenir.', blank: () => '' },
    { key: 'defs', title: 'Définitions', add: 'Ajouter une définition', empty: 'Un terme et sa définition par ligne.', blank: () => ({ t: '', d: '' }) },
    { key: 'qas', title: 'Questions', add: 'Ajouter une question', empty: 'Pose-toi des questions, avec leur réponse.', blank: () => ({ q: '', a: '' }) }
  ];

  (async () => {
    const id = K.params().get('id');
    let f = null, course = null;
    try { f = await K.db.get('fiches', id); } catch (e) { /* stockage indisponible */ }
    if (!f) { $('missing').hidden = false; return; }
    if (f.courseId) { try { course = await K.db.get('courses', f.courseId); } catch (e) { /* ignoré */ } }
    $('fiche').hidden = false;
    document.title = 'Kurso – ' + f.title;

    /* ----- En-tête ----- */
    const title = $('f-title'), subject = $('f-subject'), saved = $('saved');
    title.value = f.title;
    subject.replaceChildren(
      h('option', { value: '' }, 'Sans matière'),
      ...K.subjects.list().map(s => h('option', { value: s.id }, s.name)));
    subject.value = [...subject.options].some(o => o.value === f.subjectId) ? f.subjectId : '';
    if (course) {
      const b = $('f-course');
      b.hidden = false;
      b.textContent = 'Voir le cours : ' + course.title;
      b.addEventListener('click', () => K.courseDialog({ record: course }));
    }

    /* ----- Enregistrement automatique ----- */
    let timer = null;
    async function save() {
      timer = null;
      try { await K.db.put('fiches', f); saved.textContent = 'Enregistré'; }
      catch (e) { saved.textContent = 'Échec de l’enregistrement'; }
    }
    function touch() {
      f.updatedAt = Date.now();
      saved.textContent = 'Enregistrement…';
      clearTimeout(timer);
      timer = setTimeout(save, 400);
    }
    document.addEventListener('visibilitychange', () => { if (document.hidden && timer) { clearTimeout(timer); save(); } });
    window.addEventListener('pagehide', () => { if (timer) { clearTimeout(timer); save(); } });

    title.addEventListener('input', () => { f.title = title.value; document.title = 'Kurso – ' + (f.title || 'Fiche'); touch(); });
    title.addEventListener('blur', () => { if (!title.value.trim()) { title.value = f.title = 'Fiche sans titre'; touch(); } });
    subject.addEventListener('change', () => { f.subjectId = subject.value; touch(); });

    /* ----- Onglet Fiche ----- */
    const sheet = $('sheet');
    const autosize = t => { t.style.height = 'auto'; t.style.height = (t.scrollHeight + 2) + 'px'; };
    const ta = (label, key, i, fld, val, ph) =>
      h('textarea', { class: 'textarea textarea--auto', rows: '1', 'aria-label': label, placeholder: ph, dataset: { key, i: String(i), field: fld } }, val);

    function row(key, it, i) {
      const del = h('button', { class: 'x', type: 'button', 'aria-label': 'Supprimer cette ligne', dataset: { act: 'del', key, i: String(i) } }, '×');
      if (key === 'points') return h('div', { class: 'item' }, ta('Point clé ' + (i + 1), key, i, '', it, 'Une idée à retenir'), del);
      if (key === 'defs') return h('div', { class: 'item item--pair' }, ta('Terme', key, i, 't', it.t, 'Terme'), ta('Définition', key, i, 'd', it.d, 'Définition'), del);
      return h('div', { class: 'item item--pair' }, ta('Question', key, i, 'q', it.q, 'Question'), ta('Réponse', key, i, 'a', it.a, 'Réponse'), del);
    }

    function renderSheet() {
      sheet.replaceChildren(...SECTIONS.map(sec => h('section', { class: 'block' },
        h('h2', { class: 'section-title' }, sec.title),
        f[sec.key].length ? f[sec.key].map((it, i) => row(sec.key, it, i)) : h('p', { class: 'note' }, sec.empty),
        h('button', { class: 'btn btn--ghost btn--sm add', type: 'button', dataset: { act: 'add', key: sec.key } }, sec.add))));
      sheet.querySelectorAll('textarea').forEach(autosize);
      $('tab-cards').textContent = cardsLabel();
    }

    sheet.addEventListener('input', e => {
      const t = e.target;
      if (!t.matches('textarea')) return;
      autosize(t);
      const { key, i, field } = t.dataset;
      if (field) f[key][+i][field] = t.value; else f[key][+i] = t.value;
      $('tab-cards').textContent = cardsLabel();
      touch();
    });
    sheet.addEventListener('click', e => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      const { act, key, i } = b.dataset;
      const sec = SECTIONS.find(s => s.key === key);
      if (act === 'add') {
        f[key].push(sec.blank());
        renderSheet();
        const all = sheet.querySelectorAll(`textarea[data-key="${key}"]`);
        const perRow = key === 'points' ? 1 : 2;
        const target = all[all.length - perRow];
        if (target) target.focus();
      } else {
        f[key].splice(+i, 1);
        renderSheet();
      }
      touch();
    });

    /* ----- Onglet Cartes : révision espacée ----- */
    const S = K.study;
    const filled = s => typeof s === 'string' && s.trim().length > 0;
    const deck = $('deck');
    const buildCards = () => S.cardsOf(f);
    const cardsLabel = () => {
      const n = buildCards().length, due = S.ficheStats(f).due;
      return 'Cartes (' + n + ')' + (due ? ' · ' + due + ' à réviser' : '');
    };
    let session = null;

    /* Enregistre l’état de révision sans changer la date de modification de la fiche */
    function persist() {
      saved.textContent = 'Enregistrement…';
      clearTimeout(timer);
      timer = setTimeout(save, 300);
    }

    function start(cards) {
      session = { queue: S.shuffle(cards.slice()), total: cards.length, missed: new Set(), flipped: false, done: 0 };
      renderDeck();
    }

    function answer(g) {
      const c = session.queue[0];
      S.grade(f, c, g);
      persist();
      session.queue.shift();
      session.flipped = false;
      session.done++;
      if (g === 'again') { session.missed.add(c); session.queue.push(c); }
      renderDeck();
    }

    function renderDeck() {
      const cards = buildCards();
      $('tab-cards').textContent = cardsLabel();
      if (!cards.length) {
        session = null;
        deck.replaceChildren(h('div', { class: 'empty' }, 'Complète des définitions ou des questions (terme et définition, question et réponse) dans l’onglet Fiche : elles deviennent des cartes.'));
        return;
      }
      if (!session) {
        const st = S.ficheStats(f);
        const dueCards = cards.filter(c => S.isDue(S.stateOf(f, c)));
        deck.replaceChildren(h('div', { class: 'deck' },
          h('p', { class: 'deck__title' }, K.plural(cards.length, 'carte') + ' dans cette fiche'),
          h('p', { class: 'note' }, `${st.due} à réviser aujourd’hui, ${st.fresh} nouvelle${st.fresh > 1 ? 's' : ''}, ${st.mastered} maîtrisée${st.mastered > 1 ? 's' : ''}.`),
          h('p', { class: 'note' }, 'Lis la face avant, essaie de répondre, puis retourne la carte et dis si tu savais. Les cartes difficiles reviennent plus souvent.'),
          h('div', { class: 'deck__actions' },
            dueCards.length ? h('button', { class: 'btn', type: 'button', onclick: () => start(dueCards) }, 'Réviser les cartes dues (' + dueCards.length + ')') : null,
            h('button', { class: dueCards.length ? 'btn btn--ghost' : 'btn', type: 'button', onclick: () => start(cards) }, 'Tout réviser'))));
        return;
      }
      if (!session.queue.length) {
        const missed = [...session.missed];
        deck.replaceChildren(h('div', { class: 'deck' },
          h('p', { class: 'deck__title' }, 'Série terminée'),
          h('p', { class: 'note' }, missed.length
            ? `${K.plural(session.total, 'carte')} passées en revue, ${K.plural(missed.length, 'carte')} à revoir au moins une fois.`
            : `${K.plural(session.total, 'carte')} passées en revue, sans erreur.`),
          h('div', { class: 'deck__actions' },
            missed.length ? h('button', { class: 'btn', type: 'button', onclick: () => start(missed) }, 'Revoir les cartes ratées') : null,
            h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => { session = null; renderDeck(); } }, 'Retour'))));
        return;
      }

      const c = session.queue[0];
      const side = session.flipped ? 'back' : 'front';
      const card = h('button', {
        class: 'card', type: 'button', 'data-side': side,
        'aria-label': session.flipped ? 'Retourner la carte, face avant' : 'Retourner la carte, voir la réponse',
        onclick: () => { session.flipped = !session.flipped; renderDeck(); }
      }, h('span', { class: 'card__kind' }, session.flipped ? 'Réponse' : c.kind), h('span', { class: 'card__text' }, session.flipped ? c.back : c.front));

      const st = S.stateOf(f, c);
      const actions = session.flipped
        ? Object.entries(S.GRADES).map(([g, info]) => h('button', {
            class: 'btn grade grade--' + g, type: 'button', onclick: () => answer(g), title: 'Raccourci : ' + info.key
          }, info.label, h('small', {}, S.nextLabel(st, g))))
        : [h('span', { class: 'note' }, 'Clique sur la carte (ou Espace) pour voir la réponse.')];

      deck.replaceChildren(h('div', { class: 'deck' },
        h('p', { class: 'deck__count' }, session.queue.length > 1 ? `${session.queue.length} cartes restantes` : '1 carte restante'),
        card,
        h('div', { class: 'deck__actions' }, actions)));
      card.focus();
    }

    /* Raccourcis clavier pendant une série : Espace = retourner, 1 à 4 = noter */
    document.addEventListener('keydown', e => {
      if (!session || !session.queue.length || $('panel-cards').hidden) return;
      if (e.target.closest('input, textarea, select') || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === ' ' || e.key === 'Enter') {
        if (e.target.closest('.btn')) return;
        e.preventDefault(); session.flipped = !session.flipped; renderDeck();
      } else if (session.flipped) {
        const g = Object.keys(S.GRADES).find(k => S.GRADES[k].key === e.key);
        if (g) { e.preventDefault(); answer(g); }
      }
    });

    /* ----- Onglet Quiz : choix multiple à partir des définitions ----- */
    const quizBox = $('quiz');
    let quiz = null;
    function renderQuiz() {
      if (!quiz) {
        const n = S.quizOf(f, 1000).length;
        quizBox.replaceChildren(n
          ? h('div', { class: 'deck' },
              h('p', { class: 'deck__title' }, 'Quiz de la fiche'),
              h('p', { class: 'note' }, 'On te donne une définition, tu retrouves le bon terme parmi quatre propositions. ' + K.plural(Math.min(n, 10), 'question') + ' par série.'),
              h('div', { class: 'deck__actions' }, h('button', { class: 'btn', type: 'button', onclick: () => { quiz = { qs: S.quizOf(f, 10), i: 0, score: 0, picked: -1 }; renderQuiz(); } }, 'Lancer le quiz')))
          : h('div', { class: 'empty' }, 'Il faut au moins 3 définitions complètes (terme et définition) pour générer un quiz. Ajoute-les dans l’onglet Fiche.'));
        return;
      }
      if (quiz.i >= quiz.qs.length) {
        if (!quiz.logged) { quiz.logged = true; S.Activity.add('quiz', quiz.qs.length); }
        const pct = Math.round(100 * quiz.score / quiz.qs.length);
        quizBox.replaceChildren(h('div', { class: 'deck' },
          h('p', { class: 'deck__title' }, `${quiz.score} / ${quiz.qs.length}`),
          h('p', { class: 'note' }, pct === 100 ? 'Sans faute, bravo !' : pct >= 60 ? 'Bien joué, encore un effort sur les erreurs.' : 'À retravailler : relis la fiche puis réessaie.'),
          h('div', { class: 'deck__actions' },
            h('button', { class: 'btn', type: 'button', onclick: () => { quiz = { qs: S.quizOf(f, 10), i: 0, score: 0, picked: -1 }; renderQuiz(); } }, 'Rejouer'),
            h('button', { class: 'btn btn--ghost', type: 'button', onclick: () => { quiz = null; renderQuiz(); } }, 'Retour'))));
        return;
      }
      const q = quiz.qs[quiz.i], answered = quiz.picked >= 0;
      quizBox.replaceChildren(h('div', { class: 'deck deck--quiz' },
        h('p', { class: 'deck__count' }, `Question ${quiz.i + 1} sur ${quiz.qs.length}`),
        h('div', { class: 'quiz__q' }, h('span', { class: 'card__kind' }, 'Quel terme correspond à cette définition ?'), h('span', { class: 'card__text' }, q.prompt)),
        h('div', { class: 'quiz__opts' }, q.options.map((o, i) => h('button', {
          class: 'opt' + (answered ? (i === q.answer ? ' is-right' : i === quiz.picked ? ' is-wrong' : '') : ''),
          type: 'button', disabled: answered,
          onclick: () => { quiz.picked = i; if (i === q.answer) quiz.score++; renderQuiz(); }
        }, h('kbd', {}, String(i + 1)), o))),
        h('div', { class: 'deck__actions' }, answered
          ? h('button', { class: 'btn', type: 'button', onclick: () => { quiz.i++; quiz.picked = -1; renderQuiz(); } }, quiz.i + 1 < quiz.qs.length ? 'Question suivante' : 'Voir le score')
          : null)));
    }
    document.addEventListener('keydown', e => {
      if (!quiz || quiz.i >= quiz.qs.length || $('panel-quiz').hidden || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target.closest('input, textarea, select')) return;
      const q = quiz.qs[quiz.i];
      if (quiz.picked < 0 && /^[1-4]$/.test(e.key) && +e.key <= q.options.length) {
        quiz.picked = +e.key - 1; if (quiz.picked === q.answer) quiz.score++; renderQuiz();
      } else if (quiz.picked >= 0 && e.key === 'Enter') { quiz.i++; quiz.picked = -1; renderQuiz(); }
    });

    /* ----- Onglets ----- */
    function showTab(name) {
      for (const t of ['sheet', 'cards', 'quiz']) {
        $('tab-' + t).setAttribute('aria-selected', String(t === name));
        $('panel-' + t).hidden = t !== name;
      }
      if (name === 'sheet') sheet.querySelectorAll('textarea').forEach(autosize);
      else if (name === 'cards') { session = null; renderDeck(); }
      else { quiz = null; renderQuiz(); }
    }
    $('tab-sheet').addEventListener('click', () => showTab('sheet'));
    $('tab-cards').addEventListener('click', () => showTab('cards'));
    $('tab-quiz').addEventListener('click', () => showTab('quiz'));

    /* ----- Export, impression, suppression ----- */
    function toText() {
      const L = [f.title.trim() || 'Fiche', '', 'Matière : ' + K.subjects.get(f.subjectId).name];
      if (course) L.push('Cours : ' + course.title);
      L.push('');
      const sec = (name, lines) => { if (lines.length) { L.push(name, '-'.repeat(name.length), ...lines, ''); } };
      sec('Points clés', f.points.filter(filled).map(p => '- ' + p.trim()));
      sec('Définitions', f.defs.filter(d => filled(d.t) || filled(d.d)).map(d => d.t.trim() + ' : ' + d.d.trim()));
      sec('Questions', f.qas.filter(q => filled(q.q) || filled(q.a)).flatMap(q => ['Q : ' + q.q.trim(), 'R : ' + q.a.trim(), '']));
      return L.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
    }
    $('export').addEventListener('click', () => {
      const slug = f.title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'fiche';
      const url = URL.createObjectURL(new Blob([toText()], { type: 'text/plain;charset=utf-8' }));
      const a = h('a', { href: url, download: slug + '.txt' });
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      K.toast('Fiche exportée.');
    });
    $('print').addEventListener('click', () => { showTab('sheet'); window.print(); });
    $('delete').addEventListener('click', async () => {
      if (!await K.confirmBox(`Supprimer la fiche « ${f.title} » ? Cette action est définitive.`)) return;
      clearTimeout(timer); timer = null;
      try { await K.db.del('fiches', f.id); location.href = 'revisions.html'; }
      catch (e) { K.toast('Suppression impossible.'); }
    });

    renderSheet();
  })();
})();
