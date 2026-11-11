/**
 * Hayvan Oyunu - Web Audio API Müzik & Ses Motoru
 * 5 ÜLKE x 5 İKONİK MÜZİK (Toplam 25 İkonik Parça)
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
    this.tempoInterval = null;
    this.activeOscillators = [];
    this.initialized = false;

    // Her ülke için parça takip indeksi (0..4 döngüsü)
    this.trackIndices = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

    // 5 Ülke x 5 İkonik Şarkı Kataloğu
    this.CATALOG = {
      // 1. KÜRDİSTAN (Aslan)
      1: [
        { name: 'Şemmamé (Govend / Halay)', fn: 'playSemmame' },
        { name: 'Ey Reqîb (Kürdistan Milli Marşı)', fn: 'playEyReqib' },
        { name: 'Herne Pêş (Şivan Perwer)', fn: 'playHernePes' },
        { name: 'Çerxa Şoreşê (Direniş Marşı)', fn: 'playCerxaSorese' },
        { name: 'Keçkê Dine (Tempolu Halk Dansı)', fn: 'playKeckeDine' }
      ],
      // 2. AZERBAYCAN (Kurt)
      2: [
        { name: 'Çırpınırdı Karadeniz', fn: 'playCirpinirdi' },
        { name: 'Lezginka & Qaytağı (Kafkas Dansı)', fn: 'playLezginka' },
        { name: 'Yaşa Yaşa Azerbaycan', fn: 'playYasaAzerbaycan' },
        { name: 'Azerbaycan Milli Marşı', fn: 'playAzeriMilliMars' },
        { name: 'Esger Marşı (Cenab Leytenant)', fn: 'playEsgerMarsi' }
      ],
      // 3. TÜRKİYE (Bozkurt)
      3: [
        { name: 'Ölürüm Türkiyem (Mustafa Yıldızdoğan)', fn: 'playOlurumTurkiyem' },
        { name: 'Ceddin Deden (Mehter Marşı)', fn: 'playMehterTheme' },
        { name: 'İzmir Marşı (Yaşa Mustafa Kemal Paşa)', fn: 'playIzmirMarsi' },
        { name: 'Dombıra (Bozkurtlar Marşı)', fn: 'playDombira' },
        { name: 'Plevne Marşı (Tuna Nehri Akmam Diyor)', fn: 'playPlevneMarsi' }
      ],
      // 4. AFGANİSTAN (Pars)
      4: [
        { name: 'Attan Savaş Dansı (Milli Afgan Dansı)', fn: 'playAttanDance' },
        { name: 'Da Zamong Zeba Watan (Vatan Marşı)', fn: 'playZebaWatan' },
        { name: 'Qataghani (Hızlı Dombra & Dutar)', fn: 'playQataghani' },
        { name: 'Beparwa (Ahmed Zahir Klasiği)', fn: 'playBeparwa' },
        { name: 'Logari Rubab & Tabla Ritmi', fn: 'playLogari' }
      ],
      // 5. SURİYE (Kaplan)
      5: [
        { name: 'Dabke Suri (Şam & Halep Halayı)', fn: 'playDabkeSuri' },
        { name: 'Homat el Diyar (Suriye Milli Marşı)', fn: 'playHomatElDiyar' },
        { name: 'Mawtini (Vatanım Özgürlük Marşı)', fn: 'playMawtini' },
        { name: 'Ya Heyf (Samih Choukeir)', fn: 'playYaHeyf' },
        { name: 'Halep Muvaşşah & Zourouni', fn: 'playHalepMuwashahat' }
      ]
    };
  }

  init() {
    if (this.initialized) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.setValueAtTime(0.75, this.ctx.currentTime);
      this.musicGain.connect(this.ctx.destination);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(0.65, this.ctx.currentTime);
      this.sfxGain.connect(this.ctx.destination);

      this.ctx.onstatechange = () => {
        console.log('[SoundEngine] AudioContext durumu:', this.ctx.state);
        if (this.ctx.state === 'running' && this.currentTheme && !this.tempoInterval && !this.isMuted) {
          this.playThemeForLane(this.currentTheme);
        }
      };

      this.initialized = true;
      console.log('[SoundEngine] Web Audio API ve 25 Şarkılık Müzik Kataloğu Aktif.');
    } catch (e) {
      console.warn('[SoundEngine] Web Audio başlatılamadı:', e.message);
    }
  }

  async ensureContext() {
    if (!this.initialized) this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
        console.log('[SoundEngine] AudioContext başarıyla aktifleştirildi (running).');
      } catch (e) {
        console.warn('[SoundEngine] AudioContext resume bekliyor (kullanıcı etkileşimi gerekli):', e.message);
      }
    }
    return this.ctx ? this.ctx.state : null;
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.musicGain) {
      this.musicGain.gain.value = this.isMuted ? 0 : 0.75;
    }
    if (this.sfxGain) {
      this.sfxGain.gain.value = this.isMuted ? 0 : 0.65;
    }
    if (!this.isMuted && this.currentTheme && !this.tempoInterval) {
      this.playThemeForLane(this.currentTheme);
    }
    return this.isMuted;
  }

  // -------------------------------------------------------------
  // "ÖNDE OLANIN ŞARKISI ÇALAR" (Dinamik 5 Şarkılık Geçiş Motoru)
  // -------------------------------------------------------------
  switchLeaderTheme(laneId) {
    this.ensureContext();
    if (this.isMuted) return { name: '' };

    const tracks = this.CATALOG[laneId];
    if (!tracks || tracks.length === 0) return { name: '' };

    // Eğer aynı lider devam ediyorsa ve müzik çalıyorsa bölme
    if (this.currentTheme === laneId && this.tempoInterval) {
      const currentTrackIdx = Math.max(0, (this.trackIndices[laneId] - 1 + tracks.length) % tracks.length);
      return tracks[currentTrackIdx] || tracks[0];
    }

    const trackIdx = this.trackIndices[laneId] % tracks.length;
    const track = tracks[trackIdx];
    this.trackIndices[laneId] = (trackIdx + 1) % tracks.length;

    this.currentTheme = laneId;
    this.currentTrackName = track.name;
    this.stopCurrentTheme();

    if (this.ctx && this.ctx.state === 'running') {
      this.playThemeForLane(laneId, track);
    } else {
      console.log(`[SoundEngine] ${track.name} lider parçası sıraya alındı, ses kilidinin açılması bekleniyor.`);
    }

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

    this.stopCurrentTheme();

    // Hayvan Kükremesi / Uluması
    switch (laneId) {
      case 3: this.playWolfHowl(); break;
      case 2: this.playWolfHowl(true); break;
      case 1: this.playLionRoar(); break;
      case 4: this.playParsRoar(); break;
      case 5: this.playTigerRoar(); break;
    }

    // Seçilen parçayı çal
    if (typeof this[track.fn] === 'function') {
      console.log(`[SoundEngine] 🎵 Çalıyor: ${track.name} (${track.fn})`);
      this[track.fn]();
    } else {
      console.log(`[SoundEngine] Varsayılan sentezleyici devreye girdi (Kulvar ${laneId})`);
      this.playDefaultSynth(laneId);
    }
  }

  playDefaultSynth(laneId) {
    const scales = {
      1: [330, 392, 440, 494, 523],
      2: [294, 330, 370, 440, 494],
      3: [440, 494, 523, 587, 659],
      4: [261, 294, 330, 392, 440],
      5: [330, 349, 415, 440, 494]
    };
    const notes = scales[laneId] || scales[3];
    let step = 0;
    this.tempoInterval = setInterval(() => {
      if (this.isMuted) return;
      const freq = notes[step % notes.length];
      this.playSynthNote(freq, 'sawtooth', 0.22, 0.24);
      if (step % 2 === 0) this.playBassDrum();
      step++;
    }, 240);
  }

  stopCurrentTheme() {
    if (this.tempoInterval) {
      clearInterval(this.tempoInterval);
      this.tempoInterval = null;
    }
    this.activeOscillators.forEach(osc => {
      try { osc.stop(); osc.disconnect(); } catch (e) {}
    });
    this.activeOscillators = [];
  }

  // ===========================================================================
  // TÜRKİYE (5 İKONİK PARÇA)
  // ===========================================================================

  // 1. Ölürüm Türkiyem (Mustafa Yıldızdoğan)
  playOlurumTurkiyem() {
    const notes = [
      440.00, 493.88, 523.25, 493.88, 440.00, 392.00, 440.00, 493.88,
      440.00, 392.00, 349.23, 329.63, 349.23, 392.00, 440.00, 440.00
    ];
    let step = 0;
    this.tempoInterval = setInterval(() => {
      if (this.isMuted) return;
      const freq = notes[step % notes.length];
      this.playSynthNote(freq, 'sawtooth', 0.14, 0.24);
      if (step % 2 === 0) this.playBassDrum();
      step++;
    }, 240);
  }

  // 2. Ceddin Deden / Mehter Hücum Marşı
  playMehterTheme() {
    const notes = [
      293.66, 329.63, 349.23, 392.00, 440.00, 392.00, 349.23, 293.66,
      349.23, 392.00, 440.00, 523.25, 440.00, 392.00, 349.23, 293.66
    ];
    let step = 0;
    this.tempoInterval = setInterval(() => {
      if (this.isMuted) return;
      const freq = notes[step % notes.length];
      this.playSynthNote(freq, 'sawtooth', 0.15, 0.28);
      if (step % 2 === 0) this.playBassDrum();
      step++;
    }, 280);
  }

  // 3. İzmir Marşı (Yaşa Mustafa Kemal Paşa Yaşa)
  playIzmirMarsi() {
    const notes = [
      329.63, 392.00, 523.25, 493.88, 440.00, 392.00, 349.23, 392.00, 329.63,
      523.25, 523.25, 587.33, 523.25, 493.88, 440.00, 392.00
    ];
    let step = 0;
    this.tempoInterval = setInterval(() => {
      if (this.isMuted) return;
      const freq = notes[step % notes.length];
      this.playSynthNote(freq, 'triangle', 0.16, 0.22);
      if (step % 2 === 0) this.playBassDrum();
      if (step % 4 === 2) this.playSnareHit(200, 0.08);
      step++;
    }, 220);
  }

  // 4. Dombıra (Bozkurtlar Marşı)
  playDombira() {
    const notes = [
      293.66, 293.66, 293.66, 349.23, 329.63, 293.66, 261.63, 293.66,
      349.23, 349.23, 392.00, 349.23, 329.63, 293.66
    ];
    let step = 0;
    this.tempoInterval = setInterval(() => {
      if (this.isMuted) return;
      const freq = notes[step % notes.length];
      this.playSynthNote(freq, 'sawtooth', 0.16, 0.16);
      this.playSnareHit(160, 0.06);
      step++;
    }, 180);
  }

  // 5. Plevne Marşı (Tuna Nehri Akmam Diyor)
  playPlevneMarsi() {
    const notes = [
      293.66, 440.00, 392.00, 349.23, 329.63, 349.23, 293.66,
      440.00, 440.00, 523.25, 493.88, 440.00, 392.00
    ];
    let step = 0;
    this.tempoInterval = setInterval(() => {
      if (this.isMuted) return;
      const freq = notes[step % notes.length];
      this.playSynthNote(freq, 'sawtooth', 0.14, 0.32);
      if (step % 2 === 0) this.playBassDrum();
      step++;
    }, 310);
  }

  // ===========================================================================
  // AZERBAYCAN (5 İKONİK PARÇA)
  // ===========================================================================

  // 1. Çırpınırdı Karadeniz
  playCirpinirdi() {
    const notes = [
      440.00, 523.25, 493.88, 440.00, 415.30, 440.00, 493.88, 523.25, 493.88,
      440.00, 392.00, 349.23, 440.00, 392.00, 329.63
    ];
    let step = 0;
    this.tempoInterval = setInterval(() => {
      if (this.isMuted) return;
      const freq = notes[step % notes.length];
      this.playSynthNote(freq, 'triangle', 0.16, 0.28);
      if (step % 3 === 0) this.playBassDrum();
      step++;
    }, 260);
  }

  // 2. Lezginka & Qaytağı (Hızlı Kafkas Dansı)
  playLezginka() {
    const notes = [
      440.00, 493.88, 523.25, 587.33, 659.25, 587.33, 523.25, 493.88,
      440.00, 523.25, 659.25, 523.25
    ];
    let step = 0;
    this.tempoInterval = setInterval(() => {
      if (this.isMuted) return;
      const freq = notes[step % notes.length];
      this.playSynthNote(freq, 'triangle', 0.15, 0.18);
      if (step % 2 === 1) this.playSnareHit(180, 0.08);
      step++;
    }, 190);
  }

  // 3. Yaşa Yaşa Azerbaycan
  playYasaAzerbaycan() {
    const notes = [
      293.66, 369.99, 440.00, 493.88, 440.00, 392.00, 369.99, 329.63, 293.66,
      440.00, 493.88, 554.37, 587.33
    ];
    let step = 0;
    this.tempoInterval = setInterval(() => {
      if (this.isMuted) return;
      const freq = notes[step % notes.length];
      this.playSynthNote(freq, 'sawtooth', 0.14, 0.22);
      if (step % 2 === 0) this.playBassDrum();
      step++;
    }, 220);
  }

  // 4. Azerbaycan Milli Marşı
  playAzeriMilliMars() {
    const notes = [
      261.63, 392.00, 329.63, 392.00, 523.25, 493.88, 440.00, 392.00,
      349.23, 392.00, 440.00, 329.63
    ];
    let step = 0;
    this.tempoInterval = setInterval(() => {
      if (this.isMuted) return;
      const freq = notes[step % notes.length];
      this.playSynthNote(freq, 'sawtooth', 0.16, 0.32);
      if (step % 2 === 0) this.playBassDrum();
      step++;
    }, 300);
  }

  // 5. Esger Marşı (Cenab Leytenant)
  playEsgerMarsi() {
    const notes = [
      329.63, 392.00, 440.00, 493.88, 440.00, 392.00, 349.23, 329.63,
      392.00, 440.00, 523.25, 493.88, 440.00
    ];
    let step = 0;
    this.tempoInterval = setInterval(() => {
      if (this.isMuted) return;
      const freq = notes[step % notes.length];
      this.playSynthNote(freq, 'sawtooth', 0.15, 0.25);
      if (step % 2 === 0) this.playBassDrum();
      step++;
    }, 250);
  }

  // ===========================================================================
  // KÜRDİSTAN (5 İKONİK PARÇA)
  // ===========================================================================

  // 1. Şemmamé (Govend / Halay)
  playSemmame() {
    const notes = [
      293.66, 349.23, 392.00, 349.23, 293.66, 349.23, 392.00, 440.00, 392.00, 349.23,
      440.00, 392.00, 349.23, 329.63, 293.66
    ];
    let step = 0;
    this.tempoInterval = setInterval(() => {
      if (this.isMuted) return;
      const freq = notes[step % notes.length];
      this.playSynthNote(freq, 'sawtooth', 0.16, 0.17);
      if (step % 2 === 0) this.playBassDrum();
      if (step % 2 === 1) this.playSnareHit(240, 0.08); // Erbane vuruşu
      step++;
    }, 180);
  }

  // 2. Ey Reqîb (Milli Marş)
  playEyReqib() {
    const notes = [
      261.63, 329.63, 392.00, 392.00, 440.00, 392.00, 349.23, 329.63, 293.66, 261.63,
      329.63, 392.00, 523.25, 440.00, 392.00
    ];
    let step = 0;
    this.tempoInterval = setInterval(() => {
      if (this.isMuted) return;
      const freq = notes[step % notes.length];
      this.playSynthNote(freq, 'sawtooth', 0.15, 0.32);
      if (step % 2 === 0) this.playBassDrum();
      step++;
    }, 320);
  }

  // 3. Herne Pêş (Şivan Perwer)
  playHernePes() {
    const notes = [
      293.66, 329.63, 349.23, 392.00, 349.23, 329.63, 293.66, 261.63, 293.66,
      349.23, 392.00, 440.00, 392.00, 349.23
    ];
    let step = 0;
    this.tempoInterval = setInterval(() => {
      if (this.isMuted) return;
      const freq = notes[step % notes.length];
      this.playSynthNote(freq, 'triangle', 0.16, 0.24);
      if (step % 2 === 0) this.playBassDrum();
      step++;
    }, 240);
  }

  // 4. Çerxa Şoreşê
  playCerxaSorese() {
    const notes = [
      440.00, 493.88, 523.25, 493.88, 440.00, 392.00, 440.00,
      523.25, 587.33, 523.25, 493.88, 440.00
    ];
    let step = 0;
    this.tempoInterval = setInterval(() => {
      if (this.isMuted) return;
      const freq = notes[step % notes.length];
      this.playSynthNote(freq, 'sawtooth', 0.15, 0.25);
      if (step % 2 === 0) this.playBassDrum();
      step++;
    }, 250);
  }

  // 5. Keçkê Dine
  playKeckeDine() {
    const notes = [
      329.63, 349.23, 392.00, 440.00, 392.00, 349.23, 329.63, 293.66, 329.63,
      392.00, 440.00, 523.25, 440.00, 392.00
    ];
    let step = 0;
    this.tempoInterval = setInterval(() => {
      if (this.isMuted) return;
      const freq = notes[step % notes.length];
      this.playSynthNote(freq, 'triangle', 0.15, 0.19);
      if (step % 2 === 1) this.playSnareHit(200, 0.08);
      step++;
    }, 200);
  }

  // ===========================================================================
  // AFGANİSTAN (5 İKONİK PARÇA)
  // ===========================================================================

  // 1. Attan Savaş Dansı (Milli Afgan Dansı)
  playAttanDance() {
    const notes = [
      392.00, 440.00, 493.88, 587.33, 493.88, 440.00, 392.00, 329.63, 392.00,
      493.88, 587.33, 659.25, 587.33
    ];
    let step = 0;
    this.tempoInterval = setInterval(() => {
      if (this.isMuted) return;
      const freq = notes[step % notes.length];
      this.playSynthNote(freq, 'triangle', 0.16, 0.18);
      // Çift Tabla Vuruşu
      if (step % 2 === 0) this.playBassDrum();
      if (step % 4 === 3) this.playSnareHit(140, 0.08);
      step++;
    }, 190);
  }

  // 2. Da Zamong Zeba Watan (Vatan Marşı)
  playZebaWatan() {
    const notes = [
      293.66, 349.23, 392.00, 440.00, 523.25, 440.00, 392.00, 349.23, 293.66,
      392.00, 440.00, 523.25, 587.33, 523.25
    ];
    let step = 0;
    this.tempoInterval = setInterval(() => {
      if (this.isMuted) return;
      const freq = notes[step % notes.length];
      this.playSynthNote(freq, 'sawtooth', 0.15, 0.28);
      if (step % 2 === 0) this.playBassDrum();
      step++;
    }, 270);
  }

  // 3. Qataghani (Kuzey Afganistan Dombra Ritmi)
  playQataghani() {
    const notes = [
      293.66, 329.63, 349.23, 440.00, 392.00, 349.23, 329.63, 293.66, 261.63, 293.66,
      349.23, 440.00, 523.25, 440.00
    ];
    let step = 0;
    this.tempoInterval = setInterval(() => {
      if (this.isMuted) return;
      const freq = notes[step % notes.length];
      this.playSynthNote(freq, 'sawtooth', 0.16, 0.16);
      this.playSnareHit(170, 0.06);
      step++;
    }, 175);
  }

  // 4. Beparwa (Ahmed Zahir Klasiği)
  playBeparwa() {
    const notes = [
      440.00, 523.25, 493.88, 440.00, 392.00, 349.23, 392.00, 440.00,
      523.25, 493.88, 440.00, 349.23, 329.63
    ];
    let step = 0;
    this.tempoInterval = setInterval(() => {
      if (this.isMuted) return;
      const freq = notes[step % notes.length];
      this.playSynthNote(freq, 'triangle', 0.15, 0.24);
      if (step % 2 === 0) this.playBassDrum();
      step++;
    }, 240);
  }

  // 5. Logari Rubab Ritmi
  playLogari() {
    const notes = [
      329.63, 392.00, 440.00, 493.88, 523.25, 493.88, 440.00, 392.00,
      440.00, 493.88, 587.33, 493.88
    ];
    let step = 0;
    this.tempoInterval = setInterval(() => {
      if (this.isMuted) return;
      const freq = notes[step % notes.length];
      this.playSynthNote(freq, 'triangle', 0.16, 0.19);
      if (step % 2 === 1) this.playSnareHit(210, 0.07);
      step++;
    }, 200);
  }

  // ===========================================================================
  // SURİYE (5 İKONİK PARÇA)
  // ===========================================================================

  // 1. Dabke Suri (Şam & Halep Hızlı Halay)
  playDabkeSuri() {
    const notes = [
      293.66, 349.23, 392.00, 415.30, 392.00, 349.23, 293.66, 261.63, 293.66,
      349.23, 392.00, 440.00, 415.30, 392.00
    ];
    let step = 0;
    this.tempoInterval = setInterval(() => {
      if (this.isMuted) return;
      const freq = notes[step % notes.length];
      this.playSynthNote(freq, 'sawtooth', 0.17, 0.17);
      // Ağır Darbuka & Def
      if (step % 2 === 0) this.playBassDrum();
      if (step % 2 === 1) this.playSnareHit(260, 0.08);
      step++;
    }, 180);
  }

  // 2. Homat el Diyar (Suriye Milli Marşı)
  playHomatElDiyar() {
    const notes = [
      261.63, 392.00, 440.00, 493.88, 523.25, 392.00, 329.63, 261.63,
      392.00, 440.00, 523.25, 587.33, 523.25
    ];
    let step = 0;
    this.tempoInterval = setInterval(() => {
      if (this.isMuted) return;
      const freq = notes[step % notes.length];
      this.playSynthNote(freq, 'sawtooth', 0.16, 0.32);
      if (step % 2 === 0) this.playBassDrum();
      step++;
    }, 310);
  }

  // 3. Mawtini (Vatanım Özgürlük Marşı)
  playMawtini() {
    const notes = [
      293.66, 349.23, 392.00, 440.00, 392.00, 349.23, 329.63, 293.66,
      349.23, 329.63, 293.66, 261.63, 293.66
    ];
    let step = 0;
    this.tempoInterval = setInterval(() => {
      if (this.isMuted) return;
      const freq = notes[step % notes.length];
      this.playSynthNote(freq, 'triangle', 0.16, 0.28);
      if (step % 2 === 0) this.playBassDrum();
      step++;
    }, 280);
  }

  // 4. Ya Heyf (Samih Choukeir)
  playYaHeyf() {
    const notes = [
      440.00, 493.88, 523.25, 493.88, 440.00, 392.00, 349.23, 329.63,
      349.23, 392.00, 440.00, 349.23
    ];
    let step = 0;
    this.tempoInterval = setInterval(() => {
      if (this.isMuted) return;
      const freq = notes[step % notes.length];
      this.playSynthNote(freq, 'triangle', 0.15, 0.24);
      if (step % 2 === 0) this.playBassDrum();
      step++;
    }, 250);
  }

  // 5. Halep Muvaşşah & Zourouni
  playHalepMuwashahat() {
    const notes = [
      293.66, 329.63, 349.23, 392.00, 349.23, 329.63, 277.18, 293.66,
      349.23, 392.00, 440.00, 392.00
    ];
    let step = 0;
    this.tempoInterval = setInterval(() => {
      if (this.isMuted) return;
      const freq = notes[step % notes.length];
      this.playSynthNote(freq, 'sawtooth', 0.15, 0.25);
      if (step % 2 === 0) this.playBassDrum();
      step++;
    }, 260);
  }

  // ===========================================================================
  // SES SENTEZLEYİCİ YARDIMCILARI (NOTE, DRUM, SFX)
  // ===========================================================================

  playSynthNote(freq, type, gainLevel, dur) {
    if (!this.ctx || this.ctx.state !== 'running' || this.isMuted) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      const t = this.ctx.currentTime;
      osc.frequency.setValueAtTime(freq, t);

      // Daha tok ve duyulur ses seviyesi
      const actualGain = Math.min(gainLevel * 1.5, 0.45);
      gain.gain.setValueAtTime(actualGain, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

      osc.connect(gain);
      gain.connect(this.musicGain);

      osc.start(t);
      osc.stop(t + dur + 0.05);
      this.activeOscillators.push(osc);
      setTimeout(() => {
        const idx = this.activeOscillators.indexOf(osc);
        if (idx !== -1) this.activeOscillators.splice(idx, 1);
      }, (dur + 0.1) * 1000);
    } catch (e) {
      console.warn('[SoundEngine] playSynthNote uyarısı:', e.message);
    }
  }

  playBassDrum() {
    if (!this.ctx || this.ctx.state !== 'running' || this.isMuted) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      const t = this.ctx.currentTime;
      osc.frequency.setValueAtTime(140, t);
      osc.frequency.exponentialRampToValueAtTime(35, t + 0.18);
      gain.gain.setValueAtTime(0.55, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.19);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.2);
    } catch (e) {}
  }

  playSnareHit(freq = 180, dur = 0.08) {
    if (!this.ctx || this.ctx.state !== 'running' || this.isMuted) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      const t = this.ctx.currentTime;
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(60, t + dur);
      gain.gain.setValueAtTime(0.25, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + dur + 0.02);
    } catch (e) {}
  }

  playGiftPing() {
    this.ensureContext();
    if (!this.ctx || this.isMuted) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      const t = this.ctx.currentTime;
      osc.frequency.setValueAtTime(880, t);
      osc.frequency.exponentialRampToValueAtTime(1760, t + 0.12);
      gain.gain.setValueAtTime(0.3, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.38);
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
      osc.frequency.setValueAtTime(240, t);
      osc.frequency.linearRampToValueAtTime(isShort ? 460 : 540, t + 0.35);
      osc.frequency.exponentialRampToValueAtTime(280, t + (isShort ? 1.0 : 1.4));
      gain.gain.setValueAtTime(0.01, t);
      gain.gain.linearRampToValueAtTime(0.26, t + 0.25);
      gain.gain.exponentialRampToValueAtTime(0.001, t + (isShort ? 1.0 : 1.4));
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + (isShort ? 1.05 : 1.45));
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
  }
}

window.soundEngine = new SoundEngine();
