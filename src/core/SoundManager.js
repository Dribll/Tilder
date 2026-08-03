class SoundManager {
    constructor() {
        this.audioCtx = null;
        this.initialized = false;
        
        // Listen for first interaction to initialize AudioContext
        const initAudio = () => {
            if (!this.initialized) {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                this.audioCtx = new AudioContext();
                this.initialized = true;
                
                // Remove listeners once initialized
                window.removeEventListener('click', initAudio);
                window.removeEventListener('keydown', initAudio);
            }
        };
        
        window.addEventListener('click', initAudio, { once: true });
        window.addEventListener('keydown', initAudio, { once: true });
    }

    _playOscillator(type, freqStart, freqEnd, duration, volLevel) {
        if (!this.initialized || !this.audioCtx) return;
        
        const t = this.audioCtx.currentTime;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc.type = type;
        
        // Frequency Envelope
        osc.frequency.setValueAtTime(freqStart, t);
        if (freqEnd) {
            osc.frequency.exponentialRampToValueAtTime(freqEnd, t + duration);
        }

        // Volume Envelope
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(volLevel, t + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);

        osc.start(t);
        osc.stop(t + duration);
    }

    playClick() {
        // A very subtle, short tap (e.g. for buttons, toggles)
        this._playOscillator('sine', 600, 400, 0.015, 0.04);
    }

    playTick() {
        // An extremely subtle, short tick (e.g. for hover states, tabs)
        this._playOscillator('sine', 800, 700, 0.01, 0.02);
    }

    playPop() {
        // A soft, low-pitch thud (e.g. for opening modals, command palette)
        this._playOscillator('sine', 150, 80, 0.05, 0.03);
    }

    playSwoosh() {
        // A slide sound (e.g. for opening sidebars)
        this._playOscillator('sine', 100, 60, 0.1, 0.02);
    }
    
    playError() {
        // A standard bonk error sound
        if (!this.initialized || !this.audioCtx) return;
        
        const t = this.audioCtx.currentTime;
        const osc1 = this.audioCtx.createOscillator();
        const osc2 = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();

        osc1.type = 'triangle';
        osc2.type = 'sine';
        
        osc1.frequency.setValueAtTime(150, t);
        osc2.frequency.setValueAtTime(200, t);
        
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.08, t + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.audioCtx.destination);

        osc1.start(t);
        osc1.stop(t + 0.3);
        osc2.start(t);
        osc2.stop(t + 0.3);
    }
}

// Export a singleton instance
export const soundManager = new SoundManager();
