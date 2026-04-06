// ===== picker.js — Picker de precio (pp-bar) =====
// Dependencias: quickAddCandle(), showPPProjection(), hidePPProjection() desde logic.js
// Cargado DESPUÉS que logic.js en index.html

  (function() {
    var ppRef = null, ppSpread = 1, ppMin = 0, ppMax = 0;
    var ZONES = [
      { min:80, max:100, str:4,   label:'Engulfing/Cap', gBg:'rgba(0,210,80,0.24)',  rBg:'rgba(210,50,50,0.24)'  },
      { min:60, max:80,  str:3,   label:'Muy grande',    gBg:'rgba(0,210,80,0.16)',  rBg:'rgba(210,50,50,0.16)'  },
      { min:40, max:60,  str:2.5, label:'Grande',        gBg:'rgba(0,210,80,0.10)',  rBg:'rgba(210,50,50,0.10)'  },
      { min:22, max:40,  str:2,   label:'Normal',        gBg:'rgba(0,210,80,0.06)',  rBg:'rgba(210,50,50,0.06)'  },
      { min:8,  max:22,  str:1.5, label:'Pequeña',       gBg:'rgba(0,210,80,0.03)',  rBg:'rgba(210,50,50,0.03)'  },
      { min:0,  max:8,   str:1,   label:'Doji',          gBg:'rgba(130,130,130,0.07)',rBg:'rgba(130,130,130,0.07)'},
    ];

    function getZone(pct) {
      for (var i=0;i<ZONES.length;i++) { if (pct >= ZONES[i].min) return ZONES[i]; }
      return ZONES[ZONES.length-1];
    }

    function centerRange(price) {
      ppRef = price; ppMin = price - ppSpread; ppMax = price + ppSpread;
      if (typeof ppRefPrice !== 'undefined') { window.ppRefPrice = price; window.ppMinPrice = ppMin; window.ppMaxPrice = ppMax; }
      renderBar();
    }

    var _ppLastSide = 'G';

    function renderBar(side) {
      var bar = document.getElementById('pp-bar');
      if (!bar || ppMax <= ppMin) return;
      if (side) _ppLastSide = side;
      var isRed = _ppLastSide === 'R';
      var range = ppMax - ppMin, html = '';
      ZONES.forEach(function(z,i) {
        var top = (100 - z.max)+'%', h = (z.max - z.min)+'%';
        var priceHi = (ppMin + z.max/100*range).toFixed(2);
        var bg = isRed ? z.rBg : z.gBg;
        var labelCol = isRed ? 'rgba(255,80,80,0.9)' : 'rgba(0,210,80,0.9)';
        html += '<div class="ppz" id="ppz'+i+'" style="position:absolute;left:0;right:0;top:'+top+';height:'+h+';background:'+bg+';display:flex;align-items:center;justify-content:space-between;padding:0 8px;border-bottom:1px solid rgba(255,255,255,0.04);transition:background .08s;">'
          +'<span style="font-size:10px;font-weight:500;color:'+labelCol+';pointer-events:none;">'+z.label+' · F'+z.str+'</span>'
          +'<span style="font-size:9px;color:rgba(255,255,255,0.35);pointer-events:none;">'+priceHi+'</span>'
          +'</div>';
      });
      [25,50,75].forEach(function(p) {
        var price = (ppMin + p/100*range).toFixed(2);
        html += '<div style="position:absolute;left:0;right:0;top:'+(100-p)+'%;height:1px;background:rgba(255,255,255,0.07);pointer-events:none;">'
          +'<span style="position:absolute;left:50%;transform:translateX(-50%);bottom:2px;font-size:9px;color:rgba(255,255,255,0.35);">'+price+'</span></div>';
      });
      html += '<div style="position:absolute;top:3px;left:7px;font-size:9px;color:rgba(255,255,255,0.4);pointer-events:none;">'+ppMax.toFixed(2)+' ↑</div>';
      html += '<div style="position:absolute;bottom:3px;left:7px;font-size:9px;color:rgba(255,255,255,0.4);pointer-events:none;">'+ppMin.toFixed(2)+' ↓</div>';
      if (ppRef !== null) {
        var refPct = Math.max(0,Math.min(100,((ppRef-ppMin)/range)*100));
        html += '<div style="position:absolute;left:0;right:0;top:'+(100-refPct).toFixed(1)+'%;height:2px;background:#4499ff;z-index:4;pointer-events:none;">'
          +'<span style="position:absolute;left:7px;bottom:3px;font-size:9px;color:#4499ff;font-weight:bold;">ref '+ppRef.toFixed(2)+'</span></div>';
      }
      html += '<div id="pp-hline" style="position:absolute;left:0;right:0;height:2px;display:none;pointer-events:none;z-index:6;">'
        +'<span id="pp-hprice" style="position:absolute;right:7px;top:-15px;font-size:10px;font-weight:bold;padding:1px 5px;border-radius:3px;"></span>'
        +'<span id="pp-hdir" style="position:absolute;left:7px;top:-15px;font-size:10px;font-weight:bold;padding:1px 5px;border-radius:3px;"></span>'
        +'</div>';
      bar.innerHTML = html;
    }

    window.ppBarHover = function(e) {
      var bar = document.getElementById('pp-bar');
      if (!bar || ppRef === null) return;
      var rect = bar.getBoundingClientRect();
      var price = ppMax - ((e.clientY - rect.top)/rect.height)*(ppMax-ppMin);
      var isGreen = price >= ppRef;
      var newSide = isGreen ? 'G' : 'R';
      if (newSide !== _ppLastSide) renderBar(newSide);
      var pct = Math.min(100, Math.abs(price-ppRef)/ppSpread*100);
      var z = getZone(pct), zi = ZONES.indexOf(z);
      var col = isGreen ? '#00cc66' : '#ff4444';
      ZONES.forEach(function(zd,i) {
        var el = document.getElementById('ppz'+i);
        if (!el) return;
        el.style.background = (i===zi) ? (isGreen ? 'rgba(0,210,80,0.42)' : 'rgba(210,50,50,0.42)') : (isGreen ? zd.gBg : zd.rBg);
        el.firstElementChild.style.color = (i===zi) ? col : (isGreen ? 'rgba(0,210,80,0.75)' : 'rgba(210,70,70,0.75)');
      });
      var yPx = e.clientY - rect.top;
      var hl=document.getElementById('pp-hline'), hp=document.getElementById('pp-hprice'), hd=document.getElementById('pp-hdir');
      if (!hl) return;
      hl.style.display='block'; hl.style.top=yPx+'px'; hl.style.background=col;
      hp.textContent=price.toFixed(2); hp.style.color=col; hp.style.background=isGreen?'rgba(0,170,60,0.18)':'rgba(190,40,40,0.18)';
      hd.textContent=(isGreen?'▲ VERDE':'▼ ROJA')+' · '+z.label+' · F'+z.str; hd.style.color=col; hd.style.background=hp.style.background;

      if (typeof window.showPPProjection === 'function') {
        window.showPPProjection(isGreen ? 'G' : 'R', z.str, e.clientX, e.clientY);
      }
    };

    window.ppBarLeave = function() {
      ZONES.forEach(function(z,i) {
        var el=document.getElementById('ppz'+i);
        if (el) { el.style.background=z.gBg; if(el.firstElementChild) el.firstElementChild.style.color='rgba(0,210,80,0.75)'; }
      });
      if (typeof window.hidePPProjection === 'function') { window.hidePPProjection(); }
      var hl=document.getElementById('pp-hline'); if(hl) hl.style.display='none';
    };

    window.ppBarClick = function(e) {
      var bar=document.getElementById('pp-bar');
      if (!bar) return;
      if (ppRef === null) {
        document.getElementById('pp-result').innerHTML='<span style="color:#ff4444">Primero ingresa el precio base en el campo Ref</span>';
        document.getElementById('pp-ref-manual').focus();
        return;
      }
      var rect=bar.getBoundingClientRect();
      var price=Math.max(ppMin,Math.min(ppMax, ppMax-((e.clientY-rect.top)/rect.height)*(ppMax-ppMin)));
      // pct: distancia desde el centro (ppRef) como % del half-range (ppSpread)
      // ppMax-ppMin = 2*spread, pero la distancia máxima desde ref es 1*spread
      // Dividir por ppSpread (half-range) para mapear correctamente 0–100%
      var pct=Math.min((Math.abs(price-ppRef)/ppSpread)*100,100);
      var isGreen=price>=ppRef, z=getZone(pct), col=isGreen?'#00cc66':'#ff4444', arrow=isGreen?'▲':'▼';
      var res=document.getElementById('pp-result');
      res.style.cssText='margin-top:6px;padding:6px 10px;border-radius:6px;font-size:0.75em;font-weight:bold;border:1px solid '+col+'44;background:'+(isGreen?'rgba(0,190,70,0.1)':'rgba(200,50,50,0.1)')+';color:'+col+';';
      res.innerHTML=arrow+' <b>'+(isGreen?'VERDE':'ROJA')+'</b> &nbsp;·&nbsp; Cierre <b>'+price.toFixed(2)+'</b> &nbsp;·&nbsp; Recorrió <b>'+pct.toFixed(0)+'%</b> &nbsp;·&nbsp; <b>F'+z.str+' '+z.label+'</b>';
      ppRef=price;
      document.getElementById('pp-ref-manual').value=price.toFixed(2);
      document.getElementById('pp-ref-label').textContent='';
      centerRange(price);
      if (typeof quickAddCandle==='function') quickAddCandle(isGreen?'G':'R', z.str);
      if (typeof window.hidePPProjection === 'function') { window.hidePPProjection(); }
    };

    window.ppSetRef = function(val) {
      var price=parseFloat(val); if (isNaN(price)) return;
      centerRange(price);
      document.getElementById('pp-ref-label').textContent='✓';
      var res=document.getElementById('pp-result');
      res.style.cssText='margin-top:6px;padding:6px 10px;border-radius:6px;font-size:0.75em;font-weight:bold;border:1px solid #3366ff44;background:rgba(51,102,255,0.08);color:#4499ff;';
      res.innerHTML='Ref fijada en <b>'+price.toFixed(2)+'</b> · Spread ±'+ppSpread+' · Haz click donde cerró la vela';
    };

    window.ppUpdateSpread = function() {
      var v=parseFloat(document.getElementById('pp-spread').value);
      if (!isNaN(v)&&v>0) { ppSpread=v; if(ppRef!==null) centerRange(ppRef); }
    };

    window.ppRebuild = function() { if (ppRef!==null) centerRange(ppRef); };

    document.addEventListener('DOMContentLoaded', function() {
      var sp=document.getElementById('pp-spread');
      var rf=document.getElementById('pp-ref-manual');
      if (sp) sp.addEventListener('input', window.ppUpdateSpread);
      if (rf) {
        rf.addEventListener('change', function() { window.ppSetRef(this.value); });
        rf.addEventListener('keydown', function(e) { if(e.key==='Enter') window.ppSetRef(this.value); });
      }
    });
  })();
