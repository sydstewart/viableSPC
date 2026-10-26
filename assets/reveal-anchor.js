(function () {
  function revealTarget() {
    let id;

    try {
      id = decodeURIComponent(window.location.hash.slice(1));
    } catch {
      return;
    }

    if (!id) return;

    const target = document.getElementById(id);
    if (!target) return;

    // Open any enclosing dropdowns, including nested ones.
    let element = target;
    while (element) {
      if (element.tagName === "DETAILS") {
        element.open = true;
      }
      element = element.parentElement;
    }

    requestAnimationFrame(() => target.scrollIntoView());
  }

  window.addEventListener("hashchange", revealTarget);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", revealTarget);
  } else {
    revealTarget();
  }
})();