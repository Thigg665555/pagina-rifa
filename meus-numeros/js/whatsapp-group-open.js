/**
 * WhatsApp grupo — abre link direto chat.whatsapp.com (sem intent:// no Android).
 */
(function () {
	'use strict';

	function normalizeUrl(url) {
		if (!url) {
			return '';
		}
		var trimmed = String(url).trim();
		if (/^http:\/\//i.test(trimmed)) {
			trimmed = 'https://' + trimmed.slice(7);
		}
		var inviteMatch = trimmed.match(/whatsapp\.com\/invite(?:\/)?\??(?:code=)?([A-Za-z0-9_-]+)/i);
		if (inviteMatch) {
			return 'https://chat.whatsapp.com/' + inviteMatch[1];
		}
		var communityMatch = trimmed.match(/chat\.whatsapp\.com\/community\/([A-Za-z0-9_-]+)/i);
		if (communityMatch) {
			return 'https://chat.whatsapp.com/community/' + communityMatch[1];
		}
		var chatMatch = trimmed.match(/chat\.whatsapp\.com\/([A-Za-z0-9_-]+)/i);
		if (chatMatch && chatMatch[1].toLowerCase() !== 'community') {
			return 'https://chat.whatsapp.com/' + chatMatch[1];
		}
		return trimmed;
	}

	function isMobile() {
		return /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent || '');
	}

	function openGroupUrl(url) {
		var webUrl = normalizeUrl(url);
		if (!webUrl) {
			return false;
		}

		if (isMobile()) {
			window.location.assign(webUrl);
			return true;
		}

		var popup = window.open(webUrl, '_blank', 'noopener,noreferrer');
		if (!popup) {
			window.location.assign(webUrl);
		}
		return true;
	}

	function openWhatsAppGroup(url) {
		return openGroupUrl(url);
	}

	document.addEventListener(
		'click',
		function (event) {
			var link = event.target.closest('.rifa-wa-grupo-link');
			if (!link) {
				return;
			}

			var url = link.getAttribute('data-wa-grupo-url') || link.getAttribute('href');
			var webUrl = normalizeUrl(url);
			if (!webUrl) {
				return;
			}

			event.preventDefault();

			if (typeof window.rifaFunnelTrack === 'function') {
				window.rifaFunnelTrack('group_click');
			}

			openGroupUrl(webUrl);
		},
		true
	);

	window.rifaOpenWhatsAppGroup = openWhatsAppGroup;
	window.rifaSmartOpenWhatsAppGroup = openWhatsAppGroup;
})();
