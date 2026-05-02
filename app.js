// Bottle — a private ritual.
// Single-page app, vanilla JS, persisted in localStorage.

(() => {
  'use strict';

  const STORAGE_KEY = 'bottle.state.v1';
  const TARGET = 100;

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

      for (const b of all) {
        grid.appendChild(buildBottleCard(b));
      }
    }

    mount(root);
  };

  const REST_ROT_Y = -15;
  const REST_TILT = -4;

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

    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', '0 0 80 120');
    svg.setAttribute('class', 'bottle-svg' + (isSealed ? ' sealed' : ''));
    const use = document.createElementNS(svgNS, 'use');
    use.setAttribute('href', '#bottle-shape');
    svg.appendChild(use);
    stage.appendChild(svg);
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

    // ----- Drag-to-rotate (per card) -----
    let dragging = false;
    let didDrag = false;
    let startX = 0;
    let startRotY = REST_ROT_Y;
    let currentRotY = REST_ROT_Y;

    const apply = (rotY) => {
      svg.style.transform = `rotateY(${rotY}deg) rotate(${REST_TILT}deg)`;
    };
    apply(currentRotY);

    svg.addEventListener('pointerdown', (e) => {
      dragging = true;
      didDrag = false;
      startX = e.clientX;
      startRotY = currentRotY;
      svg.classList.add('dragging');
      svg.setPointerCapture(e.pointerId);
    });
    svg.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 4) didDrag = true;
      currentRotY = startRotY + dx * 0.6;
      apply(currentRotY);
    });
    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      svg.classList.remove('dragging');
      // Spring back to rest on the next frame so the transition reapplies.
      requestAnimationFrame(() => {
        currentRotY = REST_ROT_Y;
        apply(currentRotY);
      });
    };
    svg.addEventListener('pointerup', endDrag);
    svg.addEventListener('pointercancel', endDrag);

    card.addEventListener('click', (e) => {
      if (didDrag) {
        didDrag = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
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
