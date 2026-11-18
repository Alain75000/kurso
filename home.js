/* Accueil : matières, derniers cours, dernières fiches */
(() => {
  const K = Kurso, { h } = K;
  const $ = id => document.getElementById(id);

  /* Tableau de bord : série, objectif du jour, cartes dues, échéances */
  function renderDash(courses, fiches) {
    const S = K.study;
    const name = KursoTheme.get().name;
    $('hello').textContent = name ? 'Bonjour, ' + name : 'Bienvenue sur Kurso';

    const due = fiches.reduce((n, f) => n + S.ficheStats(f).due, 0);
    const today = S.Activity.day(), goal = S.goal();
    const week = S.Activity.lastDays(7);
    const streak = S.Activity.streak();
    const tile = (n, label, hint, href) => h(href ? 'a' : 'div', { class: 'tile' + (href ? ' tile--link' : ''), href }, h('p', { class: 'tile__n' }, n), h('p', { class: 'tile__l' }, label), hint ? h('p', { class: 'tile__h' }, hint) : null);
    $('tiles').replaceChildren(
      tile(String(due), 'cartes à réviser', due ? 'Lance une série' : 'Tout est à jour', 'reviser.html'),
      h('div', { class: 'tile' },
        h('p', { class: 'tile__n' }, `${today.cards || 0}/${goal}`), h('p', { class: 'tile__l' }, 'objectif du jour'),
        h('div', { class: 'meter', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(goal), 'aria-valuenow': String(Math.min(today.cards || 0, goal)) },
          h('span', { style: `width:${Math.min(100, Math.round(100 * (today.cards || 0) / goal))}%` }))),
      tile(K.plural(streak, 'jour'), 'de série', streak ? 'Continue comme ça' : 'Révise aujourd’hui pour démarrer'),
      tile(S.fmtMinutes(week.reduce((a, d) => a + (d.minutes || 0), 0)), 'de travail sur 7 jours', null, 'focus.html'));

    $('week').replaceChildren(S.barChart(week.map(d => ({
      label: S.weekday(d.date), value: (d.cards || 0) + (d.quiz || 0),
      title: `${K.fmtDate(d.date)} : ${d.cards || 0} cartes, ${d.quiz || 0} questions de quiz, ${S.fmtMinutes(d.minutes || 0)}`, today: d.date === K.today()
    })), 'cartes'));

    const next = S.Tasks.upcoming(4);
    $('deadlines').replaceChildren(next.length
      ? h('div', { class: 'list' }, next.map(t => {
          const sj = K.subjects.get(t.subjectId);
          return h('a', { class: 'row row--deadline', href: t.ficheId ? 'fiche.html?id=' + t.ficheId : 'agenda.html' },
            h('span', { class: 'badge badge--fiche' }, ({ devoir: 'Devoir', controle: 'Ctrl', examen: 'Exam', revision: 'Rév.' })[t.type] || 'Tâche'),
            h('span', {}, h('span', { class: 'row__title' }, t.title), h('span', { class: 'row__sub' }, K.dot(sj), sj.name)),
            h('span', { class: 'row__meta' }, ''),
            h('span', { class: 'row__meta' + (S.Tasks.daysLeft(t) < 0 ? ' is-late' : '') }, S.Tasks.countdown(t)));
        }))
      : h('div', { class: 'empty' }, 'Rien de prévu. ', h('a', { href: 'agenda.html' }, 'Ajoute un devoir ou un contrôle')));
  }

  async function render() {
    let courses = [], fiches = [];
    try {
      [courses, fiches] = await Promise.all([K.db.all('courses'), K.db.all('fiches')]);
    } catch (e) { K.toast('Le stockage du navigateur est indisponible.'); }

    renderDash(courses, fiches);

    // Matières
    const cards = K.subjects.list().map(s => {
      const nc = courses.filter(c => c.subjectId === s.id).length;
      const nf = fiches.filter(f => f.subjectId === s.id).length;
      return h('div', { class: 'subject' },
        h('a', { class: 'subject__name', href: 'cours.html?matiere=' + encodeURIComponent(s.id) }, K.dot(s, true), s.name),
        h('p', { class: 'subject__stats' }, K.plural(nc, 'cours', 'cours') + ', ' + K.plural(nf, 'fiche')),
        h('button', {
          class: 'subject__edit', type: 'button', 'aria-label': 'Modifier la matière ' + s.name,
          onclick: async () => { const r = await K.subjectDialog(s); if (r.action !== 'closed') render(); }
        }, 'Modifier'));
    });
    cards.push(h('button', {
      class: 'subject subject--add', type: 'button',
      onclick: async () => { const r = await K.subjectDialog(null); if (r.action === 'saved') render(); }
    }, 'Ajouter une matière'));
    $('subjects').replaceChildren(...cards);

    // Derniers cours
    const openCourse = async rec => {
      const r = await K.courseDialog({ record: rec });
      if (r.action === 'saved') K.toast('Modifications enregistrées.');
      if (r.action === 'deleted') K.toast('Cours supprimé.');
      if (r.action === 'saved' || r.action === 'deleted') render();
    };
    const lastCourses = courses.sort((a, b) => b.addedAt - a.addedAt).slice(0, 5);
    $('recent-courses').replaceChildren(lastCourses.length
      ? h('div', { class: 'list' }, lastCourses.map(c => K.courseRow(c, openCourse)))
      : h('div', { class: 'empty' }, 'Aucun cours pour l’instant. ', h('a', { href: 'importer.html' }, 'Importe ton premier cours')));

    // Dernières fiches
    const lastFiches = fiches.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 3);
    $('recent-fiches').replaceChildren(lastFiches.length
      ? h('div', { class: 'list' }, lastFiches.map(K.ficheRow))
      : h('div', { class: 'empty' }, 'Aucune fiche pour l’instant. ', h('a', { href: 'revisions.html' }, 'Crée ta première fiche')));
  }

  render();
})();
