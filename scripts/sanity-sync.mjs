#!/usr/bin/env node
/*
  Sanity → static HTML sync for kampar-free-range-duck.com
  ------------------------------------------------------------------
  The site stays plain static HTML (good for SEO and GitHub Pages).
  This script pulls the published content from Sanity and rewrites only the
  parts of each page that sit between marker comments, e.g.

      <!-- cms:parts -->  ...generated...  <!-- /cms:parts -->

  Anything outside the markers is never touched. Run by
  .github/workflows/sanity-sync.yml whenever content is published in Sanity.

  Local use:
      node scripts/sanity-sync.mjs                   # fetch from Sanity
      node scripts/sanity-sync.mjs --data file.json  # use saved JSON (testing)
*/
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ID = '3k9cyy6o';
const DATASET = 'production';
const API_VERSION = '2026-11-06';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE_URL = 'https://kampar-free-range-duck.com';

const QUERY = `{
  "settings": *[_id == "siteSettings"][0]{
    companyName, whatsappNumber, email, instagramUrl, facebookUrl,
    locations[]{_key, nameZh, nameEn, address}
  },
  "home": *[_id == "homePage"][0]{
    sinceYear, brandSlogan, stats[]{_key, value, label}, steps[]{_key, title, text}
  },
  "products": *[_type == "product" && availability != "hidden" && defined(slug.current)]
    | order(coalesce(sortOrder, 999) asc, nameZh asc){
      nameZh, nameEn, "slug": slug.current, category, descriptionZh, descriptionEn,
      specs[]{_key, labelZh, labelEn, valueZh, valueEn}, price, availability, whatsappText,
      "images": images[]{alt, "url": asset->url, "w": asset->metadata.dimensions.width, "h": asset->metadata.dimensions.height}
    },
  "docs": *[_type in ["siteSettings", "homePage", "aboutPage", "productsPage", "supplierPage"] && !(_id in path("drafts.**"))],
  "assets": *[_type in ["sanity.imageAsset", "sanity.fileAsset"]]{_id, url, "w": metadata.dimensions.width, "h": metadata.dimensions.height}
}`;

// ---------- helpers ----------
const esc = (s = '') =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const imgUrl = (img, w = 1600) => `${img.url}?w=${w}&fit=max&auto=format`;
const dims = (img) => (img.w ? ` width="${img.w}" height="${img.h}"` : '');
const waLink = (number, text) =>
  `https://wa.me/${encodeURIComponent(number)}${text ? `?text=${encodeURIComponent(text).replace(/%2C/g, ',').replace(/%3A/g, ':').replace(/%2F/g, '/').replace(/'/g, '%27')}` : ''}`;
const slugToKey = (slug) => slug.replace(/-/g, '_');
const OUT_OF_STOCK = '暂时缺货<span class="en">Out of stock</span>';

async function loadData() {
  const i = process.argv.indexOf('--data');
  if (i > -1) return JSON.parse(await readFile(process.argv[i + 1], 'utf8'));
  const url = `https://${PROJECT_ID}.api.sanity.io/v${API_VERSION}/data/query/${DATASET}` +
    `?query=${encodeURIComponent(QUERY)}&perspective=published`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sanity request failed: ${res.status} ${await res.text()}`);
  return (await res.json()).result;
}

function renderers(d) {
  const s = d.settings;
  const h = d.home || {};
  const feature = d.products.find((p) => p.category === 'whole');
  const pp = (d.docs || []).find((x) => x._id === 'productsPage') || {};
  const others = d.products.filter((p) => p !== feature);
  const enquiry = (p) => `${p.whatsappText || `I'm interested in ${p.nameEn || p.nameZh}.`} ${SITE_URL}/products.html`;

  return {
    // ---------- home page ----------
    'since': () => `Since ${esc(h.sinceYear)}`,

    'slogan': () => (h.brandSlogan || '').split('\n').map((l) => esc(l.trim())).filter(Boolean).join('<br>'),

    'stats': () => '\n' + (h.stats || []).map((st) => `          <div class="stat">
            <span class="stat-label">${esc(st.label)}</span>
            <span class="stat-value">${esc(st.value)}</span>
          </div>`).join('\n') + '\n        ',

    // One marker per photo card; n1 = first step, n2 = second, ...
    'step': (opts) => {
      const n = Number((opts.find((o) => /^n\d+$/.test(o)) || 'n1').slice(1));
      const st = (h.steps || [])[n - 1] || {};
      return `
                <div class="card-caption-title">
                  <span class="badge">${n}</span>
                  <h3>${esc(st.title)}</h3>
                </div>
                <span class="en">${esc(st.text)}</span>
              `;
    },

    // ---------- products page ----------
    'feature': () => {
      if (!feature) return '\n      ';
      const imgs = feature.images?.length ? feature.images : [];
      const slides = imgs.length
        ? imgs.map((img, i) => `          <div class="slide${i === 0 ? ' is-active' : ' slide--inset'}" data-slide="${i}">
            <img class="slide-bg" src="${esc(imgUrl(img))}" alt="${esc(img.alt || feature.nameZh)}"${i === 0 ? ' fetchpriority="high"' : ' loading="lazy"'}${dims(img)}>
          </div>`).join('\n')
        : `          <div class="slide is-active" data-slide="0">
            <img class="slide-bg" src="assets/duck-logo.webp" alt="${esc(feature.nameZh)}" width="584" height="584">
          </div>`;
      const specs = [
        ...(feature.price ? [{ labelZh: '价格', labelEn: 'Price', valueZh: feature.price }] : []),
        ...(feature.availability === 'outOfStock' ? [{ labelZh: '库存', labelEn: 'Stock', raw: OUT_OF_STOCK }] : []),
        ...(feature.specs || []),
      ];
      return `
        <h1 class="product-title">${esc(feature.nameZh)}<span class="en">${esc(feature.nameEn)}</span></h1>
        <div class="product-feature-media slider">
${slides}
          <button class="slider-arrow slider-arrow--prev" aria-label="上一张">
            <img src="assets/icon-arrow-right.svg" alt="" aria-hidden="true" width="38" height="38">
          </button>
          <button class="slider-arrow slider-arrow--next" aria-label="下一张">
            <img src="assets/icon-arrow-right.svg" alt="" aria-hidden="true" width="38" height="38">
          </button>
        </div>
        <div class="product-feature-body">
          <p>${esc(feature.descriptionZh)}</p>
          <p class="en-p">${esc(feature.descriptionEn)}</p>
          <dl class="product-specs">
${specs.map((sp) => `            <div>
              <dt>${esc(sp.labelZh)}<span class="en">${esc(sp.labelEn)}</span></dt>
              <dd>${sp.raw || `${esc(sp.valueZh)}${sp.valueEn ? `<span class="en">${esc(sp.valueEn)}</span>` : ''}`}</dd>
            </div>`).join('\n')}
          </dl>
          <a class="pill-btn"
          id="product-whole-duck-btn"
          href="${esc(waLink(s.whatsappNumber, enquiry(feature)))}"
          target="_blank"
          rel="noopener">${esc(pp.featureButtonText || '咨询整鸭 Enquire')}</a>
        </div>
      `;
    },

    'parts': () => '\n' + others.map((p) => {
      const img = p.images?.[0];
      const media = img
        ? `<div class="part-card-media">
              <img src="${esc(imgUrl(img, 800))}" alt="${esc(img.alt || p.nameZh)}" loading="lazy"${dims(img)}>
            </div>`
        : `<div class="part-card-media is-placeholder">
              <img src="assets/duck-logo.webp" alt="" aria-hidden="true" loading="lazy" width="584" height="584">
            </div>`;
      const extra = [
        p.price ? `            <p class="en-p">${esc(p.price)}</p>\n` : '',
        p.availability === 'outOfStock' ? `            <p class="en-p">暂时缺货 Out of stock</p>\n` : '',
      ].join('');
      return `          <article class="part-card">
            ${media}
            <h3>${esc(p.nameZh)}<span class="en">${esc(p.nameEn)}</span></h3>
            <p>${esc(p.descriptionZh)}</p>
            <p class="en-p">${esc(p.descriptionEn)}</p>
${extra}            <a class="part-enquire"
            data-product="${esc(slugToKey(p.slug))}"
            href="${esc(waLink(s.whatsappNumber, enquiry(p)))}"
            target="_blank"
            rel="noopener">${esc(pp.partButtonText || '咨询 Enquire')}</a>
          </article>`;
    }).join('\n') + '\n      ',

    // ---------- footer (every page) ----------
    'footer-company': () => esc(s.companyName),

    'footer-icons': () => `
          ${s.email ? `<a href="mailto:${esc(s.email)}" aria-label="Email">
            <img src="assets/icon-email.svg" alt="邮件" loading="lazy" width="57" height="57">
          </a>
          ` : ''}<a href="${esc(waLink(s.whatsappNumber))}" target="_blank" rel="noopener" aria-label="WhatsApp">
            <img src="assets/icon-waicon.webp" alt="Whatsapp" loading="lazy" width="120" height="120">
          </a>
          ${s.instagramUrl ? `<a href="${esc(s.instagramUrl)}" target="_blank" rel="noopener" aria-label="Instagram">
            <img src="assets/ins-icon.webp" alt="Instagram" loading="lazy" width="384" height="389">
          </a>
          ` : ''}${s.facebookUrl ? `<a href="${esc(s.facebookUrl)}" target="_blank" rel="noopener" aria-label="Facebook">
            <img src="assets/f-icon.webp" alt="Facebook" loading="lazy" width="508" height="499">
          </a>
        ` : ''}`,

    'footer-locations': (opts) => {
      const pin = opts.includes('pin') ? '📍' : '';
      return '\n' + (s.locations || []).map((l) =>
        `          <li><span class="footer-city">${esc(l.nameZh)} ${esc(l.nameEn)}</span>${pin}${esc((l.address || '').replace(/\s*\n\s*/g, ' '))}</li>`
      ).join('\n') + '\n        ';
    },
  };
}

// ---------- duck-site extras for the generic engine ----------
// Templates for repeating items (cards, bullet points, FAQ). {{field}} is filled from Sanity.
const LISTS = {
  "homePage.areas.cards": {
    "template": "        <div class=\"location-card\">\n          <div class=\"location-icon\">\n            <svg viewBox=\"0 0 24 24\" width=\"22\" height=\"22\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 21s-7-7.58-7-12a7 7 0 0 1 14 0c0 4.42-7 12-7 12z\"/><circle cx=\"12\" cy=\"9\" r=\"2.5\"/></svg>\n          </div>\n          <h3>{{title}}</h3>\n          <p>{{zh}}</p>\n          <p class=\"location-en\">{{en}}</p>\n        </div>",
    "sep": "\n",
    "lead": "\n",
    "trail": ""
  },
  "aboutPage.story1.points": {
    "template": "            <li>{{zh}}<span class=\"en-p\">{{en}}</span></li>",
    "sep": "\n",
    "lead": "\n",
    "trail": "\n          "
  },
  "supplierPage.intro.points": {
    "template": "            <li>{{zh}}<span class=\"en-p\">{{en}}</span></li>",
    "sep": "\n",
    "lead": "\n",
    "trail": "\n          "
  },
  "supplierPage.delivery.cards": {
    "template": "        <div class=\"location-card\">\n          <div class=\"location-icon\">\n            <svg viewBox=\"0 0 24 24\" width=\"22\" height=\"22\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 21s-7-7.58-7-12a7 7 0 0 1 14 0c0 4.42-7 12-7 12z\"/><circle cx=\"12\" cy=\"9\" r=\"2.5\"/></svg>\n          </div>\n          <h3>{{title}}</h3>\n          <p>{{zh}}</p>\n          <p class=\"location-en\">{{en}}</p>\n        </div>",
    "sep": "\n",
    "lead": "\n",
    "trail": ""
  },
  "supplierPage.faqSection.items": {
    "template": "        <details class=\"faq-item\">\n          <summary>\n            <span class=\"faq-q-zh\">{{qZh}}</span>\n            <span class=\"faq-q-en\">{{qEn}}</span>\n          </summary>\n          <div class=\"faq-a\">\n            <p>{{aZh}}</p>\n            <p class=\"faq-a-en\">{{aEn}}</p>\n          </div>\n        </details>",
    "sep": "\n",
    "lead": "\n",
    "trail": ""
  }
};

// ---------- sanity checks: never publish an empty or broken site ----------
function validate(d) {
  const problems = [];
  if (!d?.settings) problems.push('Site Settings document is missing');
  else if (!d.settings.whatsappNumber) problems.push('WhatsApp number is empty');
  if (!d?.products?.length) problems.push('no visible products');
  if (!d?.home) problems.push('Home Page document is missing');
  if (problems.length) throw new Error('Refusing to update the site: ' + problems.join('; '));
}

const MARKER = /<!-- cms:([a-z-]+)((?: [\w.:-]+)*) -->([\s\S]*?)<!-- \/cms:\1(?:\2)? -->/g;

// =====================================================================
// Generic content engine
// Markers look like  <!-- cms:KIND KEY [OPTIONS] --> … <!-- /cms:KIND KEY [OPTIONS] -->
// KEY is "documentId.field.subField" in Sanity, e.g. "aboutPage.story2.title".
//   t       text (Enter = <br>, **bold**, [link](url))   txt   plain text   title  whole <title> tag
//   attr    sets one attribute on the tag inside          img   photo (src/alt/size)
//   imgurl  photo URL in a <meta content="…">              paras paragraphs (blank line = new <p>)
//   pt      rich text (headings, lists, bold, links)       list  repeating items (see LISTS)
//   yt      YouTube video                                  video MP4 video + poster photo
//   wa      WhatsApp button (number from Site Settings)    jsonld  Google structured data
// A missing value never blanks the page: the original HTML is kept.
// =====================================================================
const IMG_MAX_W = 1600;

function indexContent(d) {
  const docs = {}; for (const doc of d.docs || []) docs[doc._id] = doc;
  const assets = {}; for (const a of d.assets || []) assets[a._id] = a;
  return { docs, assets };
}

function getPath(idx, key) {
  const [doc, ...path] = key.split('.');
  let v = idx.docs[doc];
  for (const p of path) { if (v == null) return undefined; v = v[p]; }
  return v;
}

const linkHtml = (href, inner) => /^https?:/.test(href)
  ? `<a href="${esc(href)}" target="_blank" rel="noopener">${inner}</a>`
  : `<a href="${esc(href)}">${inner}</a>`;

// Editor text → HTML: escape, then [text](url), **bold**, new lines.
function inlineFmt(s = '') {
  let out = esc(String(s).trim());
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, url) => linkHtml(url.replace(/&amp;/g, '&'), text));
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  return out.replace(/\n/g, '<br>\n');
}

function setAttr(tag, name, value) {
  const v = esc(value);
  const re = new RegExp(`(\\s${name}=")[^"]*(")`);
  if (re.test(tag)) return tag.replace(re, (m, a, b) => a + v + b);
  return tag.replace(/^<([a-zA-Z]+)/, (m, t) => `<${t} ${name}="${v}"`);
}

const assetOf = (idx, img) => (img && img.asset && img.asset._ref ? idx.assets[img.asset._ref] : undefined);
const imgSrc = (a, full) => `${a.url}?${full ? '' : `w=${IMG_MAX_W}&fit=max&`}auto=format`;

function imgAttrs(idx, img) {
  const a = assetOf(idx, img);
  if (!a) return 'src="" alt=""';
  return `src="${esc(imgSrc(a))}" alt="${esc(img.alt || '')}"${a.w ? ` width="${a.w}" height="${a.h}"` : ''}`;
}

function ptSpans(b) {
  const defs = Object.fromEntries((b.markDefs || []).map((m) => [m._key, m]));
  return (b.children || []).map((c) => {
    let t = esc(c.text || '').replace(/\n/g, '<br>\n');
    const marks = c.marks || [];
    if (marks.includes('em')) t = `<em>${t}</em>`;
    if (marks.includes('strong')) t = `<strong>${t}</strong>`;
    for (const m of marks) { const def = defs[m]; if (def && def._type === 'link' && def.href) t = linkHtml(def.href, t); }
    return t;
  }).join('');
}

function ptToHtml(blocks = [], h2cls, ulcls, custom = {}) {
  const out = []; let list = null;
  const flush = () => { if (list) { out.push(`<ul class="${ulcls}">\n${list.join('\n')}\n</ul>`); list = null; } };
  for (const b of blocks) {
    if (b._type !== 'block') { flush(); if (custom[b._type]) out.push(custom[b._type](b)); continue; }
    const inner = ptSpans(b);
    if (b.listItem) { (list = list || []).push(`  <li>${inner}</li>`); continue; }
    flush();
    if (b.style === 'h2' || b.style === 'h3') out.push(`<${b.style} class="${h2cls}">${inner}</${b.style}>`);
    else out.push(`<p>\n  ${inner}\n</p>`);
  }
  flush();
  return '\n' + out.join('\n') + '\n';
}

const ptPlain = (s) => String(s || '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\*\*(.+?)\*\*/g, '$1').replace(/\n/g, ' ').trim();

function youTubeId(url = '') {
  const m = String(url).match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{6,})/);
  return m ? m[1] : null;
}

function genericRenderers(d, LISTS, CUSTOM_PT) {
  const idx = indexContent(d);
  const s = d.settings || {};
  const val = (key) => getPath(idx, key);
  const has = (v) => v !== undefined && v !== null;

  return {
    t: ([key]) => { const v = val(key); return has(v) ? inlineFmt(v) : null; },
    txt: ([key]) => { const v = val(key); return has(v) ? esc(v) : null; },
    // <title> cannot contain comments (browsers show them), so this marker wraps the whole tag
    title: ([key]) => { const v = val(key); return has(v) ? `<title>${esc(v)}</title>` : null; },
    attr: ([key, name], orig) => { const v = val(key); return has(v) ? setAttr(orig, name, String(v)) : null; },
    img: ([key, full], orig) => {
      const img = val(key); const a = assetOf(idx, img);
      if (!a) return null;
      let tag = setAttr(orig, 'src', imgSrc(a, full === 'full'));
      tag = setAttr(tag, 'alt', img.alt || '');
      if (a.w) { tag = setAttr(tag, 'width', String(a.w)); tag = setAttr(tag, 'height', String(a.h)); }
      return tag;
    },
    imgurl: ([key], orig) => { const a = assetOf(idx, val(key)); return a ? setAttr(orig, 'content', `${a.url}?w=1200&fit=max`) : null; },
    paras: ([key, cls]) => {
      const v = val(key); if (!has(v)) return null;
      return String(v).split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
        .map((p) => `<p${cls && cls !== '-' ? ` class="${cls}"` : ''}>${inlineFmt(p)}</p>`).join('\n        ');
    },
    pt: ([key, h2cls, ulcls]) => { const v = val(key); return Array.isArray(v) ? ptToHtml(v, h2cls, ulcls, CUSTOM_PT) : null; },
    list: ([key]) => {
      const items = val(key); const cfg = LISTS[key];
      if (!Array.isArray(items) || !cfg) return null;
      return cfg.lead + items.map((it, i) => cfg.template.replace(/\{\{(\w+)(?:\|(\w+))?\}\}/g, (m, f, mod) => {
        if (f === 'i') return String(i + 1);
        if (mod === 'img') return imgAttrs(idx, it[f]);
        if (mod === 'attr') return esc(ptPlain(it[f]));
        return inlineFmt(it[f]);
      })).join(cfg.sep) + cfg.trail;
    },
    yt: ([key], orig) => { const id = youTubeId(val(key)); return id ? setAttr(orig, 'src', `https://www.youtube.com/embed/${id}`) : null; },
    video: ([key, posterKey], orig) => {
      let tag = orig;
      const f = val(key); const fa = f && f.asset && idx.assets[f.asset._ref];
      if (fa) tag = setAttr(tag, 'src', fa.url);
      const pa = assetOf(idx, val(posterKey));
      if (pa) tag = setAttr(tag, 'poster', imgSrc(pa));
      return tag;
    },
    wa: ([key], orig) => { const v = val(key); return has(v) && s.whatsappNumber ? setAttr(orig, 'href', waLink(s.whatsappNumber, v)) : null; },
    jsonld: ([faqKey], orig) => {
      const m = orig.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
      if (!m) return null;
      let data; try { data = JSON.parse(m[1]); } catch { return null; }
      const faq = faqKey ? val(faqKey) : null;
      const walk = (n) => {
        if (Array.isArray(n)) return n.forEach(walk);
        if (!n || typeof n !== 'object') return;
        if ('telephone' in n && s.whatsappNumber) n.telephone = '+' + s.whatsappNumber;
        if ('email' in n && s.email) n.email = s.email;
        if (Array.isArray(n.sameAs)) n.sameAs = n.sameAs.map((u) =>
          /instagram\.com/.test(u) && s.instagramUrl ? s.instagramUrl : /facebook\.com/.test(u) && s.facebookUrl ? s.facebookUrl : u);
        if (n['@type'] === 'FAQPage' && Array.isArray(faq)) n.mainEntity = faq.map((q) => ({
          '@type': 'Question', name: ptPlain(q.qZh) + ptPlain(q.qEn),
          acceptedAnswer: { '@type': 'Answer', text: ptPlain(q.aZh) + ptPlain(q.aEn) },
        }));
        Object.values(n).forEach(walk);
      };
      walk(data);
      return `<script type="application/ld+json">\n${JSON.stringify(data, null, 2).replace(/</g, '\\u003c')}\n</script>`;
    },
  };
}

async function main() {
  const data = await loadData();
  validate(data);
  const r = { ...genericRenderers(data, LISTS, {}), ...renderers(data) };
  const files = (await readdir(ROOT)).filter((f) => f.endsWith('.html'));
  let changed = 0;
  for (const file of files) {
    const p = path.join(ROOT, file);
    const before = await readFile(p, 'utf8');
    const after = before.replace(MARKER, (all, name, opts, inner) => {
      if (!r[name]) throw new Error(`${file}: unknown marker cms:${name}`);
      const out = r[name](opts.trim().split(' '), inner);
      if (out === undefined || out === null || out === false) return all;
      return `<!-- cms:${name}${opts} -->${out}<!-- /cms:${name}${opts} -->`;
    });
    if (after !== before) {
      await writeFile(p, after);
      changed++;
      console.log(`updated ${file}`);
    }
  }
  console.log(changed ? `${changed} file(s) updated` : 'no changes');
}

main().catch((e) => { console.error(e.message); process.exit(1); });
