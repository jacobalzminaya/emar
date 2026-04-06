// CMD DETECTOR - Content Script v3.5
// Timeframe configurable: 5s, 15s, 30s, 60s

(function() {
  'use strict';

  var _enabled     = false;
  var _candleCount = 0;
  var _lastSent    = 0;
  var _candles     = {};
  var _activeAsset = null;
  var _tf          = 60; // segundos por vela, configurable desde popup

  function log(msg) { console.log('[CMD Bridge]', msg); }

  // =====================================================
  // ESCUCHAR WS VIA CustomEvent
  // =====================================================

  document.addEventListener('cmd-ws-message', function(evt) {
    if (!_enabled) return;
    if (!evt.detail || !evt.detail.data) return;
    processWSMessage(evt.detail.data);
  });

  function processWSMessage(raw) {
    if (!raw || typeof raw !== 'string') return;
    if (raw.indexOf('updateStream') >= 0) return;
    if (raw.charAt(0) !== '[') return;

    var msg;
    try { msg = JSON.parse(raw); } catch(e) { return; }
    if (!Array.isArray(msg)) return;

    msg.forEach(function(item) {
      if (!Array.isArray(item) || item.length < 3) return;
      var asset = String(item[0]);
      var ts    = parseFloat(item[1]);
      var price = parseFloat(item[2]);
      if (!asset || isNaN(price) || isNaN(ts)) return;

      // Filtrar por asset activo
      if (_activeAsset) {
        var normActive = normalizeAsset(_activeAsset);
        var normAsset  = normalizeAsset(asset);
        if (normAsset !== normActive &&
            !normAsset.includes(normActive) &&
            !normActive.includes(normAsset)) return;
      }

      // Agrupar por timeframe configurable
      var period = Math.floor(ts / _tf);

      if (!_candles[asset]) {
        _candles[asset] = {open:price,high:price,low:price,close:price,period:period,ticks:1};
        return;
      }

      var c = _candles[asset];

      if (period !== c.period) {
        // Vela completa
        var color    = c.close >= c.open ? 'G' : 'R';
        var body     = Math.abs(c.close - c.open);
        var range    = c.high - c.low || body;
        var ratio    = range > 0 ? body/range : 0.5;
        var strength = ratio>=0.85?4:ratio>=0.70?3:ratio>=0.55?2.5:ratio>=0.40?2:ratio>=0.20?1.5:1;

        log('Vela ['+_tf+'s] '+color+' F'+strength+' '+asset+' ticks='+c.ticks);

        // Skip incomplete first candles — need at least 40% of expected ticks
        var minTicks = Math.max(2, Math.round(_tf * 0.4));
        if (c.ticks >= minTicks) sendCandle(color, strength, asset);
        else log('Vela descartada — solo '+c.ticks+'/'+minTicks+' ticks (incompleta)');

        _candles[asset] = {open:price,high:price,low:price,close:price,period:period,ticks:1};
      } else {
        c.close = price;
        c.high  = Math.max(c.high, price);
        c.low   = Math.min(c.low,  price);
        c.ticks++;
      }
    });
  }

  function normalizeAsset(name) {
    if (!name) return '';
    return name.toUpperCase().replace(/[^A-Z0-9]/g,'').replace(/OTC$/,'');
  }

  function detectActiveAsset() {
    var selectors = [
      '.pair-name','.asset-name','.symbol-name',
      '[class*="pair-name"]','[class*="asset-name"]',
      '[class*="symbol-title"]','[class*="active-asset"]',
      '.chart-title','[class*="chart-title"]'
    ];
    for (var i=0; i<selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el && el.textContent.trim().length > 2) {
        return el.textContent.trim().toUpperCase();
      }
    }
    var m = (document.title||'').match(/([A-Z]{3,}[/_][A-Z]{3,})/);
    return m ? m[1] : null;
  }

  // =====================================================
  // FALLBACK DOM
  // =====================================================

  var _observer = null;

  function startObserver() {
    if (_observer) _observer.disconnect();
    _observer = new MutationObserver(function(mutations) {
      if (!_enabled) return;
      mutations.forEach(function(mut) {
        (mut.addedNodes||[]).forEach(function(node) {
          if (node.nodeType!==1) return;
          if (/deals-noty\b/.test(node.className||'')) processNotif(node);
          if (node.querySelectorAll) {
            node.querySelectorAll('[class*="deals-noty"]').forEach(function(n){
              if (/deals-noty\b/.test(n.className||'')) processNotif(n);
            });
          }
        });
      });
    });
    _observer.observe(document.body,{childList:true,subtree:true});

    setTimeout(function(){
      _activeAsset = detectActiveAsset();
      log('Asset: '+(_activeAsset||'no detectado')+' | TF: '+_tf+'s');
    }, 800);
  }

  function processNotif(el) {
    setTimeout(function(){
      var cls   = el.className||'';
      var color = /close-success/i.test(cls)?'G':/close-fail|close-loss/i.test(cls)?'R':null;
      if (!color) return;
      var strength=2;
      var vals=el.querySelectorAll('.deals-noty__value');
      if (vals.length>=2) {
        var payout=parseFloat((vals[0].textContent||'').replace(/[^0-9.]/g,''));
        var profit=parseFloat((vals[1].textContent||'').replace(/[^0-9.]/g,''));
        if (payout>0&&profit>0){var r=profit/payout;strength=r>=0.8?4:r>=0.6?3:r>=0.4?2.5:r>=0.2?2:1.5;}
      }
      log('Deal: '+color+' F'+strength);
      sendCandle(color, strength, 'deal');
    }, 300);
  }

  // =====================================================
  // ENVIAR VELA
  // =====================================================

  function sendCandle(color, strength, asset) {
    var now = Date.now();
    if (now - _lastSent < 150) return;
    _lastSent = now;
    _candleCount++;
    chrome.runtime.sendMessage({
      type:'candle',color:color,strength:strength,
      count:_candleCount,ts:now,asset:asset||''
    });
    showFeedback(color, strength, asset);
  }

  function showFeedback(color, strength, asset) {
    var el = document.getElementById('cmd-fb');
    if (!el) {
      el = document.createElement('div');
      el.id = 'cmd-fb';
      el.style.cssText = 'position:fixed;bottom:80px;right:16px;z-index:99999;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:900;transition:opacity .4s;border:1px solid;font-family:monospace;cursor:move;';
      document.body.appendChild(el);
      // Make draggable
      el.addEventListener('mousedown', function(e) {
        var ox=e.clientX-el.getBoundingClientRect().left, oy=e.clientY-el.getBoundingClientRect().top;
        function mm(e){ el.style.left=(e.clientX-ox)+"px"; el.style.top=(e.clientY-oy)+"px"; el.style.right="auto"; el.style.bottom="auto"; }
        function mu(){ document.removeEventListener("mousemove",mm); document.removeEventListener("mouseup",mu); }
        document.addEventListener("mousemove",mm);
        document.addEventListener("mouseup",mu);
        e.preventDefault();
      });
    }
    var g = color==='G';
    el.textContent     = (g?'🟢':'🔴')+' F'+strength+' ['+_tf+'s] → CMD';
    el.style.background  = g?'rgba(0,40,15,.95)':'rgba(40,0,8,.95)';
    el.style.color       = g?'#00ff88':'#ff4444';
    el.style.borderColor = g?'#00ff8866':'#ff444466';
    el.style.opacity     = '1';
    clearTimeout(el._t);
    el._t = setTimeout(function(){ el.style.opacity='0'; }, 3000);
  }

  // =====================================================
  // MENSAJES DESDE POPUP
  // =====================================================

  chrome.runtime.onMessage.addListener(function(msg, sender, sendResponse) {
    if (msg.type==='enable') {
      _enabled = true;
      _activeAsset = null;
      if (msg.tf) _tf = msg.tf;
      startObserver();
      log('Bridge ACTIVADO ['+_tf+'s]');
      sendResponse({ok:true, asset:_activeAsset});
    }
    else if (msg.type==='disable') {
      _enabled = false;
      if (_observer){_observer.disconnect();_observer=null;}
      _candles = {};
      log('Bridge DESACTIVADO');
      sendResponse({ok:true});
    }
    else if (msg.type==='setTf') {
      _tf = msg.tf || 60;
      _candles = {}; // reset acumulador
      log('Timeframe: '+_tf+'s');
      sendResponse({ok:true});
    }
    else if (msg.type==='status') {
      sendResponse({ok:true,enabled:_enabled,count:_candleCount,asset:_activeAsset,tf:_tf});
    }
    return true;
  });

  log('Content script v3.5 listo');

})();
