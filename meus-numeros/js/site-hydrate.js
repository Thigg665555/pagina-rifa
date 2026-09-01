/**
 * Preenche [data-ui-h] e carrega miolo [data-page-src].
 * Após injetar o miolo, remove o blur(30px) do style.css (antes só no window.load).
 */
(function () {
  var COPY = null;

  function applyCopy(map) {
    if (!map) return;
    COPY = map;
    document.querySelectorAll("[data-ui-h]").forEach(function (el) {
      var key = el.getAttribute("data-ui-h");
      if (!key || map[key] == null) return;
      var val = String(map[key]);
      if (el.tagName === "IMG" || el.classList.contains("js-ui-h-src")) {
        el.setAttribute("src", val);
        el.removeAttribute("hidden");
        return;
      }
      if (el.getAttribute("data-ui-h-html") === "1") el.innerHTML = val;
      else el.textContent = val;
    });
  }

  function unblur(root) {
    var scope = root && root.querySelectorAll ? root : document;
    var sel = "img, h1, h2, h3, h4, h5, h6, p, .badge, .app-title-desc, .SorteioTpl_imagem__2GXxI, .app-main img";
    try {
      scope.querySelectorAll(sel).forEach(function (el) {
        el.style.opacity = "1";
      });
      document.querySelectorAll(".app-main img, .app-main h1, .app-main h2, .app-main h3, .app-main h4, .app-main h5, .app-main h6, .app-main p, .app-main .badge, .app-main .app-title-desc").forEach(function (el) {
        el.style.opacity = "1";
      });
    } catch (e) {}
    if (typeof window.lrUnblurParticipar === "function") {
      try {
        window.lrUnblurParticipar();
      } catch (e2) {}
    }
    if (window.jQuery) {
      try {
        window.jQuery(".app-main img, h1, h2, h3, h4, h5, h6, p, .badge, .app-title-desc").css("opacity", "1");
      } catch (e3) {}
    }
  }

  function markHydrated() {
    try {
      document.documentElement.classList.add("js-hydrated");
    } catch (e) {}
  }

  function loadCopy() {
    var base = typeof BASE_URL !== "undefined" && BASE_URL ? BASE_URL : "/";
    if (base.slice(-1) !== "/") base += "/";
    return fetch(base + "site_hydrate.php", {
      credentials: "same-origin",
      headers: { Accept: "application/json" },
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (data) {
        if (data && data.ok) {
          applyCopy(data.copy || {});
          window.__rifaUiCopy = data;
          try {
            window.dispatchEvent(
              new CustomEvent("rifa:ui-copy", { detail: data })
            );
          } catch (e) {}
        }
        return data;
      })
      .catch(function () {
        return null;
      });
  }

  function adoptStyles(root) {
    root.querySelectorAll("link[rel='stylesheet'], link[rel=\"stylesheet\"]").forEach(function (link) {
      var href = link.getAttribute("href");
      if (!href) {
        link.remove();
        return;
      }
      var exists = false;
      document.querySelectorAll('link[rel="stylesheet"]').forEach(function (l) {
        if (l.getAttribute("href") === href) exists = true;
      });
      if (!exists) {
        var neu = document.createElement("link");
        neu.rel = "stylesheet";
        neu.href = href;
        var cross = link.getAttribute("crossorigin");
        if (cross !== null) neu.setAttribute("crossorigin", cross);
        document.head.appendChild(neu);
      }
      link.remove();
    });
    root.querySelectorAll('link[rel="preconnect"]').forEach(function (link) {
      var href = link.getAttribute("href");
      if (!href) {
        link.remove();
        return;
      }
      var exists = false;
      document.querySelectorAll('link[rel="preconnect"]').forEach(function (l) {
        if (l.getAttribute("href") === href) exists = true;
      });
      if (!exists) {
        var neu = document.createElement("link");
        neu.rel = "preconnect";
        neu.href = href;
        if (link.hasAttribute("crossorigin")) neu.setAttribute("crossorigin", link.getAttribute("crossorigin") || "");
        document.head.appendChild(neu);
      }
      link.remove();
    });
  }

  function reinjectScripts(root) {
    var scripts = Array.prototype.slice.call(root.querySelectorAll("script"));
    scripts.forEach(function (old) {
      var s = document.createElement("script");
      for (var a = 0; a < old.attributes.length; a++) {
        var attr = old.attributes[a];
        s.setAttribute(attr.name, attr.value);
      }
      if (!old.src) s.textContent = old.textContent;
      old.parentNode.replaceChild(s, old);
    });
  }

  function loadBody(root) {
    var url = root.getAttribute("data-page-src");
    if (!url) return Promise.resolve();
    if (root.getAttribute("data-loaded") === "1") return Promise.resolve();
    root.setAttribute("aria-busy", "true");
    return fetch(url, { credentials: "same-origin" })
      .then(function (r) {
        if (!r.ok) throw new Error("body " + r.status);
        return r.text();
      })
      .then(function (html) {
        root.innerHTML = html;
        root.setAttribute("data-loaded", "1");
        adoptStyles(root);
        reinjectScripts(root);
        root.removeAttribute("aria-busy");
        if (COPY) applyCopy(COPY);
        unblur(root);
        markHydrated();
        try {
          document.dispatchEvent(new CustomEvent("ui:body-ready", { detail: { root: root } }));
        } catch (e) {}
      })
      .catch(function () {
        root.removeAttribute("aria-busy");
        root.innerHTML =
          '<div class="container py-5 text-center"><p style="filter:none">Não foi possível carregar. <a href="javascript:location.reload()">Tentar novamente</a></p></div>';
      });
  }

  function scheduleDeferredCheckout(roots) {
    if (!roots.length) return;
    var loaded = false;
    function loadAll() {
      if (loaded) return;
      loaded = true;
      roots.forEach(function (root) {
        loadBody(root);
      });
    }

    document.addEventListener(
      "click",
      function (ev) {
        var t = ev.target;
        if (!t || !t.closest) return;
        if (
          t.closest(
            '[data-bs-target="#modal-checkout"], #add_to_cart, .bilhetes-cta, .bilhetes-cta-label, [data-open-checkout], .btn-participar, .js-open-checkout'
          )
        ) {
          loadAll();
        }
      },
      true
    );

    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(
        function () {
          loadAll();
        },
        { timeout: 5000 }
      );
    } else {
      setTimeout(loadAll, 3000);
    }
  }

  function boot() {
    var roots = Array.prototype.slice.call(document.querySelectorAll("[data-page-src]"));
    var deferred = [];
    var immediate = [];
    roots.forEach(function (root) {
      if (root.getAttribute("data-defer-load") === "1") {
        deferred.push(root);
      } else {
        immediate.push(root);
      }
    });

    var copyP = loadCopy();
    var bodiesP =
      immediate.length > 0
        ? Promise.all(
            immediate.map(function (root) {
              return loadBody(root);
            })
          )
        : Promise.resolve();

    Promise.all([copyP, bodiesP]).then(function () {
      markHydrated();
      unblur(document);
      scheduleDeferredCheckout(deferred);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  document.addEventListener("ui:body-ready", function (ev) {
    unblur(ev && ev.detail && ev.detail.root ? ev.detail.root : document);
  });

  window.rifaApplyUiCopy = applyCopy;
  window.rifaReloadUiCopy = loadCopy;
  window.rifaUnblurPage = unblur;
})();
