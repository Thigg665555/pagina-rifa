/**
 * Meta Pixel (browser) — deduplicação com CAPI via eventID + cookies _fbp/_fbc.
 */
(function (global) {
    'use strict';

    function readCookie(name) {
        var m = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'));
        return m ? decodeURIComponent(m[1]) : '';
    }

    function setCookie(name, value, maxAge) {
        var secure = (typeof location !== 'undefined' && location.protocol === 'https:') ? '; Secure' : '';
        document.cookie = name + '=' + encodeURIComponent(value) +
            '; path=/; max-age=' + (maxAge || 7776000) + '; SameSite=Lax' + secure;
    }

    function resolveFbclid() {
        try {
            var params = new URLSearchParams(global.location.search);
            var fbclid = params.get('fbclid');
            if (fbclid) {
                return fbclid;
            }
            var saved = global.localStorage ? localStorage.getItem('utm_params') : null;
            if (saved) {
                var uj = JSON.parse(saved);
                if (uj && uj.fbclid) {
                    return String(uj.fbclid);
                }
            }
        } catch (e) { /* ignore */ }
        return '';
    }

    function setFbcFromFbclid() {
        try {
            var fbclid = resolveFbclid();
            if (!fbclid) {
                return;
            }
            var existing = readCookie('_fbc');
            if (existing && existing.indexOf(fbclid) !== -1) {
                return;
            }
            setCookie('_fbc', 'fb.1.' + Date.now() + '.' + fbclid);
            try {
                var saved = {};
                var raw = global.localStorage ? localStorage.getItem('utm_params') : null;
                if (raw) {
                    saved = JSON.parse(raw) || {};
                }
                saved.fbclid = fbclid;
                localStorage.setItem('utm_params', JSON.stringify(saved));
            } catch (e2) { /* ignore */ }
        } catch (e) { /* ignore */ }
    }

    function getFbpFbc() {
        return {
            fbp: readCookie('_fbp') || null,
            fbc: readCookie('_fbc') || null
        };
    }

    function track(eventName, params, eventId) {
        if (typeof global.fbq !== 'function') {
            return false;
        }
        var data = params || {};
        if (eventId) {
            global.fbq('track', eventName, data, { eventID: String(eventId) });
        } else {
            global.fbq('track', eventName, data);
        }
        return true;
    }

    function appendPixelFieldsToFormData(fd) {
        if (!fd || typeof fd.append !== 'function') {
            return fd;
        }
        var ids = getFbpFbc();
        if (ids.fbp && !fd.has('fbp')) {
            fd.append('fbp', ids.fbp);
        }
        if (ids.fbc && !fd.has('fbc')) {
            fd.append('fbc', ids.fbc);
        }
        if (!fd.has('page_url') && global.location) {
            fd.append('page_url', global.location.href || '');
        }
        return fd;
    }

    function appendPixelFieldsToObject(obj) {
        obj = obj || {};
        var ids = getFbpFbc();
        if (ids.fbp && !obj.fbp) {
            obj.fbp = ids.fbp;
        }
        if (ids.fbc && !obj.fbc) {
            obj.fbc = ids.fbc;
        }
        if (!obj.page_url && global.location) {
            obj.page_url = global.location.href || '';
        }
        return obj;
    }

    var api = {
        init: function () {
            setFbcFromFbclid();
        },
        track: track,
        eventId: function (prefix, id) {
            return String(prefix) + '_' + String(id);
        },
        buildEcommerceParams: function (productId, qty, value, currency) {
            var params = {
                currency: currency || 'BRL',
                value: parseFloat(value) || 0
            };
            if (productId) {
                params.content_ids = [String(productId)];
                params.content_type = 'product';
                params.contents = [{
                    id: String(productId),
                    quantity: qty > 0 ? qty : 1
                }];
            }
            return params;
        },
        trackAddToCart: function (productId, qty, value, currency, eventId) {
            var params = api.buildEcommerceParams(productId, qty, value, currency);
            var eid = eventId || api.eventId('addtocart', productId + '_' + (qty || 0));
            return track('AddToCart', params, eid);
        },
        trackInitiateCheckoutStart: function (productId, qty, value, currency, eventId) {
            var params = api.buildEcommerceParams(productId, qty, value, currency);
            var eid = eventId || api.eventId('checkout_start', productId + '_' + Date.now());
            return track('InitiateCheckout', params, eid);
        },
        trackCheckout: function (orderId, value, currency, productId, qty) {
            var eid = api.eventId('checkout', orderId);
            var params = api.buildEcommerceParams(productId, qty, value, currency);
            return track('InitiateCheckout', params, eid);
        },
        trackPurchase: function (orderId, value, currency, productId, qty) {
            var eid = api.eventId('purchase', orderId);
            var params = api.buildEcommerceParams(productId, qty, value, currency);
            return track('Purchase', params, eid);
        },
        trackViewContent: function (productId, value) {
            var params = { content_type: 'product', currency: 'BRL' };
            if (productId) {
                params.content_ids = [String(productId)];
            }
            if (value) {
                params.value = parseFloat(value) || 0;
            }
            return track('ViewContent', params);
        },
        trackLead: function (leadId) {
            var eid = leadId ? api.eventId('lead', leadId) : null;
            return track('Lead', {}, eid);
        },
        getFbpFbc: getFbpFbc,
        appendPixelFieldsToFormData: appendPixelFieldsToFormData,
        appendPixelFieldsToObject: appendPixelFieldsToObject
    };

    global.rifaMetaPixel = api;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', api.init);
    } else {
        api.init();
    }
})(typeof window !== 'undefined' ? window : this);
