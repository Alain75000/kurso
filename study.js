/* ==========================================================
   Kurso – outils d’étude (à charger après core.js)
   - Activité : cartes révisées, quiz, minutes de travail, série de jours
   - Révision espacée (boîtes de Leitner) sur les cartes d’une fiche
   - Quiz à choix multiple généré à partir des définitions
   - Agenda : devoirs, contrôles, examens
   - Séances de travail (minuteur Focus)
   Données de petite taille gardées dans localStorage ; l’état de
   révision de chaque carte est gardé dans la fiche (f.srs).
   ========================================================== */
(() => {
  'use strict';
  const K = window.Kurso;

  /* ---------- localStorage JSON ---------- */
  const ls = {
    get(key, fallback) {
      try { const v = JSON.parse(localStorage.getItem(key)); return v == null ? fallback : v; }
      catch (e) { return fallback; }
    },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; } }
  };

  /* ---------- Dates (au format AAAA-MM-JJ) ---------- */
  const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const parse = s => new Date(s + 'T12:00:00');
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const diffDays = (a, b) => Math.round((parse(a) - parse(b)) / 86400000);
  const weekday = s => parse(s).toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '');

  /* ---------- Activité ---------- */
  const ACT_KEY = 'kurso.activity';
  const Activity = {
    all: () => ls.get(ACT_KEY, {}),
    add(kind, n = 1) {
      const a = Activity.all(), t = K.today();
      const day = a[t] || { cards: 0, quiz: 0, minutes: 0 };
      day[kind] = (day[kind] || 0) + n;
      a[t] = day;
      // on ne garde que les 400 derniers jours
      const keys = Object.keys(a).sort();
      while (keys.length > 400) delete a[keys.shift()];
      ls.set(ACT_KEY, a);
    },
    day(date = K.today()) { return Activity.all()[date] || { cards: 0, quiz: 0, minutes: 0 }; },
    isActive: d => !!d && (d.cards > 0 || d.quiz > 0 || d.minutes > 0),
    /* n derniers jours, du plus ancien à aujourd’hui */
    lastDays(n = 7) {
      const a = Activity.all(), t = K.today();
      return Array.from({ length: n }, (_, i) => {
        const date = addDays(t, i - (n - 1));
        return { date, ...(a[date] || { cards: 0, quiz: 0, minutes: 0 }) };
      });
    },
    /* Jours d’affilée avec de l’activité (aujourd’hui peut encore être vide) */
    streak() {
      const a = Activity.all();
      let d = K.today(), n = 0;
      if (!Activity.isActive(a[d])) d = addDays(d, -1);
      while (Activity.isActive(a[d])) { n++; d = addDays(d, -1); }
      return n;
    }
  };

  /* ---------- Cartes de révision et boîtes de Leitner ---------- */
  const INTERVALS = [0, 1, 3, 7, 14, 30, 60];   // jours avant la prochaine révision, par boîte
  const MASTERED_BOX = 4;
  const GRADES = {
    again: { label: 'À revoir', key: '1' },
    hard: { label: 'Difficile', key: '2' },
    good: { label: 'Bien', key: '3' },
    easy: { label: 'Facile', key: '4' }
  };

  const hash = str => {
    let h1 = 5381, h2 = 52711;
    for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = (h1 * 33) ^ c; h2 = (h2 * 31 + c) | 0; }
    return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36);
  };
  const filled = s => typeof s === 'string' && s.trim().length > 0;
  const cardKey = (kind, front) => kind[0] + ':' + hash(K.norm(front).replace(/\s+/g, ' ').trim());

  /* Cartes d’une fiche : chaque définition et chaque question complète */
  function cardsOf(f) {
    const mk = (kind, front, back) => ({
      key: cardKey(kind, front), kind, front: front.trim(), back: back.trim(),
      ficheId: f.id, ficheTitle: f.title, subjectId: f.subjectId
    });
    return [
      ...(f.defs || []).filter(d => filled(d.t) && filled(d.d)).map(d => mk('Terme', d.t, d.d)),
      ...(f.qas || []).filter(q => filled(q.q) && filled(q.a)).map(q => mk('Question', q.q, q.a))
    ];
  }
  const stateOf = (f, card) => (f.srs && f.srs[card.key]) || null;
  const isDue = st => !st || st.due <= K.today();
  const isMastered = st => !!st && st.box >= MASTERED_BOX;

  /* Enregistre une réponse dans la fiche (à sauvegarder ensuite avec db.put) */
  function grade(f, card, g) {
    f.srs = f.srs || {};
    const st = f.srs[card.key] || { box: 0, seen: 0, ok: 0 };
    if (g === 'again') st.box = 0;
    else if (g === 'hard') st.box = Math.max(1, st.box);
    else if (g === 'good') st.box = Math.min(INTERVALS.length - 1, st.box + 1);
    else st.box = Math.min(INTERVALS.length - 1, st.box + 2);
    st.seen += 1;
    if (g !== 'again') st.ok += 1;
    st.last = K.today();
    st.due = addDays(K.today(), g === 'again' ? 0 : INTERVALS[st.box]);
    f.srs[card.key] = st;
    Activity.add('cards', 1);
    return st;
  }

  function ficheStats(f) {
    const cards = cardsOf(f);
    let due = 0, mastered = 0, fresh = 0;
    cards.forEach(c => {
      const st = stateOf(f, c);
      if (!st) fresh++;
      if (isDue(st)) due++;
      if (isMastered(st)) mastered++;
    });
    return { total: cards.length, due, mastered, fresh };
  }

  /* Texte du délai avant la prochaine révision, pour l’aperçu des boutons */
  const nextLabel = (st, g) => {
    const box = st ? st.box : 0;
    const nb = g === 'again' ? 0 : g === 'hard' ? Math.max(1, box) : Math.min(INTERVALS.length - 1, box + (g === 'good' ? 1 : 2));
    const d = INTERVALS[nb];
    return d === 0 ? 'maintenant' : d === 1 ? 'demain' : 'dans ' + d + ' j';
  };

  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  /* ---------- Quiz à choix multiple (définition → terme) ---------- */
  function quizOf(f, max = 10) {
    const seen = new Set();
    const defs = (f.defs || []).filter(d => filled(d.t) && filled(d.d)).filter(d => {
      const k = K.norm(d.t).trim();
      if (seen.has(k)) return false;
      seen.add(k); return true;
    });
    if (defs.length < 3) return [];
    return shuffle(defs.slice()).slice(0, max).map(d => {
      const others = shuffle(defs.filter(x => x !== d)).slice(0, 3).map(x => x.t.trim());
      const options = shuffle([d.t.trim(), ...others]);
      return { prompt: d.d.trim(), options, answer: options.indexOf(d.t.trim()) };
    });
  }

  /* ---------- Agenda ---------- */
  const TASK_KEY = 'kurso.tasks';
  const TASK_TYPES = { devoir: 'Devoir', controle: 'Contrôle', examen: 'Examen', revision: 'Révision', autre: 'Autre' };
  const Tasks = {
    all: () => ls.get(TASK_KEY, []),
    save: list => ls.set(TASK_KEY, list),
    add(t) { const list = Tasks.all(); const rec = { id: K.uid(), done: false, ...t }; list.push(rec); Tasks.save(list); return rec; },
    update(id, patch) { const list = Tasks.all(); const t = list.find(x => x.id === id); if (t) { Object.assign(t, patch); Tasks.save(list); } },
    remove(id) { Tasks.save(Tasks.all().filter(t => t.id !== id)); },
    daysLeft: t => diffDays(t.date, K.today()),
    /* « Aujourd’hui », « Demain », « J-5 », « 2 j de retard » */
    countdown(t) {
      const d = Tasks.daysLeft(t);
      if (d === 0) return 'Aujourd’hui';
      if (d === 1) return 'Demain';
      if (d > 1) return 'J-' + d;
      return Math.abs(d) + ' j de retard';
    },
    upcoming: (n = 4) => Tasks.all().filter(t => !t.done).sort((a, b) => a.date.localeCompare(b.date)).slice(0, n)
  };

  /* ---------- Séances de travail ---------- */
  const SES_KEY = 'kurso.sessions';
  const Sessions = {
    all: () => ls.get(SES_KEY, []),
    add(subjectId, minutes) {
      if (!(minutes > 0)) return;
      const list = Sessions.all();
      list.push({ id: K.uid(), date: K.today(), at: Date.now(), subjectId: subjectId || '', minutes });
      ls.set(SES_KEY, list.slice(-500));
      Activity.add('minutes', minutes);
    },
    since(days) { const from = addDays(K.today(), -(days - 1)); return Sessions.all().filter(s => s.date >= from); }
  };

  /* Durée lisible : 95 → « 1 h 35 » */
  const fmtMinutes = m => {
    m = Math.round(m);
    if (m < 60) return m + ' min';
    const h = Math.floor(m / 60), r = m % 60;
    return r ? `${h} h ${String(r).padStart(2, '0')}` : h + ' h';
  };

  /* Objectif du jour (cartes) */
  const goal = () => Math.max(1, +(window.KursoTheme && KursoTheme.get().goal) || 10);

  /* ---------- Histogramme simple (barres verticales) ---------- */
  function barChart(data, unit = '') {
    const max = Math.max(1, ...data.map(d => d.value));
    return K.h('div', { class: 'bars', role: 'img', 'aria-label': 'Histogramme : ' + data.map(d => `${d.label} ${d.value}${unit ? ' ' + unit : ''}`).join(', ') },
      data.map(d => K.h('div', { class: 'bar' + (d.today ? ' is-today' : ''), title: d.title || '' },
        K.h('span', { class: 'bar__val' }, d.value ? String(d.value) : ''),
        K.h('span', { class: 'bar__track' }, K.h('span', { class: 'bar__fill', style: `height:${Math.round(100 * d.value / max)}%` })),
        K.h('span', { class: 'bar__lbl' }, d.label))));
  }

  /* Pastille « cartes à réviser » dans le menu */
  document.addEventListener('DOMContentLoaded', async () => {
    const a = document.querySelector('.side__nav a[href="reviser.html"]');
    if (!a) return;
    try {
      const n = (await K.db.all('fiches')).reduce((sum, f) => sum + ficheStats(f).due, 0);
      if (n) a.append(K.h('span', { class: 'nav__badge', title: n + ' à réviser' }, n > 99 ? '99+' : String(n)));
    } catch (e) { /* stockage indisponible */ }
  });

  Object.assign(K, {
    study: {
      ls, iso, parse, addDays, diffDays, weekday, shuffle, fmtMinutes, goal,
      Activity, Tasks, Sessions, TASK_TYPES, GRADES, INTERVALS,
      cardsOf, stateOf, isDue, isMastered, grade, ficheStats, nextLabel, quizOf, barChart
    }
  });
})();
