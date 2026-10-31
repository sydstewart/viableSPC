// Inject the shared site chrome and initialise its navigation.
async function inject(id, url) {
    const el = document.getElementById(id);
    if (!el) return;
    try {
        const response = await fetch(url, { cache: "no-cache" });
        if (response.ok) el.innerHTML = await response.text();
    } catch (error) {
        console.warn("Could not load shared site content:", url);
    }
}

function wireSiteNavigation() {
    const header = document.querySelector('.simple-header');
    const button = document.querySelector('.mobile-menu-btn');
    const mobileNav = document.getElementById('mobileNav');
    if (!header || header.dataset.navigationReady) return;
    header.dataset.navigationReady = 'true';
    const desktopGroups = [...header.querySelectorAll('details.simple-dropdown')];
    const mobileGroups = mobileNav ? [...mobileNav.querySelectorAll('details.simple-dropdown')] : [];
    function closeGroups(groups) { groups.forEach(group => { group.open = false; }); }
    function closeMobile(restoreFocus = false) {
        if (!mobileNav || !button) return;
        mobileNav.classList.remove('open');
        button.setAttribute('aria-expanded', 'false');
        closeGroups(mobileGroups);
        if (restoreFocus) button.focus();
    }
    if (button && mobileNav) {
        button.addEventListener('click', () => {
            const open = mobileNav.classList.toggle('open');
            button.setAttribute('aria-expanded', String(open));
            if (!open) closeGroups(mobileGroups);
        });
        mobileNav.addEventListener('click', event => {
            if (event.target.closest('a')) closeMobile();
        });
    }
    // Close desktop disclosures when navigating or clicking outside them.
    document.addEventListener('click', event => {
        desktopGroups.forEach(group => {
            if (!group.contains(event.target) || event.target.closest('a')) group.open = false;
        });
        if (mobileNav && mobileNav.classList.contains('open') &&
            !mobileNav.contains(event.target) && !header.contains(event.target)) closeMobile();
    });
    document.addEventListener('focusin', event => {
        desktopGroups.forEach(group => { if (!group.contains(event.target)) group.open = false; });
    });
    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        const openGroup = [...desktopGroups, ...mobileGroups].find(group => group.open);
        if (openGroup) {
            openGroup.open = false;
            openGroup.querySelector('summary').focus();
            event.preventDefault();
        } else if (mobileNav && mobileNav.classList.contains('open')) {
            closeMobile(true);
            event.preventDefault();
        }
    });
    const wide = window.matchMedia('(min-width: 1361px)');
    wide.addEventListener('change', () => { closeGroups(desktopGroups); closeMobile(); });
}

inject('site-header', 'partials/header.html').then(wireSiteNavigation);
inject('site-footer', 'partials/footer.html');
