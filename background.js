// CMD Bridge — Background Service Worker v1.2
// Recibe velas desde content.js y las inyecta en CMD Detector

chrome.runtime.onInstalled.addListener(function() {
  console.log('[CMD Bridge] Instalado v1.2');
});

chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
  if (msg.type !== 'candle') { sendResponse({ok:false}); return true; }

  var color    = msg.color;
  var strength = msg.strength || 2;
  console.log('[CMD Bridge] Vela:', color, 'F'+strength);

  // Buscar TODOS los tabs abiertos
  chrome.tabs.query({}, function(tabs) {
    var sent = 0;
    tabs.forEach(function(tab) {
      if (!tab.url) return;
      var url = tab.url.toLowerCase();

      // Detectar tab de CMD Detector — cualquier criterio
      var isCMD = url.indexOf('index.html') >= 0 ||
                  url.indexOf('github.io')  >= 0 ||
                  url.indexOf('localhost')  >= 0 ||
                  url.indexOf('127.0.0.1')  >= 0 ||
                  url.indexOf('cmd')        >= 0 ||
                  url.indexOf('emar')       >= 0 ||
                  // file:// con index.html
                  (url.indexOf('file:')>=0 && url.indexOf('index.html')>=0);

      if (!isCMD) return;

      console.log('[CMD Bridge] Inyectando en tab:', tab.url);

      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: function(c, s) {
          // Intentar quickAddCandle primero
          if (typeof quickAddCandle === 'function') {
            quickAddCandle(c, s);
            console.log('[CMD Bridge] quickAddCandle:', c, s);
            return 'quickAddCandle';
          }
          // Fallback: disparar evento de storage manualmente
          var data = { color:c, strength:s, timestamp:Date.now() };
          localStorage.setItem('cmd-ext-candle', JSON.stringify(data));
          localStorage.setItem('cmd-ext-candle-ts', String(Date.now()));
          // Disparar evento storage manualmente (file:// no lo dispara solo)
          window.dispatchEvent(new StorageEvent('storage', {
            key:      'cmd-ext-candle',
            newValue: JSON.stringify(data),
            storageArea: localStorage
          }));
          console.log('[CMD Bridge] storage event:', c, s);
          return 'storage';
        },
        args: [color, strength]
      }).then(function(results) {
        sent++;
        console.log('[CMD Bridge] Inyectado OK:', results);
      }).catch(function(e) {
        console.log('[CMD Bridge] Error tab', tab.id, ':', e.message);
      });
    });
  });

  sendResponse({ ok: true });
  return true;
});
