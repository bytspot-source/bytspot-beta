// Runs before the Smart App Banner meta is parsed so iOS never caches a
// homepage app-argument for a /party/<id> or /sale/<id> link. The module
// bundle below re-applies the same value once it boots.
(function () {
  try {
    var parts = window.location.pathname.split('/').filter(Boolean);
    if ((parts[0] === 'party' || parts[0] === 'group' || parts[0] === 'sale') && parts[1]) {
      document.write('<meta name="apple-itunes-app" content="app-id=6761876421, app-clip-bundle-id=com.bytspot.app.Clip, app-clip-display=card, app-argument=' + window.location.href + '">');
    }
  } catch (_) {}
})();
