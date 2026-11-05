/* ==========================================================================
   Burry - portfolio chat widget (vanilla JS, no dependencies)

   - Floating launcher in the bottom-right corner
   - A reminder bubble pops up every 8-9 seconds while the chat is closed
   - Streams answers from the Flask backend (POST /api/chat)
   ========================================================================== */
(() => {
  "use strict";

  /* ------------------------------------------------------------ Settings */

  const NUDGE_MIN_MS = 8000;      // a reminder appears every 8-9 seconds
  const NUDGE_MAX_MS = 9000;
  const NUDGE_VISIBLE_MS = 4500;  // ...and stays on screen this long
  const MAX_HISTORY = 12;         // messages sent to the server
  const STORAGE_KEY = "burry_chat_v1";

  const GREETING =
    "Hi, I’m **Burry** 👋 the assistant for this portfolio. I can tell you about the " +
    "designer’s skills, projects, experience and how to get in touch. What would you like to know?";

  const QUICK_REPLIES = [
    "Who is behind this portfolio?",
    "What projects have they built?",
    "What skills and tools do they use?",
    "What’s their experience?",
    "How can I hire them?",
  ];

  const NUDGES = [
    ["Hi, I’m Burry 👋", "Ask me anything about this portfolio."],
    ["Looking for a designer?", "I can tell you about the brand and web work."],
    ["Curious about the projects?", "Ask me about VisaBits and Nippon Paints."],
    ["Need a quick answer?", "Skills, experience, availability: just ask."],
    ["Want to start a project?", "I’ll point you to the right place."],
    ["Questions? I’m right here.", "Tap to chat with Burry."],
  ];

  /* Where the Flask API lives.
     - Opened through Flask (http://127.0.0.1:5000)  -> same origin
     - Opened with VS Code Live Server / file://     -> http://127.0.0.1:5000
     - Deployed behind your own domain               -> same origin
     Override any time with:  window.BURRY_API_URL = "https://your-api.example.com"  */
  function apiBase() {
    if (typeof window.BURRY_API_URL === "string") return window.BURRY_API_URL.replace(/\/$/, "");
    const { protocol, port, hostname } = window.location;
    if (protocol === "file:") return "http://127.0.0.1:5000";
    if (port === "5000") return "";
    if (hostname === "localhost" || hostname === "127.0.0.1") return "http://127.0.0.1:5000";
    return "";
  }
  const API = apiBase();

  /* ----------------------------------------------------------- Markup */

  const FACE = `
    <svg class="burry-face" viewBox="0 0 48 48" aria-hidden="true">
      <use href="#burry-face-symbol"></use>
    </svg>`;

  const root = document.createElement("div");
  root.className = "burry-root";
  root.id = "burry";
  root.innerHTML = `
    <svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">
      <defs>
        <symbol id="burry-face-symbol" viewBox="0 0 48 48">
          <line x1="24" y1="14" x2="24" y2="8.5" stroke="#e5b25d" stroke-width="2" stroke-linecap="round"/>
          <circle cx="24" cy="7" r="2.6" fill="#e5b25d"/>
          <rect x="6.5" y="22" width="4" height="9" rx="2" fill="#e5b25d"/>
          <rect x="37.5" y="22" width="4" height="9" rx="2" fill="#e5b25d"/>
          <rect x="10" y="14" width="28" height="22" rx="10" fill="#f6eee1"/>
          <ellipse class="burry-eye" cx="18.5" cy="24.5" rx="2.4" ry="3.2" fill="#2a1014"/>
          <ellipse class="burry-eye" cx="29.5" cy="24.5" rx="2.4" ry="3.2" fill="#2a1014"/>
          <circle cx="14.5" cy="29.5" r="2" fill="#d4142f" opacity=".28"/>
          <circle cx="33.5" cy="29.5" r="2" fill="#d4142f" opacity=".28"/>
          <path d="M19.5 30 Q24 34.2 28.5 30" fill="none" stroke="#b8643a" stroke-width="2" stroke-linecap="round"/>
        </symbol>
      </defs>
    </svg>

    <div class="burry-nudge" id="burry-nudge" role="status" aria-live="polite">
      <button type="button" class="burry-nudge-open"><b></b><span></span></button>
      <button type="button" class="burry-nudge-x" aria-label="Dismiss reminder">&times;</button>
    </div>

    <section class="burry-window" id="burry-window" role="dialog" aria-label="Chat with Burry">
      <header class="burry-head">
        <span class="burry-avatar lg">${FACE}</span>
        <div class="burry-id">
          <b>Burry</b>
          <span class="burry-status"><i></i>Online · Portfolio assistant</span>
        </div>
        <button type="button" class="burry-icon-btn" data-act="reset" aria-label="Start a new chat" title="New chat">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></svg>
        </button>
        <button type="button" class="burry-icon-btn" data-act="close" aria-label="Close chat" title="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
      </header>

      <div class="burry-log" role="log" aria-live="polite" aria-label="Conversation with Burry"></div>

      <form class="burry-form" autocomplete="off">
        <textarea rows="1" maxlength="1500" placeholder="Ask Burry anything…" aria-label="Your message"></textarea>
        <button type="submit" class="burry-send" aria-label="Send message">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        </button>
      </form>
      <p class="burry-foot">Burry is an AI assistant and can make mistakes.</p>
    </section>

    <button type="button" class="burry-launcher" aria-label="Open chat with Burry"
            aria-expanded="false" aria-controls="burry-window">
      <span class="burry-ico burry-ico-chat">${FACE}</span>
      <span class="burry-ico burry-ico-close">
        <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
      </span>
      <i class="burry-dot" aria-hidden="true"></i>
    </button>
  `;
  document.body.appendChild(root);

  const $ = (sel) => root.querySelector(sel);
  const launcher = $(".burry-launcher");
  const win = $(".burry-window");
  const log = $(".burry-log");
  const form = $(".burry-form");
  const input = $(".burry-form textarea");
  const sendBtn = $(".burry-send");
  const nudge = $("#burry-nudge");
  const nudgeTitle = nudge.querySelector("b");
  const nudgeSub = nudge.querySelector("span");

  /* ------------------------------------------------------------ State */

  let history = [];        // [{role: "user" | "assistant", content}]
  let isOpen = false;
  let busy = false;
  let nudgeTimer = 0;
  let nudgeHideTimer = 0;
  let nudgeIndex = 0;

  function save() {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-40))); } catch (_) {}
  }
  function load() {
    try {
      const data = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "[]");
      if (Array.isArray(data)) {
        history = data.filter(
          (m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string"
        );
      }
    } catch (_) { history = []; }
  }

  /* ------------------------------------- Safe, minimal markdown renderer */

  const esc = (s) =>
    s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function inline(text) {
    let s = esc(text);
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+|#[A-Za-z][\w-]*)\)/g,
      (_, label, url) =>
        url.startsWith("#")
          ? `<a href="${url}">${label}</a>`   // jump to a section of this page
          : `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`
    );
    // bare URLs (not already inside an href or link text)
    s = s.replace(
      /(^|[\s(])(https?:\/\/[^\s<)]*[^\s<).,;:!?])/g,
      (_, pre, url) => `${pre}<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
    );
    return s;
  }

  function render(md) {
    const lines = md.replace(/\r/g, "").split("\n");
    let html = "", list = null, para = [], code = null;
    const flushPara = () => { if (para.length) { html += `<p>${para.map(inline).join("<br>")}</p>`; para = []; } };
    const flushList = () => { if (list) { html += `</${list}>`; list = null; } };

    for (const line of lines) {
      if (/^\s*```/.test(line)) {
        if (code) { html += `<pre><code>${esc(code.join("\n"))}</code></pre>`; code = null; }
        else { flushPara(); flushList(); code = []; }
        continue;
      }
      if (code) { code.push(line); continue; }

      let m;
      if ((m = line.match(/^\s*[-*•]\s+(.*)/))) {
        flushPara();
        if (list !== "ul") { flushList(); html += "<ul>"; list = "ul"; }
        html += `<li>${inline(m[1])}</li>`;
      } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) {
        flushPara();
        if (list !== "ol") { flushList(); html += "<ol>"; list = "ol"; }
        html += `<li>${inline(m[1])}</li>`;
      } else if (!line.trim()) {
        flushPara(); flushList();
      } else if ((m = line.match(/^#{1,4}\s+(.*)/))) {
        flushPara(); flushList();
        html += `<p><strong>${inline(m[1])}</strong></p>`;
      } else {
        flushList();
        para.push(line);
      }
    }
    if (code) html += `<pre><code>${esc(code.join("\n"))}</code></pre>`;
    flushPara(); flushList();
    return html;
  }

  /* ---------------------------------------------------------- Chat UI */

  const nearBottom = () => log.scrollHeight - log.scrollTop - log.clientHeight < 90;
  function scrollDown(force) {
    if (force || nearBottom()) log.scrollTop = log.scrollHeight;
  }

  function addMessage(role, text, extraClass = "") {
    const wrap = document.createElement("div");
    wrap.className = `burry-msg ${role === "user" ? "user" : "bot"} ${extraClass}`.trim();
    if (role !== "user") wrap.insertAdjacentHTML("afterbegin", `<span class="burry-avatar sm">${FACE}</span>`);
    const bubble = document.createElement("div");
    bubble.className = "burry-bubble";
    if (role === "user") bubble.textContent = text;
    else bubble.innerHTML = render(text);
    wrap.appendChild(bubble);
    log.appendChild(wrap);
    scrollDown(true);
    return bubble;
  }

  function addTyping() {
    const wrap = document.createElement("div");
    wrap.className = "burry-msg bot";
    wrap.innerHTML = `<span class="burry-avatar sm">${FACE}</span>
      <div class="burry-bubble" aria-label="Burry is typing"><div class="burry-typing"><i></i><i></i><i></i></div></div>`;
    log.appendChild(wrap);
    scrollDown(true);
    return wrap;
  }

  function addChips() {
    const box = document.createElement("div");
    box.className = "burry-chips";
    QUICK_REPLIES.forEach((q) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "burry-chip";
      b.textContent = q;
      b.addEventListener("click", () => send(q));
      box.appendChild(b);
    });
    log.appendChild(box);
    scrollDown(true);
  }

  function startConversation() {
    log.innerHTML = "";
    addMessage("assistant", GREETING);
    addChips();
  }

  function restoreConversation() {
    log.innerHTML = "";
    addMessage("assistant", GREETING);
    if (!history.length) { addChips(); return; }
    history.forEach((m) => addMessage(m.role, m.content));
  }

  function setBusy(v) {
    busy = v;
    sendBtn.disabled = v;
    input.setAttribute("aria-busy", String(v));
  }

  function autosize() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 112) + "px";
  }

  /* -------------------------------------------------------- Messaging */

  async function send(text) {
    text = (text || "").trim();
    if (!text || busy) return;

    log.querySelector(".burry-chips")?.remove();
    addMessage("user", text);
    history.push({ role: "user", content: text });
    save();
    input.value = "";
    autosize();
    setBusy(true);

    const typing = addTyping();
    let bubble = null;
    let answer = "";
    let raf = 0;
    const paint = () => { raf = 0; bubble.innerHTML = render(answer); scrollDown(false); };

    try {
      const res = await fetch(`${API}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history.slice(-MAX_HISTORY) }),
      });

      if (!res.ok) {
        let message = "";
        try { message = (await res.json()).error || ""; } catch (_) {}
        throw Object.assign(new Error(message || "Something went wrong. Please try again."), { friendly: true });
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        let end;
        while ((end = buffer.indexOf("\n\n")) >= 0) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          for (const line of block.split("\n")) {
            if (!line.startsWith("data:")) continue;
            let evt;
            try { evt = JSON.parse(line.slice(5)); } catch (_) { continue; }
            if (evt.error) throw Object.assign(new Error(evt.error), { friendly: true });
            if (evt.delta) {
              if (!bubble) { typing.remove(); bubble = addMessage("assistant", ""); }
              answer += evt.delta;
              if (!raf) raf = requestAnimationFrame(paint);
            }
          }
        }
      }

      if (raf) cancelAnimationFrame(raf);
      if (!answer.trim()) {
        throw Object.assign(new Error("I didn’t get an answer back that time. Could you try asking again?"), { friendly: true });
      }
      bubble.innerHTML = render(answer);
      history.push({ role: "assistant", content: answer });
      save();
    } catch (err) {
      if (raf) cancelAnimationFrame(raf);
      typing.remove();
      if (bubble && answer.trim()) {
        history.push({ role: "assistant", content: answer });   // keep what arrived before the interruption
        save();
      }
      const msg = err.friendly
        ? err.message
        : "I can’t reach my server right now. Please try again in a moment, or use the contact form on this page.";
      if (!err.friendly) console.warn("[Burry] request failed:", err);
      addMessage("assistant", msg, "error");
    } finally {
      typing.remove();
      setBusy(false);
      scrollDown(true);
      if (isOpen && !matchMedia("(pointer: coarse)").matches) input.focus();
    }
  }

  /* -------------------------------------------------- Reminder bubble */

  function hideNudge() {
    clearTimeout(nudgeHideTimer);
    nudge.classList.remove("show");
    launcher.classList.remove("ping");
  }

  function showNudge() {
    if (isOpen || document.hidden) { scheduleNudge(); return; }
    const [title, sub] = NUDGES[nudgeIndex++ % NUDGES.length];
    nudgeTitle.textContent = title;
    nudgeSub.textContent = sub;

    // restart the ring/wiggle animation
    launcher.classList.remove("ping");
    void launcher.offsetWidth;
    launcher.classList.add("ping");
    nudge.classList.add("show");

    clearTimeout(nudgeHideTimer);
    nudgeHideTimer = setTimeout(hideNudge, NUDGE_VISIBLE_MS);
    scheduleNudge();
  }

  function scheduleNudge() {
    clearTimeout(nudgeTimer);
    const wait = NUDGE_MIN_MS + Math.random() * (NUDGE_MAX_MS - NUDGE_MIN_MS);
    nudgeTimer = setTimeout(showNudge, wait);
  }

  /* ------------------------------------------------------ Open / close */

  function openChat() {
    if (isOpen) return;
    isOpen = true;
    root.classList.add("is-open", "seen");
    launcher.setAttribute("aria-expanded", "true");
    launcher.setAttribute("aria-label", "Close chat with Burry");
    hideNudge();
    clearTimeout(nudgeTimer);
    scrollDown(true);
    if (!matchMedia("(pointer: coarse)").matches) setTimeout(() => input.focus(), 280);
  }

  function closeChat(returnFocus = true) {
    if (!isOpen) return;
    isOpen = false;
    root.classList.remove("is-open");
    launcher.setAttribute("aria-expanded", "false");
    launcher.setAttribute("aria-label", "Open chat with Burry");
    scheduleNudge();                       // start reminding again 8-9 s after closing
    if (returnFocus) launcher.focus();
  }

  function resetChat() {
    if (busy) return;
    history = [];
    save();
    startConversation();
    input.focus();
  }

  /* ----------------------------------------------------------- Events */

  launcher.addEventListener("click", () => (isOpen ? closeChat() : openChat()));
  nudge.querySelector(".burry-nudge-open").addEventListener("click", openChat);
  nudge.querySelector(".burry-nudge-x").addEventListener("click", hideNudge);   // reminders keep coming

  root.querySelector('[data-act="close"]').addEventListener("click", () => closeChat());
  root.querySelector('[data-act="reset"]').addEventListener("click", resetChat);

  form.addEventListener("submit", (e) => { e.preventDefault(); send(input.value); });

  input.addEventListener("input", autosize);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send(input.value);
    }
  });

  root.addEventListener("keydown", (e) => { if (e.key === "Escape" && isOpen) closeChat(); });

  // In-page links from Burry (e.g. "contact form" -> #contact): on phones the chat covers
  // most of the screen, so tuck it away to reveal the section.
  log.addEventListener("click", (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (link && matchMedia("(max-width: 520px)").matches) closeChat(false);
  });

  document.addEventListener("visibilitychange", () => { if (document.hidden) hideNudge(); });

  /* ------------------------------------------------------------- Start */

  load();
  restoreConversation();
  if (history.length) root.classList.add("seen");   // returning visitor: no unread dot
  scheduleNudge();

  // Small hook for debugging / other scripts:  Burry.open(), Burry.close()
  window.Burry = { open: openChat, close: () => closeChat(false) };
})();
