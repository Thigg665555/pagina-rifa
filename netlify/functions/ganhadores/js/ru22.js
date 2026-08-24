(() => {
  const PIXEL_ID = '3572746969556647';
  const UTM_KEYS = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'];
  try {
    const q = new URLSearchParams(location.search);
    const saved = JSON.parse(sessionStorage.getItem('ru22_attribution') || '{}');
    UTM_KEYS.forEach(k => { if (q.get(k)) saved[k] = q.get(k); });
    if (q.get('fbclid')) saved.fbclid = q.get('fbclid');
    sessionStorage.setItem('ru22_attribution', JSON.stringify(saved));
  } catch (_) {}

  window.RU22 = {
    pixelId: PIXEL_ID,
    attribution() {
      try { return JSON.parse(sessionStorage.getItem('ru22_attribution') || '{}'); }
      catch (_) { return {}; }
    },
    track(name, params) {
      if (typeof window.fbq !== 'function') return false;
      try {
        window.fbq('track', name, params || {});
        return true;
      } catch (_) {
        return false;
      }
    },
    checkoutUrl(resp) {
      if (resp && resp.order_token) {
        return '/compra?token=' + encodeURIComponent(String(resp.order_token));
      }
      let target = resp && resp.redirect ? String(resp.redirect) : '';
      const m = target.match(/^\/compra\/([^/?#]+)/);
      if (m) return '/compra?token=' + encodeURIComponent(m[1]);
      return target || '/compra';
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('a[href*="br251oficial.com"]').forEach(a => {
      try { const u = new URL(a.href); a.href = u.pathname + u.search + u.hash; } catch (_) {}
    });
  });
})();
