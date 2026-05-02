// Bottle — a private ritual.
// Single-page app, vanilla JS, persisted in localStorage.

(() => {
  'use strict';

  const STORAGE_KEY = 'bottle.state.v1';
  const TARGET = 100;
  const SKETCHFAB_SRC =
    'https://sketchfab.com/models/317ee8ebb8ef4bad8d239e544cce81d3/embed' +
    '?autostart=1&ui_infos=0&ui_controls=0&ui_watermark=0&ui_help=0' +
    '&ui_inspector=0&ui_stop=0&ui_annotations=0&ui_animations=0' +
    '&ui_settings=0&ui_vr=0&ui_fullscreen=0&ui_general_controls=0' +
    '&ui_loading=0&transparent=1&dnt=1';

  const buildBottleEmbed = ({ lazy = false, large = false } = {}) => {
    const iframe = document.createElement('iframe');
    iframe.title = 'Message in a Bottle';
    iframe.allow = 'autoplay; fullscreen; xr-spatial-tracking';
    iframe.setAttribute('allowfullscreen', '');
    iframe.setAttribute('mozallowfullscreen', 'true');
    iframe.setAttribute('webkitallowfullscreen', 'true');
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('execution-while-out-of-viewport', '');
    iframe.setAttribute('execution-while-not-rendered', '');
    iframe.className = 'bottle-frame' + (large ? ' bottle-frame-large' : '');
    if (lazy) iframe.dataset.src = SKETCHFAB_SRC;
    else iframe.src = SKETCHFAB_SRC;
    return iframe;
  };

  // ---------- Storage ----------

  const loadState = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { bottles: [], activeId: null };
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.bottles)) return { bottles: [], activeId: null };
      return parsed;
    } catch {
      return { bottles: [], activeId: null };
    }
  };

  const saveState = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore quota / privacy mode
    }
  };

  let state = loadState();

  // ---------- Helpers ----------

  const uid = () =>
    'b_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  const getBottle = (id) => state.bottles.find((b) => b.id === id);

  const formatDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  // Normalize for flexible matching: collapse whitespace, drop trailing punctuation,
  // case-insensitive. Keeps the ritual honest but forgives minor slips.
  const normalize = (s) =>
    (s || '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[.,!?;:"'`]+$/g, '')
      .toLowerCase();

  const microcopyFor = (count) => {
    if (count === 0) return 'Begin.';
    if (count >= TARGET) return 'Complete.';
    if (count >= TARGET - 10) return 'Last 10.';
    if (count === Math.floor(TARGET / 2)) return "You're halfway there.";
    if (count > TARGET / 2) return 'Keep going.';
    return 'Write it again.';
  };

  // ---------- Routing (hash-based) ----------

  // Routes:
  //   #/           → shelf
  //   #/new        → create
  //   #/write/:id  → writing session
  //   #/seal/:id   → completion / seal
  //   #/bottle/:id → sealed detail

  const navigate = (path) => {
    if (location.hash !== '#' + path) {
      location.hash = path;
    } else {
      render();
    }
  };

  const parseRoute = () => {
    const hash = location.hash.replace(/^#/, '') || '/';
    const parts = hash.split('/').filter(Boolean);
    if (parts.length === 0) return { name: 'shelf' };
    const [head, id] = parts;
    if (head === 'new') return { name: 'create' };
    if (head === 'write' && id) return { name: 'write', id };
    if (head === 'seal' && id) return { name: 'seal', id };
    if (head === 'bottle' && id) return { name: 'detail', id };
    return { name: 'shelf' };
  };

  // ---------- Rendering ----------

  const app = document.getElementById('app');

  const useTemplate = (id) => {
    const tpl = document.getElementById(id);
    return tpl.content.cloneNode(true);
  };

  const mount = (node) => {
    app.replaceChildren(node);
  };

  const render = () => {
    const route = parseRoute();
    switch (route.name) {
      case 'shelf':  return renderShelf();
      case 'create': return renderCreate();
      case 'write':  return renderWrite(route.id);
      case 'seal':   return renderSeal(route.id);
      case 'detail': return renderDetail(route.id);
    }
  };

  // ----- Shelf -----

  const renderShelf = () => {
    const node = useTemplate('tpl-shelf');
    const root = document.createElement('div');
    root.appendChild(node);

    const empty = root.querySelector('[data-empty]');
    const grid = root.querySelector('[data-grid]');

    // Wire top buttons + empty CTA
    root.querySelectorAll('[data-action="new-bottle"]').forEach((b) => {
      b.addEventListener('click', () => navigate('/new'));
    });

    // Build list: drafts/active first (resumable), then sealed in reverse-seal order.
    const sealed = state.bottles
      .filter((b) => b.status === 'sealed')
      .sort((a, b) => new Date(b.sealedAt) - new Date(a.sealedAt));
    const inProgress = state.bottles
      .filter((b) => b.status !== 'sealed')
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    const all = [...inProgress, ...sealed];

    if (all.length === 0) {
      empty.hidden = false;
      grid.hidden = true;
    } else {
      empty.hidden = true;
      grid.hidden = false;

      // Lazy-load Sketchfab iframes only when their slide is on/near screen.
      const observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const iframe = entry.target;
          if (iframe.dataset.src && !iframe.src) {
            iframe.src = iframe.dataset.src;
          }
          observer.unobserve(iframe);
        }
      }, { root: grid, threshold: 0.4 });

      for (const b of all) {
        const card = buildBottleCard(b);
        grid.appendChild(card);
        const iframe = card.querySelector('iframe');
        if (iframe) observer.observe(iframe);
      }
    }

    mount(root);
  };

  const buildBottleCard = (b) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'bottle-card';
    const title = b.title?.trim() || b.statement;
    const isSealed = b.status === 'sealed';
    card.setAttribute('aria-label',
      isSealed ? `Sealed bottle: ${title}` : `Continue writing: ${title} (${b.completedCount}/${TARGET})`
    );

    const stage = document.createElement('div');
    stage.className = 'bottle-stage';
    stage.appendChild(buildBottleEmbed({ lazy: true }));
    card.appendChild(stage);

    const t = document.createElement('div');
    t.className = 'card-title';
    t.textContent = title;
    card.appendChild(t);

    const d = document.createElement('div');
    d.className = 'card-date';
    d.textContent = isSealed
      ? formatDate(b.sealedAt)
      : `${b.completedCount}/${TARGET}`;
    card.appendChild(d);

    // Clicks on the iframe stay inside its document and don't bubble out,
    // so this fires only for the title, date, and surrounding card padding —
    // exactly the affordance we want.
    card.addEventListener('click', () => {
      if (isSealed) navigate(`/bottle/${b.id}`);
      else if (b.completedCount >= TARGET) navigate(`/seal/${b.id}`);
      else navigate(`/write/${b.id}`);
    });

    return card;
  };

  // ----- Create -----

  const renderCreate = () => {
    const node = useTemplate('tpl-create');
    const root = document.createElement('div');
    root.appendChild(node);

    root.querySelector('[data-action="back"]').addEventListener('click', () => navigate('/'));

    const form = root.querySelector('[data-create-form]');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const statement = String(fd.get('statement') || '').trim();
      const title = String(fd.get('title') || '').trim();
      if (!statement) return;

      const bottle = {
        id: uid(),
        statement,
        title,
        createdAt: new Date().toISOString(),
        sealedAt: null,
        status: 'active',
        completedCount: 0,
        entries: [],
      };
      state.bottles.push(bottle);
      state.activeId = bottle.id;
      saveState();
      navigate(`/write/${bottle.id}`);
    });

    mount(root);

    // focus statement after paint
    requestAnimationFrame(() => {
      form.querySelector('textarea[name="statement"]').focus();
    });
  };

  // ----- Write -----

  const renderWrite = (id) => {
    const bottle = getBottle(id);
    if (!bottle) return navigate('/');
    if (bottle.status === 'sealed') return navigate(`/bottle/${id}`);
    if (bottle.completedCount >= TARGET) return navigate(`/seal/${id}`);

    const node = useTemplate('tpl-write');
    const root = document.createElement('div');
    root.appendChild(node);

    root.querySelector('[data-action="back-shelf"]').addEventListener('click', () => navigate('/'));
    root.querySelector('[data-bottle-title]').textContent = bottle.title?.trim() || 'Bottle';
    root.querySelector('[data-statement]').textContent = bottle.statement;

    const counterEl = root.querySelector('[data-counter]');
    const microEl = root.querySelector('[data-microcopy]');
    const fillEl = root.querySelector('[data-fill]');
    const input = root.querySelector('[data-entry-input]');
    const errorEl = root.querySelector('[data-error]');
    const form = root.querySelector('[data-write-form]');

    const updateProgress = () => {
      counterEl.textContent = `${bottle.completedCount} / ${TARGET}`;
      microEl.textContent = microcopyFor(bottle.completedCount);
      fillEl.style.width = `${(bottle.completedCount / TARGET) * 100}%`;
    };
    updateProgress();

    // Block paste / drop / autofill.
    const blockEvent = (e) => {
      e.preventDefault();
      flashError('Type the statement.');
    };
    input.addEventListener('paste', blockEvent);
    input.addEventListener('drop', blockEvent);
    input.addEventListener('dragover', (e) => e.preventDefault());

    let errorTimer = null;
    const flashError = (msg) => {
      errorEl.textContent = msg;
      input.classList.add('input-error');
      clearTimeout(errorTimer);
      errorTimer = setTimeout(() => {
        errorEl.textContent = '';
        input.classList.remove('input-error');
      }, 1400);
    };

    input.addEventListener('input', () => {
      if (errorEl.textContent) {
        errorEl.textContent = '';
        input.classList.remove('input-error');
      }
    });

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = input.value;
      const target = bottle.statement;

      if (normalize(text) !== normalize(target)) {
        flashError(text.trim() ? "Doesn't match. Try again." : 'Type the statement.');
        input.focus();
        input.select();
        return;
      }

      bottle.entries.push({
        id: uid(),
        bottleId: bottle.id,
        text: text.trim(),
        createdAt: new Date().toISOString(),
        index: bottle.completedCount + 1,
      });
      bottle.completedCount += 1;
      saveState();

      input.value = '';
      updateProgress();

      if (bottle.completedCount >= TARGET) {
        navigate(`/seal/${bottle.id}`);
      } else {
        input.focus();
      }
    });

    mount(root);

    requestAnimationFrame(() => input.focus());
  };

  // ----- Seal -----

  const renderSeal = (id) => {
    const bottle = getBottle(id);
    if (!bottle) return navigate('/');
    if (bottle.status === 'sealed') return navigate(`/bottle/${id}`);
    if (bottle.completedCount < TARGET) return navigate(`/write/${id}`);

    const node = useTemplate('tpl-complete');
    const root = document.createElement('div');
    root.appendChild(node);

    root.querySelector('[data-statement]').textContent = bottle.statement;
    root.querySelector('[data-seal-bottle]').appendChild(buildBottleEmbed({ large: true }));

    const stage = root.querySelector('.seal-stage');
    const sealBtn = root.querySelector('[data-action="seal"]');

    sealBtn.addEventListener('click', () => {
      if (sealBtn.disabled) return;
      sealBtn.disabled = true;
      stage.classList.add('sealing');

      // After the rolling animation, persist + navigate.
      setTimeout(() => {
        bottle.status = 'sealed';
        bottle.sealedAt = new Date().toISOString();
        saveState();
        navigate(`/bottle/${bottle.id}`);
      }, 950);
    });

    mount(root);
  };

  // ----- Detail -----

  const renderDetail = (id) => {
    const bottle = getBottle(id);
    if (!bottle) return navigate('/');

    const node = useTemplate('tpl-detail');
    const root = document.createElement('div');
    root.appendChild(node);

    root.querySelector('[data-action="back-shelf"]').addEventListener('click', () => navigate('/'));
    root.querySelector('[data-detail-bottle]').appendChild(buildBottleEmbed({ large: true }));
    root.querySelector('[data-title]').textContent = bottle.title?.trim() || '';
    root.querySelector('[data-statement]').textContent = bottle.statement;
    root.querySelector('[data-started]').textContent = formatDate(bottle.createdAt);
    root.querySelector('[data-sealed]').textContent = formatDate(bottle.sealedAt);
    root.querySelector('[data-count]').textContent = `${bottle.completedCount} / ${TARGET}`;

    mount(root);
  };

  // ---------- Bootstrap ----------

  window.addEventListener('hashchange', render);

  if (!location.hash) location.hash = '#/';
  render();
})();
