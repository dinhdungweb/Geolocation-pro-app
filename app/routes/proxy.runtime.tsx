import type { LoaderFunctionArgs } from "@remix-run/node";

const RUNTIME_VERSION = "2026-04-24-runtime-enforcer";

const runtimeHeaders = {
  "Content-Type": "application/javascript; charset=utf-8",
  "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
  "X-Content-Type-Options": "nosniff",
};

const runtimeScript = `
(function () {
  'use strict';

  var RUNTIME_VERSION = '__RUNTIME_VERSION__';
  if (window.__GEOLOCATION_RUNTIME_ACTIVE__) return;
  window.__GEOLOCATION_RUNTIME_ACTIVE__ = true;

  var bootstrap = window.__GEOLOCATION_APP_CONFIG__ || {};
  var urlParams = new URLSearchParams(window.location.search);
  var DEBUG = urlParams.get('debug') === 'true';

  function log() {
    if (!DEBUG || !window.console || !console.log) return;
    var args = Array.prototype.slice.call(arguments);
    args.unshift('[Geolocation]');
    console.log.apply(console, args);
  }

  function getScriptParam(name) {
    try {
      var currentScript = document.currentScript;
      var src = currentScript && currentScript.src ? currentScript.src : '';
      return src ? new URL(src).searchParams.get(name) : '';
    } catch (error) {
      return '';
    }
  }

  var GEOLOCATION_CONFIG = {
    shop: bootstrap.shop || getScriptParam('shop') || '',
    proxyUrl: bootstrap.proxyUrl || '/apps/geolocation/config',
    analyticsUrl: bootstrap.analyticsUrl || '',
    visitorCountry: bootstrap.visitorCountry || '',
    themeBlockEnabled: bootstrap.themeBlockEnabled !== false
  };

  if (!GEOLOCATION_CONFIG.analyticsUrl && GEOLOCATION_CONFIG.shop) {
    GEOLOCATION_CONFIG.analyticsUrl = '/apps/geolocation/analytics?shop=' + encodeURIComponent(GEOLOCATION_CONFIG.shop);
  }

  function escapeHtml(value) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(value || ''));
    return div.innerHTML;
  }

  function safeColor(value, fallback) {
    return /^#[0-9a-f]{3,8}$/i.test(value || '') ? value : fallback;
  }

  var CookieManager = {
    set: function (name, value, days) {
      var expires = new Date(Date.now() + days * 864e5).toUTCString();
      document.cookie = name + '=' + encodeURIComponent(value) + '; expires=' + expires + '; path=/; SameSite=Lax';
    },
    get: function (name) {
      var match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
      return match ? decodeURIComponent(match[2]) : null;
    },
    has: function (name) {
      return this.get(name) !== null;
    },
    remove: function (name) {
      document.cookie = name + '=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    }
  };

  function fetchConfig() {
    if (!GEOLOCATION_CONFIG.shop) {
      return Promise.reject(new Error('Missing shop'));
    }

    var apiUrl =
      GEOLOCATION_CONFIG.proxyUrl +
      '?shop=' + encodeURIComponent(GEOLOCATION_CONFIG.shop) +
      '&path=' + encodeURIComponent(window.location.pathname) +
      '&country=' + encodeURIComponent(GEOLOCATION_CONFIG.visitorCountry || '') +
      '&_geo_ts=' + Date.now() +
      (DEBUG ? '&debug=true' : '');

    return fetch(apiUrl, {
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { 'Cache-Control': 'no-cache' }
    }).then(function (response) {
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response.json();
    });
  }

  function getCountryCode(config) {
    if (DEBUG && urlParams.get('test_country')) {
      return urlParams.get('test_country').toUpperCase();
    }
    return ((config && config.countryCode) || GEOLOCATION_CONFIG.visitorCountry || '').toUpperCase();
  }

  function trackEvent(type, config, extra) {
    try {
      if (window.Shopify && window.Shopify.designMode) return;

      if (type === 'visit') {
        if (sessionStorage.getItem('geo_visit_tracked')) return;
        sessionStorage.setItem('geo_visit_tracked', 'true');
      }

      var rule = (config && config.rule) || {};
      var payload = Object.assign({
        type: type,
        path: window.location.pathname,
        countryCode: getCountryCode(config),
        eventToken: config && config.eventToken ? config.eventToken : undefined,
        ruleId: rule.ruleId || undefined,
        ruleName: rule.name || undefined,
        targetUrl: rule.targetUrl || undefined
      }, extra || {});

      if (navigator.sendBeacon) {
        var blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
        if (navigator.sendBeacon(GEOLOCATION_CONFIG.analyticsUrl, blob)) return;
      }

      fetch(GEOLOCATION_CONFIG.analyticsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
        cache: 'no-store'
      }).catch(function (error) {
        log('Analytics error:', error);
      });
    } catch (error) {
      log('Analytics failed:', error);
    }
  }

  function alreadyOnTarget(targetUrl) {
    if (!targetUrl) return true;
    try {
      var current = new URL(window.location.href);
      var target = new URL(targetUrl, current.origin);
      if (current.origin !== target.origin) return false;
      var normalizePath = function (path) {
        return path.replace(/\\/+$/, '') || '/';
      };
      return normalizePath(current.pathname) === normalizePath(target.pathname);
    } catch (error) {
      return window.location.href === targetUrl;
    }
  }

  function showPopup(config) {
    var rule = config.rule || {};
    var popup = config.popup || {};
    var template = popup.template || 'modal';
    var container = document.getElementById('geolocation-app-container');
    if (!container) return;

    var targetName = rule.targetUrl || '';
    try {
      targetName = new URL(rule.targetUrl, window.location.origin).hostname;
    } catch (error) {}

    var title = escapeHtml(popup.title || 'Redirect Available');
    var message = escapeHtml((popup.message || 'We detected you are from {country}. Would you like to visit {target}?')
      .replace('{country}', getCountryCode(config) || 'your region')
      .replace('{target}', targetName || 'the recommended store'));
    var confirmBtn = escapeHtml(popup.confirmBtn || 'Go now');
    var cancelBtn = escapeHtml(popup.cancelBtn || 'Stay here');
    var bgColor = safeColor(popup.bgColor, '#ffffff');
    var textColor = safeColor(popup.textColor, '#333333');
    var btnColor = safeColor(popup.btnColor, '#007bff');

    var overlayStyle = '';
    var contentStyle = '';
    if (template === 'top_bar' || template === 'bottom_bar') {
      var verticalPosition = template === 'top_bar' ? 'top: 0 !important;' : 'bottom: 0 !important;';
      var animation = template === 'top_bar' ? 'geo-slide-down' : 'geo-slide-up';
      overlayStyle = 'position: fixed !important; ' + verticalPosition + ' left: 0 !important; right: 0 !important; background: ' + bgColor + ' !important; color: ' + textColor + ' !important; padding: 12px 20px !important; z-index: 2147483647 !important; box-shadow: 0 4px 12px rgba(0,0,0,0.1) !important; display: flex !important; align-items: center !important; justify-content: space-between !important; flex-wrap: wrap !important; gap: 15px !important; animation: ' + animation + ' 0.3s ease !important;';
      contentStyle = 'display: flex !important; align-items: center !important; gap: 15px !important; flex: 1 !important;';
    } else {
      overlayStyle = 'position: fixed !important; inset: 0 !important; background: rgba(0, 0, 0, 0.5) !important; z-index: 2147483647 !important; display: flex !important; align-items: center !important; justify-content: center !important; animation: geo-fade-in 0.3s ease !important;';
      contentStyle = 'background: ' + bgColor + ' !important; color: ' + textColor + ' !important; padding: 24px !important; border-radius: 12px !important; max-width: 400px !important; width: 90% !important; box-shadow: 0 10px 40px rgba(0,0,0,0.2) !important; text-align: center !important; animation: geo-slide-up 0.3s ease !important; position: relative !important;';
    }

    var buttonsHtml = '<div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">' +
      '<button id="geo-confirm-btn" style="background: ' + btnColor + '; color: #fff; border: none; padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: 500; cursor: pointer;">' + confirmBtn + '</button>' +
      '<button id="geo-cancel-btn" style="background: transparent; color: ' + textColor + '; border: 1px solid ' + textColor + '; padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: 500; cursor: pointer;">' + cancelBtn + '</button>' +
      '</div>';

    var contentHtml = template === 'modal'
      ? '<div id="geo-popup-modal" style="' + contentStyle + '"><h3 style="margin: 0 0 12px; font-size: 18px; font-weight: 600;">' + title + '</h3><p style="margin: 0 0 20px; font-size: 14px; line-height: 1.5; opacity: 0.9;">' + message + '</p>' + buttonsHtml + '</div>'
      : '<div id="geo-bar-content" style="' + contentStyle + '"><span style="font-weight: 600; font-size: 14px;">' + title + '</span><span style="font-size: 14px; opacity: 0.9; margin-right: auto;">' + message + '</span>' + buttonsHtml + '</div>';

    container.innerHTML =
      '<div id="geo-popup-overlay" style="' + overlayStyle + '">' + contentHtml + '</div>' +
      '<style>@keyframes geo-fade-in { from { opacity: 0; } to { opacity: 1; } } @keyframes geo-slide-up { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } } @keyframes geo-slide-down { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }</style>';
    container.style.display = 'block';

    document.getElementById('geo-confirm-btn').addEventListener('click', function () {
      CookieManager.set('geo_choice', 'redirected', config.popup && config.popup.cookieDuration ? config.popup.cookieDuration : 7);
      trackEvent('redirected', config);
      window.location.href = rule.targetUrl;
    });

    document.getElementById('geo-cancel-btn').addEventListener('click', function () {
      CookieManager.set('geo_choice', 'stayed', config.popup && config.popup.cookieDuration ? config.popup.cookieDuration : 7);
      trackEvent('clicked_no', config);
      container.style.display = 'none';
    });

    if (template === 'modal') {
      document.getElementById('geo-popup-overlay').addEventListener('click', function (event) {
        if (event.target.id === 'geo-popup-overlay') {
          trackEvent('dismissed', config);
          container.style.display = 'none';
        }
      });
    }
  }

  function showBlockScreen(config) {
    var blockedSettings = config.blocked || {};
    var isVpn = config.rule && config.rule.source === 'vpn';
    var title = escapeHtml(isVpn ? 'Security Alert' : (blockedSettings.title || 'Access Denied'));
    var message = escapeHtml(isVpn ? 'Access via VPN or proxy is not allowed for this store.' : (blockedSettings.message || 'We do not offer services in your country/region.'));

    var overlay = document.createElement('div');
    overlay.id = 'geo-block-screen';
    overlay.style.cssText = 'position: fixed !important; inset: 0 !important; background: linear-gradient(135deg, #1a1a1a 0%, #000000 100%) !important; color: #fff !important; z-index: 2147483647 !important; display: flex !important; align-items: center !important; justify-content: center !important; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important; padding: 20px !important; visibility: visible !important;';
    overlay.innerHTML =
      '<div style="background: rgba(255,255,255,0.05) !important; padding: 40px !important; border-radius: 16px !important; border: 1px solid rgba(255,255,255,0.1) !important; text-align: center !important; max-width: 500px !important; width: 100% !important; box-shadow: 0 20px 40px rgba(0,0,0,0.4) !important; color: #ffffff !important;">' +
      '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:block !important; margin:0 auto 24px !important;"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><path d="m9 9 6 6"></path><path d="m15 9-6 6"></path></svg>' +
      '<h1 style="font-size: 24px !important; font-weight: 600 !important; margin: 0 0 16px !important; color: #ffffff !important;">' + title + '</h1>' +
      '<p style="font-size: 16px !important; line-height: 1.6 !important; color: rgba(255,255,255,0.8) !important; margin: 0 !important;">' + message + '</p></div>' +
      '<style id="geo-block-overrides">html.geo-blocked, html.geo-blocked body { overflow: hidden !important; height: 100% !important; } html.geo-blocked body { position: fixed !important; width: 100% !important; } html.geo-blocked body > *:not(#geolocation-app-container):not(#geo-block-screen) { display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; }</style>';

    document.documentElement.classList.add('geo-blocked');
    document.body.appendChild(overlay);
  }

  function exposeDebug() {
    window.GeolocationDebug = Object.assign(window.GeolocationDebug || {}, {
      runtimeVersion: RUNTIME_VERSION,
      themeBlockEnabled: GEOLOCATION_CONFIG.themeBlockEnabled,
      clearPreference: function () {
        CookieManager.remove('geo_choice');
        console.log('Cleared geolocation preference. Refresh the page to test again.');
      },
      getPreference: function () {
        return CookieManager.get('geo_choice');
      },
      getConfig: fetchConfig
    });
  }

  function init() {
    exposeDebug();
    if (window.Shopify && window.Shopify.designMode) return;
    if (window.location.search.indexOf('preview_theme_id') !== -1 || window.location.pathname.indexOf('/editor') !== -1) return;
    if (!GEOLOCATION_CONFIG.themeBlockEnabled) {
      log('Theme block is disabled');
      return;
    }

    fetchConfig().then(function (config) {
      exposeDebug();
      trackEvent('visit', config);

      if (!config || config.action === 'none' || config.limitExceeded) {
        log('No storefront action required', config);
        return;
      }

      var rule = config.rule || {};
      if ((config.action === 'popup' || config.action === 'auto_redirect') && alreadyOnTarget(rule.targetUrl)) {
        log('Already on target URL', rule.targetUrl);
        return;
      }

      if (config.action === 'block') {
        CookieManager.remove('geo_choice');
        trackEvent(config.analyticsEvent || 'blocked', config);
        showBlockScreen(config);
        return;
      }

      if (config.action === 'auto_redirect') {
        CookieManager.remove('geo_choice');
        trackEvent(config.analyticsEvent || 'auto_redirected', config);
        window.location.replace(rule.targetUrl);
        return;
      }

      if (config.action === 'popup') {
        if (CookieManager.has('geo_choice')) {
          log('User preference found, skipping popup');
          return;
        }
        trackEvent('popup_shown', config);
        showPopup(config);
      }
    }).catch(function (error) {
      log('Could not fetch config:', error);
    });
  }

  exposeDebug();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  window.addEventListener('pageshow', function (event) {
    if (event.persisted) init();
  });
})();
`.replace("__RUNTIME_VERSION__", RUNTIME_VERSION);

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method !== "GET") {
    return new Response("", { status: 405, headers: runtimeHeaders });
  }

  return new Response(runtimeScript, {
    status: 200,
    headers: runtimeHeaders,
  });
};
