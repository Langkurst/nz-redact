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
  var current = { items: [], map: {}, text: "" };

  function keyOf(f) { return f.type + ":" + f.text.replace(/[\s\-()]/g, "").toLowerCase(); }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function autosize(t, min) { t.style.height = "auto"; t.style.height = Math.max(t.scrollHeight, min || 352) + "px"; }

  function render() {
    var text = input.value;
    var all = R.scan(text);
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
      marks.appendChild(el("mark", "hl g-" + R.TYPES[f.type].group + (kept[keyOf(f)] ? " is-kept" : ""), text.slice(f.start, f.end)));
      at = f.end;
    });
    marks.appendChild(document.createTextNode(text.slice(at) + "\n"));
    autosize(input);

    // Redacted copy, with placeholders shown as chips.
    redactedView.textContent = "";
    if (!text) redactedView.appendChild(el("p", "doc-empty", "Paste text on the Check step first."));
    else {
      r.text.split(/(\[[A-Z_]+_\d+\])/g).forEach(function (part) {
        if (/^\[[A-Z_]+_\d+\]$/.test(part)) {
          var type = Object.keys(R.TYPES).filter(function (k) { return part.indexOf("[" + R.TYPES[k].token + "_") === 0; })[0];
          redactedView.appendChild(el("span", "tok g-" + (type ? R.TYPES[type].group : "id"), part));
        } else redactedView.appendChild(document.createTextNode(part));
      });
    }

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
        var k = keyOf(f), on = !kept[k];
        var li = el("li", "hit" + (on ? "" : " is-kept"));
        var body = el("div", "hit-body");
        var top = el("div", "hit-top");
        top.appendChild(el("span", "hit-label", R.TYPES[f.type].label));
        if (on && tokenByKey[k]) top.appendChild(el("span", "tok tok-sm", tokenByKey[k]));
        if (!on) top.appendChild(el("span", "kept-pill", "Left in"));
        body.appendChild(top);
        body.appendChild(el("code", "hit-value", f.text));
        body.appendChild(el("span", "hit-why", f.why.charAt(0).toUpperCase() + f.why.slice(1) + "."));
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

  // Steps, with arrow keys between them.
  function select(tab) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
      $(t.getAttribute("aria-controls")).hidden = !on;
    });
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

  function copy(text, button) {
    var label = button.querySelector(".label");
    var was = label.textContent;
    var done = function (ok) { label.textContent = ok ? "Copied" : "Select the text to copy it"; setTimeout(function () { label.textContent = was; }, 1800); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
    else done(false);
  }
  copyRedacted.addEventListener("click", function () { copy(current.text, copyRedacted); });
  copyRestored.addEventListener("click", function () { copy(copyRestored.dataset.text || "", copyRestored); });
  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter" && !copyRedacted.disabled) { e.preventDefault(); copy(current.text, copyRedacted); }
  });

  // Open or drop a plain-text file. It is read on this device and never uploaded.
  var MAX = 2 * 1024 * 1024;
  function load(file) {
    if (!file) return;
    if (file.size > MAX) { statusEl.textContent = "File is over 2 MB"; return; }
    if (!/\.(txt|csv|tsv|md|eml)$/i.test(file.name) && file.type && !/^text\//.test(file.type)) { statusEl.textContent = "Use a .txt or .csv file"; return; }
    file.text().then(function (t) { kept = {}; input.value = t; select(tabs[0]); render(); input.focus(); });
  }
  $("open-file").addEventListener("click", function () { $("file").click(); });
  $("file").addEventListener("change", function (e) { load(e.target.files[0]); e.target.value = ""; });
  var depth = 0;
  editor.addEventListener("dragenter", function (e) { if (e.dataTransfer && [].indexOf.call(e.dataTransfer.types, "Files") !== -1) { depth++; editor.classList.add("is-dragging"); } });
  editor.addEventListener("dragleave", function () { depth = Math.max(0, depth - 1); if (!depth) editor.classList.remove("is-dragging"); });
  editor.addEventListener("dragover", function (e) { e.preventDefault(); });
  editor.addEventListener("drop", function (e) { e.preventDefault(); depth = 0; editor.classList.remove("is-dragging"); load(e.dataTransfer.files[0]); });

  var timer;
  input.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(render, 60); });
  reply.addEventListener("input", function () { autosize(reply, 128); renderRestore(); });
  $("example").addEventListener("click", function () { kept = {}; input.value = EXAMPLE; render(); input.focus(); });
  $("clear").addEventListener("click", function () { kept = {}; input.value = ""; reply.value = ""; autosize(reply, 128); render(); input.focus(); });
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
    var B = A.blind, M = A.main;
    var pct = function (x) { return Math.round(x * 100) + "%"; };
    var set = function (k, v) { document.querySelectorAll('[data-eval="' + k + '"]').forEach(function (n) { n.textContent = v; }); };
    set("docs", String(B.documents)); set("structured", pct(B.structuredRecall)); set("names", pct(B.nameRecall));
    set("precision", pct(B.precision)); set("negatives", B.negativesKept + " of " + B.negatives);
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
