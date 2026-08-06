import React from 'react';

import { HeroGrid } from './lib/hero-grid.js';
import { SiteContent } from './lib/content.js';
import { SearchIndex } from './lib/search-index.js';
// Imported for their window.* side effects: the logic below reads window.SearchModel
// and window.SearchVectors directly, and that is left verbatim.
import './lib/search-model.js';
import './lib/search-vectors.js';

// The banner lives in hero-grid.js, next to the geometry and mask code that measures
// it — those have to agree on the exact glyph grid, so a second copy here could drift.
const NAME_ASCII = HeroGrid.NAME_ASCII;

// All content lives in content.js. SECTION_IDS replaces the ids array that used to be
// copy-pasted into computeFlow, updateActive, and renderVals independently.
const CONTENT = SiteContent;
const SECTION_IDS = CONTENT.sections.map((s) => s.id);

// A bare '/' should open search, but not while the user is mid-word in a field.
function isTypingTarget(t) {
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
}

// ---- pin engine ----------------------------------------------------------
// A pinned section is a tall scroll *track* holding a position:sticky *stage*.
// The stage holds still on screen while the scroll distance below it advances
// the stage's contents, so elements arrive in place rather than sliding past.
// Native scroll throughout — nothing hijacks the wheel, so keyboard, trackpad,
// touch and scrollToSection all keep working unchanged.

// Two pacing dials, because pinned sections do two different jobs.
//
// STEP_VH is scroll distance per step, for sections you advance through — one
// job, then the next; one project, then the next. 42 puts a step at roughly one
// trackpad flick.
//
// REVEAL_VH is how long a one-shot section holds after its reveal has played.
// Those sections don't advance: arriving triggers the whole animation, and this
// is the beat the stage stays put afterwards so it lands rather than flicking by.
const STEP_VH = 42;
const REVEAL_VH = 60;

// Matches the breakpoint the neural strip already uses. Below it we don't pin at
// all — sticky + full-viewport heights are unreliable against mobile browser
// chrome, and a long pinned sequence is worse on a phone than a plain scroll.
const PIN_MIN_WIDTH = 900;

// A stage is one viewport tall and has to hold its section's tallest step. The
// two tightest are education and projects, which measure ~643px on a 900px-wide
// window; below ~680px of viewport they would overflow the stage and the excess
// would be unreachable, since the track scroll advances steps rather than
// panning the stage. A short window falls back to plain flow instead.
const PIN_MIN_HEIGHT = 680;

// What each pinned section does, and how much scroll it gets for it.
//
// A section with one step doesn't advance — it plays. Its single future→active
// flip is the trigger, and everything inside sequences off that in CSS. A section
// with several steps is one you move through, and only two sections earn that:
// experience, whose three jobs cannot share a stage, and projects, whose rail
// travels sideways as you go.
//
// Counts are data-driven so adding a job or a project lengthens that track
// instead of silently overflowing its last step. Contact is deliberately absent:
// it's where someone acts, and it should arrive normally with the footer reachable.
const PIN_SPEC = {
  about: { steps: 1, vh: REVEAL_VH },
  experience: { steps: CONTENT.experience.length, vh: STEP_VH },
  education: { steps: 1, vh: REVEAL_VH },
  projects: { steps: CONTENT.projects.length, vh: STEP_VH },
  skills: { steps: 1, vh: REVEAL_VH }
};
const PIN_IDS = Object.keys(PIN_SPEC);

export default class Portfolio extends React.Component {
  constructor(props) {
    super(props);
    this.canvasRef = React.createRef();
    this.heroRef = React.createRef();
    this.state = {
      scrollY: 0,
      winW: typeof window !== 'undefined' ? window.innerWidth : 1440,
      winH: typeof window !== 'undefined' ? window.innerHeight : 900,
      active: 'about',
      openProject: null,
      searchOpen: false,
      searchQuery: '',
      searchResults: [],
      searchSel: -1,
      searchMode: 'idle',  // idle | loading | embedding | ready | failed
      searchProgress: 0,   // 0..1, drives the fill on the mode chip
      // Pinning is opt-in and starts off, so the very first paint is today's
      // plain document with every step present. It only switches on once the
      // engine has decided the viewport allows it and has measured the tracks.
      pinned: false,
      pins: null           // { [id]: { p, step, sp } } once measured
    };
    // Search internals live off state: none of them should trigger a render, and
    // renderVals() runs on every scroll event.
    this._alive = true;
    this._searchIndex = null;       // built lazily on first open
    this._searchEmbeddings = null;  // aligned to _searchIndex.chunks once the model lands
    this._searchSeq = 0;            // guards against out-of-order async results
    this._searchDebounce = null;
    this._queryVecCache = new Map();
    this._searchInputRef = React.createRef();
    // The nav pill's active marker is positioned imperatively — see syncNavIndicator().
    this._navPillRef = React.createRef();
    this._navIndicatorRef = React.createRef();
    this._searchTriggerEl = null;
    this._flashTimer = null;
    this._pendingScroll = null;
    this._isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform || '');
    this._time = 0;
    this._geom = null;
    this._mask = null;
    this._reduceMotion = typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    // Document-space top of each pinned track, measured on mount / resize / font
    // load. Null means "not measured, don't pin" — every consumer treats that as
    // plain flow, so a failed measurement degrades to today's site.
    this._pinTops = null;
    // { centres: number[], viewW } for the projects rail — see measureRail().
    this._rail = null;
  }

  componentDidMount() {
    this.onScroll = () => {
      this.setState({ scrollY: window.scrollY, flow: this.computeFlow(), pins: this.computePins() });
      this.updateActive();
    };
    this.onResize = () => {
      // pinAllowed() reads window.innerWidth/innerHeight directly, not state, so
      // it is already looking at the new size when this runs.
      this.setState({ winW: window.innerWidth, winH: window.innerHeight, pinned: this.pinAllowed() });
      this.sizeCanvas();
    };
    window.addEventListener('scroll', this.onScroll, { passive: true });
    window.addEventListener('resize', this.onResize);
    // Escape unwinds top-down: the project modal sits above the palette, so it wins
    // first and one press never closes both.
    this.onKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (this.state.openProject != null) { this.closeProjectModal(); return; }
        if (this.state.searchOpen) this.closeSearch();
        return;
      }
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (this.state.searchOpen) this.closeSearch();
        else this.openSearch(document.activeElement);
        return;
      }
      // '/' is a shortcut only when it isn't a character the user is typing.
      if (e.key === '/' && !this.state.searchOpen && this.state.openProject == null && !isTypingTarget(e.target)) {
        e.preventDefault();
        this.openSearch(document.activeElement);
      }
    };
    window.addEventListener('keydown', this.onKeyDown);
    // Toggling the OS setting has to unpin live, not on next reload: a pinned
    // stage is exactly the thing someone reaching for reduce-motion wants gone.
    this.onMotionPrefChange = () => this._safeSetState({ pinned: this.pinAllowed() });
    if (this._reduceMotion && this._reduceMotion.addEventListener) {
      this._reduceMotion.addEventListener('change', this.onMotionPrefChange);
    }
    this.sizeCanvas();
    // Web fonts change every section's height, which moves every track top. The
    // canvas already re-derives its geometry here; the pin tops have to as well.
    if (document.fonts && document.fonts.ready) {
      // The pill's link widths are font-dependent, so the marker has to be
      // re-measured once the real face lands — same reason as the canvas geometry.
      document.fonts.ready.then(() => {
        this.sizeCanvas();
        this.remeasurePins();
        this.syncNavIndicator(false);
      });
    }
    this.startLoop();
    this.setState({ pinned: this.pinAllowed() });
    this.syncNavIndicator(false);
  }

  componentDidUpdate(prevProps, prevState) {
    // Only when something that moves the marker changed. prevState is why this
    // is cheap — the old DCLogic shim only ever passed prevProps, so this had to
    // wait for the React port.
    if (prevState.active !== this.state.active) this.syncNavIndicator(true);
    else if (prevState.winW !== this.state.winW) this.syncNavIndicator(false);

    // Track tops are only valid for the layout that produced them. Re-measure
    // when pinning turns on or off (which changes every track's height) and when
    // the window resizes (which changes both heights and wrapping above them).
    if (prevState.pinned !== this.state.pinned ||
        prevState.winW !== this.state.winW ||
        prevState.winH !== this.state.winH) {
      this.remeasurePins();
    }
  }

  componentWillUnmount() {
    this._alive = false;
    window.removeEventListener('scroll', this.onScroll);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    if (this._reduceMotion && this._reduceMotion.removeEventListener) {
      this._reduceMotion.removeEventListener('change', this.onMotionPrefChange);
    }
    document.body.style.overflow = this._prevOverflow || '';
    if (this._raf) cancelAnimationFrame(this._raf);
    clearTimeout(this._searchDebounce);
    clearTimeout(this._flashTimer);
  }

  // The model load and query embedding are async and can outlive the component.
  _safeSetState(patch, cb) {
    if (this._alive) this.setState(patch, cb);
  }

  sizeCanvas() {
    const c = this.canvasRef.current;
    if (!c) return;
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    c.style.width = w + 'px';
    c.style.height = h + 'px';
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._geom = HeroGrid.geometry(w, h, NAME_ASCII.split('\n'));
    this._mask = HeroGrid.buildMask(NAME_ASCII.split('\n'), this._geom);
  }

  // Moves the nav pill's gold marker under the active section link. Written
  // straight to the node rather than routed through state, for the same reason
  // flashTarget() is: this component re-renders on every scroll event, and
  // pushing one animated transform through that is a whole-page render to move a
  // 60px box. Reading offsetLeft/offsetWidth here is a layout read, but it only
  // happens when the active section or the window width actually changed.
  syncNavIndicator(animate) {
    const pill = this._navPillRef.current;
    const bar = this._navIndicatorRef.current;
    if (!pill || !bar) return;
    const items = pill.querySelectorAll('[data-nav-item]');
    const i = Math.max(0, SECTION_IDS.indexOf(this.state.active));
    const a = items[i];
    if (!a) return;
    // .nav-pill is position:fixed, so it is the offsetParent and these are
    // already pill-relative — no getBoundingClientRect arithmetic needed.
    bar.style.transition = animate ? '' : 'none';
    bar.style.width = a.offsetWidth + 'px';
    bar.style.height = a.offsetHeight + 'px';
    bar.style.transform = 'translate(' + a.offsetLeft + 'px, ' + a.offsetTop + 'px)';
    if (!animate) {
      // Flush the un-transitioned placement before re-arming, or the browser
      // coalesces both writes and the marker slides in from the origin on load.
      void bar.offsetWidth;
      bar.style.transition = '';
    }
  }

  // ---- pin engine ---------------------------------------------------------

  pinAllowed() {
    if (typeof window === 'undefined') return false;
    if (window.innerWidth < PIN_MIN_WIDTH) return false;
    if (window.innerHeight < PIN_MIN_HEIGHT) return false;
    if (this._reduceMotion && this._reduceMotion.matches) return false;
    return true;
  }

  // Height of a track in px: one viewport for the stage itself, plus that
  // section's per-step distance for each step it has.
  pinTrackHeight(id) {
    const spec = PIN_SPEC[id];
    return this.state.winH * (100 + spec.steps * spec.vh) / 100;
  }

  // Where each project card sits along the rail, measured once per layout rather
  // than per frame. Card widths differ — featured cards are wider — so centring
  // one cannot be CSS arithmetic; it needs the real numbers. Same cache-then-do-
  // arithmetic shape as _pinTops, so the scroll handler still reads no layout.
  measureRail() {
    const rail = document.querySelector('#projects .proj-rail');
    if (!rail) { this._rail = null; return false; }
    const cards = rail.querySelectorAll(':scope > .proj-card');
    // A count mismatch means the rail isn't laid out the way the engine thinks it
    // is, and centring against it would put cards anywhere. Treat it as a failure.
    if (cards.length !== PIN_SPEC.projects.steps) { this._rail = null; return false; }
    const centres = [];
    // .proj-rail is position:relative while pinned, so it is the offsetParent and
    // these are rail-relative without any rect arithmetic.
    cards.forEach((c) => centres.push(c.offsetLeft + c.offsetWidth / 2));
    const viewport = rail.parentElement;
    if (!viewport) { this._rail = null; return false; }
    this._rail = { centres, viewW: viewport.clientWidth };
    return true;
  }

  // Puts card `i` at the centre of the rail by scrolling the page to that card's
  // point along the projects track. Focus and the rail must never disagree: a
  // card that has keyboard focus but sits off the side of the stage is a card
  // nobody can see they are on.
  scrollRailTo(i) {
    if (!this.state.pinned || !this._pinTops) return;
    const steps = PIN_SPEC.projects.steps;
    if (steps < 2) return;
    const p = Math.max(0, Math.min(1, i / (steps - 1)));
    const span = Math.max(1, this.pinTrackHeight('projects') - window.innerHeight);
    window.scrollTo({ top: Math.round(this._pinTops.projects + span * p), behavior: 'auto' });
  }

  // Horizontal offset that puts the current point along the rail dead centre.
  // Interpolating between neighbouring card centres rather than snapping to one
  // is what makes the rail travel continuously while each card still lands
  // centred exactly at its own step.
  computeRail(p) {
    const rail = this._rail;
    if (!rail || p == null) return null;
    const c = rail.centres;
    if (c.length === 0) return null;
    if (c.length === 1) return rail.viewW / 2 - c[0];
    const pos = p * (c.length - 1);
    const i = Math.min(c.length - 2, Math.floor(pos));
    const t = pos - i;
    return rail.viewW / 2 - (c[i] + (c[i + 1] - c[i]) * t);
  }

  // The only layout read the pin engine ever does, and it happens on mount,
  // resize, and font load — never per scroll. Everything after this is
  // arithmetic on scrollY, so the scroll handler gains no forced reflows.
  remeasurePins() {
    if (!this.state.pinned) {
      this._pinTops = null;
      if (this.state.pins) this._safeSetState({ pins: null });
      return;
    }
    const tops = {};
    for (const id of PIN_IDS) {
      const el = document.getElementById(id);
      // All-or-nothing, and it turns pinning off rather than just clearing the
      // progress. Clearing alone would leave the tracks tall and the stages
      // sticky while every step reported 'active' — which in the two swapping
      // sections means all three jobs, or all five project cards, rendered on
      // top of each other. Unpinning is the same exit the too-narrow and
      // reduce-motion paths take, and it lands on the plain document.
      if (!el) {
        this._pinTops = null;
        this._safeSetState({ pinned: false, pins: null });
        return;
      }
      tops[id] = el.getBoundingClientRect().top + window.scrollY;
    }
    this._pinTops = tops;
    // The rail is measured under the same all-or-nothing rule. A rail that can't
    // be measured would sit at offset zero with its first card jammed against the
    // left edge and no way to reach the rest — worse than not pinning.
    if (!this.measureRail()) {
      this._pinTops = null;
      this._safeSetState({ pinned: false, pins: null });
      return;
    }
    this._safeSetState({ pins: this.computePins() });
  }

  // Per-track progress and step index. `p` is 0..1 across the whole track, `step`
  // is the index currently on stage, and `sp` is 0..1 within that step for
  // effects that need to be continuous rather than discrete.
  //
  // `step` is -1 before the track has been reached, which is what makes the
  // first step's entrance play at all: progress clamps at 0, so without this
  // every section's step 0 would already be on stage from page load and would
  // simply be *there* when you arrived rather than arriving.
  computePins() {
    const tops = this._pinTops;
    if (!tops) return null;
    const y = window.scrollY, vh = window.innerHeight;
    const out = {};
    for (const id of PIN_IDS) {
      const steps = PIN_SPEC[id].steps;
      // The stage is stuck from the track's top until its bottom reaches the
      // viewport bottom; that window is the whole span of travel.
      const span = Math.max(1, this.pinTrackHeight(id) - vh);
      const p = Math.max(0, Math.min(1, (y - tops[id]) / span));
      // Step 0 arrives while the stage is still rising into view rather than at
      // the instant it locks, so the visitor doesn't watch an empty stage climb
      // a whole viewport first. 0.6 puts it a little past halfway up.
      const entered = y > tops[id] - vh * 0.6;
      const raw = p * steps;
      // At p === 1 the floor would land one past the end. Hold the last step
      // instead, with sp saturated, so the final frame doesn't snap backwards.
      const step = !entered ? -1 : raw >= steps ? steps - 1 : Math.floor(raw);
      out[id] = { p, step, sp: raw >= steps ? 1 : raw - step };
    }
    // Projects rides its track sideways rather than swapping, so it carries one
    // extra number: how far along the rail we are, in px.
    out.projects.railX = out.projects.step < 0 ? this.computeRail(0) : this.computeRail(out.projects.p);
    return out;
  }

  computeFlow() {
    const ids = SECTION_IDS;
    const anchors = ids.map((id) => {
      const el = document.getElementById(id);
      return el ? el.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.4 : null;
    });
    if (anchors.some((a) => a === null)) return this.state.flow || 0;
    const y = window.scrollY;
    if (y <= anchors[0]) return 0;
    for (let i = 0; i < anchors.length - 1; i++) {
      if (y < anchors[i + 1]) {
        const span = Math.max(1, anchors[i + 1] - anchors[i]);
        return i + (y - anchors[i]) / span;
      }
    }
    return anchors.length - 1;
  }

  updateActive() {
    const ids = SECTION_IDS;
    // A short final section never gets its top above the 40% line, so the loop below
    // can't ever pick it: at max scroll contact.top is (innerHeight - its height), which
    // only clears 0.4*innerHeight on windows under ~820px tall. Being at the end of the
    // page means you're in the last section, wherever its top sits. The tolerance is so
    // this engages over the final stretch of scroll rather than snapping in the last pixel.
    const doc = document.documentElement;
    if (window.innerHeight + window.scrollY >= doc.scrollHeight - 130) {
      const last = ids[ids.length - 1];
      if (last !== this.state.active) this.setState({ active: last });
      return;
    }
    let current = this.state.active;
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el && el.getBoundingClientRect().top < window.innerHeight * 0.4) current = id;
    }
    if (current !== this.state.active) this.setState({ active: current });
  }

  // Body scroll is locked while the dialog is open so the page behind it does not
  // drift under the overlay. The previous overflow value is restored rather than
  // hard-set to a default, since something else may legitimately own it.
  openProjectModal(key) {
    this._prevOverflow = document.body.style.overflow;
    this._prevFocus = document.activeElement;
    document.body.style.overflow = 'hidden';
    this.setState({ openProject: key });
  }

  closeProjectModal() {
    if (this.state.openProject == null) return;
    document.body.style.overflow = this._prevOverflow || '';
    this.setState({ openProject: null });
    // send focus back to whatever card opened the dialog
    if (this._prevFocus && this._prevFocus.focus) this._prevFocus.focus();
    // A search result that opened this dialog deferred its scroll until now, because
    // scrolling under an open modal is both invisible and cancelled by overflow:hidden.
    const pending = this._pendingScroll;
    this._pendingScroll = null;
    if (pending) {
      this.scrollToSection(pending);
      this.flashTarget(pending);
    }
  }

  scrollToSection(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const y = el.getBoundingClientRect().top + window.scrollY - 90;
    const smooth = !(this._reduceMotion && this._reduceMotion.matches);
    window.scrollTo({ top: y, behavior: smooth ? 'smooth' : 'auto' });
  }

  // ---- search -------------------------------------------------------------

  // No body-scroll lock here on purpose. document.body.style.overflow already has
  // exactly one owner (openProjectModal/closeProjectModal). A second owner racing
  // it eventually leaves the page permanently unscrollable.
  openSearch(triggerEl) {
    if (this.state.searchOpen) return;
    this._searchTriggerEl = triggerEl && triggerEl.focus ? triggerEl : null;
    if (!this._searchIndex) {
      this._searchIndex = SearchIndex.buildIndex(SearchIndex.buildChunks(CONTENT));
    }
    this.setState({ searchOpen: true, searchSel: -1 }, () => {
      const el = this._searchInputRef.current;
      if (el) { el.focus(); el.select(); }
    });
    this.warmModel();
  }

  closeSearch() {
    if (!this.state.searchOpen) return;
    clearTimeout(this._searchDebounce);
    // The query survives so reopening resumes where you left off.
    this.setState({ searchOpen: false, searchSel: -1 });
    const el = this._searchTriggerEl;
    this._searchTriggerEl = null;
    if (el && document.contains(el)) el.focus();
  }

  // Kicks off the model download. Never called from componentDidMount — a visitor
  // who does not search must never pay for the weights.
  warmModel() {
    if (!window.SearchModel) return;
    if (this.state.searchMode !== 'idle') return;
    this.setState({ searchMode: 'loading', searchProgress: 0 });

    const chunks = this._searchIndex.chunks;
    const pre = this.loadPrecomputedVectors(chunks);

    // Progress arrives per network chunk, far faster than is worth re-rendering
    // for. Only push a repaint on a visible move (1%) — renderVals is not cheap.
    const onProgress = (p) => {
      if (p - this.state.searchProgress < 0.01 && p < 0.99) return;
      this._safeSetState({ searchProgress: p });
    };

    window.SearchModel.ensureLoaded(onProgress)
      .then((ok) => {
        if (!this._alive) return null;
        if (!ok) { this._safeSetState({ searchMode: 'failed' }); return null; }
        // With a valid prebuilt index there is nothing to embed — the model is
        // still needed, but only to embed the query (~10ms).
        if (pre) return pre;
        // Otherwise the corpus has to be embedded before semantic ranking can
        // happen. Keep the chip busy rather than claiming readiness.
        this._safeSetState({ searchMode: 'embedding', searchProgress: 1 });
        return window.SearchModel.embed(chunks.map((c) => c.text));
      })
      .then((vecs) => {
        if (!this._alive || !vecs) return;
        this._searchEmbeddings = vecs;
        this._safeSetState({ searchMode: 'ready' });
        // Re-rank whatever is already on screen with the better signal.
        this.runSearch(this.state.searchQuery, true);
      })
      .catch(() => { this._safeSetState({ searchMode: 'failed' }); });
  }

  // Returns the prebuilt corpus vectors from search-vectors.js, or null if that file
  // is absent, malformed, or was built from different content. Every rejection is a
  // fallback to live embedding, never an error: a stale build costs ~4s, not results.
  loadPrecomputedVectors(chunks) {
    const V = window.SearchVectors;
    if (!V) return null;
    const M = window.SearchModel;
    if (V.model !== M.MODEL_ID || V.dtype !== M.DTYPE) {
      console.warn('[search] search-vectors.js was built for a different model — embedding live instead.');
      return null;
    }
    if (V.count !== chunks.length) {
      console.warn('[search] search-vectors.js has ' + V.count + ' vectors for ' + chunks.length +
        ' chunks — embedding live instead. Re-run build-vectors.html.');
      return null;
    }
    if (V.hash !== SearchIndex.corpusHash(chunks, M.MODEL_ID, M.DTYPE)) {
      console.warn('[search] site content changed since search-vectors.js was built — embedding live instead. Re-run build-vectors.html.');
      return null;
    }
    const vecs = SearchIndex.decodeVectors(V);
    if (!vecs) { console.warn('[search] search-vectors.js payload is malformed — embedding live instead.'); return null; }
    return vecs;
  }

  // Lexical always runs synchronously so something useful is on screen by the next
  // paint. The semantic pass is debounced behind it and upgrades the same list.
  runSearch(query, immediate) {
    const seq = ++this._searchSeq;
    clearTimeout(this._searchDebounce);

    const index = this._searchIndex;
    if (!index) return;

    const q = String(query || '');
    const lex = SearchIndex.lexicalScores(index, q);
    this._safeSetState({ searchResults: SearchIndex.rank(index, lex, null), searchSel: -1 });

    if (!q.trim() || !this._searchEmbeddings || this.state.searchMode !== 'ready') return;

    const run = () => {
      const cached = this._queryVecCache.get(q);
      const done = (vec) => {
        if (!this._alive || seq !== this._searchSeq || !vec) return;
        if (this._queryVecCache.size > 30) this._queryVecCache.clear();
        this._queryVecCache.set(q, vec);
        const sem = SearchIndex.semanticScores(this._searchEmbeddings, vec);
        this._safeSetState({ searchResults: SearchIndex.rank(index, lex, sem), searchSel: -1 });
      };
      if (cached) { done(cached); return; }
      window.SearchModel.embed([q]).then((v) => done(v && v[0])).catch(() => {});
    };

    if (immediate) run();
    else this._searchDebounce = setTimeout(run, 120);
  }

  onSearchInput(value) {
    this.setState({ searchQuery: value });
    this.runSearch(value);
  }

  moveSearchSel(delta) {
    const n = this.state.searchResults.length;
    if (!n) return;
    let next = this.state.searchSel + delta;
    if (next < 0) next = n - 1;
    if (next >= n) next = 0;
    this.setState({ searchSel: next });
  }

  activateResult(r) {
    if (!r) return;
    // Close first: it restores focus to the trigger, so openProjectModal's
    // _prevFocus capture grabs that rather than <body>.
    this.closeSearch();
    if (r.openProject) {
      // Don't also scroll — openProjectModal sets overflow:hidden, which kills an
      // in-flight smooth scroll. Hand it to closeProjectModal instead.
      this._pendingScroll = r.anchorId;
      this.openProjectModal(r.openProject);
    } else {
      this.scrollToSection(r.anchorId);
      this.flashTarget(r.anchorId);
    }
  }

  // Direct classList rather than React state: the six sections carry no class
  // attribute in the template, so React never writes className on them and cannot
  // clobber this. Routing it through state would re-render the whole page to
  // animate one box-shadow.
  flashTarget(id) {
    if (this._reduceMotion && this._reduceMotion.matches) return;
    const section = document.getElementById(id);
    if (!section) return;
    // A pinned track is several viewports tall, so flashing the section itself
    // would tint a box mostly off screen. The stage is what the visitor is
    // actually looking at when they land.
    const el = section.querySelector(':scope > .pin-stage') || section;
    clearTimeout(this._flashTimer);
    el.classList.remove('flash-target');
    void el.offsetWidth;               // force reflow so a repeat flash restarts
    el.classList.add('flash-target');
    this._flashTimer = setTimeout(() => el.classList.remove('flash-target'), 1400);
  }

  startLoop() {
    const draw = () => {
      this._raf = requestAnimationFrame(draw);
      const canvas = this.canvasRef.current;
      if (!canvas || !this._geom || !this._mask) return;
      const geom = this._geom;
      const ctx = canvas.getContext('2d');

      // Respect the OS-level reduce-motion setting. The swirl is a full-viewport field of
      // moving glyphs — the exact pattern that triggers vestibular symptoms. The name is
      // DOM, not canvas, so clearing here leaves the hero composed, just static. Read per
      // frame rather than cached so toggling the OS setting takes effect live, and placed
      // before the _time advance so returning to motion resumes instead of jumping.
      if (this._reduceMotion && this._reduceMotion.matches) {
        if (!this._cleared) {
          ctx.clearRect(0, 0, geom.w, geom.h);
          this._cleared = true;
        }
        return;
      }
      this._time += 0.012;

      // read scroll directly, not from state — the loop must stay smooth and
      // independent of React re-renders
      const phaseAPx = geom.h * HeroGrid.PHASE_A;
      const p1 = HeroGrid.clamp(window.scrollY / phaseAPx, 0, 1);
      const swirlAlpha = HeroGrid.alphaFor(p1);

      if (swirlAlpha <= 1e-4) {
        if (!this._cleared) {
          ctx.clearRect(0, 0, geom.w, geom.h);
          this._cleared = true;
        }
        return;
      }
      this._cleared = false;
      ctx.clearRect(0, 0, geom.w, geom.h);
      ctx.font = geom.fontSize + 'px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      for (let row = 0; row < geom.rows; row++) {
        for (let col = 0; col < geom.cols; col++) {
          if (this._mask.has(row * geom.cols + col)) continue;
          const s = HeroGrid.sample(col, row, geom, 0, this._time, swirlAlpha);
          if (!s) continue;
          ctx.fillStyle = 'rgba(248,212,136,' + s.alpha.toFixed(3) + ')';
          ctx.fillText(s.ch, col * geom.cellW, row * geom.cellH);
        }
      }
    };
    this._raf = requestAnimationFrame(draw);
  }

  render() {
    const lerp = (a, b, t) => a + (b - a) * t;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const geom = this._geom || HeroGrid.geometry(this.state.winW, this.state.winH, NAME_ASCII.split('\n'));
    const phaseAPx = this.state.winH * HeroGrid.PHASE_A;
    const p1 = clamp(this.state.scrollY / phaseAPx, 0, 1);                        // swirl rise
    const p2 = clamp((this.state.scrollY - phaseAPx) / HeroGrid.PHASE_B, 0, 1);   // name docks

    const asciiName = NAME_ASCII;
    const restLeft = geom.col0 * geom.cellW;
    const restTop = geom.row0 * geom.cellH;
    const left = lerp(restLeft, 30, p2);
    const top = lerp(restTop, 26, p2);
    const nameFontSize = lerp(geom.fontSize, HeroGrid.DOCKED_FONT, p2);
    const namePad = lerp(0, 8, p2).toFixed(1) + 'px ' + lerp(0, 10, p2).toFixed(1) + 'px';
    const namePlateBg = 'rgba(8,8,10,' + (p2 * 0.6).toFixed(3) + ')';

    const nameStyle = {
      position: 'fixed',
      left: left + 'px',
      top: top + 'px',
      transform: 'translate(0, 0)',
      zIndex: 90,
      margin: 0
    };

    const taglineOpacity = clamp(1 - p2 * 2.6, 0, 1);
    const subStyle = {
      position: 'fixed',
      left: '50%',
      top: (restTop + geom.nameH + 34) + 'px',
      transform: 'translate(-50%,0)',
      opacity: taglineOpacity,
      pointerEvents: p2 < 0.3 ? 'auto' : 'none',
      zIndex: 55
    };

    const indicatorOpacity = clamp(1 - p1 * 6, 0, 1);
    const navOpacity = clamp((p2 - 0.3) / 0.35, 0, 1);
    const navPillStyle = { opacity: navOpacity, pointerEvents: navOpacity > 0.5 ? 'auto' : 'none' };
    // spacer covers phase A only — the content then scrolls in *during* the name's dock
    const heroSpacerStyle = { position: 'relative', height: (this.state.winH + phaseAPx) + 'px', width: '100%' };

    // --- pin engine render contract ---
    // pin(id) hands each pinned section everything it needs and nothing else:
    // the track height, the custom properties the stage exposes, and a per-step
    // state. When pinning is off — narrow viewport, reduce-motion, or a failed
    // measurement — every step reports 'active', which is the finished state, so
    // the section renders as today's plain document with all of it visible.
    const pinned = this.state.pinned;
    const pinData = this.state.pins;
    // `mode` is 'accumulate' (past steps stay on stage) or 'swap' (only the
    // active step is on stage). It exists purely so inert() knows whether a past
    // step is still visible: in a swap section it is not, and something nobody
    // can see must not be clickable or reachable by Tab — the project cards are
    // role=button and tabIndex=0, so this is a real leak, not a theoretical one.
    const pin = (id, mode) => {
      const d = pinned && pinData ? pinData[id] : null;
      const swap = mode === 'swap';
      return {
        steps: PIN_SPEC[id].steps,
        trackStyle: pinned ? { height: Math.round(this.pinTrackHeight(id)) + 'px' } : null,
        stageStyle: d ? { '--pin-progress': d.p.toFixed(4), '--step-progress': d.sp.toFixed(4) } : null,
        // 'past' — already arrived and still standing. 'active' — on stage now.
        // 'future' — not yet reached, including everything before the track has
        // been entered at all (step -1).
        at: (i) => (!d ? 'active' : i < d.step ? 'past' : i === d.step ? 'active' : 'future'),
        inert: (i) => (d && (swap ? i !== d.step : i > d.step) ? '' : undefined)
      };
    };
    const pAbout = pin('about', 'accumulate');
    const pExp = pin('experience', 'swap');
    const pEdu = pin('education', 'accumulate');
    // 'accumulate', not 'swap': every card stays visible on the rail, so none of
    // them may be inert. That is also what restores the Tab route through all of
    // them, which one-card-per-stage had narrowed to whichever card was on screen.
    const pProj = pin('projects', 'accumulate');
    const pSkills = pin('skills', 'accumulate');
    // The rail's own offset. Null whenever pinning is off, which leaves the plain
    // grid in charge rather than a transform on a non-existent rail.
    const railData = pinned && pinData ? pinData.projects : null;
    const railStyle = railData && railData.railX != null
      ? { '--rail-x': railData.railX.toFixed(1) + 'px' } : null;
    // Which card is nearest centre, for emphasis. -1 before the track is entered.
    const railFocus = railData && railData.step >= 0
      ? Math.round(railData.p * (PIN_SPEC.projects.steps - 1)) : -1;

    const ids = SECTION_IDS;
    const navItems = CONTENT.sections.map((s) => ({
      id: s.id,
      href: '#' + s.id,
      label: s.label,
      active: this.state.active === s.id,
      // The gold background is the sliding .nav-indicator now, not a per-item fill.
      color: this.state.active === s.id ? '#08080a' : 'rgba(242,241,236,0.65)',
      onClick: (e) => { e.preventDefault(); this.scrollToSection(s.id); }
    }));

    // Content comes from content.js. Lists that need per-render fields are copied first —
    // the source arrays are shared with the search index and must never pick them up.
    // Experience needs none: its dom id is built inline in the JSX, so it renders
    // straight off the source array with no copy at all.
    const experience = CONTENT.experience;

    const stackHero = this.state.winW < 760;
    const projects = CONTENT.projects.map((p) => {
      const v = Object.assign({}, p);
      v.hasImage = !!p.image;
      v.onOpen = () => this.openProjectModal(p.key);
      v.onCardKey = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          if (e.key === ' ') e.preventDefault();
          this.openProjectModal(p.key);
        }
      };
      if (p.featured) {
        v.heroStyle = {
          display: 'flex', flexDirection: stackHero ? 'column' : 'row', gridColumn: '1 / -1',
          border: '1px solid rgba(255,255,255,0.1)', borderRadius: '10px', overflow: 'hidden', background: '#0e0e11'
        };
        v.heroImgWrapStyle = {
          width: stackHero ? '100%' : '42%', flex: 'none', background: '#08080a',
          borderRight: stackHero ? 'none' : '1px solid rgba(255,255,255,0.08)',
          borderBottom: stackHero ? '1px solid rgba(255,255,255,0.08)' : 'none'
        };
      }
      return v;
    });

    const featuredProjects = projects.filter((p) => p.featured);
    const gridProjects = projects.filter((p) => !p.featured);
    // Reads 01..05 while a card is on stage and 00 before the track is entered,
    // which is the honest answer rather than pretending the first one is up.
    const projActive = projects.findIndex((_, i) => pProj.at(i) === 'active');
    const projCounter = String(projActive + 1).padStart(2, '0');

    const openProj = this.state.openProject != null ? projects.find((p) => p.key === this.state.openProject) : null;
    const modal = openProj ? {
      name: openProj.name, longDesc: openProj.longDesc, highlights: openProj.highlights, tags: openProj.tags,
      link: openProj.link, image: openProj.image, imageAlt: openProj.imageAlt, year: openProj.year,
      dotColor: openProj.dotColor, hasImage: openProj.hasImage,
      close: () => this.closeProjectModal(),
      stopProp: (e) => e.stopPropagation()
    } : null;

    // flat skill groups rendered directly as chips
    const skills = CONTENT.skills;
    const skillsBlurb = CONTENT.skillsBlurb;

    const education = CONTENT.education;
    const about = CONTENT.about;
    const contact = CONTENT.contact;

    // --- search ---
    // Everything below is pure formatting. The {{ }} evaluator has no arithmetic,
    // calls, or ternaries, so every width, colour, percentage, and sentence has to
    // arrive as a finished value.
    const openSearchFromHero = (e) => { e.preventDefault(); this.openSearch(e.currentTarget); };
    const openSearchFromNav = (e) => { e.preventDefault(); this.openSearch(e.currentTarget); };
    // Width lives in .search-trigger-hero, not here — see the note in the stylesheet.
    const heroSearchStyle = {
      display: 'flex', alignItems: 'center', gap: '10px',
      background: 'rgba(10,10,13,0.9)', backdropFilter: 'blur(7px)',
      border: '1px solid rgba(255,255,255,0.07)', borderRadius: '999px',
      padding: '11px 16px 11px 20px', fontSize: '14px', color: '#f2f1ec'
    };
    const kbdHintLabel = this._isMac ? '⌘K' : 'Ctrl K';

    const DIM = 'rgba(242,241,236,0.35)';
    const MODE_TEXT = {
      idle: { label: 'keyword', color: DIM, title: 'Keyword matching' },
      loading: { label: 'keyword', color: DIM, title: 'Keyword matching — downloading the semantic model' },
      embedding: { label: 'keyword', color: DIM, title: 'Keyword matching — indexing the page' },
      failed: { label: 'keyword', color: DIM, title: 'Keyword matching — the semantic model could not be loaded' },
      ready: { label: 'semantic', color: '#f8d488', title: 'Semantic matching — meaning, not just keywords' }
    };

    let search = null;
    if (this.state.searchOpen) {
      const mode = MODE_TEXT[this.state.searchMode] || MODE_TEXT.idle;
      const q = this.state.searchQuery;
      const list = this.state.searchResults;
      const hasQuery = q.trim().length > 0;

      const results = list.map((r, i) => Object.assign({}, r, {
        domId: 'search-opt-' + i,
        // A real boolean: React renders aria-* booleans as "true"/"false" itself. The
        // hand-coercion this replaces existed only because {{ }} could not do it.
        selected: i === this.state.searchSel,
        scorePct: Math.round(Math.max(0.08, Math.min(1, r.score)) * 100),
        onActivate: () => this.activateResult(r),
        onHover: () => { if (this.state.searchSel !== i) this.setState({ searchSel: i }); }
      }));

      // The chip fills left-to-right with gold as the model downloads. A hard-stop
      // gradient rather than a child element keeps it to one node, and the whole
      // string has to be built here because {{ }} cannot do arithmetic.
      const isBusy = this.state.searchMode === 'loading' || this.state.searchMode === 'embedding';
      const pct = Math.round(Math.max(0, Math.min(1, this.state.searchProgress)) * 100);
      const modeStyle = {
        flex: 'none', fontSize: '10.5px', letterSpacing: '0.1em', padding: '3px 8px',
        borderRadius: '5px', color: mode.color, whiteSpace: 'nowrap',
        border: '1px solid ' + (this.state.searchMode === 'ready' ? 'rgba(248,212,136,0.55)' : 'rgba(255,255,255,0.12)'),
        background: this.state.searchMode === 'ready'
          ? 'rgba(248,212,136,0.16)'
          : (isBusy
            ? 'linear-gradient(90deg, rgba(248,212,136,0.34) ' + pct + '%, rgba(255,255,255,0.03) ' + pct + '%)'
            : 'transparent')
      };

      const count = results.length;
      const liveMessage = !hasQuery ? ''
        : (count === 0 ? 'No matches found.' : count + (count === 1 ? ' result' : ' results') + ' found.');

      search = {
        inputRef: this._searchInputRef,
        query: q,
        results,
        // sc-if has no else branch, so both sides of every either/or are their own flag.
        showEmpty: hasQuery && count === 0,
        showSuggestions: !hasQuery,
        emptyMessage: 'Nothing on the page matches “' + q.trim() + '”. Try a section instead:',
        sectionLinks: CONTENT.sections.map((s) => ({
          label: s.label,
          onGo: () => { this.closeSearch(); this.scrollToSection(s.id); this.flashTarget(s.id); }
        })),
        suggestions: CONTENT.suggestions.map((text) => ({
          text,
          onPick: () => {
            const el = this._searchInputRef.current;
            if (el) el.focus();
            this.onSearchInput(text);
          }
        })),
        modeLabel: mode.label,
        modeColor: mode.color,
        modeTitle: mode.title,
        modeStyle: modeStyle,
        // A constant string in an aria-live region is announced once, on the change
        // that introduced it — which is exactly the "it just got better" moment.
        modeAnnouncement: this.state.searchMode === 'ready' ? 'Semantic ranking ready.' : '',
        // aria-activedescendant must be a string, never undefined: an unresolved
        // interpolation logs a runtime warning and renders empty anyway.
        activeId: this.state.searchSel >= 0 ? 'search-opt-' + this.state.searchSel : '',
        liveMessage,
        footerHint: count > 0 ? '↑↓ to navigate · ↵ to jump · esc to close' : 'esc to close',
        onInput: (e) => this.onSearchInput(e.target.value),
        onKeyDown: (e) => {
          // Arrow handling lives on the input, not the window listener — a global
          // ArrowDown would hijack page scrolling everywhere else on the site.
          if (e.key === 'ArrowDown') { e.preventDefault(); this.moveSearchSel(1); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); this.moveSearchSel(-1); }
          else if (e.key === 'Enter') {
            e.preventDefault();
            const sel = this.state.searchSel;
            this.activateResult(this.state.searchResults[sel >= 0 ? sel : 0]);
          }
        },
        // Rows activate on click, but mousedown would blur the input first and the
        // palette would flicker. Swallowing mousedown is the standard combobox fix.
        holdFocus: (e) => e.preventDefault(),
        onBackdrop: () => this.closeSearch(),
        stopProp: (e) => e.stopPropagation()
      };
    }

    // --- nav neural-network layer strip: one layer per section, traversed on scroll ---
    const layerCounts = [3, 4, 4, 3, 5, 2];
    const activeIndex = Math.max(0, ids.indexOf(this.state.active));
    const netW = 60;
    const netH = Math.max(360, this.state.winH - 190);
    const startY = 10;
    const endY = netH - 10;
    const gap = (endY - startY) / (layerCounts.length - 1);
    const netLayerPts = layerCounts.map((n, li) => {
      const y = startY + gap * li;
      return Array.from({ length: n }, (_, i) => ({ y, x: 8 + ((netW - 16) / (n + 1)) * (i + 1) }));
    });
    // continuous traversal: signal travels along each edge, then the next layer's nodes light up
    const flow = clamp(this.state.flow || 0, 0, layerCounts.length - 1);
    const netNodes = [], netEdges = [], netPulses = [];
    netLayerPts.forEach((layer, li) => {
      // a layer charges as the signal arriving from the previous layer completes
      const charge = li === 0 ? clamp(flow / 0.35, 0, 1) : clamp((flow - (li - 1) - 0.6) / 0.4, 0, 1);
      const cur = Math.abs(flow - li) < 0.5;
      layer.forEach((pt) => {
        netNodes.push({
          x: pt.x, y: pt.y,
          r: 2.4 + charge * 1.2,
          fill: charge < 0.02 ? 'rgba(242,241,236,0.16)'
            : 'rgba(' + Math.round(248 + 7 * charge) + ',' + Math.round(212 + 31 * charge) + ',' + Math.round(136 + 68 * charge) + ',' + (0.25 + 0.75 * charge) + ')',
          glowR: cur ? 4 + charge * 5 : 0,
          glowFill: cur ? 'rgba(248,212,136,' + (0.2 * charge).toFixed(3) + ')' : 'transparent'
        });
      });
      if (li < netLayerPts.length - 1) {
        const t = clamp(flow - li, 0, 1);
        const nextLayer = netLayerPts[li + 1];
        layer.forEach((a) => nextLayer.forEach((b) => {
          netEdges.push({
            x1: a.x, y1: a.y, x2: b.x, y2: b.y,
            stroke: 'rgba(242,241,236,0.5)',
            opacity: t > 0 ? 0.1 + 0.08 * t : 0.07
          });
          if (t > 0.01) {
            netPulses.push({
              x1: a.x, y1: a.y,
              x2: a.x + (b.x - a.x) * t, y2: a.y + (b.y - a.y) * t,
              opacity: (0.55 * Math.min(1, t * 3)).toFixed(3)
            });
          }
        }));
      }
    });
    const netStripStyle = {
      position: 'fixed', top: '96px', left: '38px', width: netW + 'px', height: netH + 'px',
      // above the content layer (z-index 10) — that layer is opaque #08080a and would
      // otherwise paint straight over the strip. Safe: it sits in the empty margin
      // beside the 900px content column, and is pointer-transparent.
      zIndex: 20, opacity: clamp((p2 - 0.94) / 0.06, 0, 1) * 0.45, pointerEvents: 'none',
      display: this.state.winW < 900 ? 'none' : 'block'
    };

    return (
      <div className={pinned ? 'page-root js-pin' : 'page-root'}>

        <canvas ref={this.canvasRef} className="bg-canvas"></canvas>

        {/* FIXED IDENTITY (name shrinks + travels to top-left on scroll) */}
        <div style={nameStyle}>
          <pre aria-hidden="true" className="ascii-name" style={{ fontSize: `${nameFontSize}px`, padding: namePad, background: namePlateBg }}>{asciiName}</pre>
          <h1 className="sr-only">Joseph DiPietro</h1>
        </div>

        <div style={subStyle}>
          <div className="hero-stack">
            <div className="hero-badge">&gt;&gt; class: computer_science <span className="text-gold">//</span> track: systems + AI</div>

            <button className="search-trigger search-trigger-hero" onClick={openSearchFromHero} aria-label="Search this site" aria-keyshortcuts="Control+K Meta+K" style={heroSearchStyle}>
              <span aria-hidden="true" className="hero-search-chevron">&gt;</span>
              <span className="hero-search-placeholder">ask anything about my work</span>
              <span className="search-kbd" aria-hidden="true">{kbdHintLabel}</span>
            </button>

            <div className="hero-cta-row">
              <a href="#contact" className="btn-primary">./resume.pdf</a>
              <a href="#projects" className="btn-secondary">view projects</a>
            </div>
          </div>
        </div>

        {/* NEURAL LAYER STRIP (scroll traverses the network) */}
        <div style={netStripStyle}>
          <svg width={netW} height={netH} className="net-svg">
            {netEdges.map((e, i) => <React.Fragment key={i}>
              <line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} stroke={e.stroke} strokeOpacity={e.opacity} strokeWidth="0.75"></line>
            </React.Fragment>)}
            {netPulses.map((s, i) => <React.Fragment key={i}>
              <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} stroke="#f8d488" strokeOpacity={s.opacity} strokeWidth="1.1" strokeLinecap="round"></line>
            </React.Fragment>)}
            {netNodes.map((n, i) => <React.Fragment key={i}>
              <circle cx={n.x} cy={n.y} r={n.glowR} fill={n.glowFill}></circle>
              <circle cx={n.x} cy={n.y} r={n.r} fill={n.fill}></circle>
            </React.Fragment>)}
          </svg>
        </div>

        {/* FLOATING NAV PILL */}
        <div className="nav-pill" style={navPillStyle} ref={this._navPillRef}>
          {/* One marker that slides between the six section links, rather than six
              backgrounds flipping on and off. Positioned by syncNavIndicator();
              it carries no text, so it is decoration to assistive tech. Sized to
              zero until the first measurement so it never flashes at full width. */}
          <span className="nav-indicator" aria-hidden="true" ref={this._navIndicatorRef}></span>
          {navItems.map((item, i) => <React.Fragment key={i}>
            <a href={item.href} onClick={item.onClick} data-nav-item className="nav-pill-item" style={{ color: item.color }}>{item.label}</a>
          </React.Fragment>)}
          <button className="search-trigger nav-search-trigger" onClick={openSearchFromNav} aria-label="Search this site" aria-keyshortcuts="Control+K Meta+K">
            <span aria-hidden="true" className="chevron-gold">&gt;</span>
            <span className="search-nav-label" aria-hidden="true">Search</span>
          </button>
          <a href="#contact" className="btn-nav-resume">Resume</a>
        </div>

        {/* HERO */}
        <section ref={this.heroRef} style={heroSpacerStyle}>
          <div className="scroll-indicator" style={{ opacity: indicatorOpacity }}>
            <div className="scroll-indicator-label">SCROLL</div>
            <div className="scroll-indicator-arrow">↓</div>
          </div>
        </section>

        <div className="content-wrap">

          {/* ABOUT — accumulate: the console opens, then it logs a line. */}
          <section id="about" className="section section--about pin-track" style={pAbout.trackStyle}>
            <div className="pin-stage" style={pAbout.stageStyle}>
              <div className="pin-inner">
                <div className="section-kicker">SYS.01 // IDENTITY</div>
                <h2 className="sr-only">About</h2>
                <div className="panel">
                  <div className="pin-step about-step-titlebar" data-pin={pAbout.at(0)} inert={pAbout.inert(0)}>
                    <div className="panel-titlebar">
                      <div className="titlebar-dot"></div>
                      <div className="titlebar-dot"></div>
                      <div className="titlebar-dot"></div>
                      <div className="titlebar-label">identity.log</div>
                    </div>
                  </div>
                  <div className="about-body">
                    <div className="pin-step about-step-body" data-pin={pAbout.at(0)} inert={pAbout.inert(0)}>
                      <div className="text-cream">{about.headline}</div>
                      {about.paragraphs.map((para, i) => <React.Fragment key={i}>
                        <p className="about-para">{para}</p>
                      </React.Fragment>)}
                    </div>
                    <div className="pin-step about-step-status" data-pin={pAbout.at(1)} inert={pAbout.inert(1)}>
                      {/* The status is a log line, so it types out. The reveal is
                          scroll-linked rather than timed: you scrub it out, which
                          is both more interesting and needs no timer to clean up. */}
                      <p className="about-status">
                        <span className="about-status-wrap">
                          <span className="about-status-type">{about.status}</span>
                          <span className="blink-cursor about-status-cursor">_</span>
                        </span>
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* EXPERIENCE — swap: one job on stage, the rail beside it showing
              where you are. The three jobs total more than a viewport, so they
              cannot coexist on a pinned stage; swapping is what makes it work. */}
          <section id="experience" className="section pin-track" style={pExp.trackStyle}>
            <div className="pin-stage" style={pExp.stageStyle}>
              <div className="pin-inner">
                <div className="section-kicker">SYS.02 // EXPERIENCE</div>
                <h2 className="section-title">Work Experience</h2>
                <div className="timeline exp-timeline">
                  {/* The rail persists across the whole track. It is a position
                      indicator, and the per-item dots below say the same thing,
                      so those are hidden while pinned rather than duplicated. */}
                  <div className="exp-rail" aria-hidden="true">
                    {experience.map((job, i) => <React.Fragment key={job.id}>
                      <div className="exp-rail-dot" data-pin={pExp.at(i)} style={{ '--dot-color': job.dotColor }}></div>
                    </React.Fragment>)}
                  </div>
                  <div className="exp-stack">
                    {experience.map((job, i) => <React.Fragment key={i}>
                      <div id={`job-${job.id}`} className="timeline-item pin-step exp-step" data-pin={pExp.at(i)} inert={pExp.inert(i)}>
                        <div className="timeline-dot" style={{ background: job.dotColor }}></div>
                        <div className="timeline-range">{job.range}</div>
                        <div className="timeline-role">{job.role}</div>
                        <div className="timeline-org" style={{ color: job.dotColor }}>{job.org}</div>
                        <div className="timeline-bullets">
                          {job.bullets.map((b, i) => <React.Fragment key={i}>
                            <div className="timeline-bullet">
                              <span className="bullet-marker">›</span>{b}
                            </div>
                          </React.Fragment>)}
                        </div>
                        <div className="tag-row">
                          {job.tags.map((tag, i) => <React.Fragment key={i}>
                            <span className="tag">{tag}</span>
                          </React.Fragment>)}
                        </div>
                      </div>
                    </React.Fragment>)}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* EDUCATION — accumulate: the record prints, then the GPA fills.
              pin-step goes straight onto the two grid children rather than onto
              wrappers around them, so .edu-json keeps being the grid cell and its
              full-height divider border still spans the row. */}
          <section id="education" className="section pin-track" style={pEdu.trackStyle}>
            <div className="pin-stage" style={pEdu.stageStyle}>
              <div className="pin-inner">
                <div className="section-kicker">SYS.03 // EDUCATION</div>
                <h2 className="section-title">Education</h2>
                <div className="edu-grid">
                  <div className="edu-json pin-step" data-pin={pEdu.at(0)} inert={pEdu.inert(0)}>
                    <div style={{ '--i': 0 }}><span className="edu-punct">{'{'}</span></div>
                    <div className="edu-field" style={{ '--i': 1 }}><span className="edu-key">"institution"</span>: <span className="text-gold">"{education.institution}"</span>,</div>
                    <div className="edu-field" style={{ '--i': 2 }}><span className="edu-key">"degree"</span>: <span className="text-gold">"{education.degree}"</span>,</div>
                    <div className="edu-field" style={{ '--i': 3 }}><span className="edu-key">"focus"</span>: <span className="text-gold">"{education.focus}"</span>,</div>
                    <div className="edu-field" style={{ '--i': 4 }}><span className="edu-key">"graduation"</span>: <span className="text-gold">"{education.graduation}"</span>,</div>
                    <div className="edu-field" style={{ '--i': 5 }}><span className="edu-key">"honors"</span>: <span className="text-gold">"{education.honors}"</span>,</div>
                    <div className="edu-field" style={{ '--i': 6 }}><span className="edu-key">"coursework"</span>: [</div>
                    {education.coursework.map((c, i) => <React.Fragment key={i}>
                      <div className="edu-array-item" style={{ '--i': 7 + i }}><span className="text-gold">"{c}"</span>,</div>
                    </React.Fragment>)}
                    <div className="edu-field" style={{ '--i': 7 + education.coursework.length }}>]</div>
                    <div style={{ '--i': 8 + education.coursework.length }}><span className="edu-punct">{'}'}</span></div>
                  </div>
                  <div className="edu-gpa-col pin-step" data-pin={pEdu.at(1)} inert={pEdu.inert(1)}>
                    <div className="edu-gpa-label">GPA</div>
                    <div className="edu-gpa-row">
                      <div className="edu-gpa-value">{education.gpa}</div>
                    </div>
                    <div className="progress-track">
                      <div className="progress-fill" style={{ width: `${education.gpaPct}%` }}></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* PROJECTS — swap: one card at a time, each large enough to read.
              This is the section that fits worst as a grid (over three viewports)
              and the one that gains most from getting a whole stage per card.
              Step index is the project's position in the full 5-item array, which
              featuredProjects (0,1) and gridProjects (2,3,4) partition in order. */}
          <section id="projects" className="section section--wide pin-track" style={pProj.trackStyle}>
            <div className="pin-stage" style={pProj.stageStyle}>
              <div className="pin-inner">
                <div className="section-kicker">SYS.04 // PROJECTS</div>
                <h2 className="section-title">Project Work</h2>
                <div className="project-grid">

              {featuredProjects.map((proj, i) => <React.Fragment key={i}>
                <div className="proj-card pin-step" data-pin={pProj.at(i)} inert={pProj.inert(i)} role="button" tabIndex={0} onClick={proj.onOpen} onKeyDown={proj.onCardKey} style={proj.heroStyle}>
                  <div className="proj-pin-imgwrap" style={proj.heroImgWrapStyle}>
                    <img src={proj.image} alt={proj.imageAlt} className="proj-hero-img" />
                  </div>
                  <div className="proj-hero-body">
                    <div className="proj-title-row">
                      <div className="proj-dot" style={{ background: proj.dotColor }}></div>
                      <div className="proj-name">{proj.name}</div>
                      <div className="proj-year">{proj.year}</div>
                    </div>
                    <div className="proj-desc">{proj.desc}</div>
                    <div className="tag-row">
                      {proj.tags.map((tag, j) => <React.Fragment key={j}>
                        <span className="tag">{tag}</span>
                      </React.Fragment>)}
                    </div>
                    <div className="proj-open-link" style={{ color: proj.dotColor }}>open details →</div>
                  </div>
                </div>
              </React.Fragment>)}

              {gridProjects.map((proj, i) => <React.Fragment key={i}>
                <div className="proj-card panel proj-grid-card pin-step" data-pin={pProj.at(featuredProjects.length + i)} inert={pProj.inert(featuredProjects.length + i)} role="button" tabIndex={0} onClick={proj.onOpen} onKeyDown={proj.onCardKey}>
                  <div className="proj-card-titlebar">
                    <div className="proj-dot-sm" style={{ background: proj.dotColor }}></div>
                    <div className="proj-card-title">{proj.name}</div>
                  </div>
                  {proj.hasImage ? <>
                    <img src={proj.image} alt={proj.imageAlt} className="proj-card-img" />
                  </> : <>
                    {/* One project has no screenshot. On the grid that's fine —
                        the card is short. On a full stage it would read as a
                        missing asset, so a stand-in holds the slot. Pin-only. */}
                    <div className="proj-card-img proj-pin-noimage-fill" aria-hidden="true" style={{ color: proj.dotColor }}>
                      <span className="proj-pin-noimage-glyph">{'</>'}</span>
                    </div>
                  </>}
                  <div className="proj-card-body">
                    <div className="proj-card-desc">{proj.desc}</div>
                    <div className="tag-row">
                      {proj.tags.map((tag, j) => <React.Fragment key={j}>
                        <span className="tag">{tag}</span>
                      </React.Fragment>)}
                    </div>
                    <div className="proj-open-link-sm" style={{ color: proj.dotColor }}>open details →</div>
                  </div>
                </div>
              </React.Fragment>)}

                </div>

                {/* Position indicator, pin-only. Five dots in each project's own
                    colour plus a counter, so it's obvious how many are left. */}
                <div className="proj-pin-progress" aria-hidden="true">
                  <div className="proj-pin-dots">
                    {projects.map((proj, i) => <React.Fragment key={i}>
                      <span className={pProj.at(i) === 'active' ? 'proj-pin-dot is-active' : 'proj-pin-dot'} style={{ background: proj.dotColor }}></span>
                    </React.Fragment>)}
                  </div>
                  <div className="proj-pin-counter">{projCounter} / {String(pProj.steps).padStart(2, '0')}</div>
                </div>

              </div>
            </div>
          </section>


          {/* SKILLS — accumulate: three groups in turn, chips staggering within
              each. Stagger inside one list is legitimate; it's the same entrance
              on every section that reads as generated. */}
          <section id="skills" className="section pin-track" style={pSkills.trackStyle}>
            <div className="pin-stage" style={pSkills.stageStyle}>
              <div className="pin-inner">
                <div className="section-kicker">SYS.05 // SKILLS</div>
                <h2 className="section-title section-title--tight">Skills</h2>
                <div className="skills-blurb">{skillsBlurb}</div>

                <div className="skills-groups">
                  {skills.map((g, i) => <React.Fragment key={i}>
                    <div className="pin-step skills-step" data-pin={pSkills.at(i)} inert={pSkills.inert(i)}>
                      <div className="skills-group-title">{g.title}</div>
                      <div className="tag-row">
                        {g.items.map((s, j) => <React.Fragment key={j}>
                          <span className="skill-chip" style={{ '--i': j }}>{s}</span>
                        </React.Fragment>)}
                      </div>
                    </div>
                  </React.Fragment>)}
                </div>
              </div>
            </div>
          </section>

          {/* CONTACT */}
          <section id="contact" className="section section--contact">
            <div className="section-kicker">SYS.06 // CONTACT</div>
            <h2 className="contact-title">{contact.headline}</h2>
            <p className="contact-blurb">{contact.blurb}</p>
            <div className="contact-links">
              <a href={`mailto:${contact.email}`} className="contact-email-btn">{contact.email}</a>
              {contact.links.map((l, i) => <React.Fragment key={i}>
                <a href={l.href} className="contact-link-btn">{l.label}</a>
              </React.Fragment>)}
            </div>
            <div className="contact-footer">{contact.footer}</div>
          </section>

        </div>

        {/* Overlays live OUTSIDE the content wrapper above. That wrapper is
             position:relative + z-index:10, which makes it a stacking context: anything
             inside it is trapped below the fixed name plate (z-index 90) however high its
             own z-index is. Both of these are position:fixed and belong to the page, not
             to the content column. */}
        {/* SEARCH PALETTE — z-index 190, deliberately below the project modal's 200 so a
             result that opens a project stacks correctly and Escape unwinds in order. */}
        {search ? <>
          <div onClick={search.onBackdrop} className="search-backdrop">
            <div className="search-pop search-panel" onClick={search.stopProp}>

              <div className="search-header">
                <span aria-hidden="true" className="chevron-gold">&gt;</span>
                <input className="search-input" ref={search.inputRef} type="text" role="combobox"
                       value={search.query} onChange={search.onInput} onKeyDown={search.onKeyDown}
                       placeholder="ask anything about my work" aria-label="Search this site"
                       aria-expanded="true" aria-controls="search-listbox" aria-autocomplete="list"
                       aria-activedescendant={search.activeId}
                       autoComplete="off" autoCorrect="off" spellCheck={false} />
                <span className="search-mode-chip" title={search.modeTitle} style={search.modeStyle}>{search.modeLabel}</span>
              </div>

              <div id="search-listbox" role="listbox" aria-label="Search results" className="search-listbox">
                {search.results.map((r, i) => <React.Fragment key={i}>
                  <div className="search-row" id={r.domId} role="option" aria-selected={r.selected}
                       onMouseDown={search.holdFocus} onClick={r.onActivate} onMouseEnter={r.onHover}>
                    <div className="label-kicker-sm">{r.kicker}</div>
                    <div className="search-result-title">{r.title}</div>
                    <div className="search-result-snippet">{r.snippet}</div>
                    <div className="search-score-track">
                      <div className="search-score-fill" style={{ width: `${r.scorePct}%` }}></div>
                    </div>
                  </div>
                </React.Fragment>)}
              </div>

              {search.showEmpty ? <>
                <div className="search-empty">
                  <div className="search-empty-msg">{search.emptyMessage}</div>
                  <div className="tag-row">
                    {search.sectionLinks.map((s, i) => <React.Fragment key={i}>
                      <button className="search-chip skill-chip" onClick={s.onGo}>{s.label}</button>
                    </React.Fragment>)}
                  </div>
                </div>
              </> : null}

              {search.showSuggestions ? <>
                <div className="search-suggestions">
                  <div className="search-suggestions-label">TRY ASKING</div>
                  <div className="search-suggestions-list">
                    {search.suggestions.map((s, i) => <React.Fragment key={i}>
                      <button className="search-chip suggestion-chip" onClick={s.onPick}>{s.text}</button>
                    </React.Fragment>)}
                  </div>
                </div>
              </> : null}

              <div className="search-footer">{search.footerHint}</div>
              <div className="sr-only" role="status" aria-live="polite">{search.liveMessage}</div>
              <div className="sr-only" role="status" aria-live="polite">{search.modeAnnouncement}</div>
            </div>
          </div>
        </> : null}

        {modal ? <>
          <div onClick={modal.close} className="modal-backdrop">
            <div role="dialog" aria-modal="true" aria-label={modal.name} onClick={modal.stopProp} className="modal-dialog">
              <div className="modal-header">
                <div className="modal-dot" style={{ background: modal.dotColor }}></div>
                <div className="modal-title">{modal.name}</div>
                <div className="modal-year">{modal.year}</div>
                <button className="modal-close" aria-label="Close" onClick={modal.close}>×</button>
              </div>
              {modal.hasImage ? <>
                <img src={modal.image} alt={modal.imageAlt} className="modal-img" />
              </> : null}
              <div className="modal-body">
                <p className="modal-desc">{modal.longDesc}</p>
                <div className="modal-section-label">WHAT'S IN IT</div>
                <div className="modal-highlights">
                  {modal.highlights.map((h, i) => <React.Fragment key={i}>
                    <div className="modal-highlight">
                      <span className="bullet-marker">›</span>{h}
                    </div>
                  </React.Fragment>)}
                </div>
                <div className="modal-tags">
                  {modal.tags.map((tag, i) => <React.Fragment key={i}>
                    <span className="tag--modal">{tag}</span>
                  </React.Fragment>)}
                </div>
                <a href={modal.link} className="modal-cta">view source →</a>
              </div>
            </div>
          </div>
        </> : null}

      </div>
    );
  }
}
