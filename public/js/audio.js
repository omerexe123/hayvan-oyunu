/**
 * Hayvan Oyunu - Orijinal Ülke Müzikleri & Ses Motoru
 * Her ülke için orijinal MP3 müzik kataloğu + Hayvan SFX
 * "ÖNDE OLANIN ŞARKISI ÇALAR"
 */

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.isMuted = false;
    this.currentTheme = null;
    this.currentTrackName = '';
    this.musicGain = null;
    this.sfxGain = null;
    this.tempoInterval = null; // game.js uyumluluğu için bayrak
    this.activeOscillators = [];
    this.initialized = false;
    this.currentAudio = null;
    this.audioCache = {};

    // Her ülke için parça takip indeksi
    this.trackIndices = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    // 5 Ülke Orijinal Şarkı Kataloğu (Gerçek MP3 Müzikler)
    this.CATALOG = {
      // 1. KÜRDİSTAN (Aslan)
      1: [
        { name: 'Şemmamé (İbrahim Tatlıses)', file: 'music/semmame.mp3', fn: 'playSemmame' },
        { name: 'Herne Pêş (Şivan Perwer)', file: 'music/herne_pes.mp3', fn: 'playHernePes' }
      ],
      // 2. AZERBAYCAN (Kurt)
      2: [
        { name: 'Çırpınırdı Karadeniz (Azerin)', file: 'music/cirpinirdi.mp3', fn: 'playCirpinirdi' },
        { name: 'Lezginka & Qaytağı (Kafkas Dansı)', file: 'music/lezginka.mp3', fn: 'playLezginka' }
      ],
      // 3. TÜRKİYE (Bozkurt)
      3: [
        { name: 'Ölürüm Türkiyem (Mustafa Yıldızdoğan)', file: 'music/olurum_turkiyem.mp3', fn: 'playOlurumTurkiyem' },
        { name: 'Ceddin Deden (Mehter Marşı)', file: 'music/mehter.mp3', fn: 'playMehterTheme' }
      ],
      // 4. AFGANİSTAN (Pars)
      4: [
        { name: 'Attan Savaş & Zafer Dansı', file: 'music/attan.mp3', fn: 'playAttanDance' },
        { name: 'Qataghani Mast (Afgan Rubab & Dambura)', file: 'music/qataghani.mp3', fn: 'playQataghani' }
      ],
      // 5. SURİYE (Kaplan)
      5: [
        { name: 'Dabke Suri (Suriye Halayı)', file: 'music/dabke.mp3', fn: 'playDabkeSuri' },
        { name: 'Homat el Diyar (Suriye Milli Marşı)', file: 'music/homat_el_diyar.mp3', fn: 'playHomatElDiyar' }
      ]
    };

    this.preloadCatalog();
  }

  preloadCatalog() {
    try {
      for (const laneId in this.CATALOG) {
        this.CATALOG[laneId].forEach(track => {
          const audio = new Audio();
          audio.preload = 'auto';
          audio.src = track.file;
          this.audioCache[track.file] = audio;
        });
      }
    } catch (e) {
      console.warn('[SoundEngine] Müzik önbelleğe alma uyarısı:', e);
    }
  }

  init() {
    if (this.initialized) return;
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
        this.musicGain = this.ctx.createGain();
        this.musicGain.gain.setValueAtTime(0.75, this.ctx.currentTime);
        this.musicGain.connect(this.ctx.destination);

        this.sfxGain = this.ctx.createGain();
        this.sfxGain.gain.setValueAtTime(0.65, this.ctx.currentTime);
        this.sfxGain.connect(this.ctx.destination);
      }
      this.initialized = true;
      console.log('[SoundEngine] Orijinal ülke müzikleri ve ses motoru hazır.');
    } catch (e) {
      console.warn('[SoundEngine] Ses motoru başlatılamadı:', e.message);
    }
  }

  async ensureContext() {
    if (!this.initialized) this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
        console.log('[SoundEngine] AudioContext aktif.');
      } catch (e) {
        console.warn('[SoundEngine] AudioContext resume bekleniyor:', e.message);
      }
    }
    if (this.currentTheme && (!this.currentAudio || this.currentAudio.paused) && !this.isMuted) {
      this.playThemeForLane(this.currentTheme);
    }
    return this.ctx ? this.ctx.state : null;
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.currentAudio) {
      this.currentAudio.volume = this.isMuted ? 0 : 0.85;
    }
    if (this.musicGain) {
      this.musicGain.gain.value = this.isMuted ? 0 : 0.75;
    }
    if (this.sfxGain) {
      this.sfxGain.gain.value = this.isMuted ? 0 : 0.65;
    }
    if (!this.isMuted && this.currentTheme && (!this.currentAudio || this.currentAudio.paused)) {
      this.playThemeForLane(this.currentTheme);
    }
    return this.isMuted;
  }

  // -------------------------------------------------------------
  // "ÖNDE OLANIN ŞARKISI ÇALAR" (Dinamik Liderlik Geçiş Motoru)
  // -------------------------------------------------------------
  switchLeaderTheme(laneId) {
    this.ensureContext();
    if (this.isMuted) return { name: '' };

    const tracks = this.CATALOG[laneId];
    if (!tracks || tracks.length === 0) return { name: '' };

    // Eğer lider aynıysa ve şarkı kesilmeden çalıyorsa parçayı bölme
    if (this.currentTheme === laneId && this.currentAudio && !this.currentAudio.paused) {
      const currentTrackIdx = Math.max(0, (this.trackIndices[laneId] - 1 + tracks.length) % tracks.length);
      return tracks[currentTrackIdx] || tracks[0];
    }

    const trackIdx = this.trackIndices[laneId] % tracks.length;
    const track = tracks[trackIdx];
    this.trackIndices[laneId] = (trackIdx + 1) % tracks.length;

    this.currentTheme = laneId;
    this.currentTrackName = track.name;

    this.playThemeForLane(laneId, track);
    return track;
  }

  playThemeForLane(laneId, track = null) {
    if (this.isMuted) return;
    if (!track) {
      const tracks = this.CATALOG[laneId] || [];
      const trackIdx = Math.max(0, (this.trackIndices[laneId] - 1 + tracks.length) % tracks.length);
      track = tracks[trackIdx] || tracks[0];
    }
    if (!track) return;

    this.currentTrackName = track.name;

    // Hayvan Kükremesi / Uluması SFX
    switch (laneId) {
      case 3: this.playWolfHowl(); break;
      case 2: this.playWolfHowl(true); break;
      case 1: this.playLionRoar(); break;
      case 4: this.playParsRoar(); break;
      case 5: this.playTigerRoar(); break;
    }

    // Orijinal MP3 şarkıyı çal
    this.playOriginalTrack(track, laneId);
  }

  playOriginalTrack(track, laneId) {
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch (e) {}
    }

    let audio = this.audioCache[track.file];
    if (!audio) {
      audio = new Audio(track.file);
      this.audioCache[track.file] = audio;
    }

    audio.volume = this.isMuted ? 0 : 0.85;
    audio.currentTime = 0;

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          console.log(`[SoundEngine] 🎵 Çalıyor: ${track.name} (${track.file})`);
        })
        .catch(err => {
          console.warn('[SoundEngine] Otomatik oynatma engeli (kullanıcı dokunuşu bekleniyor):', err.message);
        });
    }

    this.currentAudio = audio;
    this.tempoInterval = true; // game.js kontrolü için

    audio.onended = () => {
      // Şarkı bitince sıradaki parçaya otomatik geçiş yap
      if (this.currentTheme === laneId && !this.isMuted) {
        const tracks = this.CATALOG[laneId];
        const nextIdx = this.trackIndices[laneId] % tracks.length;
        const nextTrack = tracks[nextIdx];
        this.trackIndices[laneId] = (nextIdx + 1) % tracks.length;
        this.currentTrackName = nextTrack.name;
        this.playOriginalTrack(nextTrack, laneId);
      }
    };
  }

  stopCurrentTheme() {
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch (e) {}
      this.currentAudio = null;
    }
    this.tempoInterval = null;
    this.activeOscillators.forEach(osc => {
      try { osc.stop(); osc.disconnect(); } catch (e) {}
    });
    this.activeOscillators = [];
  }

  // ===========================================================================
  // SFX (SES EFEKTLERİ: KÜKREME, ULUMA, HEDİYE PİNG, ZAFER FANFARI)
  // ===========================================================================
  playGiftPing() {
    this.ensureContext();
    if (!this.ctx || this.isMuted) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      const t = this.ctx.currentTime;
      osc.frequency.setValueAtTime(880, t);
      osc.frequency.exponentialRampToValueAtTime(1760, t + 0.12);
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.16);
    } catch (e) {}
  }

  playWolfHowl(isShort = false) {
    this.ensureContext();
    if (!this.ctx || this.isMuted) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      const t = this.ctx.currentTime;
      const dur = isShort ? 0.9 : 1.4;
      osc.frequency.setValueAtTime(320, t);
      osc.frequency.exponentialRampToValueAtTime(680, t + dur * 0.4);
      osc.frequency.exponentialRampToValueAtTime(260, t + dur);
      gain.gain.setValueAtTime(0.01, t);
      gain.gain.linearRampToValueAtTime(0.35, t + dur * 0.25);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    } catch (e) {}
  }

  playLionRoar() {
    this.ensureContext();
    if (!this.ctx || this.isMuted) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      const t = this.ctx.currentTime;
      osc.frequency.setValueAtTime(90, t);
      osc.frequency.exponentialRampToValueAtTime(45, t + 0.9);
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.95);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 1.0);
    } catch (e) {}
  }

  playTigerRoar() {
    this.ensureContext();
    if (!this.ctx || this.isMuted) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      const t = this.ctx.currentTime;
      osc.frequency.setValueAtTime(110, t);
      osc.frequency.exponentialRampToValueAtTime(60, t + 0.8);
      gain.gain.setValueAtTime(0.26, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.85);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.9);
    } catch (e) {}
  }

  playParsRoar() {
    this.ensureContext();
    if (!this.ctx || this.isMuted) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      const t = this.ctx.currentTime;
      osc.frequency.setValueAtTime(220, t);
      osc.frequency.exponentialRampToValueAtTime(120, t + 0.5);
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.6);
    } catch (e) {}
  }

  playVictoryFanfare() {
    this.ensureContext();
    if (!this.ctx || this.isMuted) return;
    this.stopCurrentTheme();
    try {
      const fanfareNotes = [
        { f: 523.25, d: 0.2 }, { f: 523.25, d: 0.2 }, { f: 523.25, d: 0.2 },
        { f: 659.25, d: 0.6 }, { f: 587.33, d: 0.3 }, { f: 783.99, d: 1.2 }
      ];
      let time = this.ctx.currentTime;
      fanfareNotes.forEach(n => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(n.f, time);
        gain.gain.setValueAtTime(0.3, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + n.d);
        osc.connect(gain);
        gain.connect(this.sfxGain);
        osc.start(time);
        osc.stop(time + n.d + 0.05);
        time += n.d;
      });
    } catch (e) {}
  }

  // Geriye dönük uyumluluk için katalog fonksiyon çağrıları
  playSemmame() { this.playThemeForLane(1); }
  playHernePes() { this.playThemeForLane(1); }
  playCirpinirdi() { this.playThemeForLane(2); }
  playLezginka() { this.playThemeForLane(2); }
  playOlurumTurkiyem() { this.playThemeForLane(3); }
  playMehterTheme() { this.playThemeForLane(3); }
  playAttanDance() { this.playThemeForLane(4); }
  playQataghani() { this.playThemeForLane(4); }
  playDabkeSuri() { this.playThemeForLane(5); }
  playHomatElDiyar() { this.playThemeForLane(5); }
}

window.soundEngine = new SoundEngine();
