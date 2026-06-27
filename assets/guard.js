(function () {
  'use strict';

  var ALLOWED = [
    'animepahe.pw',
    'kwik.si',
    'kwik.cx',
    'pahe.win',
    'cloudflare.com',
    'google.com',
    'cloudflare.net'
  ];

  var CAPTCHA_HOST_RE = /(?:^|\.)((?:challenges|turnstile)\.cloudflare\.com|hcaptcha\.com)$/i;

  function hostAllowed(url) {
    if (!url) return true;
    var s = String(url).trim();
    if (!s || s.startsWith('#') || s.startsWith('data:') || s.startsWith('blob:') || s.startsWith('javascript:')) {
      return true;
    }
    try {
      var abs = new URL(s, location.href);
      var host = abs.hostname.toLowerCase().replace(/^www\./, '');
      if (CAPTCHA_HOST_RE.test(host)) return true;
      return ALLOWED.some(function (entry) {
        return host === entry || host.slice(-(entry.length + 1)) === '.' + entry;
      });
    } catch (e) {
      return false;
    }
  }

  function isCaptchaFrame(src) {
    if (!src) return false;
    try {
      var host = new URL(src, location.href).hostname.toLowerCase();
      return CAPTCHA_HOST_RE.test(host);
    } catch (e) {
      return false;
    }
  }

  function block(url, reason) {
    console.warn('[KioskGuard] Blocked (' + reason + '):', url);
  }

  window.open = function (url) {
    if (!url || hostAllowed(url)) {
      if (url) location.href = url;
    } else {
      block(url, 'window.open');
    }
    return null;
  };

  (function () {
    var _assign  = location.assign.bind(location);
    var _replace = location.replace.bind(location);
    Object.defineProperty(location, 'assign', {
      get: function () { return function (u) { hostAllowed(u) ? _assign(u)  : block(u, 'location.assign');  }; },
      configurable: true
    });
    Object.defineProperty(location, 'replace', {
      get: function () { return function (u) { hostAllowed(u) ? _replace(u) : block(u, 'location.replace'); }; },
      configurable: true
    });
  }());

  (function () {
    var _push    = history.pushState.bind(history);
    var _replace = history.replaceState.bind(history);
    history.pushState = function (s, t, u) {
      (!u || hostAllowed(String(u))) ? _push(s, t, u) : block(String(u), 'pushState');
    };
    history.replaceState = function (s, t, u) {
      (!u || hostAllowed(String(u))) ? _replace(s, t, u) : block(String(u), 'replaceState');
    };
  }());

  document.querySelectorAll('meta[http-equiv="refresh"]').forEach(function (el) {
    block(el.content, 'meta-refresh');
    el.remove();
  });

  var _ce = document.createElement.bind(document);
  document.createElement = function (tag) {
    var el = _ce(tag);
    var t  = String(tag).toLowerCase();
    if (t === 'script' || t === 'iframe') {
      var desc = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'src');
      if (desc) {
        Object.defineProperty(el, 'src', {
          set: function (u) { hostAllowed(String(u)) ? desc.set.call(this, u) : block(String(u), t + '.src'); },
          get: function ()  { return desc.get.call(this); },
          configurable: true
        });
      }
    }
    return el;
  };

  new MutationObserver(function (mutations) {
    mutations.forEach(function (m) {
      m.addedNodes.forEach(function (node) {
        if (node.nodeType !== 1) return;
        var frames = node.tagName === 'IFRAME' ? [node]
                   : Array.from(node.querySelectorAll('iframe'));
        frames.forEach(function (f) {
          var src = f.src || f.getAttribute('src') || '';
          if (isCaptchaFrame(src)) return;
          if (src && !hostAllowed(src)) { block(src, 'MO iframe'); f.remove(); }
        });
        var metas = node.tagName === 'META' ? [node]
                  : Array.from(node.querySelectorAll('meta[http-equiv="refresh"]'));
        metas.forEach(function (meta) { block(meta.content, 'MO meta-refresh'); meta.remove(); });
      });
    });
  }).observe(document.documentElement, { childList: true, subtree: true });

  console.log('[KioskGuard] Active. Allowed:', ALLOWED.join(', '));
}());
