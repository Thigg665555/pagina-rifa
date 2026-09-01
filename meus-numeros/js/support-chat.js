/**
 * Suporte online — chat com IA e opções de ajuda.
 */
(function () {
	'use strict';

	var cfg = window.rifaSupportConfig || {};
	var baseUrl = cfg.baseUrl || '/';
	var meusNumerosUrl = cfg.meusNumerosUrl || '/meus-numeros';
	var grupoUrl = cfg.grupoUrl || '';
	var grupoTargetUrl = cfg.grupoTargetUrl || '';
	var siteName = cfg.siteName || 'Suporte';

	var panel, body, input, sendBtn, fabWrap;
	var history = [];
	var context = '';
	var isOpen = false;
	var isSending = false;
	var pendingFile = null;

	function qs(sel, root) {
		return (root || document).querySelector(sel);
	}

	function escapeHtml(str) {
		var d = document.createElement('div');
		d.textContent = str;
		return d.innerHTML;
	}

	function formatMarkdown(text) {
		var safe = escapeHtml(text);
		safe = safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
		safe = safe.replace(/\n/g, '<br>');
		return safe;
	}

	function addMessage(role, text, extraHtml) {
		if (!body) return;
		var wrap = document.createElement('div');
		wrap.className = 'rifa-support-msg rifa-support-msg--' + (role === 'user' ? 'user' : 'bot');
		var bubble = document.createElement('div');
		bubble.className = 'rifa-support-bubble';
		bubble.innerHTML = formatMarkdown(text);
		wrap.appendChild(bubble);
		if (extraHtml) {
			var actions = document.createElement('div');
			actions.className = 'rifa-support-actions';
			actions.innerHTML = extraHtml;
			wrap.appendChild(actions);
		}
		body.appendChild(wrap);
		body.scrollTop = body.scrollHeight;

		if (role === 'user' || role === 'assistant') {
			history.push({ role: role, content: text });
			if (history.length > 20) {
				history = history.slice(-20);
			}
		}
	}

	function showTyping() {
		var el = document.createElement('div');
		el.className = 'rifa-support-msg rifa-support-msg--bot rifa-support-typing-wrap';
		el.innerHTML = '<div class="rifa-support-bubble"><div class="rifa-support-typing"><span></span><span></span><span></span></div></div>';
		body.appendChild(el);
		body.scrollTop = body.scrollHeight;
		return el;
	}

	function removeTyping(el) {
		if (el && el.parentNode) {
			el.parentNode.removeChild(el);
		}
	}

	function buildQuickMenu() {
		return '<div class="rifa-support-quick">' +
			'<button type="button" class="rifa-support-quick__btn" data-action="numbers">' +
			'<i class="bi bi-ticket-perforated"></i><span>1. Ver meus números</span></button>' +
			'<button type="button" class="rifa-support-quick__btn" data-action="group">' +
			'<i class="bi bi-whatsapp"></i><span>2. Entrar no Grupo VIP</span></button>' +
			'<button type="button" class="rifa-support-quick__btn rifa-support-quick__btn--refund" data-action="refund">' +
			'<i class="bi bi-arrow-counterclockwise"></i><span>3. Solicitar estorno</span></button>' +
			'</div>';
	}

	function welcomeMessage() {
		addMessage('assistant',
			'Olá! Sou a assistente virtual do **' + siteName + '**. Escolha uma opção ou digite sua dúvida:',
			null
		);
		var wrap = document.createElement('div');
		wrap.className = 'rifa-support-msg rifa-support-msg--bot';
		wrap.innerHTML = '<div class="rifa-support-bubble">' + buildQuickMenu() + '</div>';
		body.appendChild(wrap);
		body.scrollTop = body.scrollHeight;
		bindQuickButtons(wrap);
	}

	function bindQuickButtons(root) {
		var buttons = root.querySelectorAll('[data-action]');
		buttons.forEach(function (btn) {
			btn.addEventListener('click', function () {
				var action = btn.getAttribute('data-action');
				handleQuickAction(action);
			});
		});
	}

	function numbersActions() {
		return '<a href="' + escapeHtml(meusNumerosUrl) + '" class="rifa-support-action-btn rifa-support-action-btn--primary">' +
			'<i class="bi bi-ticket-perforated"></i> Ir para Meus números</a>';
	}

	function groupActions() {
		if (!grupoUrl) {
			return '';
		}
		var cls = grupoTargetUrl ? ' rifa-wa-grupo-link' : '';
		var data = grupoTargetUrl ? ' data-wa-grupo-url="' + escapeHtml(grupoTargetUrl) + '"' : '';
		return '<a href="' + escapeHtml(grupoUrl) + '" class="rifa-support-action-btn rifa-support-action-btn--green' + cls + '"' + data + '>' +
			'<i class="bi bi-whatsapp"></i> Entrar no grupo</a>';
	}

	function refundSubMenu() {
		var html = '<div class="rifa-support-quick">' +
			'<button type="button" class="rifa-support-quick__btn" data-refund="receipt">' +
			'<i class="bi bi-file-earmark-image"></i><span>Enviar comprovante de pagamento</span></button>' +
			'<button type="button" class="rifa-support-quick__btn" data-refund="chat">' +
			'<i class="bi bi-robot"></i><span>Falar com a assistente (IA)</span></button>' +
			'</div>';
		return html;
	}

	function showRefundForm() {
		var wrap = document.createElement('div');
		wrap.className = 'rifa-support-msg rifa-support-msg--bot';
		wrap.innerHTML =
			'<div class="rifa-support-bubble">' +
			'<strong>Enviar comprovante</strong><br>Preencha os dados e anexe o comprovante (JPG, PNG ou PDF).' +
			'<form class="rifa-support-refund-form" id="rifaSupportRefundForm">' +
			'<label>Nome</label><input type="text" name="nome" required maxlength="120">' +
			'<label>Telefone</label><input type="tel" name="telefone" required maxlength="20" placeholder="(00) 00000-0000">' +
			'<label>Nº do pedido (se tiver)</label><input type="text" name="pedido" maxlength="80" placeholder="Opcional">' +
			'<label>Descreva o problema</label><textarea name="mensagem" required minlength="10" maxlength="2000" placeholder="Ex: Paguei o PIX mas os números não apareceram..."></textarea>' +
			'<label class="rifa-support-file-btn" for="rifaSupportFile"><i class="bi bi-paperclip"></i> Anexar comprovante</label>' +
			'<input type="file" id="rifaSupportFile" accept="image/jpeg,image/png,image/webp,application/pdf" style="display:none">' +
			'<div class="rifa-support-file-name" id="rifaSupportFileName">Nenhum arquivo (opcional)</div>' +
			'<button type="submit" class="rifa-support-action-btn rifa-support-action-btn--primary" style="width:100%;justify-content:center;">Enviar solicitação</button>' +
			'</form></div>';
		body.appendChild(wrap);
		body.scrollTop = body.scrollHeight;

		var fileInput = qs('#rifaSupportFile', wrap);
		var fileName = qs('#rifaSupportFileName', wrap);
		var form = qs('#rifaSupportRefundForm', wrap);

		fileInput.addEventListener('change', function () {
			if (fileInput.files && fileInput.files[0]) {
				pendingFile = fileInput.files[0];
				fileName.textContent = pendingFile.name;
			}
		});

		form.addEventListener('submit', function (e) {
			e.preventDefault();
			submitRefundForm(form);
		});
	}

	function submitRefundForm(form) {
		if (isSending) return;
		isSending = true;

		var fd = new FormData(form);
		if (pendingFile) {
			fd.append('comprovante', pendingFile);
		}

		var typing = showTyping();

		fetch(baseUrl + 'class/Main.php?action=support_refund_request', {
			method: 'POST',
			body: fd,
			credentials: 'same-origin'
		})
			.then(function (r) { return r.json(); })
			.then(function (resp) {
				removeTyping(typing);
				isSending = false;
				pendingFile = null;
				if (resp.status === 'success') {
					addMessage('assistant', resp.msg || 'Solicitação enviada com sucesso!');
				} else {
					addMessage('assistant', resp.msg || 'Erro ao enviar. Tente novamente.');
				}
			})
			.catch(function () {
				removeTyping(typing);
				isSending = false;
				addMessage('assistant', 'Erro de conexão. Verifique sua internet e tente novamente.');
			});
	}

	function handleQuickAction(action) {
		if (action === 'numbers') {
			context = 'numbers';
			addMessage('user', 'Quero ver meus números');
			sendToAi('Quero ver meus números', true);
			return;
		}
		if (action === 'group') {
			context = 'group';
			addMessage('user', 'Quero entrar no Grupo VIP');
			var reply = 'Para entrar no **Grupo VIP**, clique no botão abaixo. Se estiver no Instagram, o link abre o WhatsApp corretamente.';
			addMessage('assistant', reply, groupActions());
			return;
		}
		if (action === 'refund') {
			context = 'refund';
			addMessage('user', 'Preciso solicitar estorno');
			var wrap = document.createElement('div');
			wrap.className = 'rifa-support-msg rifa-support-msg--bot';
			wrap.innerHTML = '<div class="rifa-support-bubble"><strong>Solicitar estorno</strong><br>Escolha como prefere continuar:' +
				refundSubMenu() + '</div>';
			body.appendChild(wrap);
			body.scrollTop = body.scrollHeight;
			wrap.querySelectorAll('[data-refund]').forEach(function (btn) {
				btn.addEventListener('click', function () {
					var mode = btn.getAttribute('data-refund');
					if (mode === 'receipt') {
						showRefundForm();
					} else {
						addMessage('assistant',
							'Certo! Descreva o que aconteceu (número do pedido, telefone, se já pagou o PIX, etc.). Vou te ajudar passo a passo.',
							null
						);
					}
				});
			});
		}
	}

	function sendToAi(message, skipUserBubble) {
		if (isSending) return;
		isSending = true;
		sendBtn.disabled = true;

		if (!skipUserBubble) {
			addMessage('user', message);
		}

		var typing = showTyping();

		var fd = new FormData();
		fd.append('message', message);
		fd.append('context', context);
		fd.append('history', JSON.stringify(history.slice(0, -1)));

		fetch(baseUrl + 'class/Main.php?action=support_ai_chat', {
			method: 'POST',
			body: fd,
			credentials: 'same-origin'
		})
			.then(function (r) { return r.json(); })
			.then(function (resp) {
				removeTyping(typing);
				isSending = false;
				sendBtn.disabled = false;
				if (resp.status === 'success' && resp.reply) {
					var extra = '';
					if (context === 'numbers') extra = numbersActions();
					if (context === 'group' && grupoUrl) extra = groupActions();
					addMessage('assistant', resp.reply, extra || null);
				} else {
					addMessage('assistant', resp.msg || 'Não consegui processar. Tente novamente.');
				}
			})
			.catch(function () {
				removeTyping(typing);
				isSending = false;
				sendBtn.disabled = false;
				addMessage('assistant', 'Erro de conexão. Tente novamente em instantes.');
			});
	}

	function openPanel() {
		if (!panel) return;
		isOpen = true;
		panel.classList.add('is-open');
		panel.setAttribute('aria-hidden', 'false');
		if (body && body.childElementCount === 0) {
			welcomeMessage();
		}
		setTimeout(function () {
			if (input) input.focus();
		}, 300);
	}

	function closePanel() {
		if (!panel) return;
		isOpen = false;
		panel.classList.remove('is-open');
		panel.setAttribute('aria-hidden', 'true');
	}

	function togglePanel() {
		if (isOpen) closePanel();
		else openPanel();
	}

	function init() {
		panel = qs('#rifaSupportPanel');
		body = qs('#rifaSupportBody');
		input = qs('#rifaSupportInput');
		sendBtn = qs('#rifaSupportSend');
		fabWrap = qs('.rifa-support-fab-wrap');

		if (!panel || !body) return;

		var fab = qs('#rifaSupportFab');
		var closeBtn = qs('#rifaSupportClose');
		var campanhaFab = document.getElementById('campanhaFabSuporteBtn');

		if (fab) {
			fab.addEventListener('click', function (e) {
				e.preventDefault();
				e.stopPropagation();
				togglePanel();
			});
		}
		if (closeBtn) {
			closeBtn.addEventListener('click', function (e) {
				e.stopPropagation();
				closePanel();
			});
		}
		if (campanhaFab) {
			campanhaFab.addEventListener('click', function (e) {
				e.preventDefault();
				e.stopPropagation();
				openPanel();
			});
		}

		if (sendBtn && input) {
			sendBtn.addEventListener('click', function () {
				var msg = input.value.trim();
				if (!msg) return;
				input.value = '';
				sendToAi(msg, false);
			});
			input.addEventListener('keydown', function (e) {
				if (e.key === 'Enter' && !e.shiftKey) {
					e.preventDefault();
					sendBtn.click();
				}
			});
		}

		document.addEventListener('click', function (e) {
			if (!isOpen) return;
			if (panel.contains(e.target)) return;
			if (fab && fab.contains(e.target)) return;
			if (fabWrap && fabWrap.contains(e.target)) return;
			if (campanhaFab && campanhaFab.contains(e.target)) return;
			closePanel();
		});
	}

	window.rifaSupportOpen = openPanel;
	window.rifaSupportClose = closePanel;

	function boot() {
		init();
		document.dispatchEvent(new CustomEvent('rifaSupportReady'));
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', boot);
	} else {
		boot();
	}
})();
