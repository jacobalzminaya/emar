// ui_manager.js - VERSIÓN CORREGIDA Y COMPLETA PARA V8.1
const UIManager = {
    // Actualiza el balance de la cuenta
    updateWealthUI(equity) {
        const eq = document.getElementById('equity-value');
        if (eq) {
            eq.innerText = `$${equity.toFixed(2)}`;
            // Ajuste de colores según balance
            eq.style.color = equity >= 1000 ? "#00ffaa" : "#ffaa00";
        }
    },

    // Añade mensajes al monitor de estado y al panel de logs
    addLog(msg, color) {
        // 1. Actualizar el monitor pequeño del encabezado
        const logMonitor = document.getElementById('wealth-log');
        const d = new Date();
        const ts = d.getHours().toString().padStart(2,'0') + ":" + 
                   d.getMinutes().toString().padStart(2,'0') + ":" + 
                   d.getSeconds().toString().padStart(2,'0');

        if (logMonitor) {
            logMonitor.innerHTML = `<div style="color:${color}">${ts} -> ${msg}</div>`;
        }

        // 2. Actualizar el panel de historial (LOGS EN TIEMPO REAL)
        const logLines = document.getElementById('log-lines');
        if (logLines) {
            const newLine = document.createElement('div');
            newLine.style.color = color;
            newLine.innerHTML = `<small style="opacity:0.6">${ts}</small> | ${msg}`;
            logLines.prepend(newLine); // Añade el log más reciente arriba

            // Limitar para que no sature la memoria (máximo 50 líneas)
            if (logLines.children.length > 50) {
                logLines.removeChild(logLines.lastChild);
            }
        }
    },

    // Dibuja la secuencia de velas (ADN) en el panel central
    updateVisualTrack(sequence) {
        // CORRECCIÓN DE ID: En tu HTML usas 'live-sequence'
        const track = document.getElementById('live-sequence');
        if (!track) return;

        if (sequence && Array.isArray(sequence)) {
            // Generamos las velas usando las clases CSS de tu index.html
            const content = sequence.slice(-100).map((v, index, arr) => {
                // Si es la última vela, le añadimos la clase 'ultima' para el efecto de brillo
                const esUltima = (index === arr.length - 1) ? 'ultima' : '';
                const tipoVela = (v.val === 'A') ? 'vela-compra' : 'vela-venta';
                
                return `<div class="vela ${tipoVela} ${esUltima}"></div>`;
            }).join('');

            track.innerHTML = `<div class="velas-container">${content}</div>`;
            
            // Actualizar contador de longitud
            const counter = document.getElementById('seq-length');
            if (counter) counter.innerText = `Longitud actual: ${sequence.length} velas`;
        }
    },

    // Actualiza las advertencias de estiramiento o anomalías
    updateStretchUI(msg, color, animate = false) {
        const stretch = document.getElementById('stretch-warning');
        if (!stretch) return;
        
        if (animate) {
            stretch.innerHTML = `<span style="animation: pulse-warn 0.4s infinite; color: ${color}; font-weight: bold;">${msg}</span>`;
        } else {
            stretch.innerText = msg;
            stretch.style.color = color;
        }
    }
};

// Exponerlo globalmente para que market_bridge_core.js pueda verlo
window.UIManager = UIManager;