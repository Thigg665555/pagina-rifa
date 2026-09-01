/**
 * Mobile — mantém campos visíveis e scroll funcional no checkout (iPhone/Android).
 */
(function () {
	'use strict';

	var MOBILE_MQ = window.matchMedia('(max-width: 767.98px)');
	var MODAL_IDS = ['newCheckoutModal', 'cadastroModal2', 'loginModal2'];
	var IOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
		|| (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
	var keyboardOpen = false;

	function isMobile() {
		return MOBILE_MQ.matches;
	}

	function getCheckoutScrollRoot() {
		var modal = document.getElementById('newCheckoutModal');
		if (!modal) {
			return null;
		}
		return modal.querySelector('.checkout-modal-pro__body');
	}

	function getFooterReserve(field) {
		var modal = document.getElementById('newCheckoutModal');
		if (!modal || !field || !field.closest('#newCheckoutModal')) {
			return 88;
		}
		var scope = field.closest('.checkout-form-pro, #step3');
		var footer = scope ? scope.querySelector('.cko-footer, #step3-actions') : null;
		if (footer) {
			return Math.max(80, Math.ceil(footer.getBoundingClientRect().height) + 8);
		}
		return 88;
	}

	function getScrollableParent(el) {
		var checkoutRoot = getCheckoutScrollRoot();
		if (checkoutRoot && el && el.closest('#newCheckoutModal')) {
			return checkoutRoot;
		}

		var node = el.parentElement;
		while (node && node !== document.body) {
			var style = window.getComputedStyle(node);
			var oy = style.overflowY;
			if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && node.scrollHeight > node.clientHeight + 2) {
				return node;
			}
			node = node.parentElement;
		}
		return null;
	}

	function clampScrollRoot(scrollParent) {
		if (!scrollParent) {
			return;
		}
		var maxScroll = Math.max(0, scrollParent.scrollHeight - scrollParent.clientHeight);
		if (scrollParent.scrollTop > maxScroll) {
			scrollParent.scrollTop = maxScroll;
		}
	}

	function visibleLimits(field) {
		var topLimit = field && field.closest('#newCheckoutModal') ? 52 : 72;
		var footerReserve = getFooterReserve(field);

		if (window.visualViewport) {
			var vv = window.visualViewport;
			return {
				top: vv.offsetTop + topLimit,
				bottom: vv.offsetTop + vv.height - footerReserve
			};
		}

		return {
			top: topLimit,
			bottom: window.innerHeight - footerReserve
		};
	}

	function scrollFieldIntoView(field, attempt) {
		if (!field || !isMobile()) {
			return;
		}

		window.requestAnimationFrame(function () {
			var delay = attempt === 0 ? 60 : attempt === 1 ? 280 : 520;
			setTimeout(function () {
				var scrollParent = getScrollableParent(field);
				clampScrollRoot(scrollParent);

				var limits = visibleLimits(field);
				var rect = field.getBoundingClientRect();

				if (rect.top >= limits.top && rect.bottom <= limits.bottom) {
					return;
				}

				if (scrollParent) {
					var currentScroll = scrollParent.scrollTop;
					var targetScroll = currentScroll;

					if (rect.top < limits.top) {
						targetScroll = currentScroll + (rect.top - limits.top) - 8;
					} else if (rect.bottom > limits.bottom) {
						targetScroll = currentScroll + (rect.bottom - limits.bottom) + 8;
					}

					scrollParent.scrollTo({
						top: Math.max(0, targetScroll),
						behavior: attempt === 0 ? 'auto' : 'smooth'
					});
				} else if (IOS) {
					try {
						field.scrollIntoView({ block: 'nearest', behavior: 'auto' });
					} catch (e) {
						field.scrollIntoView(false);
					}
				}
			}, delay);
		});
	}

	function scrollFieldWithRetries(field) {
		scrollFieldIntoView(field, 0);
		scrollFieldIntoView(field, 1);
		if (IOS) {
			scrollFieldIntoView(field, 2);
		}
	}

	function isInputFocused() {
		var active = document.activeElement;
		return !!(active && active.matches('input, textarea, select'));
	}

	function keyboardLikelyOpen() {
		if (!window.visualViewport || !isInputFocused()) {
			return false;
		}
		var vv = window.visualViewport;
		var heightDrop = window.innerHeight - vv.height;
		return heightDrop > 120 || vv.height < window.innerHeight * 0.72;
	}

	function syncVisualViewport() {
		var reserve = getFooterReserve(document.activeElement);
		document.documentElement.style.setProperty('--rifa-kb-reserve', reserve + 'px');

		if (!isMobile()) {
			document.body.classList.remove('rifa-keyboard-open');
			keyboardOpen = false;
			return;
		}

		var nowOpen = keyboardLikelyOpen();
		if (nowOpen !== keyboardOpen) {
			keyboardOpen = nowOpen;
			document.body.classList.toggle('rifa-keyboard-open', keyboardOpen);

			if (keyboardOpen) {
				var root = getCheckoutScrollRoot();
				if (root) {
					clampScrollRoot(root);
				}
			}
		}

		if (isInputFocused()) {
			scrollFieldWithRetries(document.activeElement);
		}
	}

	function bindFocusHandlers(root) {
		if (!root) {
			return;
		}
		root.addEventListener('focusin', function (e) {
			var target = e.target;
			if (!target || !target.matches('input, textarea, select')) {
				return;
			}
			var scrollRoot = getScrollableParent(target);
			clampScrollRoot(scrollRoot);
			syncVisualViewport();
			scrollFieldWithRetries(target);
		});
	}

	function bindCheckoutModal() {
		var modal = document.getElementById('newCheckoutModal');
		if (!modal) {
			return;
		}

		modal.addEventListener('shown.bs.modal', function () {
			var body = getCheckoutScrollRoot();
			if (body) {
				body.scrollTop = 0;
			}
			keyboardOpen = false;
			document.body.classList.remove('rifa-keyboard-open');
		});

		modal.addEventListener('hidden.bs.modal', function () {
			document.body.classList.remove('rifa-keyboard-open');
			keyboardOpen = false;
		});
	}

	function init() {
		MODAL_IDS.forEach(function (id) {
			bindFocusHandlers(document.getElementById(id));
		});

		bindFocusHandlers(document.querySelector('.container.app-main.app-form'));
		bindCheckoutModal();

		if (window.visualViewport) {
			window.visualViewport.addEventListener('resize', syncVisualViewport);
			window.visualViewport.addEventListener('scroll', syncVisualViewport);
		}

		window.addEventListener('resize', syncVisualViewport);
		window.addEventListener('orientationchange', function () {
			setTimeout(syncVisualViewport, 400);
		});
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', init);
	} else {
		init();
	}
})();
