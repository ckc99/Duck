# 用 Sanity 编辑网站 · Editing the website with Sanity

Content is edited at **https://kampar-free-range-duck.sanity.studio/** (Sanity project `3k9cyy6o`).
The site itself is still plain HTML on GitHub Pages, so search engines see normal static pages.

## How an edit reaches the site

1. Edit and **Publish** in Sanity Studio.
2. Within about 30 minutes the GitHub Action **Sync content from Sanity** (`.github/workflows/sanity-sync.yml`) picks it up.
   To see it sooner, open the repo's **Actions** tab → *Sync content from Sanity* → **Run workflow**.
3. The action runs `scripts/sanity-sync.mjs`, which rewrites only the parts of the HTML between
   `<!-- cms:… -->` and `<!-- /cms:… -->` markers, then commits. GitHub Pages redeploys in about a minute.

It refuses to change anything if Sanity returns no products or no WhatsApp number.

## What Sanity controls

| In Sanity | On the site |
|---|---|
| Site Settings & Contact 网站设置 | Footer on every page: company name, email / WhatsApp / Instagram / Facebook icons, Ipoh & Klang addresses. WhatsApp number is also used by every **Enquire** button |
| Home Page 首页 | "Since 2016", brand slogan 品牌标语, the two key numbers (50天+, >2.4kg), captions of the 4 山水鸭的诞生 photos |
| Product 产品 | `products.html`: the first **Whole duck** is the big feature (photos, Chinese/English text, specs); every other product is a card in 鸭只部位. Optional price, out of stock / hidden. A part with no photo shows the logo placeholder |

Everything else (layout, hero, video, home slider, service-area cards, About and Supplier page bodies, page titles/meta tags) is still edited in the HTML.

**Don't delete or rename the `<!-- cms:… -->` comments** — the sync uses them to know what to replace.

## Optional: instant updates with a webhook

Not needed — the 30-minute check already works. Add this only if you want changes live within a minute.

1. GitHub → Settings → Developer settings → **Fine-grained personal access tokens** → Generate.
   Repository access: only `ckc99/Duck`. Permissions: **Contents: Read and write**. Copy the token.
2. https://www.sanity.io/manage → project **Kampar Free Range Duck 金宝山水鸭** → API → Webhooks → Create:
   - URL: `https://api.github.com/repos/ckc99/Duck/dispatches`
   - Dataset: `production`, Trigger on: Create, Update, Delete
   - Filter: `!(_id in path("drafts.**"))`
   - Projection: `{"event_type": "sanity-publish"}`
   - HTTP method: POST
   - HTTP headers: `Authorization: Bearer <your token>` and `Accept: application/vnd.github+json`

Note: GitHub pauses scheduled actions in a repo with no commits for 60 days. If that happens, the Actions tab shows a banner — click **Enable workflow**.

## Testing locally

```bash
node scripts/sanity-sync.mjs            # pulls live content and rewrites the HTML
git diff                                # see what changed
```
