/**
 * MARKET BRIDGE CORE - V8.1 ULTIMATE UNIFIED + LSTM MEJORADO (2026)
 * Fusión completa de todas las fases con LSTM más predictivo
 * + Detector de trampas integrado
 * + Reentrenamiento automático por cambio de semilla
 * + Integración completa con UI visible (paneles, gráfico, logs en pantalla)
 * + Contadores globales para estadísticas en tiempo real
 * + Quant Hedge Fund Module (toggleable) v5.0
 * No se eliminó ni resumió NADA – versión completa y actualizada
 */

const MarketBridge = {
    predictions: {}, 
    stats: {},
    lastLeaderV: null,
    isLocked: false,
    equity: 1000.00,
    minBet: 10,
    currentStake: 10,
    martingaleLevel: 0,
    payout: 0.85,
    isManualReversal: false,
    
    // PROPIEDADES DE CONTROL Y MÉTRICAS
    consecutiveFails: {},           
    currentStreak: { val: null, count: 0 }, 
    currentPrice: 100.0,            
    priceHistory: [],               
    model: null,                    
    trapModel: null,
    ssid: '',  
    lastTrainCount: 0,              
    socket: null,
    isPOConnected: false,
    manualDisconnect: false,  

    // Configuración del modelo LSTM avanzado
    windowSize: 30,
    lstmUnits1: 64,
    lstmUnits2: 32,
    dropoutRate: 0.3,
    learningRate: 0.0005,
    minEpochs: 50,
    maxEpochs: 150,
    patienceEarlyStop: 10,

    // Contadores para UI visible
    trapsAvoided: 0,
    totalTrades: 0,
    wins: 0,
    losses: 0,

    // Nuevos contadores para ajuste dinámico del umbral de trampa
    trapInversionsTotal: 0,
    trapInversionsSuccess: 0,
    dynamicTrapThreshold: 0.65,

    // Nuevos para sensibilidad temporal
    trapHourlyCounts: Array(24).fill(0),
    isTrapMechanismEnabled: true,
    isPaused: false,

    // Nueva lógica anti-manipulación
    isInTrapRecovery: false, // Flag para modo recuperación post-trampa

    // ────────────────────────────────────────────────
    // QUANT HEDGE FUND LAYER (toggleable)
    // ────────────────────────────────────────────────
    isHedgeFundEnabled: false,
    quantHF: {
        assets: ["EURUSD", "BTCUSD", "XAUUSD"],
        portfolio: {},
        riskBudget: 0.02,
        rlTrader: null,
        volatilityHistory: [],
        lastRegime: "STABLE",
        lastRLAction: "HOLD",
    },

    toggleReversal() {
        this.isManualReversal = !this.isManualReversal;
        try {
            const status = document.getElementById('rev-status');
            const btn = document.getElementById('toggle-reversal');
            
            if (status) {
                status.innerText = this.isManualReversal ? 'ON (AUTO)' : 'OFF (MANUAL)';
                
                if (btn) {
                    btn.style.background = this.isManualReversal ? "rgba(255, 0, 255, 0.2)" : "transparent";
                    btn.style.borderColor = this.isManualReversal ? "#ff00ff" : "rgba(120,120,180,0.3)";
                }
            }
        } catch (e) {}
        
        const msg = this.isManualReversal ? 'Modo Reversión: ACTIVADO (Predeterminado)' : 'Modo Reversión: DESACTIVADO (Control Manual)';
        if (typeof UIManager !== 'undefined') {
            UIManager.addLog(msg, this.isManualReversal ? "#ff00ff" : "#ffffff");
        }
    },

    init() {
        window.sequence = window.sequence || [];
        window.traps = window.traps || [];
        for(let i=3; i<=20; i++) {
            this.stats[i] = { hits: 0, total: 0, timeline: [] }; 
            this.consecutiveFails[i] = 0;
        }
        this.priceHistory.push(this.currentPrice);
        this.setupInput();
        
        if(typeof UIManager !== 'undefined') UIManager.updateWealthUI(this.equity);

        if (window.sequence.length >= 30) this.trainModel();

        this.setupToggleButton();
        
        this.quantHF.rlTrader = new RLTrader();
        this.setupHedgeFundToggle();

        if (this.priceHistory.length > 20) {
            this.updateVolatilityHistory();
        }
    },

    setupInput() {
        document.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'BUTTON' || e.target.closest('button')) return;

            let side = null;
            if (e.button === 0) {
                console.log('[MOUSE] Fondo → BUY (A)');
                side = 'A';
            } else if (e.button === 2) {
                console.log('[MOUSE] Fondo → SELL (B)');
                side = 'B';
            }

            if (side) {
                e.preventDefault();
                this.injectManual(side);
            }
        });

        try {
            const btnBuy = document.getElementById('btn-buy');
            const btnSell = document.getElementById('btn-sell');

            if (btnBuy) {
                btnBuy.addEventListener('click', (e) => {
                    e.preventDefault();
                    console.log('[BOTÓN] Click en BUY → Enviando ADN A');
                    this.injectManual('A');
                });
            }

            if (btnSell) {
                btnSell.addEventListener('click', (e) => {
                    e.preventDefault();
                    console.log('[BOTÓN] Click en SELL → Enviando ADN B');
                    this.injectManual('B');
                });
            }
        } catch (e) {}

        document.addEventListener('contextmenu', e => e.preventDefault());
    },

    injectManual(type) {
        let finalType = type; 
        if (this.isManualReversal) {
            finalType = (type === 'A') ? 'B' : 'A';
            console.log(`🔄 [AUTO-REVERSIÓN ACTIVADA] Entrada: ${type} -> Procesado como: ${finalType}`);
        } else {
            console.log(`🎮 [CONTROL MANUAL] Procesando entrada original: ${type}`);
        }

        console.log(`[DATA-IN] Dirección: ${finalType === 'A' ? 'BUY' : 'SELL'}`);

        if (!window.sequence) window.sequence = [];
        window.sequence.push({ val: finalType, time: Date.now() });
        if (window.sequence.length > 400) window.sequence.shift();

        const priceChange = (finalType === 'A' ? 0.5 : -0.5) + (Math.random() * 0.2 - 0.1);
        this.currentPrice += priceChange;
        this.priceHistory.push(this.currentPrice);

        if (this.currentStreak.val === finalType) {
            this.currentStreak.count++;
        } else {
            this.currentStreak.val = finalType;
            this.currentStreak.count = 1;
        }

        if (typeof updateLiveSequence === 'function') updateLiveSequence();
        
        if (typeof UIManager !== 'undefined') {
            UIManager.updateVisualTrack(window.sequence);
        }

        let predictedMl = ""; 
        try {
            predictedMl = String(this.predictNext() || "");
        } catch(e) {
            predictedMl = "";
        }
        const wasInverted = predictedMl.includes('(anti-trampa)');

        if (this.isPaused || (this.calculateVolatility() >= 12)) {
            if (typeof UIManager !== 'undefined') {
                UIManager.addLog("MODO MONITOR: Dato registrado, Sistema en pausa", "#ff2e63");
            }
            this.runMultiAnalysis();
            this.updateMainSignal();
            return;
        }

        let isTrapDetected = false;
        let trapProb = 0;
        if (this.trapModel && this.isTrapMechanismEnabled) {
            const seq = window.sequence.slice(-this.windowSize).map(v => v.val === 'A' ? 1 : 0);
            const trapInput = tf.tensor3d([seq], [1, this.windowSize, 1]);
            trapProb = this.trapModel.predict(trapInput).dataSync()[0];
            trapInput.dispose();
            if (trapProb > this.dynamicTrapThreshold) {
                isTrapDetected = true;
            }
        }

        const history = window.sequence.map(v => v.val).join('');
        let adnTrap = false;
        for (let v = 3; v <= 20; v++) {
            if (window.sequence.length < v) continue;
            const pattern = history.slice(-v);
            const searchPool = history.slice(0, -1);
            const occurrences = (searchPool.match(new RegExp(pattern, 'g')) || []).length;
            if (occurrences < 2 && this.stats[v].total > 10 && this.consecutiveFails[v] > 1) {
                adnTrap = true;
                break;
            }
        }

        if (isTrapDetected || adnTrap) {
            this.isInTrapRecovery = true;
            this.addVisibleLog(`TRAMPA DETECTADA (${(trapProb*100).toFixed(0)}%) - OPERACIÓN BLOQUEADA`, "#ff2e63");
            this.trapsAvoided++;
            try {
                const header = document.getElementById('header-signal');
                if (header) header.classList.add('pulse-warning');
            } catch (e) {}
            this.runMultiAnalysis();
            this.updateMainSignal();
            this.updateTrapUI();
            this.updateStatsUI();
            return;
        }

        if (this.isInTrapRecovery) {
            const globalAgreement = this.checkGlobalAgreement();
            if (!globalAgreement) {
                this.addVisibleLog("EN RECUPERACIÓN POST-TRAMPA - ESPERANDO CONFIRMACIÓN", "#ffb400");
                this.runMultiAnalysis();
                this.updateMainSignal();
                return;
            } else {
                this.isInTrapRecovery = false;
                this.addVisibleLog("RECUPERACIÓN COMPLETA - SEÑALES REACTIVADAS", "#00ff88");
                try {
                    const header = document.getElementById('header-signal');
                    if (header) header.classList.remove('pulse-warning');
                } catch (e) {}
            }
        }

        this.processWealth(finalType);
        this.verifyAccuracy(finalType, predictedMl, wasInverted);
        this.runMultiAnalysis();
        
        if (typeof UIManager !== 'undefined') {
            UIManager.updateWealthUI(this.equity); 
        }

        if (this.calculateVolatility() >= 8 && !this.isLocked) {
            this.activateSecurityLock();
        }

        this.checkExtremeLimits();
        this.findGeneticMatch();
        this.updateMainSignal();

        if (window.sequence.length - this.lastTrainCount >= 50 && window.sequence.length >= 30) {
            this.trainModel();
            this.lastTrainCount = window.sequence.length;
        }

        this.updateTrapUI();
        this.updateStatsUI();
        if (typeof this.checkTemporalAnomaly === 'function') this.checkTemporalAnomaly();
        if (typeof this.updateVolatilityHistory === 'function') this.updateVolatilityHistory();
        // ────────────────────────────────────────────────
        // PROYECCIÓN DE CONTINUACIÓN DE RACHA (agregado correctamente)
        // ────────────────────────────────────────────────
        if (typeof this.projectStreakContinuation === 'function') {
            const proj = this.projectStreakContinuation();
            if (proj && proj.text && typeof UIManager !== 'undefined' && typeof UIManager.updateStretchUI === 'function') {
                UIManager.updateStretchUI(proj.text, proj.color);
            }
        }
    },

    checkGlobalAgreement() {
        let groups = { short: [], mid: [], long: [] };
        for(let v=3; v<=20; v++) {
            const pred = this.predictions[v];
            if (pred === "---") continue;
            if (v <= 5) groups.short.push(pred);
            else if (v <= 9) groups.mid.push(pred);
            else groups.long.push(pred);
        }
        return (groups.short.every(p => p === groups.short[0]) && 
                groups.mid.every(p => p === groups.mid[0]) && 
                groups.long.every(p => p === groups.long[0]) &&
                groups.short[0] === groups.mid[0] && groups.mid[0] === groups.long[0]);
    },

    updateVolatilityHistory() {
        const vol = this.calculateVolatility();
        this.quantHF.volatilityHistory.push(vol);
        if (this.quantHF.volatilityHistory.length > 100) {
            this.quantHF.volatilityHistory.shift();
        }
    },

    setupToggleButton() {
        try {
            const toggleBtn = document.getElementById('toggle-trap-mechanism');
            if (toggleBtn) {
                toggleBtn.addEventListener('click', () => this.toggleTrapMechanism());
                this.updateToggleUI();
            }
        } catch (e) {}
    },

    toggleTrapMechanism() {
        this.isTrapMechanismEnabled = !this.isTrapMechanismEnabled;
        this.addVisibleLog(`Mecanismo de trampas: ${this.isTrapMechanismEnabled ? 'Activado' : 'Desactivado'}`, "#ffb400");
        this.updateToggleUI();
    },

    updateToggleUI() {
        try {
            const toggleBtn = document.getElementById('toggle-trap-mechanism');
            if (toggleBtn) {
                toggleBtn.textContent = this.isTrapMechanismEnabled ? 'Desactivar Trampas' : 'Activar Trampas';
                toggleBtn.style.backgroundColor = this.isTrapMechanismEnabled ? '#00ff88' : '#ff2e63';
            }
        } catch (e) {}
    },

    setupHedgeFundToggle() {
        try {
            const toggleBtn = document.getElementById('toggle-hedge-fund');
            if (toggleBtn) {
                toggleBtn.addEventListener('click', () => this.toggleHedgeFund());
                this.updateHedgeFundToggleUI();
            }
        } catch (e) {}
    },

    toggleHedgeFund() {
        this.isHedgeFundEnabled = !this.isHedgeFundEnabled;
        const status = this.isHedgeFundEnabled ? 'ACTIVADO' : 'DESACTIVADO';
        this.addVisibleLog(`Quant Hedge Fund: ${status}`, this.isHedgeFundEnabled ? "#00d4ff" : "#ff5555");
        this.updateHedgeFundToggleUI();
        this.updateMainSignal();
    },

    updateHedgeFundToggleUI() {
        try {
            const btn = document.getElementById('toggle-hedge-fund');
            if (btn) {
                btn.textContent = this.isHedgeFundEnabled ? 'Desactivar Hedge Fund' : 'Activar Hedge Fund';
                btn.style.backgroundColor = this.isHedgeFundEnabled ? '#00d4ff' : '#444';
                btn.style.color = this.isHedgeFundEnabled ? '#000' : '#fff';
            }
        } catch (e) {}
    },

    calculateMACD(periodShort = 12, periodLong = 26, periodSignal = 9) {
        if (this.priceHistory.length < periodLong) return { macd: 0, signal: 0 };
        const emaShort = this.calculateEMA(periodShort);
        const emaLong = this.calculateEMA(periodLong);
        const macd = emaShort - emaLong;
        const signal = this.calculateEMA(periodSignal, this.priceHistory.slice(- (periodLong + periodSignal - 1)).map((_, i) => emaShort - emaLong));
        return { macd, signal };
    },

    calculateEMA(period, prices = this.priceHistory.slice(-period * 2)) {
        const k = 2 / (period + 1);
        let ema = prices[0];
        for (let i = 1; i < prices.length; i++) {
            ema = prices[i] * k + ema * (1 - k);
        }
        return ema;
    },

    calculateFractals(window = 5) {
        if (this.priceHistory.length < window) return { up: false, down: false };
        const mid = Math.floor(window / 2);
        const prices = this.priceHistory.slice(-window);
        const high = Math.max(...prices);
        const low = Math.min(...prices);
        const upFractal = prices[mid] === high;
        const downFractal = prices[mid] === low;
        return { upFractal, downFractal };
    },

    findGeneticMatch() {
        if (this.isLocked) return;
        let bestV = null; let maxWeight = -1;
        const history = window.sequence.map(v => v.val).join('');

        for (let v = 3; v <= 20; v++) {
            if (window.sequence.length < v) continue;
            const stats = this.stats[v];
            const accuracy = stats.total > 0 ? (stats.hits / stats.total) : 0;
            if (accuracy < 0.65 && stats.total > 15) continue;
            if (this.consecutiveFails[v] >= 2) continue;

            const pattern = history.slice(-v);
            const searchPool = history.slice(0, -1);
            const occurrences = (searchPool.match(new RegExp(pattern, 'g')) || []).length;
            const recentHits = stats.timeline.slice(-5).filter(s => s.success).length;

            const weight = (accuracy * 0.6) + (recentHits * 0.3) + (occurrences * 0.1);

            if (weight > maxWeight && this.predictions[v] !== "---") {
                maxWeight = weight;
                bestV = v;
            }
        }

        if (bestV) {
            this.lastLeaderV = bestV;
            this.updateLeaderUI(bestV, history);
        }
    },

    updateMainSignal() {
        if (this.isLocked) return;
        let groups = { short: [], mid: [], long: [] };
        let powerB = 0; let powerS = 0;

        for(let v=3; v<=20; v++) {
            const pred = this.predictions[v];
            const acc = this.stats[v].total > 0 ? (this.stats[v].hits / this.stats[v].total) : 0;
            if (pred === "---" || !pred) continue;
           
            if (v <= 5) groups.short.push(pred);
            else if (v <= 9) groups.mid.push(pred);
            else groups.long.push(pred);
           
            if(pred === "BUY") powerB += acc;
            if(pred === "SELL") powerS += acc;
        }
        const globalAgreement = (groups.short.includes("BUY") && groups.mid.includes("BUY") && groups.long.includes("BUY")) ||
                                (groups.short.includes("SELL") && groups.mid.includes("SELL") && groups.long.includes("SELL"));
        try {
            const side = document.getElementById('signal-side');
            const header = document.getElementById('header-signal');
            const totalPower = powerB + powerS;
            let assertiveness = totalPower > 0 ? Math.round((Math.max(powerB, powerS) / totalPower) * 100) : 0;
            if (this.currentStreak.count >= 4) assertiveness -= (this.currentStreak.count * 5);
            const trend = this.calculateTrend();
            if (trend === 'STRONG BUY') assertiveness += 10;
            else if (trend === 'STRONG SELL') assertiveness -= 10;
            const rsi = this.calculateRSIWilder();
            const mlPred = this.predictNext();
            if (mlPred === 'BUY') powerB += 0.35; else if (mlPred === 'SELL') powerS += 0.35;
            let finalDir = powerB > powerS ? "BUY" : "SELL";
            let hedgeAdvice = "";
            if (this.isHedgeFundEnabled && this.quantHF.volatilityHistory.length >= 10) {
                try {
                    const input = {
                        volatility: this.calculateVolatility() / 10,
                        liquidity: 1000,
                        volume: window.sequence?.length > 20 ? 50 : 10,
                        imbalance: this.currentStreak.count > 3 ? 0.6 : 0.2,
                        spread: 0.00015,
                        correlations: { "EURUSD": 0.4, "BTCUSD": 0.1, "XAUUSD": 0.25 },
                        volatilityHistory: this.quantHF.volatilityHistory,
                    };
                    const hedgeResult = hedgeFundDecisionEngine(input);
                    this.quantHF.lastRegime = hedgeResult.regime;
                    this.quantHF.lastRLAction = hedgeResult.rlAction;
                    if (hedgeResult.rlAction === "BUY" && finalDir !== "SELL") {
                        hedgeAdvice = " (Hedge → BUY)";
                        powerB += 0.15;
                    } else if (hedgeResult.rlAction === "SELL" && finalDir !== "BUY") {
                        hedgeAdvice = " (Hedge → SELL)";
                        powerS += 0.15;
                    } else if (hedgeResult.rlAction === "HOLD") {
                        hedgeAdvice = " (Hedge → HOLD)";
                        assertiveness = Math.max(0, assertiveness - 15);
                    }
                    const regimeEl = document.getElementById('market-regime');
                    if (regimeEl) {
                        regimeEl.textContent = `RÉGIMEN: ${hedgeResult.regime}`;
                        regimeEl.style.color = hedgeResult.regime === "CRISIS" ? "#ff2e63" :
                                             hedgeResult.regime === "VOLATILE" ? "#ffb400" : "#00ff88";
                    }
                } catch (e) { console.error("Error en Hedge Fund", e); }
            }
            // --- LÓGICA DE SINCRONIZACIÓN CON EL GRÁFICO ---
            if (typeof updateAccuracyChart === 'function') {
                updateAccuracyChart(assertiveness / 100);
            }
            // --- LÓGICA DE DECISIÓN VISUAL (COMPARATIVA) ---
            const UMBRAL_MASTER = 85;
            const UMBRAL_SEGURO = 70;
            let colorAccion = "#ffb400"; // Naranja (Espera)
            if (globalAgreement && assertiveness >= UMBRAL_MASTER) {
                finalDir = powerB > powerS ? "MASTER BUY" : "MASTER SELL";
                side.innerText = `🛡️ ${finalDir}${hedgeAdvice}`;
                colorAccion = powerB > powerS ? "#00ffaa" : "#ff4d82";
                header.style.background = powerB > powerS ? "rgba(0, 255, 136, 0.25)" : "rgba(255, 46, 99, 0.25)";
            } else if (assertiveness >= UMBRAL_SEGURO) {
                const p = this.predictions[this.lastLeaderV] || finalDir;
                side.innerText = `✅ SUGERIDO: ${p}${hedgeAdvice}`;
                colorAccion = p.includes("BUY") ? "#00ffaa" : "#ff4d82";
                header.style.background = "rgba(10, 5, 25, 0.95)";
            } else {
                const p = this.predictions[this.lastLeaderV] || "ESPERANDO";
                side.innerText = `⚠️ RIESGO ALTO: ${p}${hedgeAdvice}`;
                colorAccion = "#666666"; // Gris
                header.style.background = "rgba(10, 5, 25, 0.85)";
            }
           
            side.style.color = colorAccion;
           
            const vLabel = document.getElementById('v-label');
            if (vLabel) {
                vLabel.innerHTML = `ASERTIVIDAD: <span style="color:${colorAccion}; font-weight:bold;">${assertiveness}%</span> | RSI: ${Math.round(rsi)} | RACHA: ${this.currentStreak.count}`;
            }
        } catch (e) { console.error("Error UI", e); }
        this.updateTrapUI();
        this.updateStatsUI();
    },
    checkExtremeLimits() {
        if (window.sequence.length < 10) return;
        const history = window.sequence.map(v => v.val).join('').slice(-10);
        const countA = (history.match(/A/g) || []).length;
        const countB = (history.match(/B/g) || []).length;
       
        if (countA >= 8) UIManager.updateStretchUI("⚠️ AGOTAMIENTO ALCISTA", "#ff2e63", true);
        else if (countB >= 8) UIManager.updateStretchUI("⚠️ AGOTAMIENTO BAJISTA", "#00ff88", true);
        else this.checkPriceStretch();
        if (countA >= 6 && this.lastLeaderV) this.predictions[this.lastLeaderV] = "SELL";
        else if (countB >= 6 && this.lastLeaderV) this.predictions[this.lastLeaderV] = "BUY";
    },
    checkPriceStretch() {
        const lastData = window.sequence.slice(-6).map(v => v.val);
        if (lastData.length < 3) return;
        let count = 1;
        const lastVal = lastData[lastData.length - 1];
        for (let i = lastData.length - 2; i >= 0; i--) {
            if (lastData[i] === lastVal) count++; else break;
        }
        if (count >= 3) UIManager.updateStretchUI(`ALERTA GIRO: ${count} VELAS`, "#ffb400");
        else UIManager.updateStretchUI("ESTADO: ESTABLE", "#666");
    },
    calculateTrend() {
        if (window.sequence.length < 10) return 'NEUTRAL';
        const last10 = window.sequence.slice(-10).map(v => v.val === 'A' ? 1 : -1);
        const sum = last10.reduce((a, b) => a + b, 0);
        return sum > 5 ? 'STRONG BUY' : sum < -5 ? 'STRONG SELL' : 'NEUTRAL';
    },
    isMarketSafe() {
        const now = new Date();
        const min = now.getMinutes();
        const sec = now.getSeconds();
       
        if (min === 59 || min === 0) {
            return false;
        }
        return true;
    },
    calculateRSIWilder(period = 14) {
        if (this.priceHistory.length < period + 1) return 50;
        let avgGain = 0, avgLoss = 0;
        for (let i = 1; i <= period; i++) {
            const change = this.priceHistory[this.priceHistory.length - i] - this.priceHistory[this.priceHistory.length - i - 1];
            if (change > 0) avgGain += change;
            else avgLoss -= change;
        }
        avgGain /= period;
        avgLoss /= period;
        if (this.priceHistory.length > period + 1) {
            for (let i = period + 1; i < this.priceHistory.length; i++) {
                const change = this.priceHistory[i] - this.priceHistory[i - 1];
                avgGain = ((avgGain * (period - 1)) + (change > 0 ? change : 0)) / period;
                avgLoss = ((avgLoss * (period - 1)) + (change < 0 ? -change : 0)) / period;
            }
        }
        if (avgLoss === 0) return 100;
        const rs = avgGain / avgLoss;
        return 100 - (100 / (1 + rs));
    },
    verifyAccuracy(actualType, predictedMl, wasInverted) {
        const actualLabel = actualType === 'A' ? 'BUY' : 'SELL';
        for (let v in this.predictions) {
            if (this.predictions[v] !== "---") {
                this.stats[v].total++;
                this.totalTrades++;
                const isHit = this.predictions[v] === actualLabel;
                if (isHit) {
                    this.stats[v].hits++;
                    this.consecutiveFails[v] = 0;
                    this.wins++;
                    this.addVisibleLog(`HIT + ${(this.currentStake * this.payout).toFixed(2)}`, "#00ff88");
                } else {
                    this.consecutiveFails[v]++;
                    this.losses++;
                    const lastSeq = window.sequence.slice(-this.windowSize).map(v => v.val);
                    const predicted = this.predictions[v];
                    if (predicted === 'BUY' && actualLabel === 'SELL') {
                        window.traps.push({ seq: lastSeq, type: 'fake-reversal', time: Date.now() });
                        if (window.traps.length > 20) this.trainTrapModel();
                        this.addVisibleLog("TRAMPA DETECTADA (BUY → SELL)", "#ff2e63");
                        this.trapHourlyCounts[new Date().getHours()]++;
                    } else if (predicted === 'SELL' && actualLabel === 'BUY') {
                        window.traps.push({ seq: lastSeq, type: 'fake-reversal', time: Date.now() });
                        if (window.traps.length > 20) this.trainTrapModel();
                        this.addVisibleLog("TRAMPA DETECTADA (SELL → BUY)", "#ff2e63");
                        this.trapHourlyCounts[new Date().getHours()]++;
                    }
                    this.addVisibleLog(`MISS - ${this.currentStake.toFixed(2)}`, "#ff2e63");
                }
                this.stats[v].timeline.push({ success: isHit });
                if (this.consecutiveFails[v] >= 3) this.predictions[v] = "---";
            }
        }
        if (predictedMl && predictedMl !== '---') {
            const mlDir = predictedMl.split(' ')[0];
            const isMlHit = mlDir === actualLabel;
            if (wasInverted) {
                this.trapInversionsTotal++;
                if (isMlHit) {
                    this.trapInversionsSuccess++;
                    this.addVisibleLog(`INVERSIÓN POR TRAMPA EXITOSA (ML acertó)`, "#00ff88");
                } else {
                    this.addVisibleLog(`INVERSIÓN POR TRAMPA FALLIDA (ML erró)`, "#ff2e63");
                }
                const recentInversions = Math.min(this.trapInversionsTotal, 15);
                const recentSuccess = this.trapInversionsSuccess - (this.trapInversionsTotal - recentInversions);
                const successRate = recentInversions > 0 ? recentSuccess / recentInversions : 0.5;
                if (successRate > 0.80) {
                    this.dynamicTrapThreshold -= 0.12;
                } else if (successRate < 0.40) {
                    this.dynamicTrapThreshold += 0.12;
                } else if (successRate > 0.65) {
                    this.dynamicTrapThreshold -= 0.06;
                } else if (successRate < 0.55) {
                    this.dynamicTrapThreshold += 0.06;
                }
                this.dynamicTrapThreshold = Math.max(0.45, Math.min(0.85, this.dynamicTrapThreshold));
                this.addVisibleLog(`AJUSTE AGRESIVO: Éxito reciente = ${(successRate * 100).toFixed(0)}% | Umbral ahora = ${this.dynamicTrapThreshold.toFixed(2)}`, "#ffb400");
            }
        }
        // ────────────────────────────────────────────────
        // DETECCIÓN AUTOMÁTICA DE CAMBIO DE SEMILLA (más agresiva)
        // ────────────────────────────────────────────────
        // 1. Chequeo de volatilidad spike (>10% respecto promedio de 20 velas previas)
        const volNow = this.calculateVolatility();
        let volAvg = 0;
        if (this.priceHistory.length >= 30) {
            const prevPrices = this.priceHistory.slice(-30, -10);
            const prevVolChanges = [];
            for (let i = 1; i < prevPrices.length; i++) {
                prevVolChanges.push(Math.abs(prevPrices[i] - prevPrices[i-1]));
            }
            volAvg = prevVolChanges.reduce((a,b)=>a+b,0) / prevVolChanges.length * 10; // escalado aproximado
        }
        const spike = volAvg > 0 && (volNow - volAvg) / volAvg > 0.10;
        // 2. Patrón de últimas 5 velas ¿se repitió antes?
        const lastPattern = window.sequence.slice(-5).map(v => v.val).join('');
        let oldMatches = 0;
        if (window.sequence.length > 10) {
            const searchPool = window.sequence.slice(0, -5);
            for (let i = 0; i <= searchPool.length - 5; i++) {
                const candidate = searchPool.slice(i, i+5).map(v => v.val).join('');
                if (candidate === lastPattern) oldMatches++;
            }
        }
        const patternBroken = oldMatches < 1;
        // 3. RSI flip fuerte (cruza lejos de 50)
        const currentRSI = this.calculateRSIWilder();
        const rsiFlip = Math.abs(currentRSI - 50) > 20; // más agresivo que 15
        // 4. Decisión final de reinicio automático
        if ((this.consecutiveFails[this.lastLeaderV] >= 2 || this.calculateGlobalAccuracy() < 0.52)
            && (spike || patternBroken || rsiFlip)) {
           
            this.addVisibleLog("¡SEMILLA CAMBIADA DETECTADA! Reiniciando modelo automáticamente", "#ff2e63");
            this.retrainTrapModel();
            this.dynamicTrapThreshold = 0.45; // baja para aprender rápido
            setTimeout(() => {
                this.dynamicTrapThreshold = 0.65; // vuelve a normal después de 5 min
                this.addVisibleLog("Umbral de trampa restaurado a 0.65 tras adaptación", "#ffb400");
            }, 300000);
            // Opcional: limpiar traps muy viejos para no arrastrar ruido antiguo
            if (window.traps.length > 50) {
                window.traps = window.traps.slice(-30);
            }
        }
        if (this.consecutiveFails[this.lastLeaderV] >= 10) {
            this.retrainTrapModel();
            this.addVisibleLog("Reentrenando trapModel: 10 fallos seguidos", "#ff2e63");
        }
        this.updateTrapUI();
        this.updateStatsUI();
    },
    calculateGlobalAccuracy() {
        let total = 0, hits = 0;
        for (let v in this.stats) {
            total += this.stats[v].total;
            hits += this.stats[v].hits;
        }
        return total > 0 ? hits / total : 0;
    },
    processWealth(actualType) {
        const actualLabel = actualType === 'A' ? 'BUY' : 'SELL';
       
        if (this.lastLeaderV && this.predictions[this.lastLeaderV] && this.predictions[this.lastLeaderV] !== "---") {
           
            if (!this.isMarketSafe()) {
                this.addVisibleLog("PAUSA: Cambio de hora (Manipulación)", "#ffb400");
                return;
            }
            const pred = this.predictions[this.lastLeaderV];
           
            if (pred === actualLabel) {
                this.equity += (this.currentStake * this.payout);
                this.addVisibleLog(`HIT + ${(this.currentStake * this.payout).toFixed(2)}`, "#00ff88");
               
                this.currentStake = this.minBet;
                this.martingaleLevel = 0;
            } else {
                this.equity -= this.currentStake;
                this.addVisibleLog(`MISS - ${this.currentStake.toFixed(2)}`, "#ff2e63");
                if (this.martingaleLevel < 2) {
                    this.martingaleLevel++;
                    this.currentStake = Math.ceil(this.currentStake * 2.2);
                    this.addVisibleLog(`MARTINGALA N${this.martingaleLevel}: $${this.currentStake}`, "#ffb400");
                } else {
                    this.currentStake = this.minBet;
                    this.martingaleLevel = 0;
                    this.addVisibleLog("STOP LOSS: Reset de seguridad", "#ffffff");
                }
            }
            if(typeof UIManager !== 'undefined') UIManager.updateWealthUI(this.equity);
        }
    },
    calculateVolatility() {
        if (window.sequence.length < 10) return 0;
        const last10 = window.sequence.slice(-10).map(v => v.val === 'A' ? 1 : 0);
        const mean = last10.reduce((a,b)=>a+b,0)/10;
        const variance = last10.reduce((a,b)=>a + Math.pow(b-mean,2),0)/10;
        return Math.sqrt(variance) * 10;
    },
    activateSecurityLock() {
        this.isLocked = true;
        try {
            const side = document.getElementById('signal-side');
            if(side) side.innerText = "BLOQUEO VOLATILIDAD";
        } catch (e) {}
        this.addVisibleLog("BLOQUEO POR ALTA VOLATILIDAD (20s)", "#ff9f43");
        setTimeout(() => { this.isLocked = false; }, 20000);
    },
    reset() {
        window.sequence = []; this.equity = 1000.00;
        this.currentStreak = { val: null, count: 0 };
        this.priceHistory = [100.0];
        this.lastLeaderV = null;
        this.predictions = {};
        for(let i=3; i<=20; i++) {
            this.stats[i] = { hits: 0, total: 0, timeline: [] };
            this.consecutiveFails[i] = 0;
        }
        this.trapsAvoided = 0;
        this.totalTrades = 0;
        this.wins = 0;
        this.losses = 0;
        this.trapInversionsTotal = 0;
        this.trapInversionsSuccess = 0;
        this.dynamicTrapThreshold = 0.65;
        this.trapHourlyCounts = Array(24).fill(0);
        this.isTrapMechanismEnabled = true;
        this.isPaused = false;
        this.isHedgeFundEnabled = false;
        this.isInTrapRecovery = false;
        this.quantHF.volatilityHistory = [];
        this.quantHF.lastRegime = "STABLE";
        this.quantHF.lastRLAction = "HOLD";
        window.traps = [];
        if(typeof UIManager !== 'undefined') {
            UIManager.updateWealthUI(this.equity);
            this.addVisibleLog("SISTEMA REINICIADO", "#0088ff");
        }
        this.runMultiAnalysis();
        this.updateMainSignal();
        this.updateTrapUI();
        this.updateStatsUI();
    },
exportData() {
    // 1. Análisis de Horarios (Encontrar la "Hora de Oro")
    const hourStats = {};
    this.priceHistory.forEach(entry => {
        const hour = new Date(entry.time).getHours() + ":00";
        if (!hourStats[hour]) hourStats[hour] = { total: 0, wins: 0 };
        // Si tienes registro de trades en el historial:
        if (entry.trade) {
            hourStats[hour].total++;
            if (entry.result === 'WIN') hourStats[hour].wins++;
        }
    });

    let bestHour = "Sin datos";
    let maxAcc = 0;
    for (let h in hourStats) {
        let acc = (hourStats[h].wins / hourStats[h].total) * 100;
        if (acc > maxAcc) { maxAcc = acc; bestHour = h; }
    }

    // 2. Análisis de Trampas y Mensajes
    const totalTraps = document.getElementById('trap-count')?.innerText || "0";
    const avoided = document.getElementById('traps-avoided')?.innerText || "0";
    const lastMsg = this.lastLeaderV ? `PATRÓN V${this.lastLeaderV}` : "NINGUNO";

    // 3. Construcción del CSV Reforzado
    let csv = "data:text/csv;charset=utf-8,";
    csv += "=== REPORTE DE INTELIGENCIA QUANTUM ALPHA ===\n";
    csv += `Fecha de Auditoria: ${new Date().toLocaleString()}\n`;
    csv += `Capital Final: ${this.equity.toFixed(2)}\n`;
    csv += `Hora mas Rentable: ${bestHour} (${maxAcc.toFixed(2)}% Acc)\n`;
    csv += `Trampas Detectadas: ${totalTraps}\n`;
    csv += `Trampas Evitadas: ${avoided}\n`;
    csv += `Estrategia/Mensaje mas Letal: ${lastMsg}\n\n`;

    // 4. Tabla de Rendimiento por Ventana (V3-V20)
    csv += "VENTANA GENETICA,TOTAL TRADES,ACIERTOS,EFECTIVIDAD %,ESTADO\n";
    
    for (let v = 3; v <= 20; v++) {
        const s = this.stats[v];
        if (s && s.total > 0) {
            const acc = (s.hits / s.total * 100).toFixed(2);
            const status = acc >= 60 ? "RENTABLE" : "RIESGO";
            csv += `V${v},${s.total},${s.hits},${acc}%,${status}\n`;
        }
    }

    // 5. Historial de Tendencias Recientes
    csv += "\nULTIMOS MOVIMIENTOS DEL MERCADO (MICRO-TENDENCIAS)\n";
    csv += "TIMESTAMP,PRECIO,DIRECCION,VOLATILIDAD\n";
    this.priceHistory.slice(-20).forEach(p => {
        csv += `${new Date(p.time).toLocaleTimeString()},${p.price},${p.dir || 'N/A'},${p.vol || 'Baja'}\n`;
    });

    // 6. Ejecución de la descarga
    const encodedUri = encodeURI(csv);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Auditoria_Quantum_${Date.now()}.csv`);
    document.body.appendChild(link); 
    link.click();
    document.body.removeChild(link);

    if (typeof UIManager !== 'undefined') {
        UIManager.addLog("AUDITORÍA COMPLETA EXPORTADA", "#00ffaa");
    }
},
    async trainModel() {
        if (!window.tf) {
            console.warn("TensorFlow.js no está cargado");
            return;
        }
        const seq = window.sequence.map(v => v.val === 'A' ? 1 : 0);
        const ws = this.windowSize;
        if (seq.length < ws * 2) {
            console.log(`Datos insuficientes para entrenar (${seq.length} < ${ws * 2})`);
            return;
        }
        const enrichedXs = [];
        const ys = [];
        for (let i = 0; i < seq.length - ws; i++) {
            const slice = seq.slice(i, i + ws);
            const rsi = this.calculateRSIWilder(14, this.priceHistory.slice(i, i + ws));
            const { macd } = this.calculateMACD(12, 26, 9);
            const { upFractal } = this.calculateFractals(5);
            enrichedXs.push([...slice, rsi, macd, upFractal ? 1 : 0]);
            ys.push(seq[i + ws]);
        }
        const xsTensor = tf.tensor3d(enrichedXs, [enrichedXs.length, ws + 3, 1]);
        const ysTensor = tf.tensor2d(ys, [ys.length, 1]);
        if (this.model) this.model.dispose();
        this.model = tf.sequential();
        this.model.add(tf.layers.lstm({units: this.lstmUnits1, returnSequences: true, inputShape: [ws + 3, 1]}));
        this.model.add(tf.layers.attention());
        this.model.add(tf.layers.dropout({rate: this.dropoutRate}));
        this.model.add(tf.layers.lstm({units: this.lstmUnits2, returnSequences: false}));
        this.model.add(tf.layers.dropout({rate: this.dropoutRate}));
        this.model.add(tf.layers.dense({units: 16, activation: 'relu'}));
        this.model.add(tf.layers.dense({units: 1, activation: 'sigmoid'}));
        this.model.compile({
            optimizer: tf.train.adam(this.learningRate),
            loss: 'binaryCrossentropy',
            metrics: ['accuracy']
        });
        await this.model.fit(xsTensor, ysTensor, {
            epochs: this.maxEpochs,
            verbose: 0,
            validationSplit: 0.25,
            shuffle: true,
            callbacks: [
                tf.callbacks.earlyStopping({
                    monitor: 'val_loss',
                    patience: this.patienceEarlyStop,
                    restoreBestWeights: true,
                    verbose: 0
                }),
                {
                    onEpochEnd: (epoch, logs) => {
                        if (epoch % 10 === 0) {
                            this.addVisibleLog(`Epoch ${epoch}: loss=${logs.loss?.toFixed(4) || 'N/A'}, acc=${(logs.acc*100 || 0).toFixed(1)}%`, "#8888ff");
                        }
                    }
                }
            ]
        });
        this.addVisibleLog(`LSTM actualizado: ${enrichedXs.length} ejemplos, window=${ws}`, "#00ff88");
        xsTensor.dispose();
        ysTensor.dispose();
        if (window.traps.length > 20) this.trainTrapModel();
        this.updateTrapUI();
        this.updateStatsUI();
        this.crossValidateLSTM();
        this.validateStability();
    },
    async trainTrapModel() {
        if (!window.tf) {
            console.warn("TensorFlow.js no está cargado");
            return;
        }
        const ws = this.windowSize;
        const seq = window.sequence.map(v => v.val === 'A' ? 1 : 0);
        const normalXs = [];
        const normalYs = [];
        for (let i = 0; i < seq.length - ws; i++) {
            normalXs.push(seq.slice(i, i + ws));
            normalYs.push(0);
        }
        const trapXs = window.traps.map(t => t.seq.map(v => v === 'A' ? 1 : 0));
        const trapYs = new Array(trapXs.length).fill(1);
        const xs = normalXs.concat(trapXs);
        const ys = normalYs.concat(trapYs);
        if (xs.length < 20) {
            console.log('Datos insuficientes para entrenar trapModel');
            return;
        }
        const xsTensor = tf.tensor3d(xs, [xs.length, ws, 1]);
        const ysTensor = tf.tensor2d(ys, [ys.length, 1]);
        if (this.trapModel) this.trapModel.dispose();
        this.trapModel = tf.sequential();
        this.trapModel.add(tf.layers.lstm({units: 32, inputShape: [ws, 1]}));
        this.trapModel.add(tf.layers.dense({units: 1, activation: 'sigmoid'}));
        this.trapModel.compile({
            optimizer: tf.train.adam(this.learningRate),
            loss: 'binaryCrossentropy',
            metrics: ['accuracy']
        });
        await this.trapModel.fit(xsTensor, ysTensor, {
            epochs: 50,
            verbose: 0,
            validationSplit: 0.2,
            shuffle: true
        });
        this.addVisibleLog(`TrapModel actualizado: ${xs.length} ejemplos (${trapXs.length} trampas)`, "#ff9f43");
        xsTensor.dispose();
        ysTensor.dispose();
        this.updateTrapUI();
    },
    async retrainTrapModel() {
        if (!window.tf || window.traps.length < 10) return;
       
        window.traps = window.traps.filter(t => Date.now() - t.time < 200 * 60000);
       
        const recentSeq = window.sequence.slice(-200).map(v => v.val === 'A' ? 1 : 0);
        const recentXs = [];
        const recentYs = [];
        for (let i = 0; i < recentSeq.length - this.windowSize; i++) {
            recentXs.push(recentSeq.slice(i, i + this.windowSize));
            recentYs.push(0);
        }
       
        const trapXs = window.traps.map(t => t.seq.map(v => v === 'A' ? 1 : 0));
        const trapYs = new Array(trapXs.length).fill(1);
       
        const xs = recentXs.concat(trapXs);
        const ys = recentYs.concat(trapYs);
       
        const xsTensor = tf.tensor3d(xs, [xs.length, this.windowSize, 1]);
        const ysTensor = tf.tensor2d(ys, [ys.length, 1]);
       
        if (this.trapModel) this.trapModel.dispose();
        this.trapModel = tf.sequential();
        this.trapModel.add(tf.layers.lstm({units: 32, inputShape: [this.windowSize, 1]}));
        this.trapModel.add(tf.layers.dense({units: 1, activation: 'sigmoid'}));
       
        this.trapModel.compile({optimizer: tf.train.adam(this.learningRate), loss: 'binaryCrossentropy'});
       
        await this.trapModel.fit(xsTensor, ysTensor, {epochs: 30, verbose: 0});
       
        this.addVisibleLog("TrapModel reentrenado con datos frescos – nueva semilla detectada", "#ff9f43");
       
        xsTensor.dispose(); ysTensor.dispose();
        this.updateTrapUI();
    },
    async predictNext() {
        if (typeof tf === 'undefined' || !this.model || window.sequence.length < this.windowSize || !this.isTrapMechanismEnabled) {
            return '---';
        }
        return tf.tidy(() => {
            let seq = window.sequence.slice(-this.windowSize).map(v => v.val === 'A' ? 1 : 0);
            const min = Math.min(...seq);
            const max = Math.max(...seq);
            const range = max - min || 1;
            seq = seq.map(v => (v - min) / range);
            const rsi = this.calculateRSIWilder();
            const { macd } = this.calculateMACD();
            const { upFractal } = this.calculateFractals();
            const enrichedSeq = [...seq, rsi / 100, macd, upFractal ? 1 : 0];
            const input = tf.tensor3d([enrichedSeq], [1, this.windowSize + 3, 1]);
            const prob = this.model.predict(input).dataSync()[0];
            let originalDir;
            if (prob > 0.68) {
                originalDir = 'BUY';
            } else if (prob < 0.32) {
                originalDir = 'SELL';
            } else {
                originalDir = '---';
            }
            let finalDir = originalDir;
            let confidenceText = originalDir === 'BUY' ? (prob * 100).toFixed(0) + '%' :
                                originalDir === 'SELL' ? ((1 - prob) * 100).toFixed(0) + '%' :
                                (prob * 100).toFixed(0) + '%';
            let isTrapProb = 0;
            if (this.trapModel) {
                const trapInput = tf.tensor3d([seq], [1, this.windowSize, 1]);
                isTrapProb = this.trapModel.predict(trapInput).dataSync()[0];
                trapInput.dispose();
                if (this.currentStreak.count >= 5) {
                    this.addVisibleLog("Racha fuerte: no invierto aunque vea trampa", "#ffb400");
                } else {
                    const isHighConfidence = (originalDir === 'BUY' && prob > 0.75) || (originalDir === 'SELL' && prob < 0.25);
                    if (isTrapProb > this.dynamicTrapThreshold && originalDir !== '---' && isHighConfidence) {
                        finalDir = (originalDir === 'BUY') ? 'SELL' : 'BUY';
                        const trapMsg = `TRAMPA DETECTADA (${(isTrapProb*100).toFixed(0)}%) → INVERSIÓN: ${finalDir} (original era ${originalDir})`;
                        this.addVisibleLog(trapMsg, "#ff2e63");
                        confidenceText = finalDir === 'BUY' ? (prob * 100).toFixed(0) + '%' : ((1 - prob) * 100).toFixed(0) + '%';
                    }
                }
            }
            input.dispose();
            if (finalDir === '---') {
                return `--- (${confidenceText})`;
            }
            const resultText = `${finalDir} (${confidenceText})${isTrapProb > this.dynamicTrapThreshold ? ' (anti-trampa)' : ''}`;
           
            this.updateTrapUI();
            this.updateStatsUI();
           
            return resultText;
        });
    },
    async crossValidateLSTM(k = 5) {
        const seq = window.sequence.map(v => v.val === 'A' ? 1 : 0);
        const ws = this.windowSize;
        if (seq.length < ws * k) return;
        let rmseSum = 0;
        let mapeSum = 0;
        let accSum = 0;
        const foldSize = Math.floor(seq.length / k);
        for (let fold = 0; fold < k; fold++) {
            const valStart = fold * foldSize;
            const valEnd = valStart + foldSize;
            const trainXs = [];
            const trainYs = [];
            const valXs = [];
            const valYs = [];
            for (let i = 0; i < seq.length - ws; i++) {
                if (i >= valStart && i < valEnd) {
                    valXs.push(seq.slice(i, i + ws));
                    valYs.push(seq[i + ws]);
                } else {
                    trainXs.push(seq.slice(i, i + ws));
                    trainYs.push(seq[i + ws]);
                }
            }
            const trainXsTensor = tf.tensor3d(trainXs, [trainXs.length, ws, 1]);
            const trainYsTensor = tf.tensor2d(trainYs, [trainYs.length, 1]);
            const valXsTensor = tf.tensor3d(valXs, [valXs.length, ws, 1]);
            const valYsTensor = tf.tensor2d(valYs, [valYs.length, 1]);
            const foldModel = this.createLSTMModel();
            await foldModel.fit(trainXsTensor, trainYsTensor, {epochs: 20, verbose: 0});
            const preds = foldModel.predict(valXsTensor).dataSync();
            const actuals = valYsTensor.dataSync();
            const rmse = Math.sqrt(actuals.reduce((sum, a, i) => sum + Math.pow(a - preds[i], 2), 0) / actuals.length);
            const mape = actuals.reduce((sum, a, i) => sum + Math.abs((a - preds[i]) / a), 0) / actuals.length * 100;
            const acc = actuals.filter((a, i) => Math.sign(a) === Math.sign(preds[i])).length / actuals.length;
            rmseSum += rmse;
            mapeSum += mape;
            accSum += acc;
            trainXsTensor.dispose();
            trainYsTensor.dispose();
            valXsTensor.dispose();
            valYsTensor.dispose();
            foldModel.dispose();
        }
        this.addVisibleLog(`Validación cruzada: RMSE avg=${(rmseSum / k).toFixed(4)}, MAPE avg=${(mapeSum / k).toFixed(2)}%, Acc avg=${(accSum / k * 100).toFixed(1)}%`, "#00aaff");
    },
    createLSTMModel() {
        const model = tf.sequential();
        model.add(tf.layers.lstm({units: this.lstmUnits1, returnSequences: true, inputShape: [this.windowSize + 3, 1]}));
        model.add(tf.layers.attention());
        model.add(tf.layers.dropout({rate: this.dropoutRate}));
        model.add(tf.layers.lstm({units: this.lstmUnits2, returnSequences: false}));
        model.add(tf.layers.dropout({rate: this.dropoutRate}));
        model.add(tf.layers.dense({units: 16, activation: 'relu'}));
        model.add(tf.layers.dense({units: 1, activation: 'sigmoid'}));
        model.compile({optimizer: tf.train.adam(this.learningRate), loss: 'binaryCrossentropy', metrics: ['accuracy']});
        return model;
    },
    validateStability() {
        const volatility = this.calculateVolatility();
        let simVol = volatility * 1.5;
        const simSeq = Array(100).fill(0).map(() => Math.random() > 0.5 ? 1 : 0 + (Math.random() - 0.5) * simVol);
        const preds = this.model.predict(tf.tensor3d([simSeq.slice(0, this.windowSize)], [1, this.windowSize, 1])).dataSync();
        const rmse = Math.sqrt(simSeq.slice(this.windowSize).reduce((sum, a, i) => sum + Math.pow(a - preds[i], 2), 0) / preds.length);
        if (rmse > 0.5) {
            this.addVisibleLog("Modelo inestable bajo alta volatilidad (RMSE > 0.5)", "#ff2e63");
        } else {
            this.addVisibleLog("Modelo estable bajo volatilidad simulada", "#00ff88");
        }
    },
    checkTemporalAnomaly() {
        const hour = new Date().getHours();
        const trapFreq = this.trapHourlyCounts[hour] / (this.totalTrades || 1);
        if (trapFreq > 0.3) {
            this.pauseForAnomaly(300000);
            this.addVisibleLog(`Anomalía temporal detectada en hora ${hour} (frecuencia trampas: ${trapFreq.toFixed(2)}). Pausando.`, "#ff2e63");
        }
    },
    pauseForAnomaly(duration) {
        this.isPaused = true;
        setTimeout(() => {
            this.isPaused = false;
            this.addVisibleLog("Pausa por anomalía terminada. Reanudando.", "#00ff88");
        }, duration);
    },
    testHistorical(data) {
        data.forEach(type => this.injectManual(type));
        const globalAcc = Object.values(this.stats).reduce((a, s) => a + (s.hits / s.total || 0), 0) / Object.keys(this.stats).length;
        console.log(`Precisión Global: ${globalAcc * 100}%`);
        this.addVisibleLog(`Backtest completado: ${globalAcc * 100}% precisión`, "#00aaff");
    },
    connectToPO() {
        if (this.socket) this.socket.close();
        this.addVisibleLog("Iniciando conexión a Pocket Option...", "#0088ff");
       
        this.socket = new WebSocket("wss://demo-api-eu.po.market/socket.io/?EIO=4&transport=websocket");
        this.socket.onopen = () => {
            this.socket.send("40");
            setTimeout(() => {
                if(this.socket && this.socket.readyState === 1) this.socket.send("2probe");
            }, 1000);
        };
        this.socket.onmessage = (event) => {
            const msg = event.data;
            if (msg.startsWith("40")) {
                const initMsg = `42["user_init",{"id":124499372,"secret":"b292b113a3933576deb3a3594fc5f3d9"} ]`;
                this.socket.send(initMsg);
                this.addVisibleLog("AUTH: Enviando User Init (ID: 124499372)...", "#00ff88");
            }
            else if (msg === "2") {
                this.socket.send("3");
            }
            else if (msg.startsWith("42")) {
                try {
                    const parsed = JSON.parse(msg.slice(2));
                    if (parsed[0] === "candle-generated" || parsed[0] === "candle") {
                        const d = parsed[1];
                        this.injectManual(d.close > d.open ? 'A' : 'B');
                    }
                } catch(e) {}
            }
        };
        this.socket.onclose = () => {
            this.isPOConnected = false;
            this.updateConnectionUI(false);
            this.addVisibleLog("Conexión cerrada. Reintentando en 5s...", "#ff5555");
            if (!this.manualDisconnect) {
                setTimeout(() => this.connectToPO(), 5000);
            }
        };
        this.socket.onerror = (err) => {
            console.error("WebSocket error:", err);
            this.addVisibleLog("Error crítico en conexión PO", "#ff2e63");
        }
    },
    togglePOConnection() {
        if (this.isPOConnected) {
            this.disconnectPO();
        } else {
            this.manualDisconnect = false;
            this.connectToPO();
            this.isPOConnected = true;
            this.updateConnectionUI(true);
        }
    },
    disconnectPO() {
        this.manualDisconnect = true;
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        this.isPOConnected = false;
        this.updateConnectionUI(false);
        this.addVisibleLog("Desconectado manualmente de PO", "#ff9f43");
    },
    updateConnectionUI(connected) {
        try {
            const btn = document.getElementById('toggle-po-connection');
            if (!btn) return;

            const mainText = btn.querySelector('.btn-main') || btn;
            const subText = btn.querySelector('.btn-sub') || btn;

            if (connected) {
                btn.classList.add('active');
                mainText.textContent = "DESCONECTAR PO";
                subText.textContent = "CONECTADO";
            } else {
                btn.classList.remove('active');
                mainText.textContent = "CONECTAR PO";
                subText.textContent = "OFFLINE";
            }
        } catch (e) {}
    },
   runMultiAnalysis() {
    try {
        const containers = { 
            low: document.getElementById('col-low'), 
            mid: document.getElementById('col-mid'), 
            high: document.getElementById('col-high') 
        };
        
        // Limpiar contenedores
        Object.values(containers).forEach(c => { if (c) c.innerHTML = ''; });
        
        const history = window.sequence.map(v => v.val).join('');
        
        // ── NUEVO: Umbrales para techo/subtecho (ajusta según tu estrategia) ──
        const TECHO_FUERTE = 7;   // 🔴 TECHO – Muy probable rebote/reversión
        const TECHO_AVISO  = 4;   // 🟡 SUBTECHO – Precaución, cerca del límite
        
        for (let v = 3; v <= 20; v++) {
            if (window.sequence.length < v) continue;
            
            const pattern = history.slice(-v);
            const searchPool = history.slice(0, -1);
            const mA = (searchPool.match(new RegExp(pattern + 'A', 'g')) || []).length;
            const mB = (searchPool.match(new RegExp(pattern + 'B', 'g')) || []).length;
            
            let pred = mA > mB ? "BUY" : (mB > mA ? "SELL" : "---");
            this.predictions[v] = pred;
            
            const acc = this.stats[v].total > 0 
                ? Math.round((this.stats[v].hits / this.stats[v].total) * 100) 
                : 0;
            
            // ────────────────────────────────────────────────
            // Lógica de colores y visibilidad mejorada
            // ────────────────────────────────────────────────
            let textColor = "#ffffff";           // blanco por defecto (alto contraste)
            let borderColor = "#777788";
            let bgColor = "rgba(90, 90, 130, 0.28)";
            let bgOpacity = Math.max(0.28, acc / 110);  // nunca demasiado transparente
            
            if (pred === "BUY") {
                borderColor = "#00ff99";
                bgColor = `rgba(0, 255, 140, ${bgOpacity})`;
                textColor = acc >= 45 ? "#e8fff0" : "#ccffdd";  // tonos claros de verde
            } 
            else if (pred === "SELL") {
                borderColor = "#ff4d82";
                bgColor = `rgba(255, 77, 130, ${bgOpacity})`;
                textColor = acc >= 45 ? "#ffe0e8" : "#ffccdd";  // tonos claros de rosa
            }
            
            // Si la precisión es muy baja → neutralizamos para no dar falsa confianza
            if (acc < 35) {
                textColor = "#cccccc";
                borderColor = "#666677";
                bgColor = `rgba(100, 100, 140, ${bgOpacity})`;
            }
            
            // ────────────────────────────────────────────────
            // NUEVO: Detección de TECHO / SUBTECHO para esta V
            // ────────────────────────────────────────────────
            let techoStatus = "🟢 SIN TECHO – Puede seguir";
            let techoColor = "#00ffaa";
            let techoBg = "rgba(0, 255, 170, 0.08)";
            let techoBold = "normal";

            // Solo mostramos techo si la predicción coincide con la racha actual
            if (pred !== "---" && this.currentStreak.val) {
                const isBullishPattern = pred === "BUY";
                const streakMatches = (isBullishPattern && this.currentStreak.val === 'A') ||
                                     (!isBullishPattern && this.currentStreak.val === 'B');
                
                if (streakMatches) {
                    if (this.currentStreak.count >= TECHO_FUERTE) {
                        techoStatus = "🔴 TECHO – Riesgo rebote alto";
                        techoColor = "#ff2e63";
                        techoBg = "rgba(255, 46, 99, 0.18)";
                        techoBold = "bold";
                    } else if (this.currentStreak.count >= TECHO_AVISO) {
                        techoStatus = "🟡 SUBTECHO – Precaución";
                        techoColor = "#ffb400";
                        techoBg = "rgba(255, 180, 0, 0.12)";
                        techoBold = "600";
                    }
                }
            }

            // ────────────────────────────────────────────────
            // Tarjeta con mejor legibilidad + INDICADOR DE TECHO
            // ────────────────────────────────────────────────
            const card = `
                <div class="window-card" style="
                    border-right: 5px solid ${borderColor};
                    background: ${bgColor};
                    padding: 10px 12px;
                    border-radius: 8px;
                    margin: 6px 0;
                    color: ${textColor};
                    font-weight: ${acc >= 60 ? '600' : 'normal'};
                    min-height: 70px;  /* más alto para caber el techo */
                    display: flex;
                    flex-direction: column;
                    justify-content: space-between;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.35);
                ">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="font-size: 14px; letter-spacing: 0.5px; opacity: 0.9;">
                            V${v}
                        </div>
                        <div style="text-align: right;">
                            <strong style="font-size: 16px; letter-spacing: 0.8px;">
                                ${pred === "---" ? "—" : pred}
                            </strong>
                            <br>
                            <span style="
                                font-size: 13.5px; 
                                font-weight: ${acc >= 50 ? 'bold' : 'normal'};
                                opacity: ${acc >= 30 ? 1 : 0.9};
                            ">
                                ${acc}%
                            </span>
                        </div>
                    </div>
                    
                    <!-- NUEVO: Indicador de TECHO / SUBTECHO visible -->
                    <div style="
                        margin-top: 6px;
                        font-size: 12px;
                        color: ${techoColor};
                        background: ${techoBg};
                        padding: 4px 8px;
                        border-radius: 4px;
                        text-align: center;
                        font-weight: ${techoBold};
                        border: 1px solid ${techoColor}40;
                    ">
                        ${techoStatus}
                    </div>
                </div>
            `;
            
            // Clasificación por nivel de confianza
            if (acc >= 75 && pred !== "---") {
                containers.high.innerHTML += card;
            } else if (acc >= 55 && pred !== "---") {
                containers.mid.innerHTML += card;
            } else if (containers.low) {
                containers.low.innerHTML += card;
            }
        }
        
        // ── NUEVO: Alerta global si hay techo en V elite/fuerte ──
        if (containers.high.innerHTML.includes("TECHO") || containers.mid.innerHTML.includes("TECHO")) {
            if (typeof UIManager !== 'undefined') {
                UIManager.updateStretchUI("🚨 TECHO DETECTADO EN PATRONES FUERTES/ELITE – Posible rebote", "#ff2e63");
            }
        }
        
    } catch (e) {
        console.error("Error en runMultiAnalysis:", e);
    }
},
    updateLeaderUI(bestV, history) {
        try {
            const pred = this.predictions[bestV];
            const acc = Math.round((this.stats[bestV].hits / this.stats[bestV].total) * 100) || 0;
            document.getElementById('ai-best-match').innerHTML = `LÍDER: <b style="color:#0088ff">V${bestV}</b> [Fails: ${this.consecutiveFails[bestV]}]`;
            document.getElementById('ai-signal-value').innerText = pred;
            document.getElementById('ai-signal-value').style.color = pred === "BUY" ? "#00ff88" : "#ff2e63";
            document.getElementById('ai-confidence').innerText = `${acc}% PRECISIÓN`;
        } catch (e) {}
    },
    updateTrapUI() {
        const predictionResult = this.predictNext();
        const currentPred = typeof predictionResult === 'string' 
            ? predictionResult 
            : (predictionResult?.dir || String(predictionResult || '---'));

        const probText = currentPred.includes('(anti-trampa)') 
            ? currentPred.split('(')[1]?.replace(')', '') || '0%' 
            : '0%';

        const lastTrapSeq = (window.traps && window.traps.length > 0) 
            ? window.traps[window.traps.length - 1].seq.join(' ') 
            : '---';

        if (typeof window.updateTrapPanel === 'function') {
            window.updateTrapPanel(
                window.traps ? window.traps.length : 0,
                probText,
                lastTrapSeq,
                this.trapsAvoided || 0
            );
        }
    },

updateStatsUI() {
    // Calcula el acierto global (asegúrate de que calculateGlobalAccuracy() exista y devuelva un número)
    const acc = this.calculateGlobalAccuracy ? this.calculateGlobalAccuracy() : 0;

    // Usa UIManager (que ya tienes en ui_manager.js)
    if (UIManager && typeof UIManager.updateStatsUI === 'function') {
        UIManager.updateStatsUI(
            acc,
            this.totalTrades || 0,
            this.wins || 0,
            this.losses || 0
        );
    } else {
        console.warn("UIManager.updateStatsUI no está disponible. Verifica ui_manager.js");
    }
},

    addVisibleLog(msg, color = '#aaa') {
        if (typeof addLog === 'function') {
            addLog(msg, color);
        } else {
            console.log(`[${new Date().toLocaleTimeString()}] ${msg}`);
        }
    }
};

// ────────────────────────────────────────────────
// QUANT HEDGE FUND MODULE v5.0 – MAX EXPANSION
// ────────────────────────────────────────────────

function simulateOrderFlow(volume, imbalance) {
  return {
    buyPressure: volume * (1 + imbalance),
    sellPressure: volume * (1 - imbalance),
  };
}

function microstructureNoise(spread, liquidity) {
  return spread / liquidity;
}

function estimateSlippage(volatility, liquidity) {
  return volatility / liquidity;
}

class RLTrader {
  constructor() {
    this.qTable = {};
  }

  getState(regime, volatility) {
    return `\( {regime}_ \){Math.round(volatility * 10)}`;
  }

  chooseAction(state) {
    if (!this.qTable[state]) this.qTable[state] = { BUY: 0, SELL: 0, HOLD: 0 };
    const actions = this.qTable[state];
    return Object.keys(actions).reduce((a, b) =>
      actions[a] > actions[b] ? a : b
    );
  }

  update(state, action, reward) {
    this.qTable[state][action] += reward;
  }
}

function optimizePortfolio(assets, correlations) {
  const weights = {};
  const equalWeight = 1 / assets.length;

  for (const asset of assets) {
    weights[asset] = equalWeight * (1 - (correlations[asset] || 0));
  }

  return weights;
}

function detectRegimeHMM(volatilityHistory) {
  const avg =
    volatilityHistory.reduce((a, b) => a + b, 0) / volatilityHistory.length;

  if (avg > 0.7) return "CRISIS";
  if (avg > 0.4) return "VOLATILE";
  return "STABLE";
}

function liquidityRisk(volume, orderSize) {
  return orderSize / volume;
}

function stressTest(capital, scenarios) {
  return scenarios.map(s => capital * (1 - s.drawdown));
}

function executeTWAP(totalSize, intervals) {
  return totalSize / intervals;
}

function executeVWAP(totalSize, volumeProfile) {
  const totalVolume = volumeProfile.reduce((a, b) => a + b, 0);
  return volumeProfile.map(v => (v / totalVolume) * totalSize);
}

function adjustRiskBudget(drawdown) {
  if (drawdown > 0.2) return 0.005;
  if (drawdown > 0.1) return 0.01;
  return 0.02;
}

async function hedgeFundDecisionEngine(input) {
  const {
    volatility,
    liquidity,
    volume,
    imbalance,
    correlations,
    volatilityHistory,
  } = input;

  const flow = simulateOrderFlow(volume, imbalance);
  const noise = microstructureNoise(input.spread || 0.0001, liquidity);
  const slippage = estimateSlippage(volatility, liquidity);
  const regime = detectRegimeHMM(volatilityHistory);
  const state = MarketBridge.quantHF.rlTrader.getState(regime, volatility);
  const rlAction = MarketBridge.quantHF.rlTrader.chooseAction(state);
  const weights = optimizePortfolio(MarketBridge.quantHF.assets, correlations);

  return {
    regime,
    rlAction,
    orderFlow: flow,
    microNoise: noise,
    slippage,
    portfolioWeights: weights,
  };
}

// DEBUG: fallback para addLog si no está definido
if (typeof addLog !== 'function') {
    window.addLog = function(msg, color) {
        console.log(`[FALLBACK LOG] ${msg}`);
        const logDiv = document.getElementById('log-lines');
        if (logDiv) {
            const line = document.createElement('div');
            line.style.color = color;
            line.textContent = msg;
            logDiv.appendChild(line);
        }
    };
}

// Definir updateLiveSequence si no existe (fallback básico)
if (typeof updateLiveSequence !== 'function') {
    window.updateLiveSequence = function() {
        console.log('Actualizando secuencia en vivo (fallback)');
    };
}

MarketBridge.init();

// ────────────────────────────────────────────────────────────────
// ACTUALIZACIÓN DEL PANEL GENETIC LEADER (más limpio y profesional)
// ────────────────────────────────────────────────────────────────
MarketBridge.updateLeaderUI = function(v, history) {
    const bestMatchEl   = document.getElementById('ai-best-match');
    const signalValueEl = document.getElementById('ai-signal-value');
    const confidenceEl  = document.getElementById('ai-confidence');

    if (!bestMatchEl || !signalValueEl || !confidenceEl) return;

    // Predicción actual y precisión del líder
    const prediction = this.predictions[v] || "ESPERANDO";
    const stats = this.stats[v] || {};
    const accuracy = (stats.total > 0) ? (stats.hits / stats.total * 100) : 0;

    // 1. Nombre del patrón líder (más destacado)
    bestMatchEl.innerText = `PATRON LÍDER V${v}`;
    bestMatchEl.style.color = "#00d4ff";
    bestMatchEl.style.fontWeight = "600";
    bestMatchEl.style.letterSpacing = "0.5px";

    // 2. Señal principal grande y muy visible
    signalValueEl.innerText = prediction;
    signalValueEl.style.fontSize = "32px";
    signalValueEl.style.fontWeight = "900";
    signalValueEl.style.letterSpacing = "2px";

    if (prediction === "BUY") {
        signalValueEl.style.color = "#00ffaa";      // Verde neón alcista
        signalValueEl.style.textShadow = "0 0 12px #00ffaa80";
    } else if (prediction === "SELL") {
        signalValueEl.style.color = "#ff4d82";      // Rosa/rojo bajista
        signalValueEl.style.textShadow = "0 0 12px #ff4d8280";
    } else {
        signalValueEl.style.color = "#aaaaaa";
        signalValueEl.style.textShadow = "none";
    }

    // 3. Porcentaje de confianza (match) con color dinámico
    confidenceEl.innerText = `${accuracy.toFixed(1)}% CONFIANZA`;
    confidenceEl.style.fontSize = "14px";
    confidenceEl.style.fontWeight = accuracy > 70 ? "bold" : "normal";

    if (accuracy >= 80) {
        confidenceEl.style.color = "#00ffaa";
    } else if (accuracy >= 60) {
        confidenceEl.style.color = "#ffb400";
    } else {
        confidenceEl.style.color = "#ff4d82";
    }
};

// ────────────────────────────────────────────────────────────────
// PROYECCIÓN DE CONTINUACIÓN DE RACHA (versión profesional y visible)
// ────────────────────────────────────────────────────────────────
MarketBridge.projectStreakContinuation = function() {
    // ────────────────────────────────────────────────────────────────
    // 1. Estados especiales → mensajes claros y profesionales
    // ────────────────────────────────────────────────────────────────
    if (this.isInTrapRecovery) {
        return {
            text: "📛 MODO RECUPERACIÓN ACTIVO – Esperando confirmación post-trampa",
            color: "#ff4d82",
            level: 0
        };
    }

    if (this.isLocked || this.isPaused) {
        return {
            text: "⚠️ SISTEMA EN PAUSA – Alta volatilidad detectada",
            color: "#ffaa00",
            level: 0
        };
    }

    // ────────────────────────────────────────────────────────────────
    // 2. Sin racha activa → nada que proyectar
    // ────────────────────────────────────────────────────────────────
    const streak = this.currentStreak;
    if (!streak.val || streak.count < 1) {
        return { 
            text: "Sin racha activa en este momento", 
            color: "#888888", 
            level: 0 
        };
    }

    // ────────────────────────────────────────────────────────────────
    // 3. Definir dirección, emoji y color principal
    // ────────────────────────────────────────────────────────────────
    const isBullish   = streak.val === 'A';
    const emoji       = isBullish ? "📈" : "📉";
    const direction   = isBullish ? "SUBE" : "BAJA";
    const colorStrong = isBullish ? "#00ffaa" : "#ff4d82";

    // ────────────────────────────────────────────────────────────────
    // 4. Calcular nivel de proyección (0 a 4)
    // ────────────────────────────────────────────────────────────────
    let projectionLevel = 0;

    if (streak.count >= 1) {
        projectionLevel = 1;  // base: al menos 1 vela más probable

        // Consenso en longitudes cortas y medias
        let shortAgreement = 0;
        let midAgreement = 0;
        for (let v = 3; v <= 9; v++) {
            const pred = this.predictions[v];
            if (pred === (isBullish ? "BUY" : "SELL")) {
                if (v <= 5) shortAgreement++;
                else midAgreement++;
            }
        }

        const shortConsensus = shortAgreement >= 2;
        const midConsensus = midAgreement >= 3;

        if (shortConsensus) projectionLevel = Math.max(projectionLevel, 2);
        if (shortConsensus && midConsensus) projectionLevel = 3;

        // Bonus fuerte: líder genético con alta precisión reciente
        if (this.lastLeaderV && this.lastLeaderV <= 9) {
            const acc = this.stats[this.lastLeaderV]?.hits / this.stats[this.lastLeaderV]?.total || 0;
            if (acc > 0.70) {
                projectionLevel = Math.min(4, projectionLevel + 1); // permite hasta 4 si muy confiable
            }
        }

        // Penalización por riesgo (volatilidad alta o fails consecutivos)
        if (this.calculateVolatility() > 10 || this.consecutiveFails[streak.count] > 1) {
            projectionLevel = Math.max(0, projectionLevel - 1);
        }
    }

    // ────────────────────────────────────────────────────────────────
    // 5. Construir mensaje profesional, visible y con fuerza clara
    // ────────────────────────────────────────────────────────────────
    if (projectionLevel >= 1) {
        const strength = projectionLevel >= 3 ? "FUERTE" : 
                        (projectionLevel === 2 ? "MODERADA" : "BAJA");
        const plural   = projectionLevel > 1 ? "S" : "";

        const text = `${emoji} PROYECCIÓN ${strength}: ${direction} ${projectionLevel} VELA${plural} MÁS`;

        return { 
            text, 
            color: colorStrong, 
            level: projectionLevel 
        };
    }

    // Sin convicción suficiente para proyectar
    return { 
        text: "Sin proyección clara en este momento", 
        color: "#aaaaaa", 
        level: 0 
    };

};
