const app = document.querySelector('#app');
const numberFormatter = new Intl.NumberFormat(undefined);
const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const relativeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

let repo = null;
let route = readRoute();
let searchOpen = false;
let searchQuery = '';
let selectedSearchIndex = 0;
let liveState = { checked: false, live: false, analyzing: false, events: [], source: null };
let skillDrawer = { open: false, title: '', content: '', loading: false };

const icons = {
  home: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m3 10.5 9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M9 20v-6h6v6"/></svg>',
  search: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  sun: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>',
  moon: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a7 7 0 1 0 10.5 10.5Z"/></svg>',
  arrow: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>',
  spark: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/><path d="M19 15v4M17 17h4"/></svg>',
  cube: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m21 16-9 5-9-5V8l9-5 9 5v8Z"/><path d="m3.3 7.7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>',
  file: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>',
  branch: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="6" cy="6" r="3"/><circle cx="18" cy="18" r="3"/><path d="M9 6h3a6 6 0 0 1 6 6v3"/><path d="M6 9v12"/></svg>',
  shield: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></svg>',
  clock: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  code: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/></svg>',
  play: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 3l14 9-14 9V3Z"/></svg>',
  close: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
  book: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15Z"/></svg>',
  generic: '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 3 4 7v10l8 4 8-4V7l-8-4Z"/><path d="M4 7l8 4 8-4"/><path d="M12 11v10"/></svg>',
};

function escapeHTML(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function icon(name) {
  const key = String(name || '').toLowerCase();
  return icons[key] || icons.generic;
}

function formatNumber(value) {
  return numberFormatter.format(Number(value || 0));
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Unknown' : dateFormatter.format(date);
}

function relativeDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'unknown';
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  const units = [
    ['year', 31536000000],
    ['month', 2628000000],
    ['day', 86400000],
    ['hour', 3600000],
    ['minute', 60000],
  ];
  for (const [unit, size] of units) {
    if (abs >= size || unit === 'minute') return relativeFormatter.format(Math.round(diff / size), unit);
  }
  return 'now';
}

function slug(value) {
  return encodeURIComponent(String(value || ''));
}

function readRoute() {
  const hash = window.location.hash.replace(/^#/, '') || '/';
  const [path] = hash.split('?');
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'area' && parts[1]) return { view: 'area', areaId: decodeURIComponent(parts[1]) };
  if (parts[0] === 'feature' && parts[1]) return { view: 'feature', featureId: decodeURIComponent(parts[1]) };
  return { view: 'overview' };
}

function hrefFor(next) {
  if (next.view === 'area') return `#/area/${slug(next.areaId)}`;
  if (next.view === 'feature') return `#/feature/${slug(next.featureId)}`;
  return '#/';
}

function go(next) {
  window.location.hash = hrefFor(next).slice(1);
}

function buildRepo(manifest) {
  const areaById = new Map(manifest.areas.map((area) => [area.id, area]));
  const featureById = new Map(manifest.features.map((feature) => [feature.id, feature]));
  const featuresByArea = new Map(manifest.areas.map((area) => [area.id, []]));
  for (const feature of manifest.features) {
    if (!featuresByArea.has(feature.area)) featuresByArea.set(feature.area, []);
    featuresByArea.get(feature.area).push(feature);
  }
  for (const features of featuresByArea.values()) {
    features.sort((a, b) => a.name.localeCompare(b.name));
  }
  const searchItems = [
    ...manifest.areas.map((area) => ({ type: 'area', id: area.id, title: area.name, subtitle: area.blurb, route: { view: 'area', areaId: area.id }, icon: area.icon })),
    ...manifest.features.map((feature) => ({ type: 'feature', id: feature.id, title: feature.name, subtitle: feature.summary, route: { view: 'feature', featureId: feature.id }, icon: 'cube' })),
  ];
  return { manifest, areaById, featureById, featuresByArea, searchItems };
}

async function loadManifest() {
  try {
    const response = await fetch('/manifest.json', { cache: 'no-store' });
    if (!response.ok) throw new Error(response.status === 404 ? 'manifest.json not found — run `features init` first.' : `Unable to load manifest (${response.status}).`);
    repo = buildRepo(await response.json());
    render();
    checkLiveStatus();
  } catch (error) {
    app.innerHTML = `<main class="loading-screen"><section class="empty-card"><h1>No Analysis Found</h1><p>${escapeHTML(error.message || 'Run features init, then reload this viewer.')}</p></section></main>`;
  }
}

function statCards(stats, extra = []) {
  const base = [
    ['Features', stats.features],
    ['Areas', stats.areas],
    ['Files', stats.files],
    ['Analyzed', relativeDate(stats.lastAnalyzed)],
  ];
  return [...extra, ...base].slice(0, 4).map(([label, value]) => `
    <article class="metric-card">
      <span class="value">${typeof value === 'number' ? formatNumber(value) : escapeHTML(value)}</span>
      <span class="label">${escapeHTML(label)}</span>
    </article>
  `).join('');
}

function badge(value, label = value) {
  return `<span class="badge ${escapeHTML(value)}">${escapeHTML(label)}</span>`;
}

function card(routeTarget, options) {
  return `
    <a class="card-button" href="${hrefFor(routeTarget)}" data-route='${JSON.stringify(routeTarget)}'>
      <span class="card-top">
        <span class="icon-tile">${icon(options.icon)}</span>
        <span class="card-title">
          <h3>${escapeHTML(options.title)}</h3>
        </span>
      </span>
      <span class="card-description">${escapeHTML(options.description)}</span>
      ${options.meta ? `<span class="card-meta">${options.meta}</span>` : ''}
    </a>
  `;
}

function breadcrumbs(items) {
  return `<nav class="breadcrumbs" aria-label="Breadcrumbs">
    <button type="button" data-route='${JSON.stringify({ view: 'overview' })}'>Overview</button>
    ${items.map((item) => `
      <span aria-hidden="true">/</span>
      ${item.route ? `<button type="button" data-route='${JSON.stringify(item.route)}'>${escapeHTML(item.label)}</button>` : `<span>${escapeHTML(item.label)}</span>`}
    `).join('')}
  </nav>`;
}

function renderOverview() {
  const { manifest, featuresByArea } = repo;
  const stats = manifest.repo.stats;
  return `
    <section class="hero" aria-labelledby="overview-title">
      <div class="hero-content">
        <h1 id="overview-title">${escapeHTML(manifest.repo.name)}</h1>
        <p>${escapeHTML(manifest.repo.description || manifest.repo.tagline)}</p>
        ${liveState.live ? `<div class="hero-actions"><button type="button" class="action-button secondary" data-start-analysis>${icons.play} Run Live Analysis</button></div>` : ''}
      </div>
    </section>
    <section class="metric-grid" aria-label="Repository Stats">${statCards(stats)}</section>
    ${liveState.live ? livePanel() : ''}
    <section class="section-head" id="feature-areas">
      <div>
        <h2>Feature Areas</h2>
        <p>Every area uses the same visual grammar: clear ownership, healthy metadata, and direct paths into feature knowledge.</p>
      </div>
    </section>
    <section class="area-grid overview-area-grid" aria-label="Feature Areas">
      ${manifest.areas.map((area, index) => {
        const features = featuresByArea.get(area.id) || [];
        return card({ view: 'area', areaId: area.id }, {
          icon: area.icon,
          title: area.name,
          description: area.blurb,
          meta: '',
        });
      }).join('')}
    </section>
  `;
}

function renderArea() {
  const area = repo.areaById.get(route.areaId);
  if (!area) return notFound('Area Not Found', 'Choose an area from the sidebar to continue.');
  const features = repo.featuresByArea.get(area.id) || [];
  return `
    ${breadcrumbs([{ label: area.name }])}
    <section class="hero" aria-labelledby="area-title">
      <div class="hero-content">
        <span class="eyebrow">${icon(area.icon)} Feature Area</span>
        <h1 id="area-title">${escapeHTML(area.name)}</h1>
        <p>${escapeHTML(area.blurb)}</p>
      </div>
    </section>
    <section class="panel area-overview-panel">
      <h2>Area Overview</h2>
      <p>${escapeHTML(area.name)} owns ${formatNumber(features.length)} documented feature${features.length === 1 ? '' : 's'} in ${escapeHTML(repo.manifest.repo.name)}. Use this page as the operational map before changing related code.</p>
      <p>Each feature card keeps the story focused on what it does and where it belongs.</p>
    </section>
    <section class="section-head" id="area-features">
      <div>
        <h2>${escapeHTML(area.name)} Features</h2>
        <p>Consistent cards, clear metadata, and large hit targets across the full website.</p>
      </div>
    </section>
    <section class="feature-grid" aria-label="Features in ${escapeHTML(area.name)}">
      ${features.length ? features.map((feature) => featureCard(feature)).join('') : `<article class="empty-card"><h2>No Features Yet</h2><p>Run live analysis or features init to populate this area.</p></article>`}
    </section>
  `;
}

function featureCard(feature) {
  const area = repo.areaById.get(feature.area);
  return card({ view: 'feature', featureId: feature.id }, {
    icon: area?.icon || 'cube',
    title: feature.name,
    description: feature.summary,
    meta: '',
  });
}

function renderFeature() {
  const feature = repo.featureById.get(route.featureId);
  if (!feature) return notFound('Feature Not Found', 'Choose a feature from an area page to continue.');
  const area = repo.areaById.get(feature.area);
  const codeRefs = feature.files || [];
  return `
    ${breadcrumbs([{ label: area?.name || 'Area', route: { view: 'area', areaId: feature.area } }, { label: feature.name }])}
    <section class="hero" aria-labelledby="feature-title">
      <div class="hero-content">
        <span class="eyebrow">${icon(area?.icon)} ${escapeHTML(area?.name || 'Feature')}</span>
        <h1 id="feature-title">${escapeHTML(feature.name)}</h1>
        <p>${escapeHTML(feature.summary)}</p>
        <div class="hero-actions">
          <button type="button" class="action-button primary" data-open-skill="${escapeHTML(feature.id)}">${icons.book} View Skill</button>
          <button type="button" class="action-button secondary" data-scroll-to="code-references">${icons.code} Inspect Code</button>
        </div>
      </div>
    </section>
    <section class="metric-grid feature-metric-grid" aria-label="Feature Stats">
      <article class="metric-card"><span class="value">${formatNumber(codeRefs.length)}</span><span class="label">Code Refs</span></article>
      <article class="metric-card"><span class="value">${formatNumber(feature.howItWorks?.length || 0)}</span><span class="label">How It Works</span></article>
      <article class="metric-card"><span class="value">${formatNumber(feature.flow?.length || 0)}</span><span class="label">Flow Steps</span></article>
    </section>
    ${feature.featureStale ? `<section class="panel" role="status"><h2>Refresh Recommended</h2><p>This feature references code that changed since analysis. Re-run <code translate="no">features init --feature ${escapeHTML(feature.id)}</code> before making high-risk edits.</p></section>` : ''}
    <section class="prose-card feature-prose">
      <article class="panel">
        <h2>In a Nutshell</h2>
        <p>${escapeHTML(feature.nutshell)}</p>
      </article>
      ${feature.howItWorks?.length ? `<article class="panel"><h2>How It Works</h2><ol class="step-list">${feature.howItWorks.map((step, index) => `<li><span class="step-index">${String(index + 1).padStart(2, '0')}</span><span>${escapeHTML(step)}</span></li>`).join('')}</ol></article>` : ''}
      ${feature.flow?.length ? `<article class="panel"><h2>The Flow</h2>${renderFlow(feature.flow)}</article>` : ''}
    </section>
    <section class="section-head" id="code-references">
      <div>
        <h2>Code Reference</h2>
        <p>Review the exact files and lines behind this feature.</p>
      </div>
    </section>
    <section aria-label="Code References">${codeRefs.length ? codeRefs.map(fileCard).join('') : `<article class="empty-card"><h2>No Code References</h2><p>This feature has no compiled code snippets.</p></article>`}</section>
    ${feature.related?.length ? `<section class="section-head"><div><h2>Related Features</h2></div></section><section class="related-grid">${feature.related.map((id) => repo.featureById.get(id)).filter(Boolean).map(featureCard).join('')}</section>` : ''}
  `;
}

function renderFlow(flow) {
  return `<ol class="route-flow" aria-label="Feature Flow">
    ${flow.map((step, index) => `<li class="route-stop">
      <span class="route-track" aria-hidden="true"></span>
      <span class="route-dot" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>
      <span class="route-card">
        <strong>${escapeHTML(step.label)}</strong>
        ${step.sub ? `<span translate="no">${escapeHTML(step.sub)}</span>` : ''}
      </span>
    </li>`).join('')}
  </ol>`;
}

function fileCard(file) {
  const lines = file.lines ? `Lines ${file.lines.start}–${file.lines.end}` : 'Lines unknown';
  return `
    <details class="file-card code-evidence">
      <summary>
        <span class="icon-tile">${icons.code}</span>
        <span class="file-path">
          <strong>${escapeHTML(file.what || 'Open the matching source code')}</strong>
          <span translate="no">${escapeHTML(file.path)}</span>
        </span>
        <span class="open-code-label" aria-hidden="true"><span class="closed-label">Open Code</span><span class="open-label">Hide Code</span></span>
      </summary>
      <div class="code-reveal">
        <div class="code-toolbar">
          <span translate="no">${escapeHTML(file.path)}</span>
          <span>${escapeHTML(lines)}</span>
        </div>
        ${file.annotation ? `<div class="code-note"><p>${escapeHTML(file.annotation)}</p></div>` : ''}
        ${file.stale ? `<div class="code-note stale-note"><p>This snippet may be outdated. Refresh analysis before relying on this reference.</p></div>` : ''}
        <pre tabindex="0"><code translate="no">${escapeHTML(file.code || 'No snippet available.')}</code></pre>
      </div>
    </details>
  `;
}

function livePanel() {
  return `<section class="panel live-panel" aria-labelledby="live-title">
    <h2 id="live-title">Live Analysis</h2>
    <p>${liveState.analyzing ? 'Analysis is running. Progress updates stream below.' : 'Trigger a fresh analysis from the browser without leaving the viewer.'}</p>
    <button type="button" class="action-button secondary" data-start-analysis ${liveState.analyzing ? 'disabled' : ''}>${icons.play} ${liveState.analyzing ? 'Running…' : 'Run Analysis'}</button>
    <div class="live-log" role="log" aria-live="polite">${liveState.events.length ? liveState.events.map((event) => `<div>${escapeHTML(event.message || event.kind)}</div>`).join('') : '<div>No live events yet.</div>'}</div>
  </section>`;
}

function notFound(title, copy) {
  return `<section class="empty-card"><h1>${escapeHTML(title)}</h1><p>${escapeHTML(copy)}</p><div class="hero-actions" style="justify-content:center"><button type="button" class="action-button secondary" data-route='${JSON.stringify({ view: 'overview' })}'>Back to Overview</button></div></section>`;
}

function renderShell(content) {
  const theme = document.documentElement.classList.contains('light') ? 'light' : 'dark';
  const activeAreaId = route.view === 'area' ? route.areaId : route.view === 'feature' ? repo.featureById.get(route.featureId)?.area : '';
  return `
    <div class="shell">
      <header class="topbar">
        <button type="button" class="brand-button" data-route='${JSON.stringify({ view: 'overview' })}' aria-label="Go to Overview">
          <img src="${theme === 'light' ? '/logo-light.svg' : '/logo-dark.svg'}" width="154" height="36" alt="Features" fetchpriority="high" />
        </button>
        <span class="topbar-spacer"></span>
        <button type="button" class="search-button" data-open-search aria-label="Search features">
          ${icons.search}<span class="label">Search features…</span><span class="kbd">⌘&nbsp;K</span>
        </button>
        <button type="button" class="icon-button" data-toggle-theme aria-label="Toggle Theme">${theme === 'light' ? icons.moon : icons.sun}</button>
      </header>
      <aside class="sidebar" aria-label="Feature Areas">
        <button type="button" class="nav-button" data-route='${JSON.stringify({ view: 'overview' })}' ${route.view === 'overview' ? 'aria-current="page"' : ''}>${icons.home}<span class="nav-text">Overview</span></button>
        <div class="nav-label">Feature Areas</div>
        ${repo.manifest.areas.map((area) => {
          const count = repo.featuresByArea.get(area.id)?.length || 0;
          return `<button type="button" class="nav-button" data-route='${JSON.stringify({ view: 'area', areaId: area.id })}' ${activeAreaId === area.id ? 'aria-current="page"' : ''}>${icon(area.icon)}<span class="nav-text">${escapeHTML(area.name)}</span><span class="count-pill">${formatNumber(count)}</span></button>`;
        }).join('')}
      </aside>
      <main id="main" class="main" tabindex="-1"><div class="page">${content}</div></main>
      ${searchDialog()}
      ${drawerMarkup()}
    </div>
  `;
}

function searchDialog() {
  const results = filteredSearch();
  return `<dialog class="search-dialog" id="search-dialog" aria-labelledby="search-title">
    <form class="search-form" method="dialog" data-search-form>
      ${icons.search}
      <label class="visually-hidden" for="search-input" id="search-title">Search Features</label>
      <input id="search-input" class="search-input" type="search" name="q" autocomplete="off" spellcheck="false" placeholder="Try Serve, Routing, or CLI…" value="${escapeHTML(searchQuery)}" />
      <button type="button" class="icon-button" data-close-search aria-label="Close Search">${icons.close}</button>
    </form>
    <div class="search-results" role="listbox" aria-label="Search Results">
      ${results.length ? results.map((item, index) => `<button type="button" class="result-button" role="option" aria-selected="${index === selectedSearchIndex}" data-search-result="${index}"><span class="icon-tile">${icon(item.icon)}</span><span class="result-copy"><strong>${escapeHTML(item.title)}</strong><span>${escapeHTML(item.subtitle)}</span></span>${badge(item.type)}</button>`).join('') : `<div class="empty-card"><h2>No Results</h2><p>Try a feature name, area name, or summary keyword.</p></div>`}
    </div>
  </dialog>`;
}

function markdownInline(value = '') {
  let html = escapeHTML(value);
  html = html.replace(/`([^`]+)`/g, '<code translate="no">$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, href) => {
    const safeHref = String(href).startsWith('http') || String(href).startsWith('mailto:') || String(href).startsWith('#') ? href : '#';
    return `<a href="${escapeHTML(safeHref)}" rel="noreferrer">${label}</a>`;
  });
  return html;
}

function renderMarkdown(markdown = '') {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let paragraph = [];
  let listType = null;

  const closeParagraph = () => {
    if (!paragraph.length) return;
    html.push(`<p>${markdownInline(paragraph.join(' '))}</p>`);
    paragraph = [];
  };
  const closeList = () => {
    if (!listType) return;
    html.push(`</${listType}>`);
    listType = null;
  };
  const openList = (type) => {
    if (listType === type) return;
    closeList();
    html.push(`<${type}>`);
    listType = type;
  };

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index] || '';
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      closeParagraph();
      closeList();
      continue;
    }

    const fence = trimmed.match(/^```(\w+)?/);
    if (fence) {
      closeParagraph();
      closeList();
      const language = fence[1] || 'text';
      const code = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        code.push(lines[index]);
        index += 1;
      }
      html.push(`<pre><code class="language-${escapeHTML(language)}" translate="no">${escapeHTML(code.join('\n'))}</code></pre>`);
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      closeParagraph();
      closeList();
      const level = heading[1].length + 1;
      html.push(`<h${level}>${markdownInline(heading[2])}</h${level}>`);
      continue;
    }

    const quote = trimmed.match(/^>\s?(.+)$/);
    if (quote) {
      closeParagraph();
      closeList();
      html.push(`<blockquote>${markdownInline(quote[1])}</blockquote>`);
      continue;
    }

    const unordered = trimmed.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      closeParagraph();
      openList('ul');
      html.push(`<li>${markdownInline(unordered[1])}</li>`);
      continue;
    }

    const ordered = trimmed.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      closeParagraph();
      openList('ol');
      html.push(`<li>${markdownInline(ordered[1])}</li>`);
      continue;
    }

    paragraph.push(trimmed);
  }

  closeParagraph();
  closeList();
  return html.join('');
}

function drawerMarkup() {
  const content = skillDrawer.loading
    ? '<p role="status">Loading…</p>'
    : renderMarkdown(skillDrawer.content || 'No skill found for this feature.');
  return `<button type="button" class="drawer-backdrop ${skillDrawer.open ? 'open' : ''}" data-close-drawer aria-label="Close Skill Drawer"></button>
    <aside class="skill-drawer ${skillDrawer.open ? 'open' : ''}" aria-hidden="${skillDrawer.open ? 'false' : 'true'}" aria-labelledby="skill-title">
      <div class="drawer-head"><h2 id="skill-title">${escapeHTML(skillDrawer.title || 'Feature Skill')}</h2><button type="button" class="icon-button" data-close-drawer aria-label="Close Skill Drawer">${icons.close}</button></div>
      <article class="drawer-body markdown-body">${content}</article>
    </aside>`;
}

function filteredSearch() {
  if (!repo) return [];
  const query = searchQuery.trim().toLowerCase();
  const items = repo.searchItems;
  if (!query) return items.slice(0, 12);
  return items.filter((item) => `${item.title} ${item.subtitle} ${item.id}`.toLowerCase().includes(query)).slice(0, 30);
}

function render() {
  if (!repo) return;
  const content = route.view === 'area' ? renderArea() : route.view === 'feature' ? renderFeature() : renderOverview();
  app.innerHTML = renderShell(content);
  bindEvents();
  syncDialog();
}

function focusMain() {
  document.querySelector('#main')?.focus({ preventScroll: true });
}

function bindEvents() {
  app.querySelectorAll('[data-route]').forEach((element) => {
    element.addEventListener('click', (event) => {
      event.preventDefault();
      go(JSON.parse(element.getAttribute('data-route')));
    });
  });
  app.querySelectorAll('[data-open-search]').forEach((element) => element.addEventListener('click', openSearch));
  app.querySelectorAll('[data-close-search]').forEach((element) => element.addEventListener('click', closeSearch));
  app.querySelectorAll('[data-toggle-theme]').forEach((element) => element.addEventListener('click', toggleTheme));
  app.querySelectorAll('[data-scroll-to]').forEach((element) => element.addEventListener('click', () => document.getElementById(element.getAttribute('data-scroll-to'))?.scrollIntoView({ block: 'start' })));
  app.querySelectorAll('[data-start-analysis]').forEach((element) => element.addEventListener('click', () => startAnalysis()));
  app.querySelectorAll('[data-open-skill]').forEach((element) => element.addEventListener('click', () => openSkill(element.getAttribute('data-open-skill'))));
  app.querySelectorAll('[data-close-drawer]').forEach((element) => element.addEventListener('click', closeSkill));

  const input = app.querySelector('#search-input');
  if (input) {
    input.addEventListener('input', (event) => {
      searchQuery = event.target.value;
      selectedSearchIndex = 0;
      render();
      openSearch();
    });
    input.addEventListener('keydown', handleSearchKeys);
  }
  app.querySelectorAll('[data-search-result]').forEach((element) => {
    element.addEventListener('click', () => {
      const item = filteredSearch()[Number(element.getAttribute('data-search-result'))];
      if (item) {
        closeSearch();
        go(item.route);
      }
    });
  });
}

function syncDialog() {
  const dialog = app.querySelector('#search-dialog');
  if (!dialog) return;
  if (searchOpen && !dialog.open) {
    dialog.showModal();
    requestAnimationFrame(() => app.querySelector('#search-input')?.focus());
  }
  dialog.addEventListener('close', () => { searchOpen = false; });
}

function openSearch() {
  searchOpen = true;
  render();
}

function closeSearch() {
  searchOpen = false;
  render();
}

function handleSearchKeys(event) {
  const results = filteredSearch();
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    selectedSearchIndex = Math.min(results.length - 1, selectedSearchIndex + 1);
    render();
    openSearch();
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    selectedSearchIndex = Math.max(0, selectedSearchIndex - 1);
    render();
    openSearch();
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    const item = results[selectedSearchIndex];
    if (item) {
      closeSearch();
      go(item.route);
    }
  }
  if (event.key === 'Escape') closeSearch();
}

function toggleTheme() {
  const root = document.documentElement;
  const next = root.classList.contains('light') ? 'dark' : 'light';
  root.classList.remove('light', 'dark');
  root.classList.add(next);
  root.style.colorScheme = next;
  localStorage.setItem('features-theme', next);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'light' ? '#f8f6f1' : '#080913');
  render();
}

async function checkLiveStatus() {
  try {
    const response = await fetch('/api/status', { cache: 'no-store' });
    if (!response.ok) return;
    const status = await response.json();
    liveState = { ...liveState, checked: true, live: Boolean(status.live), analyzing: Boolean(status.analyzing) };
    render();
    if (liveState.live) connectEvents();
  } catch (error) {
    liveState.checked = true;
  }
}

function connectEvents() {
  if (liveState.source) return;
  const source = new EventSource('/api/analyze/events');
  liveState.source = source;
  const handler = (event) => {
    try {
      const data = JSON.parse(event.data);
      liveState.events.push(data);
      liveState.analyzing = data.kind !== 'done' && data.kind !== 'error';
      if (liveState.events.length > 80) liveState.events = liveState.events.slice(-80);
      if (data.kind === 'done') loadManifest();
      else render();
    } catch (error) {}
  };
  ['phase', 'file', 'warn', 'done', 'error'].forEach((name) => source.addEventListener(name, handler));
  source.onerror = () => { liveState.source = null; source.close(); };
}

async function startAnalysis() {
  liveState.analyzing = true;
  liveState.events = [{ kind: 'phase', message: 'Starting analysis…' }];
  render();
  connectEvents();
  const body = route.view === 'feature' ? { feature: route.featureId } : route.view === 'area' ? {} : {};
  try {
    const response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error('Could not start analysis.');
  } catch (error) {
    liveState.analyzing = false;
    liveState.events.push({ kind: 'error', message: error.message || 'Could not start analysis.' });
    render();
  }
}

async function openSkill(featureId) {
  const feature = repo.featureById.get(featureId);
  skillDrawer = { open: true, title: `${feature?.name || 'Feature'} Skill`, content: '', loading: true };
  render();
  try {
    const response = await fetch(`/api/skill/${encodeURIComponent(featureId)}`, { cache: 'no-store' });
    skillDrawer.content = response.ok ? await response.text() : (feature?.skill || 'No skill found for this feature.');
  } catch (error) {
    skillDrawer.content = feature?.skill || 'No skill found for this feature.';
  } finally {
    skillDrawer.loading = false;
    render();
  }
}

function closeSkill() {
  skillDrawer.open = false;
  render();
}

window.addEventListener('hashchange', () => {
  route = readRoute();
  render();
  focusMain();
});

window.addEventListener('keydown', (event) => {
  const tag = document.activeElement?.tagName || '';
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    openSearch();
  } else if (event.key === '/' && !searchOpen && !/input|textarea/i.test(tag)) {
    event.preventDefault();
    openSearch();
  } else if (event.key === 'Escape' && skillDrawer.open) {
    closeSkill();
  }
});

loadManifest();
