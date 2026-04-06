// ═══════════════════════════════════════════════════════════════
// CMD · AI ENGINE v1.0
// Aprende patrones de mercado en tiempo real
// Predice siguiente vela usando: secuencia + sentimiento + TP/SL
// ═══════════════════════════════════════════════════════════════

'use strict';

// ── Estado global ──────────────────────────────────────────────
var candles     = [];       // {color:'G'|'R', str:1-4, ts:Date}
var priceHistory= [];       // precios sintéticos acumulados
var aiMemory    = {};       // patrones aprendidos: "GGRG" → {G:n, R:n}
var sessionLog  = [];       // {pred, actual, conf, ts}

// ── Config ─────────────────────────────────────────────────────
var CFG = {
  patternLen : 4,    // cuántas velas mirar atrás
  minConf    : 52,   // confianza mínima para dar señal
  tpMult     : 1.8,  // TP = ATR × mult
  slMult     : 1.0,  // SL = ATR × mult
  memoryMax  : 2000, // máx patrones a recordar
  priceBase  : 1000, // precio sintético inicial
};

// ══════════════════════════════════════════════════════════════
// ENTRADA DE VELA — punto de entrada desde Bridge o manual
// ══════════════════════════════════════════════════════════════
function quickAddCandle(color, strength) {
  color    = (color||'G').toUpperCase();
  strength = parseFloat(strength) || 2;

  // 1. Si hay predicción pendiente — registrarla como resultado
  _resolveLastPrediction(color);

  // 2. Registrar vela
  var tick = { color:color, str:strength, ts:Date.now() };
  candles.push(tick);

  // 3. Actualizar precio sintético
  var last   = priceHistory.length ? priceHistory[priceHistory.length-1] : CFG.priceBase;
  var move   = (strength / 4) * 0.8 + Math.random() * 0.2; // 0.2 – 1.0%
  var newPx  = color==='G' ? last * (1 + move/100) : last * (1 - move/100);
  priceHistory.push(parseFloat(newPx.toFixed(4)));

  // 4. Aprender patrón actual
  _learnPattern();

  // 5. Predecir siguiente vela
  _predict();

  // 6. Renderizar
  render();
}
window.quickAddCandle = quickAddCandle;

// ══════════════════════════════════════════════════════════════
// APRENDIZAJE — registra qué siguió a este patrón
// ══════════════════════════════════════════════════════════════
function _learnPattern() {
  var n = candles.length;
  if (n < CFG.patternLen + 1) return;

  // El patrón son las N-1 velas anteriores a la última
  var seq = candles.slice(n - CFG.patternLen - 1, n - 1)
                   .map(function(c){ return c.color; }).join('');
  var outcome = candles[n-1].color;

  if (!aiMemory[seq]) aiMemory[seq] = {G:0, R:0, total:0};
  aiMemory[seq][outcome]++;
  aiMemory[seq].total++;

  // Limpiar memoria si crece demasiado
  var keys = Object.keys(aiMemory);
  if (keys.length > CFG.memoryMax) {
    // Eliminar el patrón menos visto
    var minKey = keys.reduce(function(a,b){
      return aiMemory[a].total < aiMemory[b].total ? a : b;
    });
    delete aiMemory[minKey];
  }
}

// ══════════════════════════════════════════════════════════════
// PREDICCIÓN — combina memoria + sentimiento + estructura
// ══════════════════════════════════════════════════════════════
var _lastPred = null; // {dir, conf, ts}

function _predict() {
  var n = candles.length;
  if (n < CFG.patternLen) {
    window._pred = null;
    return;
  }

  var scores = {G:0, R:0};
  var weight  = 0;

  // ── FACTOR 1: Memoria de patrones (peso 45%) ──────────────
  var seq = candles.slice(-CFG.patternLen).map(function(c){ return c.color; }).join('');
  var mem = aiMemory[seq];
  if (mem && mem.total >= 3) {
    var pG = mem.G / mem.total;
    var pR = mem.R / mem.total;
    var w  = Math.min(1, mem.total / 20); // más peso con más muestras
    scores.G += pG * 45 * w;
    scores.R += pR * 45 * w;
    weight   += 45 * w;
  }

  // Sub-patrones de longitud 3 y 2 con menor peso
  for (var pl = CFG.patternLen - 1; pl >= 2; pl--) {
    var subSeq = candles.slice(-pl).map(function(c){ return c.color; }).join('');
    var subMem = aiMemory[subSeq];
    if (subMem && subMem.total >= 2) {
      var subW = (pl / CFG.patternLen) * 15;
      scores.G += (subMem.G / subMem.total) * subW;
      scores.R += (subMem.R / subMem.total) * subW;
      weight   += subW;
    }
  }

  // ── FACTOR 2: Sentimiento momentum (peso 35%) ─────────────
  var sent = _calcSentiment();
  window._sentiment = sent;
  if (sent.dir === 'G') { scores.G += sent.strength * 35; scores.R += (1 - sent.strength) * 35; }
  else                  { scores.R += sent.strength * 35; scores.G += (1 - sent.strength) * 35; }
  weight += 35;

  // ── FACTOR 3: Estructura TP/SL (peso 20%) ─────────────────
  var tpsl = _calcTPSL();
  window._tpsl = tpsl;
  if (tpsl && tpsl.bias) {
    var tpslW = Math.min(20, tpsl.rrRatio * 10);
    if (tpsl.bias === 'G') { scores.G += tpslW; }
    else                   { scores.R += tpslW; }
    weight += tpslW;
  }

  // ── Normalizar ────────────────────────────────────────────
  var total = scores.G + scores.R || 1;
  var probG = scores.G / total;
  var probR = scores.R / total;
  var dir   = probG >= probR ? 'G' : 'R';
  var conf  = Math.round(Math.max(probG, probR) * 100);

  // Ajuste: menos confianza si memoria escasa
  if (weight < 20) conf = Math.min(conf, 58);

  _lastPred = { dir:dir, conf:conf, probG:Math.round(probG*100), probR:Math.round(probR*100), ts:Date.now() };
  window._pred = _lastPred;
}

function _resolveLastPrediction(actualColor) {
  if (!_lastPred) return;
  var hit = (_lastPred.dir === actualColor);
  sessionLog.push({
    pred   : _lastPred.dir,
    actual : actualColor,
    conf   : _lastPred.conf,
    hit    : hit,
    ts     : _lastPred.ts,
  });
  // Cap log a 500 entradas
  if (sessionLog.length > 500) sessionLog.shift();
  _lastPred = null;
}

// ══════════════════════════════════════════════════════════════
// SENTIMIENTO — momentum ponderado por fuerza de vela
// ══════════════════════════════════════════════════════════════
function _calcSentiment() {
  var n   = candles.length;
  var win = Math.min(n, 10);
  if (win === 0) return { dir:'G', strength:0.5, score:0 };

  var recent = candles.slice(-win);
  var bullPts = 0, bearPts = 0;
  recent.forEach(function(c, i) {
    var age = (win - i) / win; // más reciente = más peso
    var pts = c.str * age;
    if (c.color === 'G') bullPts += pts;
    else                 bearPts += pts;
  });

  var total    = bullPts + bearPts || 1;
  var bullFrac = bullPts / total;
  var bearFrac = bearPts / total;
  var dir      = bullFrac >= bearFrac ? 'G' : 'R';
  var strength = Math.max(bullFrac, bearFrac); // 0.5 – 1.0

  // Score -100 a +100
  var score = Math.round((bullFrac - bearFrac) * 100);

  return { dir:dir, strength:strength, score:score, bull:Math.round(bullFrac*100), bear:Math.round(bearFrac*100) };
}

// ══════════════════════════════════════════════════════════════
// TP / SL — basado en ATR sintético + estructura de precio
// ══════════════════════════════════════════════════════════════
function _calcTPSL() {
  var px = priceHistory;
  if (px.length < 5) return null;

  // ATR: promedio de rangos últimas N velas
  var atrWin = Math.min(14, candles.length);
  var atrSum = 0;
  for (var i = candles.length - atrWin; i < candles.length; i++) {
    if (i < 0) continue;
    var c   = candles[i];
    var pnow= px[i] || px[px.length-1];
    var pprev = i > 0 ? px[i-1] : pnow;
    atrSum  += Math.abs(pnow - pprev);
  }
  var atr = atrSum / atrWin;
  if (atr === 0) atr = px[px.length-1] * 0.001;

  var curPx  = px[px.length-1];
  var tp     = parseFloat((atr * CFG.tpMult).toFixed(5));
  var sl     = parseFloat((atr * CFG.slMult).toFixed(5));
  var rr     = parseFloat((tp / sl).toFixed(2));

  // Bias: si sentimiento alcista → bias buy, bajista → bias sell
  var sent = window._sentiment;
  var bias = sent ? sent.dir : null;

  return {
    tp      : tp,
    sl      : sl,
    rrRatio : rr,
    bias    : bias,
    curPx   : curPx,
    tpPx    : bias==='G' ? curPx + tp : curPx - tp,
    slPx    : bias==='G' ? curPx - sl : curPx + sl,
  };
}

// ══════════════════════════════════════════════════════════════
// ACCURACY — estadísticas de la sesión
// ══════════════════════════════════════════════════════════════
function _calcAccuracy() {
  if (!sessionLog.length) return null;
  var hits   = sessionLog.filter(function(e){ return e.hit; }).length;
  var total  = sessionLog.length;
  var pct    = Math.round(hits / total * 100);
  // Alta confianza accuracy
  var hiConf = sessionLog.filter(function(e){ return e.conf >= 65; });
  var hiHits = hiConf.filter(function(e){ return e.hit; }).length;
  var hiPct  = hiConf.length ? Math.round(hiHits/hiConf.length*100) : null;
  // Racha actual
  var streak = 0, lastHit = sessionLog[sessionLog.length-1] ? sessionLog[sessionLog.length-1].hit : false;
  for (var i = sessionLog.length-1; i >= 0; i--) {
    if (sessionLog[i].hit === lastHit) streak++;
    else break;
  }
  return { hits:hits, total:total, pct:pct, hiPct:hiPct, streak:streak, lastHit:lastHit };
}

// ══════════════════════════════════════════════════════════════
// RESET
// ══════════════════════════════════════════════════════════════
function resetAll() {
  if (!confirm('¿Borrar todo el historial y aprendizaje?')) return;
  candles      = [];
  priceHistory = [];
  aiMemory     = {};
  sessionLog   = [];
  _lastPred    = null;
  window._pred = null;
  window._sentiment = null;
  window._tpsl = null;
  render();
}
window.resetAll = resetAll;

function resetCandlesOnly() {
  candles      = [];
  priceHistory = [];
  _lastPred    = null;
  window._pred = null;
  window._sentiment = null;
  window._tpsl = null;
  render();
}
window.resetCandlesOnly = resetCandlesOnly;

// ══════════════════════════════════════════════════════════════
// RENDER — actualiza la UI
// ══════════════════════════════════════════════════════════════
function render() {
  _renderSignal();
  _renderSentiment();
  _renderTPSL();
  _renderHistory();
  _renderAccuracy();
  _renderMemory();
}
window.render = render;

function $(id){ return document.getElementById(id); }

function _renderSignal() {
  var pred = window._pred;
  var n    = candles.length;
  var card = $('signal-card');
  if (!card) return;

  if (n < CFG.patternLen) {
    card.className = 'signal-card wait';
    _setText('sig-action', '⏸ ESPERAR');
    _setText('sig-reason', (CFG.patternLen - n) + ' velas más para aprender');
    _setText('sig-conf',   '–');
    _setText('sig-bar-g',  '50');
    _setText('sig-bar-r',  '50');
    _setWidth('sig-fill-g', 50);
    _setWidth('sig-fill-r', 50);
    return;
  }

  if (!pred) return;

  var isBuy  = pred.dir === 'G';
  var isSig  = pred.conf >= CFG.minConf;

  if (!isSig) {
    card.className = 'signal-card wait';
    _setText('sig-action', '⏸ ESPERAR');
    _setText('sig-reason', 'Sin ventaja clara — conf ' + pred.conf + '%');
    _setText('sig-conf',   pred.conf + '%');
  } else if (isBuy) {
    card.className = 'signal-card buy';
    _setText('sig-action', '▲ COMPRAR');
    _setText('sig-reason', _buildReason(pred));
    _setText('sig-conf',   pred.conf + '%');
  } else {
    card.className = 'signal-card sell';
    _setText('sig-action', '▼ VENDER');
    _setText('sig-reason', _buildReason(pred));
    _setText('sig-conf',   pred.conf + '%');
  }

  _setWidth('sig-fill-g', pred.probG);
  _setWidth('sig-fill-r', pred.probR);
  _setText('sig-bar-g',   pred.probG);
  _setText('sig-bar-r',   pred.probR);
}

function _buildReason(pred) {
  var parts = [];
  var sent  = window._sentiment;
  if (sent) {
    var dir = sent.dir === 'G' ? 'alcista' : 'bajista';
    parts.push('Sentimiento ' + dir + ' ' + sent.bull + '/' + sent.bear);
  }
  var seq = candles.slice(-CFG.patternLen).map(function(c){ return c.color; }).join('');
  var mem = aiMemory[seq];
  if (mem && mem.total >= 3) parts.push('Patrón visto ' + mem.total + 'x');
  return parts.join(' · ') || 'IA prediciendo…';
}

function _renderSentiment() {
  var sent = window._sentiment;
  if (!sent) return;
  var bar  = $('sent-bar');
  var fill = $('sent-fill');
  var lbl  = $('sent-lbl');
  var scr  = $('sent-score');
  if (!bar) return;

  var bull = sent.bull, bear = sent.bear;
  if (fill) fill.style.width = bull + '%';
  if (lbl)  lbl.textContent  = sent.dir === 'G' ? '▲ ' + bull + '% alcista' : '▼ ' + bear + '% bajista';
  if (scr)  scr.textContent  = (sent.score > 0 ? '+' : '') + sent.score;
  if (bar) bar.className = 'sent-row ' + (sent.dir === 'G' ? 'bull' : 'bear');
}

function _renderTPSL() {
  var t    = window._tpsl;
  var box  = $('tpsl-box');
  if (!box) return;
  if (!t)  { box.className = 'tpsl-box'; return; }

  box.className = 'tpsl-box active ' + (t.bias === 'G' ? 'buy' : 'sell');

  var maxDist = Math.max(t.tp, t.sl) || 1;
  _setWidth('tp-bar', Math.round(t.tp / maxDist * 100));
  _setWidth('sl-bar', Math.round(t.sl / maxDist * 100));
  _setText('tp-val',  '+' + (t.tp * 10000).toFixed(1) + 'p');
  _setText('sl-val',  '-' + (t.sl * 10000).toFixed(1) + 'p');
  var rr = $('tpsl-rr');
  if (rr) {
    rr.textContent = 'RR 1:' + t.rrRatio + (t.rrRatio >= 1.5 ? ' ✓' : t.rrRatio >= 1.0 ? ' ~' : ' ⚠');
    rr.style.color = t.rrRatio >= 1.5 ? 'var(--green)' : t.rrRatio >= 1 ? 'var(--gold)' : 'var(--red)';
  }
}

function _renderHistory() {
  var strip = $('candle-strip');
  var cnt   = $('candle-count');
  if (!strip) return;
  if (cnt) cnt.textContent = candles.length;
  var show = candles.slice(-80);
  strip.innerHTML = show.map(function(c, i) {
    var isLast = i === show.length - 1;
    return '<div class="cv ' + c.color.toLowerCase() + (isLast?' last':'') + '" data-s="' + c.str + '"></div>';
  }).join('');
}

function _renderAccuracy() {
  var acc = _calcAccuracy();
  var box = $('acc-box');
  if (!box) return;
  if (!acc) { box.innerHTML = '<span class="acc-empty">Sin datos aún</span>'; return; }

  var color = acc.pct >= 65 ? 'var(--green)' : acc.pct >= 55 ? 'var(--gold)' : 'var(--red)';
  var streak = (acc.lastHit ? '🔥' : '❄') + ' ' + acc.streak;
  box.innerHTML =
    '<div class="acc-main" style="color:' + color + '">' + acc.pct + '%</div>' +
    '<div class="acc-sub">' + acc.hits + '/' + acc.total + ' · ' + streak + '</div>' +
    (acc.hiPct !== null ? '<div class="acc-hi">Alta conf: ' + acc.hiPct + '%</div>' : '');
}

function _renderMemory() {
  var cnt = $('mem-count');
  if (cnt) cnt.textContent = Object.keys(aiMemory).length + ' patrones';
}

// ── Helpers ────────────────────────────────────────────────────
function _setText(id, txt) { var el=$(id); if(el) el.textContent=txt; }
function _setWidth(id, pct){ var el=$(id); if(el) el.style.width=Math.max(0,Math.min(100,pct))+'%'; }

// ══════════════════════════════════════════════════════════════
// BRIDGE POLLING — localStorage (fallback de background.js)
// ══════════════════════════════════════════════════════════════
var _extLastTs = 0;
var _autoMode  = false;

window.toggleAutoMode = function() {
  _autoMode = !_autoMode;
  var btn = $('auto-btn');
  if (btn) {
    btn.textContent = _autoMode ? '🟢 AUTO' : '⚫ AUTO';
    btn.className   = _autoMode ? 'ctrl-btn on' : 'ctrl-btn';
  }
  var dot = $('bridge-dot');
  if (dot && !_autoMode) { dot.className = ''; $('bridge-label').textContent = 'OFFLINE'; }
};

setInterval(function() {
  if (!_autoMode) return;
  try {
    var ts = parseInt(localStorage.getItem('cmd-ext-candle-ts') || '0');
    if (ts <= _extLastTs) return;
    _extLastTs = ts;
    var raw  = localStorage.getItem('cmd-ext-candle');
    if (!raw) return;
    var data = JSON.parse(raw);
    if (!data.color) return;
    if (Date.now() - data.timestamp > 8000) return;
    quickAddCandle(data.color, data.strength || 2);
    // Update bridge status
    var dot = $('bridge-dot');
    var lbl = $('bridge-label');
    if (dot) dot.className = 'on';
    if (lbl) lbl.textContent = 'LIVE';
  } catch(e) {}
}, 500);

// Bridge status checker
setInterval(function() {
  if (!_autoMode) return;
  try {
    var ts  = parseInt(localStorage.getItem('cmd-ext-candle-ts') || '0');
    var age = ts ? (Date.now() - ts) : Infinity;
    var dot = $('bridge-dot');
    var lbl = $('bridge-label');
    if (!dot) return;
    if (age < 15000)     { dot.className='on';   if(lbl) lbl.textContent='LIVE'; }
    else if (age < 60000){ dot.className='warn';  if(lbl) lbl.textContent=Math.round(age/1000)+'s'; }
    else                 { dot.className='';       if(lbl) lbl.textContent='OFFLINE'; }
  } catch(e) {}
}, 3000);

console.log('[CMD·AI] Engine v1.0 listo');
