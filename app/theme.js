/* Set the theme before the page draws, so it never flashes the wrong one. A visitor's choice is kept in their browser only. */
(function () {
  var saved = null;
  try { saved = localStorage.getItem("nz-redact-theme"); } catch (e) {}
  var dark = saved ? saved === "dark" : window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
})();
