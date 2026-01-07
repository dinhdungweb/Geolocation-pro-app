/**
 * Geolocation Detection Script
 * This file can be used for more complex logic if needed.
 * Currently, the main logic is embedded in the Liquid template.
 */

// Export utilities for potential use
window.GeolocationApp = window.GeolocationApp || {};

window.GeolocationApp.detectCountry = async function () {
    try {
        const response = await fetch('https://www.cloudflare.com/cdn-cgi/trace');
        const text = await response.text();
        const match = text.match(/loc=([A-Z]{2})/);
        return match ? match[1] : null;
    } catch (error) {
        console.warn('[GeolocationApp] Detection failed:', error);
        return null;
    }
};

window.GeolocationApp.isBot = function () {
    const botPatterns = /bot|crawl|spider|slurp|mediapartners|facebookexternalhit|bingpreview|linkedinbot|googlebot/i;
    return botPatterns.test(navigator.userAgent);
};

console.log('[GeolocationApp] Script loaded');
