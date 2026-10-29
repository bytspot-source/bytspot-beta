(function () {
  var redirect = sessionStorage.getItem('spa_redirect');
  if (redirect) {
    sessionStorage.removeItem('spa_redirect');
    window.history.replaceState(null, '', redirect);
  }
  var banner = document.querySelector('meta[name="apple-itunes-app"]');
  if (banner) {
    var canonicalArgument = window.location.href;
    try {
      var current = new URL(window.location.href);
      var patchId = current.searchParams.get('patchId') || current.searchParams.get('patch') || current.searchParams.get('p');
      var pathParts = current.pathname.split('/').filter(Boolean);
      if (!patchId && pathParts[0] && pathParts[0].toUpperCase().indexOf('BYT') === 0) patchId = pathParts[0];
      if (!patchId && (pathParts[0] === 'p' || pathParts[0] === 'patch' || pathParts[0] === 't') && pathParts[1]) patchId = pathParts[1];
      if ((pathParts[0] === 'group' || pathParts[0] === 'party' || pathParts[0] === 'sale') && pathParts[1]) {
        canonicalArgument = current.toString();
        patchId = null;
      } else if (patchId) {
        var next = new URL('https://bytspot.app/p/app-clip');
        next.searchParams.set('patchId', patchId);
        current.searchParams.forEach(function (value, key) {
          if (key !== 'patchId' && key !== 'patch' && key !== 'p') next.searchParams.set(key, value);
        });
        canonicalArgument = next.toString();
      }
    } catch (_) {}
    banner.setAttribute('content', 'app-id=6761876421, app-clip-bundle-id=com.bytspot.app.Clip, app-clip-display=card, app-argument=' + canonicalArgument);
  }
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function (regs) {
      regs.forEach(function (reg) { reg.unregister(); });
    }).catch(function () {});
  }
})();
