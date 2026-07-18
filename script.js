// Theme: default dark, follow saved preference, persist toggle.
(function () {
  const root = document.documentElement;
  const saved = localStorage.getItem("theme");
  if (saved === "light" || saved === "dark") {
    root.dataset.theme = saved;
  } else if (window.matchMedia("(prefers-color-scheme: light)").matches) {
    root.dataset.theme = "light";
  }

  document.getElementById("themeToggle").addEventListener("click", () => {
    const next = root.dataset.theme === "dark" ? "light" : "dark";
    root.dataset.theme = next;
    localStorage.setItem("theme", next);
  });
})();

// Cursor glow follows the pointer (skipped on touch / reduced motion).
(function () {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const body = document.body;
  window.addEventListener(
    "pointermove",
    (e) => {
      body.style.setProperty("--mx", e.clientX + "px");
      body.style.setProperty("--my", e.clientY + "px");
    },
    { passive: true }
  );
})();

// Scroll-reveal via IntersectionObserver.
(function () {
  const items = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) {
    items.forEach((el) => el.classList.add("visible"));
    return;
  }
  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          io.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12 }
  );
  items.forEach((el) => io.observe(el));
})();

document.getElementById("year").textContent = new Date().getFullYear();
