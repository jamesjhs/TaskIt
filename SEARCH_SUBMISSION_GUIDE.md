# TaskIt Search Submission Guide

**Version 1.21.8**  
For the official hosted property: `https://taskit.jahosi.co.uk/`

## Self-Hosting Domain Configuration

If you deploy TaskIt on your own domain, update all official-host references before launch:

- Replace every `taskit.jahosi.co.uk` reference in this guide with your own canonical hostname
- Update `public/robots.txt` and `public/sitemap.xml`
- Update the canonical, Open Graph, Twitter, and structured-data URLs in `public/index.html`
- If you publish your own forked documentation, replace the “official hosted property” wording and any version / branding context that no longer applies

## 1. What to submit before launch

Make sure the hosted site has all of these live first:

- `https://taskit.jahosi.co.uk/robots.txt`
- `https://taskit.jahosi.co.uk/sitemap.xml`
- `https://taskit.jahosi.co.uk/llms.txt`
- Updated landing page metadata, Open Graph tags, and FAQ structured data
- A working social preview image at `https://taskit.jahosi.co.uk/og-image.png`

## 2. Priority submission targets

### Tier 1 — Submit directly

1. **Google Search Console**
   - Add the property as a **Domain property** if DNS access is available; otherwise use the URL-prefix property.
   - Verify ownership via DNS TXT where possible.
   - Submit `https://taskit.jahosi.co.uk/sitemap.xml`.
   - Use the URL Inspection tool to request indexing for:
     - `/`
     - `/user-guide.html`
     - `/howto.html`
     - `/privacy-policy.html`
   - Monitor:
     - Index coverage
     - Core Web Vitals
     - Search appearance / rich results
     - Search queries containing `taskit`, `self-hosted task manager`, `habitica alternative`, `todoist alternative`

2. **Bing Webmaster Tools**
   - Import the property from Search Console if available.
   - Submit the same sitemap.
   - Use URL submission on the same four pages.
   - Bing feeds indexing for:
     - Bing
     - Yahoo
     - DuckDuckGo (partly via Bing)
     - Ecosia
     - Many smaller search partners

3. **Yandex Webmaster**
   - Optional but worthwhile for broader international coverage.
   - Submit the sitemap and verify the home page.

### Tier 2 — No meaningful direct submission, optimize indirectly

4. **Brave Search**
   - Brave has limited direct webmaster tooling.
   - Best route: ensure Bing and Google index the site, then build crawlable backlinks from GitHub, documentation, and launch listings.

5. **Kagi**
   - No mainstream direct submission path.
   - Strong indexing on Google/Bing plus quality structured content is the practical route.

6. **Apple / Siri / Spotlight web discovery**
   - No normal standalone submission workflow for a site like TaskIt.
   - Good metadata, Open Graph, and clean indexing on major engines are the practical inputs.

## 3. AI discovery and citation checklist

These do not replace search-engine submission, but they improve visibility in AI answers:

- Keep `robots.txt` permissive for mainstream AI crawlers
- Maintain `llms.txt` with concise, factual product summaries
- Keep FAQ schema on the landing page aligned with real product behaviour
- Maintain visible comparison content for “TaskIt vs …” intent
- Keep the user guide and deployment guide public, crawlable, and internally linked
- Ensure all share cards point at a valid, public `og-image.png`

## 4. Best supporting links to publish on launch week

To accelerate discovery, publish backlinks from:

- GitHub repository README
- Release notes / changelog entry
- Product Hunt or comparable launch communities
- Reddit communities relevant to self-hosting, productivity, homelabs, and open source
- Hacker News “Show HN” if a polished demo and deployment story are ready
- Indie Hackers / alternative directories
- Self-hosted software directories and “awesome self-hosted” lists where permitted

## 5. Search positioning to reinforce in every listing

Use a consistent short description:

> Free, open-source, self-hosted task manager with recurring tasks, group collaboration, calendar sync, and optional gamification.

Use a consistent longer description:

> TaskIt is a privacy-first task manager for individuals, households, and small teams. It combines recurring tasks, sporadic maintenance tracking, long-term goals, reminders, private calendar feeds, and optional XP-based gamification in one self-hosted app.

## 6. Recommended keyword themes

Prioritize pages and listings around these intents:

- self-hosted task manager
- open source task manager
- Todoist alternative
- Habitica alternative
- recurring task manager
- household task manager
- maintenance task tracker
- gamified productivity app
- privacy-first productivity tool

## 7. First 30 days after submission

- Re-submit the homepage after major copy or metadata changes
- Watch which queries trigger impressions in Search Console
- Expand the landing page copy around the winning queries
- Add real external backlinks from launch posts and directory profiles
- Keep sitemap `lastmod` values fresh when public pages materially change
- Review Bing and Google crawl errors weekly until indexing stabilizes

## 8. What not to do

- Do not submit duplicate or staging domains
- Do not claim unsupported features in metadata or launch listings
- Do not let `robots.txt`, `llms.txt`, and the landing page contradict each other
- Do not use a favicon-sized image as the long-term social preview asset
