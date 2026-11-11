/**
 * Hayvan Oyunu - Ana Oyun Motoru (TikTok Canlı Yayın Yarışı)
 * 5 Kulvar + Canlı Hediyeler + "Önde Olanın Şarkısı Çalar" + 60 FPS
 */

class AnimalRaceGame {
  constructor() {
    this.ws = null;
    this.gameState = null;
    this.lanes = [];
    this.animalElements = {};
    this.trackElements = {};
    this.confettiCanvas = null;
    this.confettiCtx = null;
    this.confettiParticles = [];
    this.isMuted = false;
    this.isObs = false;

    this.init();
  }

  init() {
    // OBS Modu Kontrolü (?obs=1)
    const urlParams = new URLSearchParams(window.location.search);
    this.isObs = urlParams.get('obs') === '1';
    if (this.isObs) {
      document.body.classList.add('obs-mode');
    }

    this.confettiCanvas = document.getElementById('confetti-canvas');
    if (this.confettiCanvas) {
      this.confettiCtx = this.confettiCanvas.getContext('2d');
      this.resizeCanvas();
      window.addEventListener('resize', () => this.resizeCanvas());
    }

    this.initWebSocket();
    this.setupUIListeners();
    this.startAnimationLoop();
  }

  resizeCanvas() {
    if (this.confettiCanvas) {
      this.confettiCanvas.width = this.confettiCanvas.offsetWidth;
      this.confettiCanvas.height = this.confettiCanvas.offsetHeight;
    }
  }

  // -------------------------------------------------------------
  // WebSocket İletişimi
  // -------------------------------------------------------------
  initWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('[Game] Sunucuya bağlandı.');
      this.updateStatusPill(true, 'Sunucu Bağlı');
    };

    this.ws.onmessage = evt => {
      try {
        const msg = JSON.parse(evt.data);
        this.handleServerMessage(msg);
      } catch (e) {
        console.error('[Game] Mesaj ayrıştırma hatası:', e);
      }
    };

    this.ws.onclose = () => {
      console.warn('[Game] Sunucu bağlantısı koptu. Yeniden bağlanılıyor...');
      this.updateStatusPill(false, 'Bağlantı Kesildi');
      setTimeout(() => this.initWebSocket(), 2000);
    };
  }

  handleServerMessage(msg) {
    switch (msg.type) {
      case 'INITIAL_STATE':
        this.gameState = msg.gameState;
        this.lanes = msg.lanes;
        this.renderLanes();
        this.updateHUD();
        if (msg.isDemo) this.setDemoButtonState(true);
        if (msg.savedUsername) {
          const inputEl = document.getElementById('tiktok-username-input');
          if (inputEl && !inputEl.value) inputEl.value = msg.savedUsername;
        }
        if (msg.liveStatus) {
          this.handleTikTokStatus(msg.liveStatus);
        } else if (msg.currentTiktokUser) {
          this.setTiktokUIConnected(msg.currentTiktokUser);
        }

        // URL parametresi ile otomatik bağlanma (?username=kullanici_adi)
        const urlUser = new URLSearchParams(window.location.search).get('username');
        if (urlUser && (!msg.liveStatus || !msg.liveStatus.connected)) {
          this.connectTikTok(urlUser);
        }
        
        // Başlangıçta lider olan hayvanın şarkısını sıraya al/başlat
        if (this.gameState && this.gameState.leaderId && window.soundEngine) {
          window.soundEngine.switchLeaderTheme(this.gameState.leaderId);
        }
        break;

      case 'GIFT_EVENT':
        this.gameState = msg.gameState;
        this.onGiftReceived(msg);
        break;

      case 'ROUND_RESET':
        this.gameState = msg.gameState;
        this.onRoundReset();
        break;

      case 'DEMO_STATUS':
        this.setDemoButtonState(msg.isDemo);
        break;

      case 'TIKTOK_STATUS':
        this.handleTikTokStatus(msg);
        break;
    }
  }

  // -------------------------------------------------------------
  // Kulvarları & Hayvanları İnşa Etme
  // -------------------------------------------------------------
  renderLanes() {
    const container = document.getElementById('lanes-container');
    if (!container) return;
    container.innerHTML = '';

    const SPRITE_MAP = {
      1: { animWebp: 'assets/anim_lion_run.webp', giftIcon: 'assets/gg.webp', giftName: 'GG' },
      2: { animWebp: 'assets/anim_azeri_wolf_run.webp', giftIcon: 'assets/heart.webp', giftName: 'Kalp' },
      3: { animWebp: 'assets/anim_turk_wolf_run.webp', giftIcon: 'assets/rose.webp', giftName: 'Gül' },
      4: { animWebp: 'assets/anim_pars_run.webp', giftIcon: 'assets/ice_cream.webp', giftName: 'Dondurma' },
      5: { animWebp: 'assets/anim_tiger_run.webp', giftIcon: 'assets/tiktok.webp', giftName: 'TikTok' }
    };

    this.lanes.forEach((lane, idx) => {
      const cfg = SPRITE_MAP[lane.id] || SPRITE_MAP[1];
      const countryClassMap = {
        1: 'lane-kurdistan',
        2: 'lane-azeri',
        3: 'lane-turkey',
        4: 'lane-afghanistan',
        5: 'lane-syria'
      };
      const countryClass = countryClassMap[lane.id] || '';

      const laneEl = document.createElement('div');
      laneEl.className = `race-lane ${countryClass}`;
      laneEl.id = `lane-${lane.id}`;
      laneEl.style.setProperty('--lane-rank', idx);

      laneEl.innerHTML = `
        <!-- Sol Hediye & Ülke Rozeti -->
        <div class="lane-gift-pill" onclick="window.game.sendManualGift('${lane.giftKey}', 1)">
          <div class="gift-icon-wrap">
            <img src="${cfg.giftIcon}" alt="${lane.gift}" class="gift-icon-img" />
          </div>
          <div class="gift-info">
            <span class="gift-label">${lane.gift}</span>
            <span class="country-tag">${lane.country}</span>
            <span class="lane-rank-indicator" id="rank-ind-${lane.id}">${idx + 1}. SIRA</span>
          </div>
        </div>

        <!-- Koşu Yolu & Neon Çizgiler -->
        <div class="track-ground">
          <div class="track-dash-glow"></div>
          <div class="finish-line"></div>
        </div>

        <!-- Koşan Hayvan Karakteri (Otantik 4 Bacaklı Koşu Döngüsü) -->
        <div class="animal-runner" id="runner-${lane.id}">
          <div class="runner-crown" id="crown-${lane.id}">👑</div>
          <div class="runner-wind-trail"></div>

          <div class="animal-sprite-wrap">
            <img src="${cfg.animWebp}" alt="${lane.name}" class="animal-sprite-img" id="sprite-${lane.id}" />
            <div class="paw-dust" id="dust-${lane.id}"></div>
          </div>

          <div class="runner-shadow"></div>
          <div class="runner-score-badge" id="score-${lane.id}">
            <span class="badge-country">${lane.name}</span>
            <span class="badge-score">0</span>
          </div>
        </div>
      `;

      container.appendChild(laneEl);

      this.animalElements[lane.id] = document.getElementById(`runner-${lane.id}`);
      this.trackElements[lane.id] = laneEl;
    });

    this.updateAnimalPositions();
    this.reorderLanesByRank();
  }

  // -------------------------------------------------------------
  // Hediye Olayı & "ÖNDE OLANIN ŞARKISI ÇALAR"
  // -------------------------------------------------------------
  onGiftReceived(data) {
    const { laneId, count, giftName, user, leaderChanged, winner } = data;

    // 1. Kristal Hediye Sesi
    if (window.soundEngine) {
      window.soundEngine.playGiftPing();
    }

    // 2. Koşan Hayvana Hızlanma / Zıplama İvmesi
    const runnerEl = this.animalElements[laneId];
    if (runnerEl) {
      runnerEl.classList.add('boost');
      setTimeout(() => runnerEl.classList.remove('boost'), 450);

      // Ayak altından toz/kıvılcım çıkar
      this.spawnPawDust(laneId);

      // Uçan Hediye Balonu (+Gül x10, Kullanıcı Avatarı)
      this.spawnFloatingGift(laneId, giftName, count, user);
    }

    // 3. Pozisyonları ve Sıralamayı Güncelle (ÖNE GEÇEN EN ÜSTE ÇIKAR)
    this.updateAnimalPositions();
    this.reorderLanesByRank();
    this.updateHUD();

    // 4. "ÖNDE OLANIN ŞARKISI ÇALAR" Müzik Değişimi
    if (this.gameState.leaderId) {
      const leaderLane = this.lanes.find(l => l.id === this.gameState.leaderId);
      if (leaderLane) {
        let trackInfo = null;
        if (window.soundEngine) {
          trackInfo = window.soundEngine.switchLeaderTheme(leaderLane.id);
        }
        if (leaderChanged) {
          const songTxt = trackInfo && trackInfo.name ? ` 🎵 ${trackInfo.name}` : '';
          this.showLeaderBanner(`👑 ${leaderLane.country.toUpperCase()} (${leaderLane.name.toUpperCase()}) ÖNE GEÇTİ!${songTxt}`);
        }
      }
    }

    // 5. Bitiş & Kazanan Kontrolü
    if (winner) {
      this.onWinnerCelebration(winner);
    }
  }

  updateAnimalPositions() {
    if (!this.gameState || !this.gameState.lanes) return;

    this.gameState.lanes.forEach(l => {
      const runner = this.animalElements[l.id];
      const scoreBadge = document.getElementById(`score-${l.id}`);
      const crown = document.getElementById(`crown-${l.id}`);

      if (runner) {
        // Sol hediye kutusundan sonra başla (%22), bitiş çizgisinde dur (%86)
        const leftPercent = 22 + (l.progress / 100) * 64;
        runner.style.left = `${leftPercent}%`;

        // Lider tacı
        const isLeader = this.gameState.leaderId === l.id && l.score > 0;
        if (crown) {
          crown.style.display = isLeader ? 'block' : 'none';
        }
      }

      if (scoreBadge) {
        scoreBadge.querySelector('.badge-score').textContent = l.score;
      }
    });
  }

  // -------------------------------------------------------------
  // Kulvarları Sıralama: ÖNE GEÇEN HAYVAN EN ÜST SIRAYA ÇIKAR!
  // -------------------------------------------------------------
  reorderLanesByRank() {
    if (!this.gameState || !this.gameState.lanes) return;

    // En yüksek puana göre sırala (Rank 0: En üst sıra)
    const sorted = [...this.gameState.lanes].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.id - b.id;
    });

    sorted.forEach((l, rank) => {
      const laneEl = this.trackElements[l.id];
      if (laneEl) {
        laneEl.style.setProperty('--lane-rank', rank);

        const rankBadge = laneEl.querySelector('.lane-rank-indicator');
        if (rank === 0 && l.score > 0) {
          laneEl.classList.add('is-leader-lane');
          if (rankBadge) {
            rankBadge.textContent = '👑 1. SIRA (LİDER)';
            rankBadge.className = 'lane-rank-indicator rank-gold';
          }
        } else {
          laneEl.classList.remove('is-leader-lane');
          if (rankBadge) {
            rankBadge.textContent = `${rank + 1}. SIRA`;
            rankBadge.className = 'lane-rank-indicator';
          }
        }
      }
    });
  }

  // Uçan Hediye ve Avatar Rozeti (DİREKT HAYVANIN ÜSTÜNDE)
  spawnFloatingGift(laneId, giftName, count, user) {
    const runner = this.animalElements[laneId];
    if (!runner) return;

    const GIFT_ICONS = {
      1: 'assets/gg.webp',
      2: 'assets/heart.webp',
      3: 'assets/rose.webp',
      4: 'assets/ice_cream.webp',
      5: 'assets/tiktok.webp'
    };
    const giftIcon = GIFT_ICONS[laneId] || 'assets/rose.webp';
    const senderName = user && user.nick ? user.nick : 'Seyirci';

    const floatEl = document.createElement('div');
    floatEl.className = 'floating-gift-bubble';
    floatEl.innerHTML = `
      <img src="${giftIcon}" class="float-gift-img" alt="${giftName}" />
      <span class="float-text">${senderName}: <b class="gift-highlight">+${count} ${giftName}</b></span>
    `;

    runner.appendChild(floatEl);
    setTimeout(() => floatEl.remove(), 1100);
  }

  // Koşu Toz / Kıvılcım Efekti
  spawnPawDust(laneId) {
    const dustContainer = document.getElementById(`dust-${laneId}`);
    if (!dustContainer) return;

    for (let i = 0; i < 4; i++) {
      const p = document.createElement('div');
      p.className = 'dust-particle';
      p.style.setProperty('--rand-x', `${(Math.random() - 0.5) * 30}px`);
      p.style.setProperty('--rand-y', `${-Math.random() * 20}px`);
      dustContainer.appendChild(p);
      setTimeout(() => p.remove(), 600);
    }
  }

  // -------------------------------------------------------------
  // Kazanan Kutlaması & Yeni Tur
  // -------------------------------------------------------------
  onWinnerCelebration(winner) {
    if (window.soundEngine) {
      window.soundEngine.playVictoryFanfare();
    }

    // Konfeti patlaması
    this.triggerConfettiBurst();

    // Zafer Modal Banner'ı
    const modal = document.getElementById('winner-modal');
    const winnerNameEl = document.getElementById('winner-team-name');
    const winnerSubEl = document.getElementById('winner-sub-text');
    const countdownEl = document.getElementById('round-countdown');

    if (modal) {
      winnerNameEl.textContent = `🏆 ${winner.country.toUpperCase()} (${winner.name.toUpperCase()}) KAZANDI!`;
      winnerSubEl.textContent = `Toplam ${winner.score} hediye ile şampiyon oldu!`;
      modal.classList.add('active');

      let seconds = 5;
      countdownEl.textContent = `Yeni Tur: ${seconds}`;
      const timer = setInterval(() => {
        seconds--;
        if (seconds > 0) {
          countdownEl.textContent = `Yeni Tur: ${seconds}`;
        } else {
          clearInterval(timer);
          modal.classList.remove('active');
        }
      }, 1000);
    }
  }

  onRoundReset() {
    this.updateAnimalPositions();
    this.reorderLanesByRank();
    this.updateHUD();
    this.showLeaderBanner(`🏁 YENİ TUR ${this.gameState.round} BAŞLADI! HEDİYENİ AT, TAKIMINI KAZANDIR!`);
    if (window.soundEngine) {
      window.soundEngine.stopCurrentTheme();
    }
  }

  // -------------------------------------------------------------
  // Konfeti Motoru (60 FPS)
  // -------------------------------------------------------------
  triggerConfettiBurst() {
    const colors = ['#ef4444', '#f59e0b', '#10b981', '#06b6d4', '#8b5cf6', '#fbbf24', '#ffffff'];
    const w = this.confettiCanvas.width;
    const h = this.confettiCanvas.height;

    for (let i = 0; i < 180; i++) {
      this.confettiParticles.push({
        x: w / 2 + (Math.random() - 0.5) * 100,
        y: h / 2,
        vx: (Math.random() - 0.5) * 16,
        vy: -Math.random() * 18 - 4,
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 10,
        gravity: 0.35,
        opacity: 1
      });
    }
  }

  startAnimationLoop() {
    let lastDustTime = 0;
    const loop = (timestamp) => {
      requestAnimationFrame(loop);

      // Sürekli koşan hayvanların ayaklarından toz çıkarma
      if (timestamp - lastDustTime > 140) {
        lastDustTime = timestamp;
        this.lanes.forEach(lane => {
          this.spawnPawDust(lane.id);
        });
      }

      // Konfetileri güncelle ve çiz
      if (this.confettiCtx && this.confettiParticles.length > 0) {
        this.confettiCtx.clearRect(0, 0, this.confettiCanvas.width, this.confettiCanvas.height);

        for (let i = this.confettiParticles.length - 1; i >= 0; i--) {
          const p = this.confettiParticles[i];
          p.x += p.vx;
          p.y += p.vy;
          p.vy += p.gravity;
          p.rotation += p.rotSpeed;
          p.opacity -= 0.005;

          if (p.y > this.confettiCanvas.height || p.opacity <= 0) {
            this.confettiParticles.splice(i, 1);
            continue;
          }

          this.confettiCtx.save();
          this.confettiCtx.translate(p.x, p.y);
          this.confettiCtx.rotate((p.rotation * Math.PI) / 180);
          this.confettiCtx.globalAlpha = Math.max(0, p.opacity);
          this.confettiCtx.fillStyle = p.color;
          this.confettiCtx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
          this.confettiCtx.restore();
        }
      }
    };
    loop();
  }

  // -------------------------------------------------------------
  // HUD ve Banner Yönetimi
  // -------------------------------------------------------------
  updateHUD() {
    const roundEl = document.getElementById('hud-round-num');
    const leaderEl = document.getElementById('hud-leader-name');
    const totalGiftsEl = document.getElementById('hud-total-gifts');

    if (roundEl) roundEl.textContent = this.gameState.round;
    if (totalGiftsEl) totalGiftsEl.textContent = this.gameState.totalGiftsCount;

    if (leaderEl) {
      if (this.gameState.leaderId) {
        const leader = this.lanes.find(l => l.id === this.gameState.leaderId);
        const songName = window.soundEngine && window.soundEngine.currentTrackName ? ` 🎵 ${window.soundEngine.currentTrackName}` : '';
        leaderEl.textContent = leader ? `${leader.country} (${leader.name})${songName}` : '-';
      } else {
        leaderEl.textContent = 'Yarış Başlıyor';
      }
    }
  }

  showLeaderBanner(text) {
    const banner = document.getElementById('top-alert-banner');
    if (!banner) return;
    banner.textContent = text;
    banner.classList.add('active');
    if (this.bannerTimeout) clearTimeout(this.bannerTimeout);
    this.bannerTimeout = setTimeout(() => {
      banner.classList.remove('active');
    }, 4500);
  }

  // -------------------------------------------------------------
  // Kullanıcı ve Panel Etkileşimleri
  // -------------------------------------------------------------
  sendManualGift(giftKey, count = 1) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        action: 'SEND_GIFT',
        giftKey,
        count,
        user: { nick: 'Yönetici', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Admin' }
      }));
    }
  }

  setupUIListeners() {
    // Ses Butonu
    const muteBtn = document.getElementById('mute-btn');
    if (muteBtn) {
      muteBtn.addEventListener('click', async () => {
        if (window.soundEngine) {
          await window.soundEngine.ensureContext();
          const muted = window.soundEngine.toggleMute();
          muteBtn.innerHTML = muted ? '🔇 Ses Kapalı' : '🔊 Ses Açık';
        }
      });
    }

    // Demo Butonu
    const demoBtn = document.getElementById('demo-btn');
    if (demoBtn) {
      demoBtn.addEventListener('click', async () => {
        if (window.soundEngine) {
          await window.soundEngine.ensureContext();
          if (this.gameState && this.gameState.leaderId) {
            window.soundEngine.switchLeaderTheme(this.gameState.leaderId);
          }
        }
        const isRunning = demoBtn.classList.contains('active');
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({
            action: 'TOGGLE_DEMO',
            enabled: !isRunning
          }));
        }
      });
    }

    // Tur Sıfırla
    const resetBtn = document.getElementById('reset-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ action: 'RESET_ROUND' }));
        }
      });
    }

    // TikTok Bağlan / Kes Butonu
    const connectBtn = document.getElementById('tiktok-connect-btn');
    const inputEl = document.getElementById('tiktok-username-input');
    if (connectBtn && inputEl) {
      connectBtn.addEventListener('click', async () => {
        if (connectBtn.classList.contains('btn-disconnect')) {
          await this.disconnectTikTok();
          return;
        }

        const username = inputEl.value.trim().replace('@', '');
        if (!username) return alert('TikTok canlı yayın kullanıcı adınızı giriniz!');
        await this.connectTikTok(username);
      });

      inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const username = inputEl.value.trim().replace('@', '');
          if (username) this.connectTikTok(username);
        }
      });
    }
  }

  async connectTikTok(username) {
    const connectBtn = document.getElementById('tiktok-connect-btn');
    const pill = document.getElementById('tiktok-status-pill');
    if (connectBtn) connectBtn.textContent = 'Bağlanıyor...';
    if (pill) {
      pill.className = 'status-pill connecting';
      pill.textContent = `@${username} Bağlanıyor...`;
    }

    try {
      const res = await fetch('/api/tiktok/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      });
      const data = await res.json();
      if (data.success && data.liveStatus) {
        this.handleTikTokStatus(data.liveStatus);
      }
    } catch (e) {
      console.error('[TikTok Connect] Hata:', e);
      if (pill) {
        pill.className = 'status-pill disconnected';
        pill.textContent = 'Bağlantı Hatası';
      }
      if (connectBtn) connectBtn.textContent = 'Bağlan';
    }
  }

  async disconnectTikTok() {
    const connectBtn = document.getElementById('tiktok-connect-btn');
    if (connectBtn) connectBtn.textContent = 'Kesiliyor...';
    try {
      await fetch('/api/tiktok/disconnect', { method: 'POST' });
    } catch (e) {}
    this.setTiktokUIDisconnected();
  }

  handleTikTokStatus(status) {
    const pill = document.getElementById('tiktok-status-pill');
    const btn = document.getElementById('tiktok-connect-btn');
    if (!status) return;

    if (status.connected) {
      if (pill) {
        pill.className = 'status-pill connected';
        pill.textContent = `🟢 @${status.username} Canlı`;
      }
      if (btn) {
        btn.textContent = 'Bağlantıyı Kes';
        btn.classList.add('btn-disconnect');
      }
    } else if (status.error) {
      const errMsg = status.error.toLowerCase();
      const isWaiting = errMsg.includes('online') || errMsg.includes('bekleniyor') || errMsg.includes('not_found');
      if (pill) {
        pill.className = isWaiting ? 'status-pill warning' : 'status-pill disconnected';
        pill.textContent = isWaiting ? `🟡 @${status.username} Yayın Bekleniyor...` : `🔴 @${status.username} Bağlantı Yok`;
      }
      if (btn) {
        btn.textContent = 'Tekrar Dene';
        btn.classList.remove('btn-disconnect');
      }
    } else {
      this.setTiktokUIDisconnected();
    }
  }

  setDemoButtonState(isRunning) {
    const demoBtn = document.getElementById('demo-btn');
    if (!demoBtn) return;
    if (isRunning) {
      demoBtn.classList.add('active');
      demoBtn.innerHTML = '⏹ Otomatik Demo (Durdur)';
    } else {
      demoBtn.classList.remove('active');
      demoBtn.innerHTML = '▶ Otomatik Demo (Başlat)';
    }
  }

  setTiktokUIConnected(username) {
    const pill = document.getElementById('tiktok-status-pill');
    const btn = document.getElementById('tiktok-connect-btn');
    if (pill) {
      pill.className = 'status-pill connected';
      pill.textContent = `🟢 @${username} Canlı`;
    }
    if (btn) {
      btn.textContent = 'Bağlantıyı Kes';
      btn.classList.add('btn-disconnect');
    }
  }

  setTiktokUIDisconnected() {
    const pill = document.getElementById('tiktok-status-pill');
    const btn = document.getElementById('tiktok-connect-btn');
    if (pill) {
      pill.className = 'status-pill disconnected';
      pill.textContent = 'TikTok Kapalı';
    }
    if (btn) {
      btn.textContent = 'Bağlan';
      btn.classList.remove('btn-disconnect');
    }
  }

  updateStatusPill(connected, text) {
    const el = document.getElementById('ws-status-pill');
    if (el) {
      el.className = `status-pill ${connected ? 'connected' : 'disconnected'}`;
      el.textContent = text;
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.game = new AnimalRaceGame();

  const unlockAudio = async () => {
    if (window.soundEngine) {
      await window.soundEngine.ensureContext();
      if (window.game && window.game.gameState && window.game.gameState.leaderId) {
        if (!window.soundEngine.currentTheme || !window.soundEngine.tempoInterval) {
          window.soundEngine.switchLeaderTheme(window.game.gameState.leaderId);
        }
      }
      const audioBanner = document.getElementById('audio-unlock-banner');
      if (audioBanner) {
        audioBanner.classList.add('hide');
        setTimeout(() => { if (audioBanner.parentNode) audioBanner.remove(); }, 350);
      }
    }
  };

  // Kullanıcı herhangi bir yere tıkladığında/dokunduğunda veya tuşa bastığında ses kilidini aç
  ['click', 'touchstart', 'keydown'].forEach(evt => {
    window.addEventListener(evt, unlockAudio, { passive: true });
  });

  const banner = document.getElementById('audio-unlock-banner');
  if (banner) {
    banner.addEventListener('click', unlockAudio);
  }
});
