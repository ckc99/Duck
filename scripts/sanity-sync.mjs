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
    }
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
          rel="noopener">咨询整鸭 Enquire</a>
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
            rel="noopener">咨询 Enquire</a>
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

// ---------- sanity checks: never publish an empty or broken site ----------
function validate(d) {
  const problems = [];
  if (!d?.settings) problems.push('Site Settings document is missing');
  else if (!d.settings.whatsappNumber) problems.push('WhatsApp number is empty');
  if (!d?.products?.length) problems.push('no visible products');
  if (!d?.home) problems.push('Home Page document is missing');
  if (problems.length) throw new Error('Refusing to update the site: ' + problems.join('; '));
}

const MARKER = /<!-- cms:([a-z-]+)((?: [a-z0-9]+)*) -->([\s\S]*?)<!-- \/cms:\1\2 -->/g;

async function main() {
  const data = await loadData();
  validate(data);
  const r = renderers(data);
  const files = (await readdir(ROOT)).filter((f) => f.endsWith('.html'));
  let changed = 0;
  for (const file of files) {
    const p = path.join(ROOT, file);
    const before = await readFile(p, 'utf8');
    const after = before.replace(MARKER, (all, name, opts) => {
      if (!r[name]) throw new Error(`${file}: unknown marker cms:${name}`);
      return `<!-- cms:${name}${opts} -->${r[name](opts.trim().split(' '))}<!-- /cms:${name}${opts} -->`;
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
