/*
  NZ Redact page. One document with highlights drawn in place, a findings panel with a switch per
  item, a redacted copy with numbered placeholders, and a step that puts the real details back into
  an AI's answer. Everything stays in this tab: nothing is sent and nothing is stored.
*/
(function () {
  "use strict";
  var R = window.NZRedact;
  if (!R) return;
  var $ = function (id) { return document.getElementById(id); };

  var input = $("input"), marks = $("marks"), redactedView = $("redacted"), editor = $("editor");
  var reply = $("reply"), restoredView = $("restored");
  var groupsBox = $("groups"), countEl = $("count"), unitEl = $("count-unit"), statusEl = $("status"), charsEl = $("chars");
  var copyRedacted = $("copy-redacted"), copyRestored = $("copy-restored");
  var tabs = [$("tab-check"), $("tab-copy"), $("tab-back")];
  var announceEl = $("announce"), copyNote = $("copy-note"), pasteNote = $("paste-note");
  var undoMsg = $("undo-msg"), undoBtn = $("undo");
  var peekBtn = $("peek"), peekIcon = $("peek-icon");
  var panelCopy = $("panel-copy");
  var COPY_NOTE = "Paste it into your AI tool, then bring the answer back to step 3.";

  var EXAMPLE = [
    "Hi Mere,",
    "",
    "Can you sort out Sam's refund before Friday? His IRD number is 49-098-576 and the refund goes to 01-0902-0068389-00.",
    "",
    "He's on 021 123 4567, or email sam.example@example.co.nz. DOB 12/03/1985. For the ACC claim his NHI is ZAA0067, and his driver licence is AB123456.",
    "",
    "Order 4500012904 for 300 units arrived on 10/11/2026 and is not part of this.",
    "",
    "Thanks"
  ].join("\n");

  var kept = {};        // details the visitor switched off (left in the text)
  var added = [];       // text the visitor chose with "Remove this too"
  var pending = null;   // the selection the "Remove this too" button would add
  var removeBtn = $("remove-too");
  var current = { items: [], map: {}, text: "" };
  var peeking = false;  // true while the originals are shown in place of the placeholders (Redacted copy view only)
  var copiedText = null;

  // A live region that exists from page load, so a screen reader announces what changed.
  var flip = false;
  function announce(msg) { flip = !flip; announceEl.textContent = msg + (flip ? "" : "\u00A0"); }

  function keyOf(f) { return f.type + ":" + (f.type === "added" ? f.text.replace(/\s+/g, " ") : f.text.replace(/[\s\-()]/g, "").toLowerCase()); }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function autosize(t, min) { t.style.height = "auto"; t.style.height = Math.max(t.scrollHeight, min || 352) + "px"; }

  function render() {
    var text = input.value;
    // Added text that is no longer in the document is dropped.
    added = added.filter(function (v) { return R.scan(text, { added: [v], types: ["added"] }).length > 0; });
    var all = R.scan(text, { added: added });
    // A possible name is only shown as possible when no sure finding has the same text.
    var sure = {};
    all.forEach(function (f) { if (!f.maybe) sure[keyOf(f)] = true; });
    var isMaybe = function (f) { return !!f.maybe && !sure[keyOf(f)]; };
    var active = all.filter(function (f) { return !kept[keyOf(f)]; });
    var r = R.redact(text, active);
    current = { items: r.items, map: r.map, text: r.text };
    var tokenByKey = {};
    r.items.forEach(function (f) { tokenByKey[keyOf(f)] = f.token; });

    // Highlights, drawn behind the text area in the same place as the words.
    marks.textContent = "";
    var at = 0;
    all.forEach(function (f) {
      marks.appendChild(document.createTextNode(text.slice(at, f.start)));
      marks.appendChild(el("mark", "hl g-" + R.TYPES[f.type].group + (isMaybe(f) ? " is-maybe" : "") + (kept[keyOf(f)] ? " is-kept" : ""), text.slice(f.start, f.end)));
      at = f.end;
    });
    marks.appendChild(document.createTextNode(text.slice(at) + "\n"));
    autosize(input);

    paintRedacted();
    if (copiedText !== null && copiedText !== r.text) { copyNote.textContent = ""; copiedText = null; }

    // Findings, grouped.
    groupsBox.textContent = "";
    var seen = {};
    var unique = all.filter(function (f) { var k = keyOf(f); if (seen[k]) return false; seen[k] = true; return true; });
    Object.keys(R.GROUPS).forEach(function (g) {
      var list = unique.filter(function (f) { return R.TYPES[f.type].group === g; });
      if (!list.length) return;
      var section = el("section", "grp g-" + g);
      var head = el("h3", "grp-head");
      head.appendChild(el("span", "grp-dot"));
      head.appendChild(document.createTextNode(R.GROUPS[g]));
      head.appendChild(el("span", "grp-n", String(list.length)));
      section.appendChild(head);
      var ul = el("ul");
      list.forEach(function (f) {
        var k = keyOf(f), isAdded = f.type === "added", on = isAdded || !kept[k];
        var li = el("li", "hit" + (on ? "" : " is-kept"));
        var body = el("div", "hit-body");
        var top = el("div", "hit-top");
        top.appendChild(el("span", "hit-label", R.TYPES[f.type].label));
        if (on && tokenByKey[k]) top.appendChild(el("span", "tok tok-sm", tokenByKey[k]));
        if (!on) top.appendChild(el("span", "kept-pill", "Left in"));
        if (isMaybe(f)) top.appendChild(el("span", "maybe-pill", "Possible"));
        body.appendChild(top);
        body.appendChild(el("code", "hit-value", f.text));
        body.appendChild(el("span", "hit-why", f.why.charAt(0).toUpperCase() + f.why.slice(1) + "."));
        if (isAdded) {
          // Text the visitor added is never switched off, only taken back out.
          var out = el("button", "take-out");
          out.type = "button";
          out.setAttribute("aria-label", "Take " + f.text + " back out");
          var icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
          icon.setAttribute("class", "i");
          var use = document.createElementNS("http://www.w3.org/2000/svg", "use");
          use.setAttribute("href", "app/icons.svg#rotate-ccw");
          icon.appendChild(use);
          out.appendChild(icon);
          out.appendChild(document.createTextNode("Take back out"));
          out.addEventListener("click", function () {
            added = added.filter(function (v) { return v.replace(/\s+/g, " ").toLowerCase() !== k.slice("added:".length).toLowerCase(); });
            render();
            input.focus();
          });
          li.appendChild(body);
          li.appendChild(out);
          ul.appendChild(li);
          return;
        }
        var sw = el("button", "switch");
        sw.type = "button";
        sw.setAttribute("role", "switch");
        sw.setAttribute("aria-checked", String(on));
        sw.setAttribute("aria-label", "Remove " + R.TYPES[f.type].label + " " + f.text);
        sw.dataset.key = k;
        sw.addEventListener("click", function () {
          if (kept[k]) delete kept[k]; else kept[k] = true;
          render();
          var again = groupsBox.querySelector('[data-key="' + CSS.escape(k) + '"]');
          if (again) again.focus();
        });
        li.appendChild(body);
        li.appendChild(sw);
        ul.appendChild(li);
      });
      section.appendChild(ul);
      groupsBox.appendChild(section);
    });
    if (!unique.length) groupsBox.appendChild(el("p", "side-empty", text ? "Nothing found. Still read it through before you paste it." : "Details appear here as you type."));

    var removed = Object.keys(r.map).length;
    countEl.textContent = String(unique.length);
    unitEl.textContent = unique.length === 1 ? "detail" : "details";
    charsEl.textContent = plural(text.length, "character", "characters");
    statusEl.textContent = !text ? "Nothing yet" : removed ? plural(removed, "detail", "details") + " removed" : "Nothing to remove";
    statusEl.className = "pill" + (removed ? " is-done" : "");
    copyRedacted.disabled = !text;
    renderRestore();
  }

  // Redacted copy, with placeholders shown as chips. While peeking, each chip shows its original value instead.
  // Only the picture changes: the text that gets copied is current.text and is never touched.
  function paintRedacted() {
    redactedView.textContent = "";
    if (!input.value) { redactedView.appendChild(el("p", "doc-empty", "Paste text on the Check step first.")); return; }
    current.text.split(/(\[[A-Z_]+_\d+\])/g).forEach(function (part) {
      if (/^\[[A-Z_]+_\d+\]$/.test(part)) {
        var type = Object.keys(R.TYPES).filter(function (k) { return part.indexOf("[" + R.TYPES[k].token + "_") === 0; })[0];
        var real = peeking && current.map[part];
        redactedView.appendChild(el("span", "tok g-" + (type ? R.TYPES[type].group : "id") + (real ? " is-peek" : ""), real || part));
      } else redactedView.appendChild(document.createTextNode(part));
    });
  }

  function renderRestore() {
    var res = R.restore(reply.value, current.map);
    restoredView.textContent = "";
    if (!reply.value) { restoredView.appendChild(el("p", "doc-empty", "The answer with the real details appears here.")); copyRestored.disabled = true; return; }
    reply.value.split(/(\[\s*[A-Za-z_]+_\d+\s*\])/g).forEach(function (part) {
      var m = part.match(/^\[\s*([A-Za-z_]+_\d+)\s*\]$/);
      var real = m && current.map["[" + m[1].toUpperCase() + "]"];
      if (real) restoredView.appendChild(el("mark", "back", real));
      else restoredView.appendChild(document.createTextNode(part));
    });
    copyRestored.disabled = false;
    copyRestored.dataset.text = res.text;
    if (res.unknown.length) restoredView.appendChild(el("p", "doc-note", "Not recognised, left as written: " + res.unknown.join(", ") + "."));
  }

  // "Remove this too": select words the rules missed and they are removed everywhere they appear.
  // The highlight layer holds the same text in the same place, so it tells us where the selection is on screen.
  function pointsAt(offset) {
    var at = 0, nodes = marks.childNodes;
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i], t = n.nodeType === 3 ? n : n.firstChild;
      var len = t ? t.nodeValue.length : 0;
      if (offset <= at + len) return { node: t, offset: offset - at };
      at += len;
    }
    return null;
  }
  function hideRemove() { pending = null; removeBtn.hidden = true; }
  function showRemove() {
    var a = input.selectionStart, b = input.selectionEnd;
    if (document.activeElement !== input || b <= a) return hideRemove();
    var raw = input.value.slice(a, b), lead = raw.length - raw.replace(/^\s+/, "").length, value = raw.trim();
    if (value.length < 2 || value.length > 120 || !/[A-Za-z0-9\u00C0-\u024F]/.test(value)) return hideRemove();
    pending = value;
    var from = pointsAt(a + lead), to = pointsAt(a + lead + value.length);
    if (!from || !to || !from.node || !to.node) return hideRemove();
    var range = document.createRange();
    range.setStart(from.node, from.offset);
    range.setEnd(to.node, to.offset);
    var rects = range.getClientRects(), box = editor.getBoundingClientRect();
    var first = rects[0] || range.getBoundingClientRect(), last = rects[rects.length - 1] || first;
    removeBtn.hidden = false;
    var w = removeBtn.offsetWidth, h = removeBtn.offsetHeight;
    var left = Math.max(8, Math.min(last.right - box.left - w, box.width - w - 8));
    var top = first.top - box.top - h - 6;
    if (top < 4) top = last.bottom - box.top + 6;
    removeBtn.style.left = left + "px";
    removeBtn.style.top = top + "px";
  }
  removeBtn.addEventListener("mousedown", function (e) { e.preventDefault(); });   // keep the selection while clicking
  removeBtn.addEventListener("click", function () {
    var value = pending;
    hideRemove();
    if (!value) return;
    var norm = value.replace(/\s+/g, " ").toLowerCase();
    if (!added.some(function (v) { return v.replace(/\s+/g, " ").toLowerCase() === norm; })) added.push(value);
    input.setSelectionRange(input.selectionEnd, input.selectionEnd);
    render();
    input.focus();
  });
  ["mouseup", "keyup", "select"].forEach(function (name) { input.addEventListener(name, function () { setTimeout(showRemove, 0); }); });
  input.addEventListener("blur", function () { setTimeout(function () { if (document.activeElement !== removeBtn) hideRemove(); }, 150); });
  removeBtn.addEventListener("blur", function () { setTimeout(function () { if (document.activeElement !== input && document.activeElement !== removeBtn) hideRemove(); }, 150); });
  input.addEventListener("keydown", function (e) { if (e.key === "Escape") hideRemove(); });
  window.addEventListener("resize", function () { if (pending) showRemove(); });

  // Steps, with arrow keys between them.
  function select(tab) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      $(t.getAttribute("aria-controls")).hidden = !on;
    });
    setPeek(false);
  }
  tabs.forEach(function (t, i) {
    t.tabIndex = i === 0 ? 0 : -1;
    t.addEventListener("click", function () { select(t); });
    t.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      var next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
      select(next); next.focus(); e.preventDefault();
    });
  });

  // Copying: the button says Copied with a tick for 1.5 seconds, and a live region says so for screen readers.
  var COPY_LABELS = { "copy-redacted": "Copy redacted text", "copy-restored": "Copy" };
  var copyTimers = {};
  function copy(text, button) {
    var id = button.id, label = $(id + "-label"), icon = $(id + "-icon");
    var paint = function (words, glyph, ms) {
      label.textContent = words;
      icon.setAttribute("href", "app/icons.svg#" + glyph);
      clearTimeout(copyTimers[id]);
      copyTimers[id] = setTimeout(function () { label.textContent = COPY_LABELS[id]; icon.setAttribute("href", "app/icons.svg#copy"); }, ms);
    };
    var done = function (ok) {
      if (!ok) { paint("Select and copy", "copy", 1800); announce("The browser would not copy. Select the text and copy it yourself."); return; }
      paint("Copied", "check", 1500);
      if (id === "copy-redacted") {
        copiedText = text;
        copyNote.textContent = COPY_NOTE;
        announce("Copied. " + COPY_NOTE);
      } else announce("Copied.");
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
    else done(false);
  }
  copyRedacted.addEventListener("click", function () { copy(current.text, copyRedacted); });
  copyRestored.addEventListener("click", function () { copy(copyRestored.dataset.text || "", copyRestored); });

  // Step 3: restoring happens on every paste or keystroke. "Paste answer" reads the clipboard where the browser allows it.
  function putAnswer(text) {
    reply.value = text;
    autosize(reply, 128);
    renderRestore();
    pasteNote.textContent = "";
  }
  function askForCtrlV(message) {
    reply.focus();
    pasteNote.textContent = message;
    announce(message);
  }
  $("paste-answer").addEventListener("click", function () {
    var fallback = function () { askForCtrlV("Press Ctrl+V to paste"); };
    if (!(navigator.clipboard && navigator.clipboard.readText)) return fallback();
    navigator.clipboard.readText().then(function (t) {
      if (!t) return askForCtrlV("The clipboard is empty.");
      putAnswer(t);
      reply.focus();
      announce("Pasted. The real details are back in the text below.");
    }, fallback);
  });

  // Peek: hold Alt (or press and hold the button) on the Redacted copy step to see the original values in place of the placeholders.
  function setPeek(on) {
    on = !!on && !panelCopy.hidden && !!input.value;
    if (on === peeking) return;
    peeking = on;
    peekBtn.setAttribute("aria-pressed", String(on));
    paintRedacted();
  }
  ["pointerdown"].forEach(function (n) { peekBtn.addEventListener(n, function (e) { if (e.button) return; setPeek(true); }); });
  ["pointerup", "pointerleave", "pointercancel", "blur"].forEach(function (n) { peekBtn.addEventListener(n, function () { setPeek(false); }); });
  peekBtn.addEventListener("keydown", function (e) { if (e.key === " " || e.key === "Enter") { e.preventDefault(); setPeek(true); } });
  peekBtn.addEventListener("keyup", function (e) { if (e.key === " " || e.key === "Enter") setPeek(false); });
  peekBtn.addEventListener("contextmenu", function (e) { e.preventDefault(); });
  window.addEventListener("blur", function () { setPeek(false); });

  // Clear keeps what was there for 8 seconds, in a space under the editor that is always reserved, so nothing moves.
  var undoState = null, undoTimer = null;
  function hideUndo() { undoState = null; clearTimeout(undoTimer); undoMsg.hidden = true; }
  function undoClear() {
    if (!undoState) return false;
    var s = undoState;
    hideUndo();
    kept = s.kept; added = s.added; hideRemove();
    input.value = s.input; reply.value = s.reply;
    autosize(reply, 128);
    render();
    input.focus();
    announce("Your text is back.");
    return true;
  }
  undoBtn.addEventListener("click", undoClear);

  // Keyboard sheet.
  var sheet = $("sheet"), sheetClose = $("sheet-close"), sheetFrom = null, sheetTimer = null, sheetOpen = false;
  function openSheet() {
    if (sheetOpen) return;
    sheetOpen = true;
    sheetFrom = document.activeElement;
    clearTimeout(sheetTimer);
    sheet.hidden = false;
    void sheet.offsetWidth;                 // let the browser draw the start state so the change can animate
    sheet.classList.add("is-open");
    sheetClose.focus();
  }
  function closeSheet() {
    if (!sheetOpen) return;
    sheetOpen = false;
    sheet.classList.remove("is-open");
    sheetTimer = setTimeout(function () { sheet.hidden = true; }, 150);
    var back = sheetFrom && sheetFrom !== document.body ? sheetFrom : $("open-shortcuts");
    sheetFrom = null;
    back.focus();
  }
  $("open-shortcuts").addEventListener("click", openSheet);
  sheetClose.addEventListener("click", closeSheet);
  sheet.addEventListener("click", function (e) { if (e.target === sheet) closeSheet(); });

  function isTyping(t) {
    var tag = t && t.tagName ? String(t.tagName).toUpperCase() : "";
    return tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT" || !!(t && t.isContentEditable);
  }
  document.addEventListener("keydown", function (e) {
    if (sheetOpen) {
      if (e.key === "Escape") { e.preventDefault(); closeSheet(); }
      else if (e.key === "Tab") { e.preventDefault(); sheetClose.focus(); }   // the close button is the only stop, so focus stays inside
      return;
    }
    var mod = e.ctrlKey || e.metaKey;
    // These two work even while typing.
    if (mod && e.key === "Enter" && !copyRedacted.disabled) { e.preventDefault(); copy(current.text, copyRedacted); return; }
    if (mod && !e.shiftKey && !e.altKey && (e.key === "z" || e.key === "Z") && undoState) { e.preventDefault(); undoClear(); return; }
    if (isTyping(e.target) || mod) return;
    if (e.key === "?") { e.preventDefault(); openSheet(); }
    else if (e.key === "Alt" && !panelCopy.hidden) { e.preventDefault(); setPeek(true); }
  });
  document.addEventListener("keyup", function (e) { if (e.key === "Alt") { if (peeking) e.preventDefault(); setPeek(false); } });

  // Open or drop a plain-text file. It is read on this device and never uploaded.
  var MAX = 2 * 1024 * 1024;
  function load(file) {
    if (!file) return;
    if (file.size > MAX) { statusEl.textContent = "File is over 2 MB"; return; }
    if (!/\.(txt|csv|tsv|md|eml)$/i.test(file.name) && file.type && !/^text\//.test(file.type)) { statusEl.textContent = "Use a .txt or .csv file"; return; }
    file.text().then(function (t) { kept = {}; added = []; hideRemove(); hideUndo(); input.value = t; select(tabs[0]); render(); input.focus(); });
  }
  $("open-file").addEventListener("click", function () { $("file").click(); });
  $("file").addEventListener("change", function (e) { load(e.target.files[0]); e.target.value = ""; });
  var depth = 0;
  editor.addEventListener("dragenter", function (e) { if (e.dataTransfer && [].indexOf.call(e.dataTransfer.types, "Files") !== -1) { depth++; editor.classList.add("is-dragging"); } });
  editor.addEventListener("dragleave", function () { depth = Math.max(0, depth - 1); if (!depth) editor.classList.remove("is-dragging"); });
  editor.addEventListener("dragover", function (e) { e.preventDefault(); });
  editor.addEventListener("drop", function (e) { e.preventDefault(); depth = 0; editor.classList.remove("is-dragging"); load(e.dataTransfer.files[0]); });

  var timer;
  input.addEventListener("input", function () { hideRemove(); hideUndo(); clearTimeout(timer); timer = setTimeout(render, 60); });
  reply.addEventListener("input", function () { hideUndo(); pasteNote.textContent = ""; autosize(reply, 128); renderRestore(); });
  $("example").addEventListener("click", function () { kept = {}; added = []; hideRemove(); hideUndo(); input.value = EXAMPLE; render(); input.focus(); });
  $("clear").addEventListener("click", function () {
    var had = input.value || reply.value;
    var before = { input: input.value, reply: reply.value, kept: kept, added: added };
    kept = {}; added = []; hideRemove(); hideUndo();
    input.value = ""; reply.value = ""; pasteNote.textContent = ""; autosize(reply, 128); render(); input.focus();
    if (had) { undoState = before; undoMsg.hidden = false; undoTimer = setTimeout(hideUndo, 8000); }
  });
  window.addEventListener("resize", function () { autosize(input); });

  // Theme switch.
  var themeBtn = $("theme");
  function paintTheme() {
    var dark = document.documentElement.getAttribute("data-theme") === "dark";
    themeBtn.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
    themeBtn.querySelector("use").setAttribute("href", "app/icons.svg#" + (dark ? "sun" : "moon"));
  }
  themeBtn.addEventListener("click", function () {
    var next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("nz-redact-theme", next); } catch (e) {}
    paintTheme();
  });
  paintTheme();

  // Accuracy figures, measured by scripts/eval.js and saved in app/accuracy.js.
  var A = window.NZRedactAccuracy;
  if (A && A.blind) {
    var B = A.blind, M = A.main, N = A.names;
    var pct = function (x) { return Math.round(x * 100) + "%"; };
    var set = function (k, v) { document.querySelectorAll('[data-eval="' + k + '"]').forEach(function (n) { n.textContent = v; }); };
    set("docs", String(B.documents)); set("structured", pct(B.structuredRecall)); set("names", pct(B.nameRecall));
    set("precision", pct(B.precision)); set("negatives", B.negativesKept + " of " + B.negatives);
    set("names-sure", pct(B.nameRecallSure));
    if (N) {
      var nameRow = N.types.filter(function (t) { return t.type === "name"; })[0] || { falseAlarms: 0 };
      set("n-docs", String(N.documents)); set("n-recall", pct(N.nameRecall)); set("n-found", String(N.nameHit)); set("n-expected", String(N.nameExpected));
      set("n-precision", pct(N.precision)); set("n-wrong", String(nameRow.falseAlarms)); set("n-negatives", N.negativesKept + " of " + N.negatives);
    }
    set("main-docs", String(M.documents)); set("main-structured", pct(M.structuredRecall)); set("main-names", pct(M.nameRecall));
    var rows = $("acc-rows");
    B.types.forEach(function (t) {
      var tr = el("tr", t.supported ? "" : "unsupported");
      var th = el("th", null, t.label); th.scope = "row"; tr.appendChild(th);
      tr.appendChild(el("td", "n", String(t.expected)));
      tr.appendChild(el("td", "n", t.supported ? String(t.found) : "Not detected"));
      tr.appendChild(el("td", "n" + (t.missed ? " bad" : ""), String(t.missed)));
      tr.appendChild(el("td", "n" + (t.falseAlarms ? " bad" : ""), t.supported ? String(t.falseAlarms) : ""));
      rows.appendChild(tr);
    });
  }
  $("version").textContent = "Version " + R.version + ".";

  // Install and offline: a service worker keeps a copy of these files so the tool works without a connection.
  var installBtn = $("install"), deferred = null;
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferred = e; installBtn.hidden = false; });
  installBtn.addEventListener("click", function () { if (!deferred) return; deferred.prompt(); deferred.userChoice.then(function () { deferred = null; installBtn.hidden = true; }); });
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) navigator.serviceWorker.register("sw.js").catch(function () {});

  input.value = EXAMPLE;
  render();
  reply.value = "Done. I have drafted the refund note for [IRD_1] to account [BANK_ACCOUNT_1], and will confirm by email to [EMAIL_1].";
  autosize(reply, 128);
  renderRestore();
})();
