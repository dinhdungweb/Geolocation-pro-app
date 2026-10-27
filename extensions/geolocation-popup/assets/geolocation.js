(function(){"use strict";(function(){const et="2026.10.27.1",a=window.__GEOLOCATION_CONFIG__;if(!a||!a.shop){console.warn("[Geolocation] Storefront configuration is missing");return}const D=new URLSearchParams(window.location.search),_=D.get("debug")==="true",g=(...t)=>_&&console.log("[Geolocation]",...t),nt=()=>{let t=document.getElementById("geolocation-app-container");return t||(document.body?(t=document.createElement("div"),t.id="geolocation-app-container",t.style.display="none",document.body.appendChild(t),t):null)},f=t=>{const o=document.createElement("div");return o.appendChild(document.createTextNode(t||"")),o.innerHTML},x=(t,o)=>/^#[0-9a-f]{3,8}$/i.test(t||"")?t:o,P=t=>{const o=(t||"").trim();if(!o)return"";try{const e=new URL(o,window.location.origin);if(e.protocol==="http:"||e.protocol==="https:"||e.protocol==="mailto:")return e.href}catch{}return""},G=t=>{const o=P(t);return o&&!o.toLowerCase().startsWith("mailto:")?o:""},w={set(t,o,e){const i=new Date(Date.now()+e*864e5).toUTCString();document.cookie=`${t}=${encodeURIComponent(o)}; expires=${i}; path=/; SameSite=Lax`},get(t){const o=document.cookie.match(new RegExp("(^| )"+t+"=([^;]+)"));return o?decodeURIComponent(o[2]):null},has(t){return this.get(t)!==null},remove(t){document.cookie=`${t}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`}},m={get(t){try{return sessionStorage.getItem(t)}catch{return null}},set(t,o){try{sessionStorage.setItem(t,o)}catch{}},remove(t){try{sessionStorage.removeItem(t)}catch{}},has(t){return this.get(t)!==null}},it=1e4,rt=3e3,M=["geo_config",a.shop,window.location.pathname,a.visitorCountry||"",a.marketHandle||"",a.marketId||""].join(":");let $=null;const j=async()=>{if(!_)try{const t=JSON.parse(m.get(M)||"null");if(t?.expiresAt>Date.now()&&t?.config)return t.config}catch{m.remove(M)}if($)return $;$=(async()=>{const t=`${a.proxyUrl}?shop=${a.shop}&path=${encodeURIComponent(window.location.pathname)}&origin=${encodeURIComponent(window.location.origin)}&country=${encodeURIComponent(a.visitorCountry||"")}&market_handle=${encodeURIComponent(a.marketHandle||"")}&market_id=${encodeURIComponent(a.marketId||"")}&_geo_ts=${Date.now()}${_?"&debug=true":""}`,o=typeof AbortController=="function"?new AbortController:null,e=o?setTimeout(()=>o.abort(),rt):null;let i;try{i=await fetch(t,{cache:"no-store",credentials:"same-origin",headers:{"Cache-Control":"no-cache"},signal:o?o.signal:void 0})}finally{e&&clearTimeout(e)}if(!i.ok)throw new Error(`HTTP ${i.status}`);const n=await i.json();return _||m.set(M,JSON.stringify({expiresAt:Date.now()+it,config:n})),n})();try{return await $}finally{$=null}},q=t=>_&&D.get("test_country")?D.get("test_country").toUpperCase():(t.countryCode||a.visitorCountry||"").toUpperCase(),at=t=>{const o=(t||"").toUpperCase();return/^[A-Z]{2}$/.test(o)?`https://flagcdn.com/${o.toLowerCase()}.svg`:""},pt=t=>{const o=(t||"").toUpperCase();if(!o)return"your region";const e=at(o),i=f(o);return e?`<span class="geo-country-label"><img class="geo-country-flag" src="${e}" alt="" loading="lazy" onerror="this.style.display='none'"><span>${i}</span></span>`:i},y=(t,o,e={})=>{try{if(window.Shopify&&window.Shopify.designMode)return;const i=t==="visit";let n=null;if(t==="visit"){if(n=`geo_visit_tracked:${a.shop}:${window.location.pathname}`,m.has(n)||!o.visitToken)return;m.set(n,"pending")}const c=o.rule||{},d={type:t,path:window.location.pathname,countryCode:q(o),regionCode:typeof o.regionCode=="string"?o.regionCode:void 0,regionName:typeof o.regionName=="string"?o.regionName:void 0,eventToken:i?o.visitToken:o.eventToken||void 0,ruleId:c.ruleId||void 0,ruleName:c.name||void 0,targetUrl:c.targetUrl||void 0,...e};if(!i&&navigator.sendBeacon){const s=new Blob([JSON.stringify(d)],{type:"application/json"});if(navigator.sendBeacon(a.analyticsUrl,s))return}fetch(a.analyticsUrl,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(d),keepalive:!0}).then(s=>{if(!s.ok)throw new Error(`HTTP ${s.status}`);n&&m.set(n,"true")}).catch(s=>{n&&m.remove(n),g("Analytics error:",s)})}catch(i){g("Analytics failed:",i)}},ct=(t,o=!1)=>{if(!t)return!0;try{const e=new URL(window.location.href),i=new URL(t,e.origin);if(e.origin!==i.origin)return!1;const n=s=>s.replace(/\/+$/,"")||"/",c=n(e.pathname),d=n(i.pathname);return c===d?!0:o&&d!=="/"&&c.startsWith(`${d}/`)}catch{return window.location.href.includes(t)}},st=t=>{if(!t)return null;try{return new URL(t,window.location.origin)}catch{return null}},Y=t=>{const o=st(t);return!!(o&&o.origin===window.location.origin)},J=t=>{const o=t.ruleId||t.name||t.targetUrl||"unknown";return`geo_internal_redirected:${a.shop}:${o}`},K=t=>t.redirectFrequency==="always"||t.redirectFrequency==="once"?t.redirectFrequency:Y(t.targetUrl)?"once":"always",V=t=>{const o=t.rule||{},e=t.popup||{},i=e.template||"modal",n=nt();if(!n){document.addEventListener("DOMContentLoaded",()=>V(t),{once:!0});return}let c=o.targetUrl||"";try{c=new URL(o.targetUrl,window.location.origin).hostname}catch{}const d=f(e.title||"Redirect Available"),s=q(t),L=f(e.message||"We detected you are from {country}. Would you like to visit {target}?").replaceAll("{country}",pt(s)).replaceAll("{target}",f(c||"this store")),T=f(e.confirmBtn||"Go now"),I=f(e.cancelBtn||"Stay here"),S=x(e.bgColor,"#ffffff"),C=x(e.textColor,"#333333"),R=x(e.btnColor,"#007bff");let u="",p="";i==="top_bar"||i==="bottom_bar"?(u=`
        position: fixed !important; ${i==="top_bar"?"top: 0 !important;":"bottom: 0 !important;"} left: 0 !important; right: 0 !important;
        background: ${S} !important; color: ${C} !important;
        padding: 12px 20px !important; z-index: 2147483647 !important;
        box-shadow: 0 4px 12px rgba(0,0,0,0.1) !important;
        display: flex !important; align-items: center !important; justify-content: space-between !important;
        flex-wrap: wrap !important; gap: 15px !important; animation: ${i==="top_bar"?"geo-slide-down":"geo-slide-up"} 0.3s ease !important;
      `,p="display: flex !important; align-items: center !important; gap: 15px !important; flex: 1 !important;"):(u=`
        position: fixed !important; inset: 0 !important; background: rgba(17, 24, 39, 0.46) !important;
        z-index: 2147483647 !important; display: flex !important; align-items: center !important; justify-content: center !important;
        padding: 20px !important; animation: geo-fade-in 0.16s ease !important;
      `,p=`
        --geo-popup-bg: ${S}; --geo-popup-text: ${C}; --geo-popup-accent: ${R};
      `);const k=i==="modal"?`
        <div class="geo-popup-actions">
          <button id="geo-confirm-btn" class="geo-popup-btn geo-popup-btn-primary">${T}</button>
          <button id="geo-cancel-btn" class="geo-popup-btn geo-popup-btn-secondary">${I}</button>
        </div>
      `:`
        <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
          <button id="geo-confirm-btn" style="background: ${R}; color: #fff; border: none; padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: 500; cursor: pointer;">${T}</button>
          <button id="geo-cancel-btn" style="background: transparent; color: ${C}; border: 1px solid ${C}; padding: 12px 24px; border-radius: 6px; font-size: 14px; font-weight: 500; cursor: pointer;">${I}</button>
        </div>
      `,U=i==="modal"?`
        <div id="geo-popup-modal" class="geo-popup-card" style="${p}" role="dialog" aria-modal="true" aria-labelledby="geo-popup-title">
          <button id="geo-close-btn" class="geo-popup-close" type="button" aria-label="Close">&times;</button>
          <div class="geo-popup-copy">
            <h3 id="geo-popup-title" class="geo-popup-title">${d}</h3>
            <p class="geo-popup-message">${L}</p>
          </div>
          ${k}
        </div>
      `:`
        <div id="geo-bar-content" style="${p}">
          <span style="font-weight: 600; font-size: 14px;">${d}</span>
          <span style="font-size: 14px; opacity: 0.9; margin-right: auto;">${L}</span>
          ${k}
        </div>
      `;n.innerHTML=`
      <div id="geo-popup-overlay" style="${u}">
        ${U}
      </div>
      <style>
        @keyframes geo-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes geo-scale-in { from { transform: scale(0.98); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes geo-slide-up { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes geo-slide-down { from { transform: translateY(-20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        .geo-country-label {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 2px 6px;
          border: 1px solid #e3e5e8;
          border-radius: 0;
          background: #f7f8f9;
          color: #202223;
          font-size: 13px;
          font-weight: 600;
          line-height: 1.2;
          white-space: nowrap;
          vertical-align: 0;
        }
        .geo-country-flag { display: inline-block; width: 16px; height: 11px; object-fit: cover; border-radius: 0; box-shadow: none; }
        .geo-popup-card,
        .geo-popup-card * { box-sizing: border-box !important; }
        .geo-popup-card {
          width: min(390px, 100%) !important;
          background: var(--geo-popup-bg) !important;
          color: var(--geo-popup-text) !important;
          border: 1px solid #e3e5e8 !important;
          border-radius: 0 !important;
          box-shadow: none !important;
          padding: 24px !important;
          position: relative !important;
          text-align: left !important;
          animation: geo-scale-in 0.16s ease !important;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
        }
        .geo-popup-close {
          position: absolute !important;
          top: 12px !important;
          right: 12px !important;
          width: 28px !important;
          height: 28px !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          border: 0 !important;
          border-radius: 0 !important;
          background: transparent !important;
          color: var(--geo-popup-text) !important;
          font-size: 21px !important;
          line-height: 1 !important;
          cursor: pointer !important;
          opacity: 0.55 !important;
        }
        .geo-popup-close:hover { opacity: 0.9 !important; background: #f6f6f7 !important; }
        .geo-popup-copy { padding-right: 28px !important; }
        .geo-popup-title {
          margin: 0 !important;
          color: var(--geo-popup-text) !important;
          font-size: 18px !important;
          font-weight: 700 !important;
          letter-spacing: 0 !important;
          line-height: 1.3 !important;
        }
        .geo-popup-message {
          margin: 12px 0 0 !important;
          color: var(--geo-popup-text) !important;
          font-size: 14px !important;
          line-height: 1.5 !important;
          opacity: 0.74 !important;
        }
        .geo-popup-actions {
          display: flex !important;
          align-items: center !important;
          justify-content: flex-start !important;
          gap: 8px !important;
          margin-top: 18px !important;
          flex-wrap: wrap !important;
        }
        .geo-popup-btn {
          min-height: 38px !important;
          padding: 0 16px !important;
          border-radius: 0 !important;
          font-size: 13px !important;
          font-weight: 600 !important;
          line-height: 1 !important;
          cursor: pointer !important;
          font-family: inherit !important;
          transition: background 0.14s ease, border-color 0.14s ease, opacity 0.14s ease !important;
        }
        .geo-popup-btn:hover { opacity: 0.9 !important; }
        .geo-popup-btn-primary {
          order: 1 !important;
          background: var(--geo-popup-accent) !important;
          color: #ffffff !important;
          border: 1px solid var(--geo-popup-accent) !important;
          box-shadow: none !important;
        }
        .geo-popup-btn-secondary {
          order: 2 !important;
          background: transparent !important;
          color: var(--geo-popup-text) !important;
          border: 1px solid #d7dade !important;
        }
        @media (max-width: 480px) {
          .geo-popup-card { padding: 22px !important; border-radius: 0 !important; }
          .geo-popup-copy { padding-right: 28px !important; }
          .geo-popup-title { font-size: 18px !important; line-height: 1.3 !important; }
          .geo-popup-message { font-size: 14px !important; line-height: 1.5 !important; }
          .geo-popup-actions { flex-direction: column !important; align-items: stretch !important; }
          .geo-popup-btn { width: 100% !important; }
        }
      </style>
    `,n.style.display="block",document.getElementById("geo-confirm-btn").addEventListener("click",()=>{w.set("geo_choice","redirected",t.popup?.cookieDuration||7);const r=G(o.targetUrl);r&&(y("redirected",t),window.location.href=r)}),document.getElementById("geo-cancel-btn").addEventListener("click",()=>{w.set("geo_choice","stayed",t.popup?.cookieDuration||7),y("clicked_no",t),n.style.display="none"}),i==="modal"&&(document.getElementById("geo-close-btn").addEventListener("click",()=>{y("dismissed",t),n.style.display="none"}),document.getElementById("geo-popup-overlay").addEventListener("click",r=>{r.target.id==="geo-popup-overlay"&&(y("dismissed",t),n.style.display="none")}))};let O=null,z=!1,A=!1,B=!1,W=!1,b=null;const lt=()=>typeof HTMLDialogElement<"u"&&typeof HTMLDialogElement.prototype.showModal=="function",Q=(t,o)=>{if(t.tagName!=="DIALOG"||typeof t.showModal!="function")return!1;try{return o&&t.open&&t.close(),t.open||t.showModal(),!0}catch(e){return g("Could not open block dialog as modal:",e),!1}},h=(t,o)=>{if(!t||t.nodeType!==1)return!1;if(t===o)return!0;if(t===document.body||t===document.documentElement||t===document.head)return!1;if(t.id==="geo-block-root"||t.id==="geo-block-dialog"||t.id==="geo-block-layer"||t.id==="geo-block-screen"||t.id==="geolocation-app-container")return!0;const e=t.getRootNode&&t.getRootNode();return e&&e.host&&(e.host===o||e.host.id==="geo-block-root")?!0:!!(t.closest&&t.closest("#geo-block-root, #geo-block-dialog, #geo-block-layer, #geo-block-screen, #geolocation-app-container"))},l=(t,o,e)=>{t.style.getPropertyValue(o)===e&&t.style.getPropertyPriority(o)==="important"||t.style.setProperty(o,e,"important")},v=(t,o)=>{!t||t.nodeType!==1||!t.style||h(t,o)||/^(SCRIPT|STYLE|LINK|META|TEMPLATE|NOSCRIPT)$/i.test(t.tagName)||(t.getAttribute("aria-hidden")!=="true"&&t.setAttribute("aria-hidden","true"),l(t,"display","none"),l(t,"visibility","hidden"),l(t,"opacity","0"),l(t,"pointer-events","none"),l(t,"z-index","-1"))},dt=()=>{try{return Array.prototype.slice.call(document.querySelectorAll(":popover-open"))}catch{return[]}},mt=t=>{if(!(B||!document.body)){B=!0;try{l(document.body,"position","fixed"),l(document.body,"display","none"),l(document.body,"width","100%"),l(document.body,"overflow","hidden"),l(document.body,"visibility","hidden"),l(document.body,"opacity","0"),l(document.body,"pointer-events","none"),document.fullscreenElement&&!h(document.fullscreenElement,t)&&document.exitFullscreen&&document.exitFullscreen().catch(()=>{}),Array.prototype.forEach.call(document.querySelectorAll("dialog[open]"),o=>{if(!h(o,t)){try{typeof o.close=="function"&&o.close()}catch{}o.removeAttribute("open"),v(o,t)}}),dt().forEach(o=>{if(!h(o,t)){try{typeof o.hidePopover=="function"&&o.hidePopover()}catch{}v(o,t)}}),Array.prototype.forEach.call(document.body.children,o=>{v(o,t)}),Array.prototype.forEach.call(document.documentElement.children,o=>{o===document.head||o===document.body||h(o,t)||v(o,t)})}finally{B=!1}}},Z=t=>t?t.__geoBlockDialog?t.__geoBlockDialog:t.shadowRoot?t.shadowRoot.getElementById("geo-block-dialog"):document.getElementById("geo-block-dialog"):null,ut=t=>{const o=Z(t);return o||(t&&t.shadowRoot?t.shadowRoot.getElementById("geo-block-layer"):t&&t.querySelector?t.querySelector("#geo-block-layer"):null)},H=(t,o)=>{if(!document.documentElement||!t)return;document.documentElement.classList.add("geo-blocked"),b&&!b.isConnected&&(document.head||document.documentElement).appendChild(b),t.parentNode!==document.documentElement&&document.documentElement.appendChild(t),t.style.setProperty("z-index","2147483647","important");const e=Z(t);e&&Q(e,o),mt(t)},gt=t=>{b||(b=document.createElement("style"),b.id="geo-block-document-overrides",(document.head||document.documentElement).appendChild(b)),b.textContent=`
      html.geo-blocked { overflow: hidden !important; height: 100% !important; overscroll-behavior: none !important; }
      html.geo-blocked body { display: none !important; position: fixed !important; width: 100% !important; overflow: hidden !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; }
      html.geo-blocked > *:not(head):not(body):not(#geo-block-root) { display: none !important; visibility: hidden !important; opacity: 0 !important; pointer-events: none !important; z-index: -1 !important; }
      html.geo-blocked #geo-block-root {
        position: fixed !important;
        inset: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        height: 100dvh !important;
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
        pointer-events: auto !important;
        z-index: 2147483647 !important;
        isolation: isolate !important;
        contain: layout style paint !important;
      }
      html.geo-blocked #geo-block-root * { visibility: visible !important; opacity: 1 !important; pointer-events: auto !important; }
      html.geo-blocked dialog:not(#geo-block-dialog),
      html.geo-blocked #preventify---container,
      html.geo-blocked [id^="preventify"],
      html.geo-blocked [class*="preventify"],
      html.geo-blocked [popover]:not(#geo-block-root):not(#geo-block-dialog):not(#geo-block-screen) {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
    `,document.documentElement.style.setProperty("background",t,"important")},X=t=>{if(!(W||window.__geoBlockTakeoverHooksInstalled)){if(W=!0,window.__geoBlockTakeoverHooksInstalled=!0,typeof HTMLDialogElement<"u"&&HTMLDialogElement.prototype.showModal){const o=HTMLDialogElement.prototype.showModal;HTMLDialogElement.prototype.showModal=function(){if(h(this,t))return o.apply(this,arguments);v(this,t),F(t,!1)}}if(Element.prototype.showPopover){const o=Element.prototype.showPopover;Element.prototype.showPopover=function(){if(h(this,t))return o.apply(this,arguments);v(this,t),F(t,!1)}}["click","mousedown","mouseup","touchstart","touchend","wheel","keydown"].forEach(o=>{window.addEventListener(o,e=>{(e.composedPath?e.composedPath():[]).some(c=>h(c,t))||(e.preventDefault(),e.stopImmediatePropagation())},!0)})}},F=(t,o)=>{A=A||o,!z&&(z=!0,requestAnimationFrame(()=>{const e=A;z=!1,A=!1,H(t,e)}))},tt=t=>{!window.MutationObserver||O||(O=new MutationObserver(o=>{if(B)return;let e=!1;for(const i of o){if(i.type==="attributes"){const n=i.target;if(n===t||h(n,t))continue;(n===document.documentElement||n===document.body||n.parentNode===document.body||n.tagName==="DIALOG"||n.hasAttribute("popover"))&&(e=!0);continue}i.type==="childList"&&(e=!0,Array.prototype.forEach.call(i.addedNodes,n=>{n.nodeType===1&&(n.tagName==="DIALOG"||n.hasAttribute("popover")||n.querySelector&&n.querySelector("dialog, [popover]"))&&(e=!0)}))}e&&F(t,!1)}),O.observe(document.documentElement,{childList:!0,subtree:!0,attributes:!0,attributeFilter:["open","style","class","popover"]}))},ft=t=>{const o=t.blocked||{},e=t.rule&&t.rule.source==="vpn",i=f(e?"Security Alert":o.title||"Access Denied"),n=f(e?"Access via VPN or proxy is not allowed for this store.":o.message||"We do not offer services in your country/region."),c=x(o.bgColor,"#f8fafc"),d=x(o.textColor,"#0f172a"),s=x(o.accentColor,"#2563eb"),L=P(o.logoUrl),T=P(o.defaultImageUrl),I=P(o.supportUrl),S=f(o.supportText||"Contact support"),C=L?`<img src="${L}" alt="" class="geo-block-logo">`:T?`<img src="${T}" alt="" class="geo-block-default-image">`:"",R=I&&S?`<a href="${I}" class="geo-btn-support">${S}</a>`:"";gt(c);const u=document.getElementById("geo-block-root")||window.__geoBlockRoot;if(u){const E=ut(u);E&&(E.style.setProperty("--geo-block-bg",c),E.style.setProperty("--geo-block-text",d),E.style.setProperty("--geo-block-accent",s)),window.__geoBlockRoot=u,X(u),H(u,!1),tt(u);return}const p=document.createElement("div");p.id="geo-block-root",window.__geoBlockRoot=p;const k=lt(),U=p.attachShadow?p.attachShadow({mode:"open"}):null,r=document.createElement(k?"dialog":"div");r.id=k?"geo-block-dialog":"geo-block-layer",p.__geoBlockDialog=k?r:null,r.setAttribute("aria-modal","true"),r.setAttribute("role","dialog"),k&&r.addEventListener("cancel",E=>E.preventDefault()),r.style.setProperty("--geo-block-bg",c),r.style.setProperty("--geo-block-text",d),r.style.setProperty("--geo-block-accent",s);const N=document.createElement("style");N.textContent=`
      #geo-block-dialog,
      #geo-block-layer {
        position: fixed !important;
        inset: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        height: 100dvh !important;
        max-width: none !important;
        max-height: none !important;
        margin: 0 !important;
        padding: 0 !important;
        border: 0 !important;
        background: var(--geo-block-bg) !important;
        color: var(--geo-block-text) !important;
        z-index: 2147483647 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif !important;
        box-sizing: border-box !important;
        overflow: hidden !important;
        visibility: visible !important;
      }
      #geo-block-dialog::backdrop {
        background: var(--geo-block-bg) !important;
        opacity: 1 !important;
      }
      #geo-block-screen {
        position: fixed !important;
        inset: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        height: 100dvh !important;
        background: var(--geo-block-bg) !important;
        color: var(--geo-block-text) !important;
        z-index: 2147483647 !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        padding: 24px !important;
        visibility: visible !important;
      }
      #geo-block-screen,
      #geo-block-screen * {
        box-sizing: border-box !important;
      }
      .geo-block-card {
        text-align: center !important;
        max-width: 560px !important;
        width: 100% !important;
      }
      .geo-block-media {
        margin-bottom: 18px !important;
      }
      .geo-block-logo {
        max-width: 160px !important;
        max-height: 70px !important;
        object-fit: contain !important;
        display: block !important;
        margin: 0 auto 32px !important;
      }
      .geo-block-default-image {
        width: 220px !important;
        max-width: min(60vw, 260px) !important;
        height: auto !important;
        object-fit: contain !important;
        display: block !important;
        margin: 0 auto 28px !important;
      }
      .geo-block-title {
        font-size: 40px !important;
        font-weight: 600 !important;
        margin: 0 0 14px !important;
        color: var(--geo-block-text) !important;
        letter-spacing: 0 !important;
        line-height: 1.1 !important;
      }
      .geo-block-message {
        font-size: 18px !important;
        line-height: 1.5 !important;
        color: var(--geo-block-text) !important;
        opacity: 0.8 !important;
        margin: 0 !important;
        font-weight: 450 !important;
      }
      .geo-btn-support {
        display: inline-block !important;
        margin-top: 32px !important;
        background: var(--geo-block-accent) !important;
        color: #ffffff !important;
        text-decoration: none !important;
        padding: 14px 32px !important;
        border-radius: 10px !important;
        font-size: 16px !important;
        font-weight: 600 !important;
        transition: all 0.25s ease !important;
        box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.15) !important;
        font-family: inherit !important;
      }
      .geo-btn-support:hover {
        transform: translateY(-2px) !important;
        box-shadow: 0 8px 16px rgba(0,0,0,0.15) !important;
        opacity: 0.9 !important;
      }
    `,r.innerHTML=`
      <div id="geo-block-screen">
        <div class="geo-block-card">
          <div class="geo-block-media">
            ${C}
          </div>
          <h1 class="geo-block-title">${i}</h1>
          <p class="geo-block-message">${n}</p>
          ${R}
        </div>
      </div>
    `,document.documentElement.classList.add("geo-blocked"),U?(U.appendChild(N),U.appendChild(r)):(p.appendChild(N),p.appendChild(r)),document.documentElement.appendChild(p),X(p),k&&Q(r,!1),H(p,!1),tt(p)},ot=async()=>{if(window.Shopify&&window.Shopify.designMode)return;let t;try{t=await j()}catch(e){g("Could not fetch config:",e);return}if(y("visit",t),!t||t.action==="none"||t.limitExceeded){g("No storefront action required",t);return}const o=t.rule||{};if((t.action==="popup"||t.action==="auto_redirect")&&ct(o.targetUrl,t.action==="auto_redirect")){t.action==="auto_redirect"&&Y(o.targetUrl)&&K(o)==="once"&&m.set(J(o),"true"),g("Already on target URL");return}if(t.action==="block"){w.remove("geo_choice"),y(t.analyticsEvent||"blocked",t),ft(t);return}if(t.action==="auto_redirect"){if(K(o)==="once"){const i=J(o);if(m.has(i)){g("Redirect already happened once in this session");return}m.set(i,"true")}const e=G(o.targetUrl);if(!e){g("Ignoring redirect with an unsafe or invalid target URL");return}w.remove("geo_choice"),y(t.analyticsEvent||"auto_redirected",t),window.location.replace(e);return}if(t.action==="popup"){if(w.has("geo_choice")){g("User preference found, skipping popup");return}y("popup_shown",t),V(t)}};window.GeolocationDebug={version:et,clearPreference:()=>{w.remove("geo_choice"),console.log("Cleared geolocation preference. Refresh the page to test again.")},getPreference:()=>w.get("geo_choice"),getConfig:j},ot(),window.addEventListener("pageshow",t=>{t.persisted&&ot()})})()})();
