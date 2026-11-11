const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');

let TikTokLiveConnection = null;
try {
  const tiktokModule = require('tiktok-live-connector');
  TikTokLiveConnection = tiktokModule.TikTokLiveConnection;
} catch (e) {
  console.warn('[TikTok] tiktok-live-connector yüklenemedi:', e.message);
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3002;

// Kalıcı Yapılandırma Deposu (data/config.json)
const DATA_DIR = path.join(__dirname, 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let savedConfig = { targetUsername: '' };
if (fs.existsSync(CONFIG_FILE)) {
  try {
    savedConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  } catch (e) {
    savedConfig = { targetUsername: '' };
  }
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.webp') || filePath.endsWith('.png') || filePath.endsWith('.jpg') || filePath.endsWith('.mp3')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

// 5 Kulvar Tanımları (TikTok Bayrak Mücadelesi - 5 Hayvan & Ülke Eşleşmesi)
const LANES_CONFIG = [
  { id: 1, name: 'Aslan', country: 'Kürdistan', gift: 'GG', giftKey: 'gg', color: '#febd11', trackY: 10, giftIcon: 'assets/gg.webp' },
  { id: 2, name: 'Kurt', country: 'Azerbaycan', gift: 'Kalp', giftKey: 'heart', color: '#06b6d4', trackY: 28, giftIcon: 'assets/heart.webp' },
  { id: 3, name: 'Bozkurt', country: 'Türkiye', gift: 'Gül', giftKey: 'rose', color: '#ef4444', trackY: 46, giftIcon: 'assets/rose.webp' },
  { id: 4, name: 'Pars', country: 'Afganistan', gift: 'Dondurma', giftKey: 'icecream', color: '#10b981', trackY: 64, giftIcon: 'assets/ice_cream.webp' },
  { id: 5, name: 'Kaplan', country: 'Suriye', gift: 'TikTok / Paten', giftKey: 'tiktok', color: '#ce1126', trackY: 82, giftIcon: 'assets/tiktok.webp' }
];

// Oyun Durumu (Sonsuz Canlı Yayın Yarışı - Tur Bitişi Yok)
let gameState = {
  round: 'CANLI',
  lanes: LANES_CONFIG.map(l => ({ ...l, score: 0, progress: 0 })),
  leaderId: null,
  totalGiftsCount: 0,
  topGifters: []
};

// Demo Kullanıcı İsimleri
const DEMO_USERS = [
  { nick: 'Bozkurt_06', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Bozkurt' },
  { nick: 'Azeri_Bala', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Azeri' },
  { nick: 'Aslan_Parcasi', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Aslan' },
  { nick: 'Pars_Han', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Pars' },
  { nick: 'Kaplan_Reyiz', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Kaplan' },
  { nick: 'Mehmet_TR', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Mehmet' },
  { nick: 'Turan_Yolcusu', avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=Turan' }
];

let liveClient = null;
let currentTiktokUser = null;
let liveStatus = { connected: false, username: null, roomId: null, error: null };
let reconnectTimer = null;
let demoInterval = null;

// Tüm bağlı WebSocket istemcilerine yayın
function broadcast(msg) {
  const data = JSON.stringify(msg);
  wss.clients.forEach(c => {
    if (c.readyState === WebSocket.OPEN) c.send(data);
  });
}

// -------------------------------------------------------------
// TikTok Protobuf Kullanıcı Metadata Ayrıştırma (Kernel Seviyesi)
// -------------------------------------------------------------
function extractTikTokUser(data) {
  if (!data) {
    const fallbackId = 'izleyici_' + Math.floor(Math.random() * 90000 + 10000);
    return {
      nick: 'Misafir',
      uniqueId: fallbackId,
      avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(fallbackId)}`
    };
  }

  let uId = data.uniqueId ||
            data.displayId ||
            (data.user && (data.user.uniqueId || data.user.displayId || data.user.idStr || data.user.userId)) ||
            data.userId ||
            data.secUid ||
            (data.userDetails && (data.userDetails.uniqueId || data.userDetails.displayId || data.userDetails.userId));

  if (!uId || uId === 'undefined' || uId === 'null') {
    const rawNick = data.nickname || (data.user && data.user.nickname);
    if (rawNick && rawNick !== 'undefined' && rawNick !== 'null') {
      uId = 'user_' + Buffer.from(String(rawNick)).toString('hex').slice(0, 10);
    } else {
      uId = 'izleyici_' + Math.floor(Math.random() * 90000 + 10000);
    }
  }
  uId = String(uId).trim();

  let nick = data.nickname ||
             (data.user && data.user.nickname) ||
             (data.userDetails && (data.userDetails.nickName || data.userDetails.nickname)) ||
             data.uniqueId ||
             data.displayId ||
             uId;
  nick = String(nick).trim();
  if (!nick || nick === 'undefined' || nick === 'null') {
    nick = uId.startsWith('user_') ? 'İzleyici' : uId;
  }

  let avatar = null;
  if (data.profilePictureUrl && typeof data.profilePictureUrl === 'string' && data.profilePictureUrl.startsWith('http')) {
    avatar = data.profilePictureUrl;
  } else if (data.user && data.user.profilePictureUrl && data.user.profilePictureUrl.startsWith('http')) {
    avatar = data.user.profilePictureUrl;
  } else if (data.userDetails && data.userDetails.profilePictureUrl && data.userDetails.profilePictureUrl.startsWith('http')) {
    avatar = data.userDetails.profilePictureUrl;
  } else if (data.user && data.user.avatarThumb && data.user.avatarThumb.urlList && data.user.avatarThumb.urlList[0]) {
    avatar = data.user.avatarThumb.urlList[0];
  } else if (data.user && data.user.avatarMedium && data.user.avatarMedium.urlList && data.user.avatarMedium.urlList[0]) {
    avatar = data.user.avatarMedium.urlList[0];
  }

  if (!avatar || avatar.includes('undefined') || avatar.includes('null')) {
    avatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(uId)}`;
  }

  return { nick, uniqueId: uId, avatar };
}

// -------------------------------------------------------------
// Hediye İsimlerini Kulvarlara Çözümleme
// -------------------------------------------------------------
function resolveGiftKey(giftName) {
  const g = (giftName || '').toLowerCase();
  if (g.includes('gg') || g.includes('game')) return 'gg';
  if (g.includes('heart') || g.includes('kalp') || g.includes('love') || g.includes('finger')) return 'heart';
  if (g.includes('rose') || g.includes('gül') || g.includes('gul') || g.includes('flower')) return 'rose';
  if (g.includes('ice') || g.includes('cream') || g.includes('dondurma') || g.includes('cone')) return 'icecream';
  if (g.includes('tiktok') || g.includes('skate') || g.includes('paten') || g.includes('cake') || g.includes('pasta')) return 'tiktok';
  return 'rose'; // Bilinmeyen varsayılan hediye Türkiye Gül kulvarına
}

// -------------------------------------------------------------
// Hediye İşleme ve Sonsuz Canlı Yarış İlerlemesi (Tur Bitişi Yok)
// -------------------------------------------------------------
function applyGift(giftKey, count = 1, user = {}) {
  const safeCount = Math.max(1, count || 1);
  const normalizedKey = (giftKey || '').toLowerCase();

  // 5 Kulvar Eşleşmesi (skate / tiktok / cake -> Lane 5 Kaplan)
  const lane = gameState.lanes.find(l => 
    l.giftKey.toLowerCase() === normalizedKey ||
    (l.id === 5 && (normalizedKey === 'skate' || normalizedKey === 'tiktok' || normalizedKey === 'cake'))
  ) || gameState.lanes[2]; // Varsayılan Gül -> Bozkurt Türkiye

  lane.score += safeCount;
  gameState.totalGiftsCount += safeCount;

  // En çok hediye atanları kaydet
  if (user && user.nick) {
    let gifter = gameState.topGifters.find(g => g.nick === user.nick);
    if (!gifter) {
      gifter = { nick: user.nick, avatar: user.avatar, score: 0 };
      gameState.topGifters.push(gifter);
    }
    gifter.score += safeCount;
    gameState.topGifters.sort((a, b) => b.score - a.score);
    if (gameState.topGifters.length > 10) gameState.topGifters.length = 10;
  }

  // Liderlik kontrolü ("Önde olanın şarkısı çalar")
  let maxScore = -1;
  let newLeaderId = null;
  gameState.lanes.forEach(l => {
    if (l.score > maxScore && l.score > 0) {
      maxScore = l.score;
      newLeaderId = l.id;
    }
  });

  const leaderChanged = newLeaderId && newLeaderId !== gameState.leaderId;
  if (leaderChanged) {
    gameState.leaderId = newLeaderId;
  }

  // Oransal ilerleme (%0 - %100 arası, lider %100 referansı)
  gameState.lanes.forEach(l => {
    l.progress = maxScore > 0 ? (l.score / maxScore) * 100 : 0;
  });

  broadcast({
    type: 'GIFT_EVENT',
    giftKey: lane.giftKey,
    giftName: lane.gift,
    laneId: lane.id,
    count: safeCount,
    user: {
      nick: user.nick || 'İzleyici',
      avatar: user.avatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=user'
    },
    gameState,
    leaderChanged
  });
}

function resetGameScores() {
  gameState.leaderId = null;
  gameState.totalGiftsCount = 0;
  gameState.topGifters = [];
  gameState.lanes.forEach(l => {
    l.score = 0;
    l.progress = 0;
  });
  console.log('[Hayvan Oyunu] Puanlar sıfırlandı, sonsuz canlı yarış devam ediyor.');
  broadcast({
    type: 'ROUND_RESET',
    gameState
  });
}

// -------------------------------------------------------------
// WebSocket Bağlantıları
// -------------------------------------------------------------
wss.on('connection', ws => {
  ws.send(JSON.stringify({
    type: 'INITIAL_STATE',
    gameState,
    lanes: LANES_CONFIG,
    currentTiktokUser,
    liveStatus,
    savedUsername: savedConfig.targetUsername || '',
    isDemo: !!demoInterval
  }));

  ws.on('message', raw => {
    try {
      const msg = JSON.parse(raw);
      if (msg.action === 'SEND_GIFT') {
        applyGift(msg.giftKey, msg.count || 1, msg.user || { nick: 'Yönetici' });
      } else if (msg.action === 'RESET_ROUND') {
        resetGameScores();
      } else if (msg.action === 'TOGGLE_DEMO') {
        toggleDemo(msg.enabled);
      }
    } catch (e) {
      console.error('[WS] Mesaj işleme hatası:', e.message);
    }
  });
});

// -------------------------------------------------------------
// Demo Modu (Tam Otomatik Test & Offline Simülasyon)
// -------------------------------------------------------------
function toggleDemo(enable) {
  if (enable && !demoInterval) {
    demoInterval = setInterval(() => {
      const randomUser = DEMO_USERS[Math.floor(Math.random() * DEMO_USERS.length)];
      const randomLane = LANES_CONFIG[Math.floor(Math.random() * LANES_CONFIG.length)];
      // Türkiye ve Azerbaycan hediyelerine hafif ağırlık
      const weightedLane = Math.random() < 0.55 
        ? (Math.random() < 0.65 ? LANES_CONFIG[2] : LANES_CONFIG[1])
        : randomLane;
      const count = Math.random() < 0.2 ? Math.floor(Math.random() * 5) + 1 : 1;
      applyGift(weightedLane.giftKey, count, randomUser);
    }, 900);
    broadcast({ type: 'DEMO_STATUS', isDemo: true });
    console.log('[Demo] Otomatik hediye simülasyonu başlatıldı.');
  } else if (!enable && demoInterval) {
    clearInterval(demoInterval);
    demoInterval = null;
    broadcast({ type: 'DEMO_STATUS', isDemo: false });
    console.log('[Demo] Otomatik hediye simülasyonu durduruldu.');
  }
}

// -------------------------------------------------------------
// TikTok Live Otomatik & Dayanıklı Bağlantı Motoru
// -------------------------------------------------------------
function connectToTikTok(rawUsername) {
  if (!rawUsername) return;
  const username = rawUsername.replace(/^@/, '').trim();
  if (!username) return;

  // Kalıcı yapılandırmaya kaydet
  savedConfig.targetUsername = username;
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(savedConfig, null, 2));
  } catch (e) {}

  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  if (liveClient) {
    try {
      liveClient.removeAllListeners();
      liveClient.disconnect();
    } catch (e) {}
    liveClient = null;
  }

  currentTiktokUser = username;
  liveStatus = { connected: false, username, roomId: null, error: 'Bağlanılıyor...' };
  broadcast({ type: 'TIKTOK_STATUS', ...liveStatus });
  console.log(`[TikTok] @${username} canlı yayınına bağlanılıyor...`);

  if (!TikTokLiveConnection) {
    console.warn('[TikTok] TikTokLiveConnection modülü eksik, simülasyona geçildi.');
    liveStatus.error = 'tiktok-live-connector kütüphanesi eksik';
    broadcast({ type: 'TIKTOK_STATUS', ...liveStatus });
    return;
  }

  try {
    liveClient = new TikTokLiveConnection(username, {
      processInitialData: true,
      enableExtendedGiftInfo: false
    });

    liveClient.connect().then(state => {
      liveStatus.connected = true;
      liveStatus.error = null;
      liveStatus.roomId = state.roomId;
      console.log(`[TikTok] @${username} BAŞARIYLA BAĞLANDI! (Oda ID: ${state.roomId})`);
      broadcast({ type: 'TIKTOK_STATUS', ...liveStatus });
    }).catch(err => {
      const errMsg = err.message || 'Bağlantı kurulamadı';
      console.error(`[TikTok] Bağlantı Hatası:`, errMsg);
      liveStatus.connected = false;
      liveStatus.error = errMsg;
      broadcast({ type: 'TIKTOK_STATUS', ...liveStatus });

      // Yayın henüz açılmadıysa vazgeçme, 5 saniyede bir otomatik tekrar dene!
      if (errMsg.includes("isn't online") || errMsg.includes('offline') || errMsg.includes('LIVE_ROOM_NOT_FOUND') || errMsg.includes('Room ID') || errMsg.includes('retrieve')) {
        console.log(`[TikTok] @${username} henüz yayında değil, 5 sn sonra otomatik tekrar denenecek...`);
        reconnectTimer = setTimeout(() => {
          if (!liveStatus.connected && username === savedConfig.targetUsername) {
            connectToTikTok(username);
          }
        }, 5000);
      }
    });

    liveClient.on('gift', data => {
      if (data.giftType === 1 && !data.repeatEnd) return;
      const count = data.repeatCount || 1;
      const giftName = data.giftName || 'Hediye';
      const giftKey = resolveGiftKey(giftName);
      const user = extractTikTokUser(data);
      console.log(`[TikTok Gift] @${user.nick} -> ${giftName} x${count} (${giftKey})`);
      applyGift(giftKey, count, user);
    });

    liveClient.on('like', data => {
      // Beğeni etkileşimi tamamen kaldırıldı: Beğeniler yarışa etki etmez, sadece hediye atanlar ilerler.
    });

    liveClient.on('chat', data => {
      const user = extractTikTokUser(data);
      broadcast({
        type: 'CHAT_MESSAGE',
        user,
        comment: data.comment
      });
    });

    liveClient.on('disconnected', () => {
      console.warn('[TikTok] Bağlantı koptu, 5 sn sonra otomatik yeniden bağlanılıyor...');
      liveStatus.connected = false;
      liveStatus.error = 'Bağlantı koptu, yeniden deneniyor...';
      broadcast({ type: 'TIKTOK_STATUS', ...liveStatus });
      reconnectTimer = setTimeout(() => {
        if (!liveStatus.connected && username === savedConfig.targetUsername) {
          connectToTikTok(username);
        }
      }, 5000);
    });

  } catch (err) {
    liveStatus.connected = false;
    liveStatus.error = err.message;
    broadcast({ type: 'TIKTOK_STATUS', ...liveStatus });
  }
}

// -------------------------------------------------------------
// REST API Uç Noktaları
// -------------------------------------------------------------
app.post('/api/tiktok/connect', (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Kullanıcı adı gerekli' });
  connectToTikTok(username);
  res.json({ success: true, message: 'Bağlantı isteği işleme alındı', username, liveStatus });
});

app.post('/api/tiktok/disconnect', (req, res) => {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (liveClient) {
    try {
      liveClient.removeAllListeners();
      liveClient.disconnect();
    } catch (e) {}
    liveClient = null;
  }
  currentTiktokUser = null;
  liveStatus = { connected: false, username: null, roomId: null, error: null };
  broadcast({ type: 'TIKTOK_STATUS', ...liveStatus });
  res.json({ success: true, message: 'Bağlantı kesildi' });
});

app.get('/api/tiktok/status', (req, res) => {
  res.json({ liveStatus, savedUsername: savedConfig.targetUsername });
});

app.post('/api/gift', (req, res) => {
  const { giftKey, count, user } = req.body;
  if (!giftKey) return res.status(400).json({ error: 'giftKey gerekli' });
  applyGift(giftKey, count || 1, user || { nick: 'HTTP İstemcisi' });
  res.json({ success: true, gameState });
});

app.post('/api/round/reset', (req, res) => {
  resetGameScores();
  res.json({ success: true, gameState });
});

app.get('/api/state', (req, res) => {
  res.json({ gameState, lanes: LANES_CONFIG, isDemo: !!demoInterval, currentTiktokUser, liveStatus });
});

// Kayıtlı hesap varsa sunucu başlar başlamaz otomatik bağlan
if (savedConfig.targetUsername) {
  console.log(`[TikTok] Kayıtlı hesaba 2 sn içinde otomatik bağlanılıyor: @${savedConfig.targetUsername}`);
  setTimeout(() => connectToTikTok(savedConfig.targetUsername), 2000);
}

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🐾 TikTok Canlı Yayın Hayvan Yarışı Oyunu BAŞLATILDI!`);
  console.log(`🌐 Canlı Panel: http://localhost:${PORT}`);
  console.log(`📺 OBS Canlı Yayın Modu: http://localhost:${PORT}/?obs=1`);
  console.log(`====================================================`);
});
