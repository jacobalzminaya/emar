// CMD Bridge Interceptor v3 — document_start MAIN world
// Solo despacha via CustomEvent — no procesa velas aqui

(function() {
  var _OrigWS = window.WebSocket;
  if (!_OrigWS) return;

  function CmdWS(url, protocols) {
    var ws = protocols ? new _OrigWS(url, protocols) : new _OrigWS(url);
    if (url && url.indexOf('po.market') >= 0) {
      ws.addEventListener('message', function(evt) {
        try {
          var raw = evt.data;
          if (raw instanceof Blob) {
            var fr = new FileReader();
            fr.onload = function() {
              document.dispatchEvent(new CustomEvent('cmd-ws-message',{detail:{data:fr.result}}));
            };
            fr.readAsText(raw);
            return;
          }
          if (raw instanceof ArrayBuffer) raw = new TextDecoder().decode(raw);
          document.dispatchEvent(new CustomEvent('cmd-ws-message',{detail:{data:String(raw)}}));
        } catch(e) {}
      });
    }
    return ws;
  }

  CmdWS.prototype  = _OrigWS.prototype;
  CmdWS.CONNECTING = _OrigWS.CONNECTING;
  CmdWS.OPEN       = _OrigWS.OPEN;
  CmdWS.CLOSING    = _OrigWS.CLOSING;
  CmdWS.CLOSED     = _OrigWS.CLOSED;
  window.WebSocket = CmdWS;
  console.log('[CMD Interceptor] listo');
})();
