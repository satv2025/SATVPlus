export function qs(sel, root = document) { return root.querySelector(sel); }
export function qsa(sel, root = document) { return [...root.querySelectorAll(sel)]; }

export function setActiveNav(path) {
    qsa("[data-nav]").forEach(a => {
        const is = a.getAttribute("href") === path;
        a.classList.toggle("active", is);
    });
}

let toastTimer = null;
export function toast(title, detail = "") {
    const el = qs("#toast");
    if (!el) return;
    el.innerHTML = `<div>${escapeHtml(title)}</div>${detail ? `<small>${escapeHtml(detail)}</small>` : ""}`;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2800);
}

export function escapeHtml(str) {
    return (str ?? "")
        .toString()
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

export function formatMinutesLabel(mins) {
    if (!Number.isFinite(mins)) return "";
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    if (h <= 0) return `${m} min`;
    if (m === 0) return `${h} h`;
    return `${h} h ${m} min`;
}

export function parseDurationToMinutes(str) {
    // soporta "1 h 20 min", "2 h", "43 min"
    const s = (str || "").toLowerCase();
    let h = 0, m = 0;
    const hm = s.match(/(\d+)\s*h/);
    const mm = s.match(/(\d+)\s*min/);
    if (hm) h = parseInt(hm[1], 10);
    if (mm) m = parseInt(mm[1], 10);
    return (h * 60) + m;
}