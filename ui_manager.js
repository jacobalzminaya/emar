// ui_manager.js - VERSIÓN V8.7 FINAL (CORRECCIÓN DE CÓDIGOS Y SINCRONÍA)
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

    // SINCRONÍA TOTAL: Dibuja y ajusta el scroll al mismo tiempo
    updateVisualTrack(sequence) {
        const track = document.getElementById('live-sequence');
        if (!track || !Array.isArray(sequence)) return;

        // Limitar a las últimas 50 para rendimiento y visualización
        const content = sequence.slice(-50).map((v, index, arr) => {
            const esUltima = (index === arr.length - 1) ? 'ultima' : '';
            const tipoVela = (v.val === 'A') ? 'vela-compra' : 'vela-venta';
            return `<div class="vela ${tipoVela} ${esUltima}"></div>`;
        }).join('');

        track.innerHTML = `<div class="velas-container">${content}</div>`;
        
        // Sincronización del scroll: Forzar a la derecha inmediatamente
        requestAnimationFrame(() => {
            track.scrollLeft = track.scrollWidth;
        });

        const counter = document.getElementById('seq-length');
        if (counter) counter.innerText = `Longitud: ${sequence.length} velas`;
    },

    // CORRECCIÓN DEFINITIVA DE "CÓDIGOS" EN PORCENTAJES
    updateStrengthWidgets(data) {
        // Esta función limpia cualquier objeto y extrae solo el número
        const extraerNumero = (obj) => {
            if (typeof obj === 'number') return obj;
            if (typeof obj === 'string') return parseFloat(obj);
            if (typeof obj === 'object' && obj !== null) {
                // Busca propiedades comunes donde el core guarda el valor
                return obj.percent || obj.value || obj.val || 0;
            }
            return 0;
        };

        // Asumiendo que los IDs en tu index.html son fuerza-3, fuerza-4... hasta fuerza-20
        for (let i = 3; i <= 20; i++) {
            const el = document.getElementById(`fuerza-${i}`);
            if (el && data[i] !== undefined) {
                const num = extraerNumero(data[i]);
                // Si el número es decimal (ej: 0.85), multiplicar por 100
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
    }
};

window.UIManager = UIManager;