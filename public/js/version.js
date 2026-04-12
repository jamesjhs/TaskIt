/* Populates all .page-version elements with the live version from the server. */
fetch('/api/version', { cache: 'no-store' }).then(r => r.json()).then(d => {
  if (d.version) document.querySelectorAll('.page-version').forEach(el => { el.textContent = d.version; });
}).catch(() => {});
