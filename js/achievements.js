/* Achievements: tracked in localStorage, Bruno-style playful panel. */

const DEFS = [
  { id: "start", icon: "🚗", title: "I'm going on an adventure!", desc: "Start driving.", target: 1 },
  { id: "zones", icon: "🧭", title: "Traveler", desc: "Visit every section.", target: 4 },
  { id: "letters", icon: "🔤", title: "Alphabet soup", desc: "Knock over all 9 name letters.", target: 9 },
  { id: "strike", icon: "🎳", title: "Strike!", desc: "Down all 6 bowling pins.", target: 6 },
  { id: "knock", icon: "💥", title: "Demolition day", desc: "Knock 15 things over.", target: 15 },
  { id: "pier", icon: "⚓", title: "Sea breeze", desc: "Drive onto the ferry pier.", target: 1 },
  { id: "speed", icon: "🚀", title: "Speed demon", desc: "Hit 60 km/h.", target: 1 },
  { id: "dist", icon: "🛣️", title: "City marathon", desc: "Drive 3 km in total.", target: 3000 },
];

const fmt = (def, v) =>
  def.id === "dist" ? `${(Math.min(v, def.target) / 1000).toFixed(1)} / 3.0 km`
    : `${Math.min(Math.round(v), def.target)} / ${def.target}`;

export class Achievements {
  constructor(audio) {
    this.audio = audio;
    try {
      this.state = JSON.parse(localStorage.getItem("ach-v1")) || {};
    } catch (e) { this.state = {}; }
    this.state.counts = this.state.counts || {};
    this.state.sets = this.state.sets || {};
    this.state.unlocked = this.state.unlocked || {};

    this.panel = document.getElementById("achPanel");
    this.list = document.getElementById("achList");
    this.toast = document.getElementById("achToast");
    this.counter = document.getElementById("achCount");
    document.getElementById("achBtn").addEventListener("click", () => this.toggle());
    document.getElementById("achClose").addEventListener("click", () => this.toggle(false));
    this.render();
  }

  save() { try { localStorage.setItem("ach-v1", JSON.stringify(this.state)); } catch (e) { /* private mode */ } }

  toggle(force) {
    const open = force !== undefined ? force : !this.panel.classList.contains("open");
    this.panel.classList.toggle("open", open);
    if (open) this.render();
  }

  value(def) {
    if (def.id === "zones") return Object.keys(this.state.sets.zones || {}).length;
    if (def.id === "letters") return Object.keys(this.state.sets.letters || {}).length;
    if (def.id === "strike") return Object.keys(this.state.sets.pins || {}).length;
    return this.state.counts[def.id] || 0;
  }

  /* progress events from the game */
  bump(id, amount = 1) {
    this.state.counts[id] = (this.state.counts[id] || 0) + amount;
    this.check(id);
  }
  mark(set, key) {
    this.state.sets[set] = this.state.sets[set] || {};
    if (this.state.sets[set][key]) return;
    this.state.sets[set][key] = true;
    this.check({ zones: "zones", letters: "letters", pins: "strike" }[set]);
  }
  top(id, v) {
    if ((this.state.counts[id] || 0) >= v) return;
    this.state.counts[id] = v;
    this.check(id);
  }

  check(id) {
    const def = DEFS.find((d) => d.id === id);
    if (!def) { this.save(); return; }
    if (!this.state.unlocked[id] && this.value(def) >= def.target) {
      this.state.unlocked[id] = true;
      this.announce(def);
    }
    this.save();
    if (this.panel.classList.contains("open")) this.render();
    this.renderCount();
  }

  announce(def) {
    this.toast.innerHTML = `<span class="ach-toast-icon">${def.icon}</span><div><b>Achievement unlocked!</b><br>${def.title}</div>`;
    this.toast.classList.add("show");
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => this.toast.classList.remove("show"), 3200);
    if (this.audio) this.audio.chime();
  }

  renderCount() {
    if (this.counter) this.counter.textContent = `${Object.keys(this.state.unlocked).length} / ${DEFS.length}`;
  }

  render() {
    this.renderCount();
    this.list.innerHTML = "";
    for (const def of DEFS) {
      const v = this.value(def);
      const done = !!this.state.unlocked[def.id];
      const el = document.createElement("div");
      el.className = "ach" + (done ? " done" : "");
      el.innerHTML = `
        <span class="ach-icon">${def.icon}</span>
        <div class="ach-mid">
          <h3>${def.title} ${done ? "✓" : ""}</h3>
          <p>${def.desc}</p>
          <div class="ach-bar"><i style="width:${Math.min(100, (v / def.target) * 100)}%"></i></div>
        </div>
        <span class="ach-val">${fmt(def, v)}</span>`;
      this.list.appendChild(el);
    }
  }
}
