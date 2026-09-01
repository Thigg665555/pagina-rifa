/**
 * Menu mobile (drawer + push) — não depende do Bootstrap Modal.
 */
(function () {
	function ensureMenuClosed(menu) {
		if (!menu) {
			return;
		}
		menu.classList.remove('is-open');
		menu.setAttribute('aria-hidden', 'true');
		menu.setAttribute('hidden', '');
		document.body.classList.remove('menu-push-open');
	}

	var earlyMenu = document.getElementById('mobileMenu');
	ensureMenuClosed(earlyMenu);

	function initMobileMenuDrawer() {
		var menu = document.getElementById('mobileMenu');
		if (!menu) {
			return false;
		}
		if (menu.dataset.drawerReady === '1') {
			return true;
		}
		menu.dataset.drawerReady = '1';

		ensureMenuClosed(menu);

		if (menu.parentElement && menu.parentElement.id === '__next') {
			document.body.appendChild(menu);
		}

		var pushClass = 'menu-push-open';

		function openMenu() {
			menu.removeAttribute('hidden');
			menu.classList.add('is-open');
			menu.setAttribute('aria-hidden', 'false');
			document.body.classList.add(pushClass);
		}

		function closeMenu() {
			menu.classList.remove('is-open');
			menu.setAttribute('aria-hidden', 'true');
			document.body.classList.remove('menu-push-open');
			window.setTimeout(function () {
				if (!menu.classList.contains('is-open')) {
					menu.setAttribute('hidden', '');
				}
			}, 400);
		}

		/** Fecha o drawer; em links <a href> deixa o clique navegar normalmente. */
		function onCloseTrigger(e) {
			var closeEl = e.target && e.target.closest ? e.target.closest('[data-mobile-menu-close]') : null;
			if (!closeEl || !menu.contains(closeEl)) {
				return;
			}
			var link = closeEl.closest('a[href]');
			var href = link ? (link.getAttribute('href') || '').trim() : '';
			closeMenu();
			if (link && href && href !== '#' && href.indexOf('javascript:') !== 0) {
				return;
			}
			e.preventDefault();
		}

		function onOpenTrigger(e) {
			var btn = e.target && e.target.closest ? e.target.closest('[data-mobile-menu-open]') : null;
			if (!btn) {
				return;
			}
			e.preventDefault();
			e.stopPropagation();
			e.stopImmediatePropagation();
			openMenu();
			return false;
		}

		document.addEventListener('click', onOpenTrigger, true);
		document.addEventListener('touchend', onOpenTrigger, { capture: true, passive: false });

		menu.addEventListener('click', onCloseTrigger);

		document.addEventListener('keydown', function (e) {
			if (e.key === 'Escape' && menu.classList.contains('is-open')) {
				closeMenu();
			}
		});

		document.addEventListener('show.bs.modal', function () {
			closeMenu();
		});

		return true;
	}

	window.rifaInitMobileMenuDrawer = initMobileMenuDrawer;

	function boot() {
		initMobileMenuDrawer();
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', boot);
	} else {
		boot();
	}
	window.addEventListener('load', boot);
})();
