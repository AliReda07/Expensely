// Applies the saved theme before first paint so a dark-mode user never sees a flash of
// the light background. Deliberately an external file rather than an inline <script>:
// the CSP in vercel.json uses `script-src 'self'`, and keeping this inline would have
// forced 'unsafe-inline', which defeats most of the point of having a CSP at all.
//
// Must stay render-blocking (no defer/async) -- deferring it puts the class change after
// first paint and the flash comes back. Reads the same key ThemeContext writes.
(function () {
  try {
    var stored = localStorage.getItem('theme-preference');
    var dark = stored === 'dark' || (stored !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    if (dark) {
      document.documentElement.classList.add('dark');
      document.querySelector('meta[name="theme-color"]').setAttribute('content', '#060814');
    }
  } catch {}
})();
