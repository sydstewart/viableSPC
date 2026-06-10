// Inject shared header and footer partials
async function inject(id, url) {
    const el = document.getElementById(id);
    if (!el) return;
    const r = await fetch(url, { cache: "no-cache" });
    if (!r.ok) return;
    el.innerHTML = await r.text();
}

// Inject header first, then wire up the mobile menu toggle after it loads
inject("site-header", "partials/header.html").then(() => {
    const btn = document.querySelector('.mobile-menu-btn');
    const nav = document.getElementById('mobileNav');
    if (btn && nav) {
        btn.addEventListener('click', () => {
            const open = nav.classList.toggle('open');
            btn.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
    }
});

inject("site-footer", "partials/footer.html");
