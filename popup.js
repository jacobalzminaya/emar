// CMD Bridge popup.js v1.5
var enabled  = false;
var count    = 0;
var tf       = 60; // timeframe en segundos

function updateUI() {
  var dot   = document.getElementById('dot');
  var txt   = document.getElementById('status-txt');
  var btn   = document.getElementById('btn-toggle');
  var badge = document.getElementById('count-badge');
  if (dot)   dot.className   = 'status-dot'+(enabled?' on':'');
  if (txt)   { txt.className = 'status-txt'+(enabled?' on':'');
               txt.textContent = enabled?'Bridge activo':'Inactivo'; }
  if (btn)   { btn.className = 'btn-main '+(enabled?'btn-disable':'btn-enable');
               btn.textContent = enabled?'⏹ Desactivar':'▶ Activar Bridge'; }
  if (badge) { badge.className = 'count-badge'+(count>0?' active':'');
               badge.textContent = count+(count===1?' vela':' velas'); }
}

function sendToTab(msg, cb) {
  chrome.tabs.query({ active:true, currentWindow:true }, function(tabs) {
    if (!tabs[0]) return;
    chrome.tabs.sendMessage(tabs[0].id, msg, function(resp) {
      if (chrome.runtime.lastError) return;
      if (cb) cb(resp);
    });
  });
}

document.addEventListener('DOMContentLoaded', function() {

  // Timeframe buttons
  document.querySelectorAll('.tf-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      tf = parseInt(this.dataset.tf);
      document.querySelectorAll('.tf-btn').forEach(function(b){ b.classList.remove('active'); });
      this.classList.add('active');
      // Enviar nuevo timeframe al content script
      sendToTab({ type:'setTf', tf:tf });
      chrome.storage.local.set({ tf: tf });
    });
  });

  // Toggle button
  document.getElementById('btn-toggle').addEventListener('click', function() {
    enabled = !enabled;
    updateUI();
    sendToTab({ type:enabled?'enable':'disable', tf:tf }, function(resp) {
      if (resp && resp.asset) {
        var el = document.getElementById('asset-name');
        if (el) el.textContent = resp.asset || 'no detectado';
      }
    });
  });

  // Load saved tf
  chrome.storage.local.get(['tf'], function(res) {
    if (res.tf) {
      tf = res.tf;
      document.querySelectorAll('.tf-btn').forEach(function(b){ b.classList.remove('active'); });
      var el = document.getElementById('tf-'+tf);
      if (el) el.classList.add('active');
    }
  });

  // Check status
  chrome.tabs.query({ active:true, currentWindow:true }, function(tabs) {
    if (!tabs[0]) return;
    chrome.tabs.sendMessage(tabs[0].id, { type:'status' }, function(resp) {
      if (chrome.runtime.lastError) return;
      if (resp) {
        enabled = resp.enabled||false;
        count   = resp.count||0;
        if (resp.asset) {
          var el = document.getElementById('asset-name');
          if (el) el.textContent = resp.asset;
        }
        updateUI();
      }
    });
  });

  updateUI();
});
