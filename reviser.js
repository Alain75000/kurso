/* À réviser : révision espacée des cartes de toutes les fiches */
(() => {
  const K = Kurso, S = K.study, { h } = K;
  const $ = id => document.getElementById(id);
  let fiches = [], byId = new Map(), subject = 'all', limit = 20, includeAll = false;
  let session = null;

  async function load() {
    try { fiches = await K.db.all('fiches'); } catch (e) { K.toast('Le stockage du navigateur est indisponible.'); }
    byId = new Map(fiches.map(f => [f.id, f]));
    render();
  }

  const allCards = () => fiches.flatMap(f => S.cardsOf(f));
  const poolCards = () => allCards().filter(c => K.matchSubject(c, subject) && (includeAll || S.isDue(S.stateOf(byId.get(c.ficheId), c))));

  const tile = (n, label, hint) => h('div', { class: 'tile' }, h('p', { class: 'tile__n' }, String(n)), h('p', { class: 'tile__l' }, label), hint ? h('p', { class: 'tile__h' }, hint) : null);

  function renderTiles() {
    const cards = allCards();
    let due = 0, fresh = 0, mastered = 0;
    cards.forEach(c => { const st = S.stateOf(byId.get(c.ficheId), c); if (S.isDue(st)) due++; if (!st) fresh++; if (S.isMastered(st)) mastered++; });
    const done = S.Activity.day().cards, goal = S.goal();
    $('tiles').replaceChildren(
      tile(due, 'à réviser', 'aujourd’hui'),
      tile(fresh, 'nouvelles', 'jamais vues'),
      tile(mastered, 'maîtrisées', 'revues avec succès plusieurs fois'),
      h('div', { class: 'tile' }, h('p', { class: 'tile__n' }, `${done}/${goal}`), h('p', { class: 'tile__l' }, 'objectif du jour'),
        h('div', { class: 'meter', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(goal), 'aria-valuenow': String(Math.min(done, goal)) },
          h('span', { style: `width:${Math.min(100, Math.round(100 * done / goal))}%` }))));
    return cards;
  }

  function render() {
    const cards = renderTiles();
    if (session) { renderDeck(); $('setup').replaceChildren(); $('by-fiche').replaceChildren(); return; }

    if (!cards.length) {
      $('setup').replaceChildren(h('div', { class: 'empty' }, 'Aucune carte pour l’instant. Les définitions et les questions de tes fiches deviennent des cartes. ', h('a', { href: 'revisions.html' }, 'Va sur tes fiches')));
      $('deck').replaceChildren(); $('by-fiche').replaceChildren();
      return;
    }

    const pool = poolCards();
    const chipBox = h('div', { class: 'chips', id: 'chips', role: 'group', 'aria-label': 'Filtrer par matière' });
    K.chips(chipBox, K.subjectItems(includeAll ? allCards() : allCards().filter(c => S.isDue(S.stateOf(byId.get(c.ficheId), c))), subject), subject, id => { subject = id; render(); });

    const sel = h('select', { class: 'select', 'aria-label': 'Cartes par série' },
      [[10, '10 cartes par série'], [20, '20 cartes par série'], [50, '50 cartes par série'], [9999, 'Toutes les cartes']].map(([v, t]) => h('option', { value: String(v), selected: v === limit }, t)));
    sel.addEventListener('change', () => { limit = +sel.value; render(); });
    const all = h('input', { type: 'checkbox', checked: includeAll });
    all.addEventListener('change', () => { includeAll = all.checked; render(); });

    const n = Math.min(pool.length, limit);
    $('setup').replaceChildren(
      chipBox,
      h('div', { class: 'toolbar' },
        sel,
        h('label', { class: 'check', style: 'margin:0' }, all, h('span', {}, 'Inclure les cartes pas encore dues')),
        h('span', { class: 'spacer' }),
        pool.length
          ? h('button', { class: 'btn', type: 'button', onclick: () => start(pool.slice()) }, 'Commencer la série (' + n + ')')
          : h('span', { class: 'note' }, includeAll ? 'Aucune carte dans cette matière.' : 'Rien à réviser pour l’instant. Reviens demain !')));
    $('deck').replaceChildren();

    /* Détail par fiche */
    const rows = fiches.map(f => ({ f, st: S.ficheStats(f) })).filter(r => r.st.total && K.matchSubject(r.f, subject))
      .sort((a, b) => b.st.due - a.st.due || a.f.title.localeCompare(b.f.title, 'fr'));
    $('by-fiche').replaceChildren(
      h('h2', { class: 'section-title' }, 'Par fiche'),
      rows.length ? h('div', { class: 'list' }, rows.map(({ f, st }) => {
        const s = K.subjects.get(f.subjectId);
        return h('a', { class: 'row', href: 'fiche.html?id=' + f.id },
          h('span', { class: 'badge badge--fiche' }, 'Fiche'),
          h('span', {}, h('span', { class: 'row__title' }, f.title), h('span', { class: 'row__sub' }, K.dot(s), s.name)),
          h('span', { class: 'row__meta' }, st.mastered + '/' + st.total + ' maîtrisées'),
          h('span', { class: 'row__meta' }, st.due ? K.plural(st.due, 'carte') + ' à réviser' : 'À jour'));
      })) : h('div', { class: 'empty' }, 'Aucune fiche avec des cartes dans cette matière.'));
  }

  /* ---------- Série de révision ---------- */
  function start(pool) {
    // les cartes les plus en retard d’abord, puis mélange léger dans ce paquet
    const sorted = pool.sort((a, b) => {
      const sa = S.stateOf(byId.get(a.ficheId), a), sb = S.stateOf(byId.get(b.ficheId), b);
      return (sa ? sa.due : '') .localeCompare(sb ? sb.due : '');
    }).slice(0, limit);
    session = { queue: S.shuffle(sorted), total: sorted.length, missed: new Set(), flipped: false, done: 0, ok: 0 };
    render();
  }

  async function answer(g) {
    const c = session.queue.shift();
    const f = byId.get(c.ficheId);
    S.grade(f, c, g);
    K.db.put('fiches', f).catch(() => K.toast('Enregistrement impossible.'));
    session.done++;
    if (g === 'again') { session.missed.add(c.key); session.queue.push(c); } else session.ok++;
    session.flipped = false;
    render();
  }

  function renderDeck() {
    const deck = $('deck');
    if (!session.queue.length) {
      const missed = session.missed.size;
      deck.replaceChildren(h('div', { class: 'deck' },
        h('p', { class: 'deck__title' }, 'Série terminée'),
        h('p', { class: 'note' }, `${K.plural(session.total, 'carte')} revue${session.total > 1 ? 's' : ''}` + (missed ? `, dont ${K.plural(missed, 'carte')} à revoir au moins une fois.` : ', sans erreur.')),
        h('p', { class: 'note' }, 'Ta progression est enregistrée : chaque carte reviendra au bon moment.'),
        h('div', { class: 'deck__actions' }, h('button', { class: 'btn', type: 'button', onclick: () => { session = null; render(); } }, 'Terminer'))));
      return;
    }
    const c = session.queue[0];
    const f = byId.get(c.ficheId);
    const st = S.stateOf(f, c);
    const s = K.subjects.get(c.subjectId);
    const card = h('button', {
      class: 'card', type: 'button', 'data-side': session.flipped ? 'back' : 'front',
      'aria-label': session.flipped ? 'Retourner la carte' : 'Retourner la carte, voir la réponse',
      onclick: () => { session.flipped = !session.flipped; renderDeck(); }
    },
      h('span', { class: 'card__kind' }, session.flipped ? 'Réponse' : c.kind + ' · ' + c.ficheTitle),
      h('span', { class: 'card__text' }, session.flipped ? c.back : c.front),
      h('span', { class: 'card__kind card__sub' }, K.dot(s), s.name));
    const actions = session.flipped
      ? Object.entries(S.GRADES).map(([g, info]) => h('button', { class: 'btn grade grade--' + g, type: 'button', onclick: () => answer(g), title: 'Raccourci : ' + info.key }, info.label, h('small', {}, S.nextLabel(st, g))))
      : [h('span', { class: 'note' }, 'Clique sur la carte (ou Espace) pour voir la réponse.')];
    deck.replaceChildren(h('div', { class: 'deck' },
      h('p', { class: 'deck__count' }, `${session.done} faite${session.done > 1 ? 's' : ''}, ${session.queue.length} restante${session.queue.length > 1 ? 's' : ''}`),
      card,
      h('div', { class: 'deck__actions' }, actions),
      h('p', { class: 'deck__actions' }, h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: () => { session = null; render(); } }, 'Arrêter la série'))));
    card.focus({ preventScroll: true });
  }

  document.addEventListener('keydown', e => {
    if (!session || !session.queue.length || e.ctrlKey || e.metaKey || e.altKey || e.target.closest('input, textarea, select')) return;
    if (e.key === ' ' || e.key === 'Enter') {
      if (e.target.closest('.btn:not(.card)')) return;
      e.preventDefault(); session.flipped = !session.flipped; renderDeck();
    } else if (session.flipped) {
      const g = Object.keys(S.GRADES).find(k => S.GRADES[k].key === e.key);
      if (g) { e.preventDefault(); answer(g); }
    }
  });

  load();
})();
