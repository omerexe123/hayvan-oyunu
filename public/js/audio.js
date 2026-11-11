/**
 * Hayvan Oyunu - Orijinal Ülke Müzikleri & Ses Motoru (Kernel Seviye Stabil)
 * 5 Ülke x 2 Orijinal MP3 Marş/Müzik Kataloğu + Hayvan SFX
 * "ÖNDE OLANIN ŞARKISI ÇALAR"
 */

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.sfxGain = null;
    this.isMuted = false;
    this.currentTheme = null;
    this.currentTrack = null;
    this.currentTrackName = '';
    this.tempoInterval = true; // game.js uyumluluğu için bayrak
    this.audio = null; // Tek ve merkezi müzik oynatıcı
    this.initialized = false;

    // Her ülke için parça takip indeksi (0 veya 1)
    this.trackIndices = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    // 5 Ülke Orijinal Şarkı Kataloğu
    this.CATALOG = {
      // 1. KÜRDİSTAN (Aslan)
      1: [
        { name: 'Şemmamé', file: 'music/semmame.mp3' },
        { name: 'Herne Pêş', file: 'music/herne_pes.mp3' }
      ],
      // 2. AZERBAYCAN (Kurt)
      2: [
        { name: 'Çırpınırdı Karadeniz', file: 'music/cirpinirdi.mp3' },
        { name: 'Lezginka & Qaytağı', file: 'music/lezginka.mp3' }
      ],
      // 3. TÜRKİYE (Bozkurt)
      3: [
        { name: 'Ölürüm Türkiyem', file: 'music/olurum_turkiyem.mp3' },
        { name: 'Ceddin Deden Mehter', file: 'music/mehter.mp3' }
      ],
      // 4. AFGANİSTAN (Pars)
      4: [
        { name: 'Attan Milli Dansı', file: 'music/attan.mp3' },
        { name: 'Qataghani Mast', file: 'music/qataghani.mp3' }
      ],
      // 5. SURİYE (Kaplan)
      5: [
        { name: 'Suriye Dabke', file: 'music/dabke.mp3' },
        { name: 'Homat el Diyar', file: 'music/homat_el_diyar.mp3' }
      ]
    };
  }

  // Sadece AudioContext ve gain düğümlerini kurar (Asla müzik çalma fonksiyonlarını çağırmaz!)
  init() {
    if (this.initialized) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.setValueAtTime(0.5, this.ctx.currentTime);
        this.sfxGain.connect(this.ctx.destination);
      }
      this.initialized = true;
    } catch (e) {
      console.warn('[SoundEngine] Web Audio init uyarısı:', e.message);
    }
  }

  // Kullanıcı dokunuşunda context'i uyandırır (Döngü veya re-entrancy İÇERMEZ!)
  async ensureContext() {
    if (!this.initialized) this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch (e) {}
    }
    // Eğer müzik durmuşsa ve ses kapalı değilse oynatmayı dene
    if (this.audio && this.audio.paused && !this.isMuted && this.currentTrack) {
      this.audio.play().catch(() => {});
    }
    return this.ctx ? this.ctx.state : null;
  }

  // Mute / Unmute
  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.audio) {
      this.audio.muted = this.isMuted;
      this.audio.volume = this.isMuted ? 0 : 0.85;
      if (!this.isMuted && this.audio.paused && this.currentTrack) {
        this.audio.play().catch(() => {});
      }
    }
    if (this.sfxGain) {
      this.sfxGain.gain.value = this.isMuted ? 0 : 0.5;
    }
    return this.isMuted;
  }

  // -------------------------------------------------------------
  // "ÖNDE OLANIN ŞARKISI ÇALAR" (Dinamik Liderlik Geçiş Motoru)
  // -------------------------------------------------------------
  switchLeaderTheme(laneId) {
    if (!laneId) return { name: '' };
    laneId = Number(laneId);

    const tracks = this.CATALOG[laneId];
    if (!tracks || tracks.length === 0) return { name: '' };

    // Eğer zaten bu lider çalıyorsa ve durmadıysa parçayı bölme, kesintisiz devam etsin
    if (this.currentTheme === laneId && this.audio && !this.audio.paused) {
      return this.currentTrack || tracks[0];
    }

    // Sıradaki parçayı seç
    const trackIdx = this.trackIndices[laneId] % tracks.length;
    const track = tracks[trackIdx];
    this.trackIndices[laneId] = (trackIdx + 1) % tracks.length;

    this.currentTheme = laneId;
    this.currentTrack = track;
    this.currentTrackName = track.name;

    // Şarkıyı ve hayvan efektini başlat
    this.playTrack(track, laneId);
    this.playLaneSfx(laneId);

    return track;
  }

  playTrack(track, laneId) {
    // Eski şarkıyı temizce durdur
    if (this.audio) {
      try {
        this.audio.pause();
        this.audio.onended = null;
        this.audio.src = '';
      } catch (e) {}
    }

    try {
      const audio = new Audio(track.file);
      audio.preload = 'auto';
      audio.volume = this.isMuted ? 0 : 0.85;
      audio.muted = this.isMuted;

      // Şarkı bitince lider değişmediyse sıradaki parçaya geçsin
      audio.onended = () => {
        if (this.currentTheme === laneId && !this.isMuted) {
          this.switchLeaderTheme(laneId);
        }
      };

      this.audio = audio;

      if (!this.isMuted) {
        const p = audio.play();
        if (p !== undefined) {
          p.catch(() => {
            // Autoplay henüz açılmadıysa sessizce unlock tıkını bekle
          });
        }
      }
    } catch (err) {
      console.warn('[SoundEngine] Müzik çalma hatası:', err.message);
    }
  }

  stopCurrentTheme() {
    if (this.audio) {
      try {
        this.audio.pause();
        this.audio.onended = null;
        this.audio.src = '';
      } catch (e) {}
      this.audio = null;
    }
    this.currentTheme = null;
    this.currentTrack = null;
    this.currentTrackName = '';
  }

  // ===========================================================================
  // SFX (HAFİF, KASMAYAN, TEK SEFERLİK SES EFEKTLERİ)
  // Kesinlikle ensureContext çağırmaz, recursive döngüye girmez!
  // ===========================================================================
  playLaneSfx(laneId) {
    if (!this.ctx || this.ctx.state !== 'running' || this.isMuted) return;
    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      switch (laneId) {
        case 3: // Türkiye Bozkurt
        case 2: // Azerbaycan Kurt
          osc.type = 'sine';
          osc.frequency.setValueAtTime(340, t);
          osc.frequency.exponentialRampToValueAtTime(700, t + 0.35);
          osc.frequency.exponentialRampToValueAtTime(300, t + 0.8);
          gain.gain.setValueAtTime(0.01, t);
          gain.gain.linearRampToValueAtTime(0.2, t + 0.2);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
          osc.connect(gain);
          gain.connect(this.sfxGain);
          osc.start(t);
          osc.stop(t + 0.85);
          break;

        case 1: // Kürdistan Aslan
        case 5: // Suriye Kaplan
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(95, t);
          osc.frequency.exponentialRampToValueAtTime(45, t + 0.6);
          gain.gain.setValueAtTime(0.18, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
          osc.connect(gain);
          gain.connect(this.sfxGain);
          osc.start(t);
          osc.stop(t + 0.7);
          break;

        case 4: // Afganistan Pars
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(200, t);
          osc.frequency.exponentialRampToValueAtTime(110, t + 0.45);
          gain.gain.setValueAtTime(0.18, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
          osc.connect(gain);
          gain.connect(this.sfxGain);
          osc.start(t);
          osc.stop(t + 0.55);
          break;
      }
    } catch (e) {}
  }

  playGiftPing() {
    if (!this.ctx || this.ctx.state !== 'running' || this.isMuted) return;
    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(987.77, t); // B5
      osc.frequency.exponentialRampToValueAtTime(1975.53, t + 0.08); // B6
      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.13);
    } catch (e) {}
  }

  playVictoryFanfare() {
    if (!this.ctx || this.ctx.state !== 'running' || this.isMuted) return;
    try {
      const t = this.ctx.currentTime;
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        const start = t + i * 0.12;
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.2, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(start);
        osc.stop(start + 0.26);
      });
    } catch (e) {}
  }

  // Geriye dönük uyumluluk takma adları
  playWolfHowl() { this.playLaneSfx(3); }
  playLionRoar() { this.playLaneSfx(1); }
  playTigerRoar() { this.playLaneSfx(5); }
  playParsRoar() { this.playLaneSfx(4); }
  playSemmame() { this.switchLeaderTheme(1); }
  playHernePes() { this.switchLeaderTheme(1); }
  playCirpinirdi() { this.switchLeaderTheme(2); }
  playLezginka() { this.switchLeaderTheme(2); }
  playOlurumTurkiyem() { this.switchLeaderTheme(3); }
  playMehterTheme() { this.switchLeaderTheme(3); }
  playAttanDance() { this.switchLeaderTheme(4); }
  playQataghani() { this.switchLeaderTheme(4); }
  playDabkeSuri() { this.switchLeaderTheme(5); }
  playHomatElDiyar() { this.switchLeaderTheme(5); }
}

window.soundEngine = new SoundEngine();
