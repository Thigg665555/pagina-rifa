/**
 * Funil de conversão — leve, sendBeacon, sem impacto no carregamento.
 */
(function () {
	'use strict';

	var cfg = window.rifaFunnelConfig || {};
	var trackUrl = cfg.url || '';
	var productId = parseInt(cfg.productId, 10) || 0;
	var orderId = parseInt(cfg.orderId, 10) || 0;
	var pageType = cfg.pageType || '';
	var sent = Object.create(null);

	var groupSelectors = '.barra-vip-btn, .wa-grupo-card__btn, .rifa-wa-grupo-link, [data-wa-grupo-url]';

	function send(step, extra) {
		if (!trackUrl || !step || sent[step]) {
			return;
		}
		sent[step] = 1;

		var pid = (extra && extra.productId) ? parseInt(extra.productId, 10) : productId;
		var oid = (extra && extra.orderId) ? parseInt(extra.orderId, 10) : orderId;
		var body = 'step=' + encodeURIComponent(step);
		if (pid > 0) {
			body += '&product_id=' + pid;
		}
		if (oid > 0) {
			body += '&order_id=' + oid;
		}

		try {
			if (navigator.sendBeacon) {
				navigator.sendBeacon(trackUrl, new Blob([body], { type: 'application/x-www-form-urlencoded' }));
				return;
			}
			fetch(trackUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
				body: body,
				keepalive: true,
				credentials: 'same-origin'
			}).catch(function () {});
		} catch (e) {}
	}

	window.rifaFunnelTrack = send;

	function isGroupClickTarget(t) {
		return t && t.closest && t.closest(groupSelectors);
	}

	function trackGroupClick() {
		send('group_click');
	}

	// Grupo: captura antes do WhatsApp interceptar o clique
	document.addEventListener('click', function (e) {
		if (isGroupClickTarget(e.target)) {
			trackGroupClick();
		}
	}, true);

	if (pageType === 'campaign' && productId > 0) {
		send('campaign_view');
	}

	if (pageType === 'order' && productId > 0) {
		if (cfg.orderStatus === 2) {
			send('pix_paid');
		} else {
			send('pix_view');
		}
	}

	function bindCampaignEvents() {
		if (!window.jQuery) {
			return;
		}
		var $ = window.jQuery;

		$(document).on('shown.bs.modal', '#newCheckoutModal', function () {
			send('checkout_open');
		});

		$(document).on('click', '.promo-btn-confianca, .promo-item button', function () {
			send('promo_click');
		});

		$(document).on('click', '#add_to_cart, .bilhetes-express-cta, .campanha-cta-principal', function () {
			send('checkout_open');
		});

		var quotaTimer = null;
		function trackQuotaDebounced() {
			clearTimeout(quotaTimer);
			quotaTimer = setTimeout(function () {
				send('quota_select');
			}, 600);
		}
		$(document).on('click', '.addNumero, .removeNumero', trackQuotaDebounced);
		$(document).on('change input', '.qty', trackQuotaDebounced);

		$(document).on('click', '#next1', function () {
			send('login_step');
		});
		$(document).on('click', '#next2', function () {
			send('register_step');
		});

		$(document).on('click', '#ckoUpsellSimBtn', function () {
			send('upsell1_sim');
		});
		$(document).on('click', '#ckoUpsellNaoBtn', function () {
			send('upsell1_nao');
		});

		$(document).on('click', '#ckoStep3Pay, #submitFormNew', function () {
			if ($('#ckoUpsellSimBtn').hasClass('is-selected')) {
				send('upsell1_sim');
			} else if ($('#ckoUpsellNaoBtn').hasClass('is-selected')) {
				send('upsell1_nao');
			}
			send('checkout_confirm');
		});
	}

	if (pageType === 'order') {
		document.addEventListener('click', function (e) {
			var t = e.target;
			if (t && t.closest && t.closest('#btnPostUpsell')) {
				send('upsell2_sim');
			}
			if (t && t.closest && (t.closest('#btnCopyPix') || t.closest('#btnCopyPixMain'))) {
				send('pix_copy');
			}
		});
	}

	if (pageType === 'campaign') {
		if (document.readyState === 'loading') {
			document.addEventListener('DOMContentLoaded', bindCampaignEvents);
		} else {
			bindCampaignEvents();
		}
	}
})();
