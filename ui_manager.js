// ui_manager.js - VERSIÓN V8.7 FINAL + updateStretchUI MEJORADO (MÁS VISIBLE Y PROFESIONAL)
const UIManager = {
    updateWealthUI(equity) {
        const eq = document.getElementById('equity-value');
        if (eq) {
            eq.innerText = `$${parseFloat(equity).toFixed(2)}`;
            eq.style.color = equity >= 1000 ? "#00ffaa" : "#ffaa00";
        }
    },

    addLog(msg, color) {
        const logMonitor = document.getElementById('wealth-log');
        const d = new Date();
        const ts = d.toLocaleTimeString();

        if (logMonitor) {
            logMonitor.innerHTML = `<div style="color:${color}">${ts} -> ${msg}</div>`;
        }

        const logLines = document.getElementById('log-lines');
        if (logLines) {
            const newLine = document.createElement('div');
            newLine.style.color = color;
            newLine.innerHTML = `<small style="opacity:0.6">${ts}</small> | ${msg}`;
            logLines.prepend(newLine);
            if (logLines.children.length > 50) logLines.removeChild(logLines.lastChild);
        }
    },

    updateVisualTrack(sequence) {
        const track = document.getElementById('live-sequence');
        if (!track || !Array.isArray(sequence)) return;

        const content = sequence.slice(-50).map((v, index, arr) => {
            const esUltima = (index === arr.length - 1) ? 'ultima' : '';
            const tipoVela = (v.val === 'A') ? 'vela-compra' : 'vela-venta';
            return `<div class="vela ${tipoVela} ${esUltima}"></div>`;
        }).join('');

        track.innerHTML = `<div class="velas-container">${content}</div>`;
        
        requestAnimationFrame(() => {
            track.scrollLeft = track.scrollWidth;
        });

        const counter = document.getElementById('seq-length');
        if (counter) counter.innerText = `Longitud: ${sequence.length} velas`;
    },

    updateStrengthWidgets(data) {
        const extraerNumero = (obj) => {
            if (typeof obj === 'number') return obj;
            if (typeof obj === 'string') return parseFloat(obj);
            if (typeof obj === 'object' && obj !== null) {
                return obj.percent || obj.value || obj.val || 0;
            }
            return 0;
        };

        for (let i = 3; i <= 20; i++) {
            const el = document.getElementById(`fuerza-${i}`);
            if (el && data[i] !== undefined) {
                const num = extraerNumero(data[i]);
                const finalVal = num < 2 ? num * 100 : num;
                
                el.innerText = `${finalVal.toFixed(1)}%`;
                el.style.color = finalVal > 50 ? "#00ffaa" : "#ff4d82";
            }
        }
    },

    addSignalToTable(signal) {
        const tbody = document.getElementById('signals-tbody');
        if (!tbody) return;

        const tr = document.createElement('tr');
        const dir = (typeof signal.direccion === 'object') ? (signal.direccion.val || '---') : signal.direccion;
        const colorDir = (dir === 'CALL' || dir === 'COMPRA') ? '#00ffaa' : '#ff4d82';

        tr.innerHTML = `
            <td style="opacity:0.5">${new Date().toLocaleTimeString()}</td>
            <td style="color:${colorDir}; font-weight:bold;">${dir}</td>
            <td>${signal.base?.name || signal.base || '---'}</td>
            <td><span class="badge" style="background:rgba(0,212,255,0.1)">${signal.inercia?.label || signal.inercia || '---'}</span></td>
            <td style="color:#00ffaa">${parseFloat(signal.fuerza || 0).toFixed(1)}%</td>
        `;

        tbody.prepend(tr);
        if (tbody.children.length > 10) tbody.removeChild(tbody.lastChild);
    },

    // ────────────────────────────────────────────────────────────────
    // updateStretchUI MEJORADO: más visible, profesional y diferenciado
    // ────────────────────────────────────────────────────────────────
    updateStretchUI(warningText = "", color = "#ffaa00") {
        const stretchEl = document.getElementById('stretch-warning');
        if (!stretchEl) return;

        // Limpiar estilos previos
        stretchEl.innerText = warningText.trim();
        stretchEl.style.color = color;
        stretchEl.style.background = "transparent";
        stretchEl.style.padding = "6px 12px";
        stretchEl.style.borderRadius = "6px";
        stretchEl.style.border = "none";
        stretchEl.style.transition = "all 0.3s ease";

        // Reset pulse y tamaño
        stretchEl.classList.remove('pulse-warning');
        stretchEl.style.fontSize = "14px";
        stretchEl.style.fontWeight = "500";
        stretchEl.style.letterSpacing = "0.5px";

        // ── Estilos según tipo de mensaje ──
        if (warningText.trim() === "") {
            stretchEl.style.opacity = "0.6";
            return;
        }

        stretchEl.style.opacity = "1";
        stretchEl.style.fontWeight = "bold";

        // Proyección FUERTE (nivel alto)
        if (warningText.includes("FUERTE") || warningText.includes("TECHO DETECTADO")) {
            stretchEl.style.fontSize = "17px";
            stretchEl.style.letterSpacing = "1px";
            stretchEl.style.background = color === "#00ffaa" 
                ? "rgba(0, 255, 170, 0.12)" 
                : "rgba(255, 77, 130, 0.15)";
            stretchEl.style.boxShadow = "0 0 15px " + color + "40";
            stretchEl.classList.add('pulse-warning');
        }
        // Proyección MODERADA o advertencia
        else if (warningText.includes("MODERADA") || warningText.includes("Racha extendida")) {
            stretchEl.style.fontSize = "15px";
            stretchEl.style.background = "rgba(255, 180, 0, 0.10)";
            stretchEl.classList.add('pulse-warning');
        }
        // Mensajes de alerta/trampa/pausa (rojo/naranja)
        else if (warningText.includes("TRAMPA") || warningText.includes("RECUPERACIÓN") || 
                 warningText.includes("PAUSA") || warningText.includes("VOLATILIDAD")) {
            stretchEl.style.fontSize = "15px";
            stretchEl.style.background = color === "#ff4d82" 
                ? "rgba(255, 77, 130, 0.18)" 
                : "rgba(255, 170, 0, 0.12)";
            stretchEl.style.boxShadow = "0 0 12px " + color + "60";
            stretchEl.classList.add('pulse-warning');
        }
        // Proyección normal o mensaje genérico
        else {
            stretchEl.style.fontSize = "14px";
            stretchEl.style.background = "rgba(0, 212, 255, 0.08)";
        }
    },

    // Función agregada para las estadísticas (para que updateStatsUI funcione correctamente)
    updateStatsUI(acc = 0, total = 0, wins = 0, losses = 0) {
        const accEl   = document.getElementById('global-acc');
        const totalEl = document.getElementById('total-trades');
        const winsEl  = document.getElementById('wins');
        const lossesEl = document.getElementById('losses');

        if (accEl)   accEl.innerText   = acc.toFixed(1) + '%';
        if (totalEl) totalEl.innerText = total;
        if (winsEl)  winsEl.innerText  = wins;
        if (lossesEl) lossesEl.innerText = losses;

        // Color dinámico para el acierto
        if (accEl) {
            accEl.style.color = acc >= 70 ? '#00ffaa' : (acc >= 50 ? '#ffb400' : '#ff4d82');
        }
    }
};

window.UIManager = UIManager;