/* ==========================================================
   Kurso – thèmes et personnalisation
   Chargé dans le <head> de chaque page pour appliquer le thème
   avant l’affichage (pas de flash). Réglages gardés dans
   localStorage (clé « kurso.theme »).
   ========================================================== */
(() => {
  'use strict';

  const KEY = 'kurso.theme';

  /* ---------- Palettes ---------- */
  const PRESETS = {
    graphite: { name: 'Graphite',     scheme: 'dark',  bg: '#1c1c1c', fg: '#ffffff', accent: '#cccccc' },
    noir:     { name: 'Noir',         scheme: 'dark',  bg: '#000000', fg: '#ffffff', accent: '#ffffff' },
    noirose:  { name: 'Noir et rose', scheme: 'dark',  bg: '#0a0a0a', fg: '#ffffff', accent: '#ff5fa2' },
    rose:     { name: 'Rose',         scheme: 'dark',  bg: '#21161c', fg: '#fff1f6', accent: '#f48fb1' },
    poudre:   { name: 'Rose poudré',  scheme: 'light', bg: '#fff1f6', fg: '#3a1d2a', accent: '#d6457f' },
    clair:    { name: 'Clair',        scheme: 'light', bg: '#f6f6f4', fg: '#1a1a1a', accent: '#2b2b2b' },
    ocean:    { name: 'Océan',        scheme: 'dark',  bg: '#101a24', fg: '#eaf3fb', accent: '#6cb6ff' },
    foret:    { name: 'Forêt',        scheme: 'dark',  bg: '#121a15', fg: '#eaf5ec', accent: '#7fc58f' },
    violet:   { name: 'Violet',       scheme: 'dark',  bg: '#17141f', fg: '#f1ecfb', accent: '#b295d6' }
  };

  const ACCENTS = [
    { hex: '#ff5fa2', name: 'Rose vif' }, { hex: '#f48fb1', name: 'Rose' },
    { hex: '#ff7a59', name: 'Corail' },   { hex: '#f0b429', name: 'Ambre' },
    { hex: '#7fc58f', name: 'Vert' },     { hex: '#4fd1c5', name: 'Turquoise' },
    { hex: '#6cb6ff', name: 'Bleu' },     { hex: '#b295d6', name: 'Violet' },
    { hex: '#ffffff', name: 'Blanc' },    { hex: '#cccccc', name: 'Gris' }
  ];

  const FONTS = {
    outfit: { name: 'Outfit (par défaut)', css: '"Outfit", system-ui, -apple-system, "Segoe UI", sans-serif' },
    systeme: { name: 'Système', css: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
    serif: { name: 'Avec empattements', css: 'Georgia, "Times New Roman", serif' },
    mono: { name: 'Machine à écrire', css: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace' }
  };

  const DEFAULTS = {
    preset: 'graphite', accent: '', font: 'outfit', size: 100,
    radius: 'normal', density: 'normal', cursor: 'cross', motion: true,
    name: '', goal: 10
  };

  /* ---------- Couleurs ---------- */
  const toRgb = hex => {
    let s = String(hex).replace('#', '');
    if (s.length === 3) s = s.split('').map(c => c + c).join('');
    const n = parseInt(s, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const toHex = rgb => '#' + rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  /* mix(a, b, p) : a + p % de b */
  const mix = (a, b, p) => {
    const A = toRgb(a), B = toRgb(b);
    return toHex(A.map((v, i) => v + (B[i] - v) * p));
  };
  const luminance = hex => {
    const [r, g, b] = toRgb(hex).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const onColor = hex => (luminance(hex) > 0.4 ? '#0a0a0a' : '#ffffff');

  /* Toutes les variables CSS d’un thème, calculées à partir de 3 couleurs */
  function compute(s) {
    const p = PRESETS[s.preset] || PRESETS.graphite;
    const light = p.scheme === 'light';
    const { bg, fg } = p;
    const accent = /^#[0-9a-f]{6}$/i.test(s.accent || '') ? s.accent : p.accent;
    const k = light ? '#000000' : '#ffffff';
    return {
      scheme: p.scheme,
      vars: {
        '--bg': bg,
        '--side': light ? mix(bg, '#000000', 0.04) : mix(bg, '#000000', 0.18),
        '--input-bg': light ? mix(bg, '#ffffff', 0.6) : mix(bg, '#000000', 0.1),
        '--border': mix(bg, fg, light ? 0.18 : 0.15),
        '--border-hover': mix(bg, fg, light ? 0.3 : 0.25),
        '--line': mix(bg, fg, light ? 0.3 : 0.25),
        '--divider': mix(bg, fg, light ? 0.1 : 0.09),
        '--hover': mix(bg, fg, light ? 0.06 : 0.07),
        '--active': mix(bg, fg, light ? 0.11 : 0.12),
        '--muted': mix(bg, fg, light ? 0.62 : 0.55),
        '--faint': mix(bg, fg, light ? 0.45 : 0.32),
        '--text': fg,
        '--text-soft': mix(fg, accent, 0.15),
        '--btn-bg': accent,
        '--btn-bg-hover': mix(accent, k, light ? 0.18 : 0.25),
        '--btn-text': onColor(accent),
        '--accent': accent,
        '--accent-text': onColor(accent),
        '--danger': light ? '#c0392b' : '#e58a8a',
        '--ok': light ? '#2f8f4e' : '#8fc99a',
        '--grid': mix(bg, fg, 0.08),
        '--toast-bg': fg,
        '--toast-text': bg,
        '--focus': light ? fg : '#ffffff'
      }
    };
  }

  /* ---------- Réglages ---------- */
  function read() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { /* stockage indisponible */ }
    const s = { ...DEFAULTS, ...saved };
    if (!PRESETS[s.preset]) s.preset = DEFAULTS.preset;
    if (!FONTS[s.font]) s.font = DEFAULTS.font;
    return s;
  }
  function write(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* ignoré */ } }

  const RADII = { square: ['3px', '5px'], normal: ['10px', '14px'], round: ['16px', '22px'] };

  function apply(s = read()) {
    const root = document.documentElement;
    const { scheme, vars } = compute(s);
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
    const [r, rl] = RADII[s.radius] || RADII.normal;
    root.style.setProperty('--radius', r);
    root.style.setProperty('--radius-lg', rl);
    root.style.setProperty('--font', (FONTS[s.font] || FONTS.outfit).css);
    root.style.setProperty('--fs', String(Math.max(80, Math.min(140, +s.size || 100)) / 100));
    root.style.setProperty('--row-y', s.density === 'compact' ? '7px' : '12px');
    root.style.setProperty('--gap-y', s.density === 'compact' ? '0.7' : '1');
    root.style.colorScheme = scheme;
    root.dataset.scheme = scheme;
    root.dataset.cursor = s.cursor;
    root.dataset.motion = s.motion ? 'on' : 'off';
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = vars['--bg'];
  }

  const get = read;
  function set(patch) {
    const s = { ...read(), ...patch };
    write(s);
    apply(s);
    return s;
  }
  function reset() { try { localStorage.removeItem(KEY); } catch (e) { /* ignoré */ } apply(); }

  apply();
  /* Mise à jour en direct quand un autre onglet change le thème */
  window.addEventListener('storage', e => { if (e.key === KEY) apply(); });

  window.KursoTheme = { PRESETS, ACCENTS, FONTS, DEFAULTS, RADII, get, set, reset, apply, compute, mix, onColor };
})();
