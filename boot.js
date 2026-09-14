/* Zstore AI — sets classes before first paint (no inline scripts under the CSP). */
(function () {
  var d = document.documentElement;
  d.classList.add('js');
  var reduce = false;
  try { reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  var saved = null;
  try { saved = localStorage.getItem('zs-motion'); } catch (e) {}
  if (saved === 'off' || (!saved && reduce)) d.classList.add('motion-off');
})();
