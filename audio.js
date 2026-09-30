// Web Audio API суурилсан хөгжим ба дууны эффектүүд (Zero external MP3 dependency)
class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.isBgmPlaying = false;
    this.bgmTimer = null;
    this.bgmStep = 0;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.muted && this.isBgmPlaying) {
      this.stopBGM();
      this.isBgmPlaying = true; // keep state so unmute resumes
    } else if (!this.muted && this.isBgmPlaying) {
      this.isBgmPlaying = false;
      this.playLobbyBGM();
    }
    return this.muted;
  }

  // --- Дууны эффектүүд ---

  // Товч дарах чимээ
  playPop() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const now = this.ctx.currentTime;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(450, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.08);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.08);
  }

  // Цагийн чаг чаг (Countdown tick)
  playTick(isUrgent = false) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = isUrgent ? 'sawtooth' : 'triangle';
    const freq = isUrgent ? 900 : 520;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.5, now + 0.04);

    gain.gain.setValueAtTime(isUrgent ? 0.35 : 0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.05);
  }

  // Зөв хариултын баярт чимээ
  playCorrect() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const now = this.ctx.currentTime + idx * 0.09;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.35);
    });
  }

  // Буруу хариултын чимээ
  playWrong() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.35);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.35);
  }

  // Тоглогч лоббид нэмэгдэхэд гарах хөгжилтэй дуу
  playPlayerJoin() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(640, now + 0.12);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.12);
  }

  // Ялалтын фанфар (Victory fanfare)
  playFanfare() {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const chords = [
      { notes: [523.25, 659.25, 783.99], time: 0.0, dur: 0.2 },
      { notes: [523.25, 659.25, 783.99], time: 0.25, dur: 0.2 },
      { notes: [523.25, 659.25, 783.99], time: 0.5, dur: 0.2 },
      { notes: [698.46, 880.00, 1046.50], time: 0.8, dur: 0.7 }
    ];

    chords.forEach(c => {
      c.notes.forEach(f => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const start = this.ctx.currentTime + c.time;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, start);

        gain.gain.setValueAtTime(0.2, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + c.dur);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(start);
        osc.stop(start + c.dur);
      });
    });
  }

  // --- Kahoot маягийн синтезатор ая (Lobby & Game BGM) ---
  playLobbyBGM() {
    if (this.muted || this.isBgmPlaying) return;
    this.init();
    if (!this.ctx) return;

    this.isBgmPlaying = true;
    this.bgmStep = 0;

    // Басс ба мелодийн нотууд
    const bassline = [130.81, 130.81, 164.81, 196.00, 174.61, 174.61, 196.00, 220.00];
    const melody = [523.25, 0, 659.25, 0, 783.99, 659.25, 523.25, 0];

    const playNote = () => {
      if (!this.isBgmPlaying || this.muted || !this.ctx) return;

      const now = this.ctx.currentTime;
      const bFreq = bassline[this.bgmStep % bassline.length];
      const mFreq = melody[this.bgmStep % melody.length];

      // Bass beat
      const bOsc = this.ctx.createOscillator();
      const bGain = this.ctx.createGain();
      bOsc.type = 'triangle';
      bOsc.frequency.setValueAtTime(bFreq, now);
      bGain.gain.setValueAtTime(0.12, now);
      bGain.gain.exponentialRampToValueAtTime(0.01, now + 0.16);
      bOsc.connect(bGain);
      bGain.connect(this.ctx.destination);
      bOsc.start(now);
      bOsc.stop(now + 0.18);

      // Melody chirp
      if (mFreq > 0) {
        const mOsc = this.ctx.createOscillator();
        const mGain = this.ctx.createGain();
        mOsc.type = 'sine';
        mOsc.frequency.setValueAtTime(mFreq, now);
        mGain.gain.setValueAtTime(0.06, now);
        mGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        mOsc.connect(mGain);
        mGain.connect(this.ctx.destination);
        mOsc.start(now);
        mOsc.stop(now + 0.15);
      }

      this.bgmStep++;
      this.bgmTimer = setTimeout(playNote, 180); // ~133 BPM
    };

    playNote();
  }

  stopBGM() {
    this.isBgmPlaying = false;
    if (this.bgmTimer) {
      clearTimeout(this.bgmTimer);
      this.bgmTimer = null;
    }
  }
}

// Глобал дууны хөдөлгүүр
const sounds = new SoundEngine();
