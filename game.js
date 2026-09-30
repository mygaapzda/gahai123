// Kahoot! Монгол - Real-time Game Engine (WebRTC PeerJS & BroadcastChannel)

// SVG Icons for 4 Kahoot Shapes
const SHAPE_SVGS = {
  triangle: `<svg viewBox="0 0 24 24"><polygon points="12,2 22,20 2,20" /></svg>`,
  diamond: `<svg viewBox="0 0 24 24"><polygon points="12,2 22,12 12,22 2,12" /></svg>`,
  circle: `<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /></svg>`,
  square: `<svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>`
};

const BOT_NAMES = [
  { name: "Бумбуу", avatar: "🐼" },
  { name: "Дорж", avatar: "🦁" },
  { name: "Ариунаа", avatar: "🦄" },
  { name: "Болд", avatar: "🚀" },
  { name: "Сараа", avatar: "🦊" },
  { name: "Тэмүүлэн", avatar: "🦖" },
  { name: "Энхээ", avatar: "🐱" },
  { name: "Цэцэгээ", avatar: "🦩" }
];

class GameManager {
  constructor() {
    this.role = null; // 'host' | 'player'
    this.pin = null;
    this.peer = null;
    this.broadcastChannel = null;
    this.connectedToHost = false;

    // Host state
    this.players = new Map(); // id -> { id, name, avatar, score, streak, lastAnswer, conn, isBot }
    this.questions = [];
    this.currentQuestionIndex = 0;
    this.timer = null;
    this.timeLeft = 0;
    this.questionTotalTime = 20;
    this.isAnsweringOpen = false;

    // Player state
    this.myId = 'player_' + Math.random().toString(36).substring(2, 9);
    this.myName = '';
    this.myAvatar = '🦊';
    this.myScore = 0;
    this.myStreak = 0;
    this.hasAnswered = false;
    this.hostConn = null;

    this.initBroadcastChannel();
  }

  // Dual communication: BroadcastChannel (instant for local multi-tab) + PeerJS (over internet)
  initBroadcastChannel() {
    try {
      this.broadcastChannel = new BroadcastChannel('kahoot_mgl_channel');
      this.broadcastChannel.onmessage = (event) => {
        this.handleNetworkMessage(event.data, 'bc');
      };
    } catch (e) {
      console.log("BroadcastChannel дэмжигдэхгүй байна, PeerJS ашиглана.");
    }
  }

  // --- Toast notification ---
  showToast(msg, duration = 3000) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), duration);
  }

  // --- HOST INIT ---
  initHost() {
    this.role = 'host';
    this.questions = QuestionManager.getQuestions();
    this.currentQuestionIndex = 0;
    this.players.clear();

    // 6 оронтой санамсаргүй PIN үүсгэх
    this.pin = Math.floor(100000 + Math.random() * 900000).toString();
    const peerId = `kahoot-mgl-${this.pin}`;

    document.getElementById('displayPin').textContent = this.pin;
    this.generateLobbyQR();

    // PeerJS үүсгэх
    this.showToast("Өрөө үүсгэж байна, түр хүлээнэ үү...");
    try {
      if (typeof Peer !== 'undefined') {
        this.peer = new Peer(peerId, {
          debug: 1,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' }
            ]
          }
        });

        this.peer.on('open', (id) => {
          console.log("Host Peer opened successfully:", id);
          this.showToast("Өрөө амжилттай үүслээ! PIN: " + this.pin);
          sounds.playPop();
        });

        this.peer.on('connection', (conn) => {
          conn.on('open', () => {
            console.log("Шинэ тоглогч холбогдлоо:", conn.peer);
          });

          conn.on('data', (data) => {
            this.handleHostReceivedData(data, conn);
          });

          conn.on('close', () => {
            this.removePlayer(conn.peer);
          });
        });

        this.peer.on('error', (err) => {
          console.warn("PeerJS анхааруулга:", err);
          if (err.type === 'unavailable-id') {
            this.initHost();
          }
        });
      }
    } catch (e) {
      console.error("PeerJS үүсгэхэд алдаа:", e);
    }

    this.renderLobbyPlayers();
    sounds.playLobbyBGM();
  }

  // QR код үүсгэх
  generateLobbyQR() {
    const qrContainer = document.getElementById('lobbyQrCode');
    if (!qrContainer) return;
    qrContainer.innerHTML = '';

    const joinUrl = `${window.location.origin}${window.location.pathname}?pin=${this.pin}`;
    try {
      if (typeof QRCode !== 'undefined') {
        new QRCode(qrContainer, {
          text: joinUrl,
          width: 60,
          height: 60,
          colorDark: "#1f084a",
          colorLight: "#ffffff",
          correctLevel: QRCode.CorrectLevel ? QRCode.CorrectLevel.M : 0
        });
      }
    } catch (e) {
      console.log("QR code үүсгэхэд алдаа:", e);
    }
  }

  // Хост мэдээлэл хүлээн авах
  handleHostReceivedData(data, conn) {
    if (!data || !data.type) return;

    if (data.type === 'player_join') {
      const pId = (conn && conn.peer) || data.senderId;
      const alreadyJoined = this.players.has(pId);

      this.players.set(pId, {
        id: pId,
        name: data.name,
        avatar: data.avatar,
        score: alreadyJoined ? this.players.get(pId).score : 0,
        streak: alreadyJoined ? this.players.get(pId).streak : 0,
        lastAnswer: null,
        conn: conn || (alreadyJoined ? this.players.get(pId).conn : null),
        isBot: false
      });

      if (!alreadyJoined) {
        sounds.playPlayerJoin();
        this.showToast(`${data.avatar} ${data.name} лоббид орлоо!`);
      }
      this.renderLobbyPlayers();

      // Баталгаажуулалт тоглогчид илгээх
      const welcomeMsg = {
        type: 'join_success',
        pin: this.pin,
        totalQuestions: this.questions.length
      };
      if (conn && conn.open) conn.send(welcomeMsg);
      if (this.broadcastChannel) this.broadcastChannel.postMessage({ ...welcomeMsg, targetId: pId });
    }

    else if (data.type === 'player_answer') {
      if (!this.isAnsweringOpen) return;
      const pId = (conn && conn.peer) || data.senderId;
      const player = this.players.get(pId);
      if (player && player.lastAnswer === null) {
        player.lastAnswer = {
          answerIndex: data.answerIndex,
          timeLeft: this.timeLeft
        };
        sounds.playPop();
        this.updateAnswerCountUI();

        // Бүгд хариулсан эсэхийг шалгах
        this.checkIfAllAnswered();
      }
    }
  }

  // Тест бот нэмэх (Байхгүй бол найзуудыг дуурайх)
  addBotPlayer() {
    const availableBots = BOT_NAMES.filter(b => ![...this.players.values()].some(p => p.name === b.name));
    if (availableBots.length === 0) {
      this.showToast("Бүх ботууд нэмэгдсэн байна!");
      return;
    }
    const bot = availableBots[Math.floor(Math.random() * availableBots.length)];
    const botId = 'bot_' + Math.random().toString(36).substring(2, 7);

    this.players.set(botId, {
      id: botId,
      name: bot.name,
      avatar: bot.avatar,
      score: 0,
      streak: 0,
      lastAnswer: null,
      conn: null,
      isBot: true
    });

    sounds.playPlayerJoin();
    this.renderLobbyPlayers();
    this.showToast(`${bot.avatar} ${bot.name} лоббид нэгдлээ!`);
  }

  // Ботуудын автомат хариулт
  simulateBotAnswers() {
    const q = this.questions[this.currentQuestionIndex];
    this.players.forEach((player) => {
      if (!player.isBot) return;

      // 2 - 8 секундийн дараа хариулах
      const delay = 1500 + Math.random() * 5000;
      setTimeout(() => {
        if (!this.isAnsweringOpen || player.lastAnswer !== null) return;
        // 70% зөв хариулах магадлалтай
        const isSmart = Math.random() < 0.75;
        let chosenIndex = q.correct;
        if (!isSmart) {
          const wrongOpts = [0, 1, 2, 3].filter(idx => idx !== q.correct);
          chosenIndex = wrongOpts[Math.floor(Math.random() * wrongOpts.length)];
        }
        player.lastAnswer = {
          answerIndex: chosenIndex,
          timeLeft: this.timeLeft
        };
        this.updateAnswerCountUI();
        this.checkIfAllAnswered();
      }, delay);
    });
  }

  removePlayer(peerId) {
    if (this.players.has(peerId)) {
      this.players.delete(peerId);
      this.renderLobbyPlayers();
    }
  }

  renderLobbyPlayers() {
    const grid = document.getElementById('lobbyPlayersGrid');
    const countEl = document.getElementById('playersCount');
    const startBtn = document.getElementById('startGameBtn');

    if (!grid) return;
    grid.innerHTML = '';
    countEl.textContent = this.players.size;

    if (this.players.size === 0) {
      grid.innerHTML = `
        <div class="players-empty">
          <div style="font-size: 36px;">⏳</div>
          <p>Тоглогчид орохыг хүлээж байна...</p>
          <small>Утаснаасаа PIN код оруулаад орно уу!</small>
        </div>
      `;
      if (startBtn) startBtn.disabled = true;
      return;
    }

    if (startBtn) startBtn.disabled = false;

    this.players.forEach(p => {
      const tag = document.createElement('div');
      tag.className = 'player-tag';
      tag.innerHTML = `<span class="avatar">${p.avatar}</span><span class="name">${p.name}</span>`;
      grid.appendChild(tag);
    });
  }

  // Бүх тоглогчдод мэдээлэл цацах (Broadcast to all peers + BroadcastChannel)
  broadcast(msg) {
    // PeerJS peers
    this.players.forEach(p => {
      if (p.conn && p.conn.open) {
        try { p.conn.send(msg); } catch(e){}
      }
    });
    // Local BroadcastChannel
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage(msg);
    }
  }

  // Тодорхой тоглогчид мессеж илгээх
  sendToPlayer(playerId, msg) {
    const p = this.players.get(playerId);
    if (p && p.conn && p.conn.open) {
      try { p.conn.send(msg); } catch(e){}
    }
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage({ ...msg, targetId: playerId });
    }
  }

  // --- ТОГЛООМ ЭХЛЭХ ---
  startGame() {
    if (this.players.size === 0) {
      this.showToast("Тоглоом эхлэхийн тулд ядаж 1 тоглогч байх хэрэгтэй!");
      return;
    }

    sounds.stopBGM();
    sounds.playPop();

    // 3 секундийн Бэлтгээрэй! тоолол
    this.showView('countdownView');
    let count = 3;
    const numEl = document.getElementById('countdownNumber');
    const textEl = document.getElementById('countdownText');
    numEl.textContent = count;
    textEl.textContent = "Бэлтгээрэй!";
    sounds.playTick(true);

    this.broadcast({ type: 'get_ready', count: count });

    const cdInterval = setInterval(() => {
      count--;
      if (count > 0) {
        numEl.textContent = count;
        sounds.playTick(true);
        this.broadcast({ type: 'get_ready', count: count });
      } else {
        clearInterval(cdInterval);
        this.showQuestion(0);
      }
    }, 1000);
  }

  // --- АСУУЛТ ХАРУУЛАХ ---
  showQuestion(index) {
    this.currentQuestionIndex = index;
    const q = this.questions[index];
    this.questionTotalTime = q.time || 20;
    this.timeLeft = this.questionTotalTime;
    this.isAnsweringOpen = true;

    // Тоглогчдын өмнөх хариултыг цэвэрлэх
    this.players.forEach(p => p.lastAnswer = null);

    // Host View шинэчлэх
    this.showView('hostQuizView');
    document.getElementById('hostQNum').textContent = `${index + 1} / ${this.questions.length}`;
    document.getElementById('hostQText').textContent = q.question;
    document.getElementById('answersCount').textContent = `0/${this.players.size} хариулсан`;

    // 4 хариултын картуудыг бэлтгэх
    const optionsGrid = document.getElementById('hostOptionsGrid');
    optionsGrid.innerHTML = '';

    const colors = ['opt-red', 'opt-blue', 'opt-yellow', 'opt-green'];
    const shapes = ['triangle', 'diamond', 'circle', 'square'];

    q.options.forEach((optText, i) => {
      const btn = document.createElement('div');
      btn.className = `kahoot-opt ${colors[i]}`;
      btn.id = `hostOpt_${i}`;
      btn.innerHTML = `
        <div class="opt-shape">${SHAPE_SVGS[shapes[i]]}</div>
        <div class="opt-text">${optText}</div>
        <div class="opt-count-badge" id="hostOptCount_${i}">0</div>
      `;
      optionsGrid.appendChild(btn);
    });

    // Next товчийг нуух
    document.getElementById('hostNextControls').style.display = 'none';

    // Countdown таймер ажиллуулах
    this.startQuestionTimer();

    // Тоглогчдод асуултыг илгээх
    this.broadcast({
      type: 'question_start',
      questionIndex: index,
      totalQuestions: this.questions.length,
      question: q.question,
      options: q.options,
      timeLimit: this.questionTotalTime
    });

    // Хэрэв ботууд байгаа бол автомат хариулт
    this.simulateBotAnswers();
  }

  startQuestionTimer() {
    if (this.timer) clearInterval(this.timer);

    const timerNum = document.getElementById('timerNumber');
    const timerCircle = document.getElementById('timerProgress');
    const maxOffset = 220;

    timerNum.textContent = this.timeLeft;
    timerCircle.classList.remove('urgent');
    timerCircle.style.strokeDashoffset = '0';

    this.timer = setInterval(() => {
      this.timeLeft--;
      timerNum.textContent = this.timeLeft;

      // Таймерын цагираг
      const progress = (this.questionTotalTime - this.timeLeft) / this.questionTotalTime;
      timerCircle.style.strokeDashoffset = (progress * maxOffset).toString();

      // Сүүлийн 5 секунд
      if (this.timeLeft <= 5) {
        timerCircle.classList.add('urgent');
        sounds.playTick(true);
      } else {
        sounds.playTick(false);
      }

      if (this.timeLeft <= 0) {
        clearInterval(this.timer);
        this.endQuestion();
      }
    }, 1000);
  }

  updateAnswerCountUI() {
    let answered = 0;
    this.players.forEach(p => {
      if (p.lastAnswer !== null) answered++;
    });
    document.getElementById('answersCount').textContent = `${answered}/${this.players.size} хариулсан`;
  }

  checkIfAllAnswered() {
    let allDone = true;
    this.players.forEach(p => {
      if (p.lastAnswer === null) allDone = false;
    });
    if (allDone) {
      if (this.timer) clearInterval(this.timer);
      this.endQuestion();
    }
  }

  // --- АСУУЛТ ДУУСАХ & ОНОО БОДОХ ---
  endQuestion() {
    this.isAnsweringOpen = false;
    if (this.timer) clearInterval(this.timer);

    const q = this.questions[this.currentQuestionIndex];
    const correctIdx = q.correct;

    // Сонголтын статистик тоолох
    const counts = [0, 0, 0, 0];

    this.players.forEach((p, pId) => {
      let isCorrect = false;
      let pointsEarned = 0;

      if (p.lastAnswer !== null) {
        counts[p.lastAnswer.answerIndex]++;

        if (p.lastAnswer.answerIndex === correctIdx) {
          isCorrect = true;
          p.streak++;

          // Онооны томьёо (Хурдан хариулсан нь их оноо авна, max 1000)
          const timeRatio = Math.max(0, p.lastAnswer.timeLeft) / this.questionTotalTime;
          pointsEarned = Math.round(500 + 500 * timeRatio);

          // Дараалсан зөв хариултын бонус
          if (p.streak > 1) {
            pointsEarned += Math.min(500, (p.streak - 1) * 100);
          }
          p.score += pointsEarned;
        } else {
          p.streak = 0;
        }
      } else {
        p.streak = 0;
      }

      // Тоглогчийн үр дүнг илгээх
      const resMsg = {
        type: 'question_result',
        isCorrect: isCorrect,
        pointsEarned: pointsEarned,
        totalScore: p.score,
        streak: p.streak,
        correctIndex: correctIdx
      };
      this.sendToPlayer(pId, resMsg);
    });

    // Хост дэлгэц дээр зөв хариултыг тодруулах ба статистика харуулах
    for (let i = 0; i < 4; i++) {
      const card = document.getElementById(`hostOpt_${i}`);
      const countBadge = document.getElementById(`hostOptCount_${i}`);
      if (card && countBadge) {
        countBadge.textContent = `${counts[i]} хүн`;
        countBadge.style.display = 'block';

        if (i === correctIdx) {
          card.classList.add('correct-highlight');
        } else {
          card.classList.add('dimmed');
        }
      }
    }

    sounds.playCorrect();

    // "Онооны самбар харах" товчийг харуулах
    const nextControls = document.getElementById('hostNextControls');
    nextControls.style.display = 'flex';
  }

  // --- ОНООНЫ САМБАР (LEADERBOARD) ---
  showLeaderboard() {
    this.showView('leaderboardView');
    sounds.playPop();

    const sorted = [...this.players.values()].sort((a, b) => b.score - a.score);
    const listEl = document.getElementById('leaderboardList');
    listEl.innerHTML = '';

    sorted.slice(0, 5).forEach((p, idx) => {
      const item = document.createElement('div');
      item.className = 'lb-item';
      item.innerHTML = `
        <div class="lb-left">
          <div class="lb-rank">${idx + 1}</div>
          <div class="lb-avatar">${p.avatar}</div>
          <div class="lb-name">
            ${p.name}
            ${p.streak >= 2 ? `<span class="lb-streak">🔥 ${p.streak} дараалсан!</span>` : ''}
          </div>
        </div>
        <div class="lb-score">${p.score.toLocaleString()} оноо</div>
      `;
      listEl.appendChild(item);
    });

    // Дараагийн товч
    const nextBtn = document.getElementById('lbNextBtn');
    if (this.currentQuestionIndex + 1 < this.questions.length) {
      nextBtn.textContent = "Дараагийн асуулт ▶";
      nextBtn.onclick = () => this.showQuestion(this.currentQuestionIndex + 1);
    } else {
      nextBtn.textContent = "Шагналын тавцан (Төгсгөл) 🏆";
      nextBtn.onclick = () => this.showPodium();
    }

    // Тоглогчдод самбарын мэдээлэл өгөх
    this.broadcast({
      type: 'leaderboard_view',
      topPlayers: sorted.slice(0, 5).map(p => ({ name: p.name, avatar: p.avatar, score: p.score }))
    });
  }

  // --- ШАГНАЛЫН ТАВЦАН (PODIUM) ---
  showPodium() {
    this.showView('podiumView');
    sounds.playFanfare();

    // Салют / Confetti буудуулах
    if (typeof confetti === 'function') {
      confetti({
        particleCount: 150,
        spread: 90,
        origin: { y: 0.6 }
      });
      setTimeout(() => {
        confetti({ particleCount: 100, angle: 60, spread: 60, origin: { x: 0 } });
        confetti({ particleCount: 100, angle: 120, spread: 60, origin: { x: 1 } });
      }, 500);
    }

    const sorted = [...this.players.values()].sort((a, b) => b.score - a.score);

    // 1st, 2nd, 3rd positions
    const p1 = sorted[0];
    const p2 = sorted[1];
    const p3 = sorted[2];

    const renderPodiumSpot = (prefix, player) => {
      const avatarEl = document.getElementById(`${prefix}Avatar`);
      const nameEl = document.getElementById(`${prefix}Name`);
      const scoreEl = document.getElementById(`${prefix}Score`);

      if (player) {
        avatarEl.textContent = player.avatar;
        nameEl.textContent = player.name;
        scoreEl.textContent = `${player.score.toLocaleString()} оноо`;
      } else {
        avatarEl.textContent = '👤';
        nameEl.textContent = '-';
        scoreEl.textContent = '0 оноо';
      }
    };

    renderPodiumSpot('p1', p1);
    renderPodiumSpot('p2', p2);
    renderPodiumSpot('p3', p3);

    // Тоглогчдод тоглоом дууссан мессеж илгээх
    this.broadcast({
      type: 'game_over',
      topPlayers: sorted.map((p, rank) => ({ rank: rank + 1, name: p.name, avatar: p.avatar, score: p.score }))
    });
  }

  // ==================== ТОГЛОГЧ (PLAYER CLIENT) ====================

  initPlayer() {
    this.role = 'player';
  }

  joinGame(pin, name, avatar) {
    this.pin = pin.trim();
    this.myName = name.trim();
    this.myAvatar = avatar || '🦊';
    this.myScore = 0;
    this.myStreak = 0;

    if (!this.pin || !this.myName) {
      this.showToast("PIN код болон нэрээ оруулна уу!");
      return;
    }

    this.showToast("Тоглоом руу холбогдож байна...");

    // PeerJS холболт үүсгэх
    try {
      if (typeof Peer !== 'undefined') {
        this.peer = new Peer({
          debug: 1,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' }
            ]
          }
        });

        this.peer.on('open', (id) => {
          this.myId = id;
          const hostPeerId = `kahoot-mgl-${this.pin}`;
          console.log("Хосттой холбогдож байна:", hostPeerId);

          const conn = this.peer.connect(hostPeerId, { reliable: true });
          this.hostConn = conn;

          conn.on('open', () => {
            console.log("Хосттой амжилттай холбогдлоо!");
            this.connectedToHost = true;
            conn.send({
              type: 'player_join',
              name: this.myName,
              avatar: this.myAvatar,
              senderId: this.myId
            });
          });

          conn.on('data', (data) => {
            this.handlePlayerReceivedData(data);
          });

          conn.on('error', (err) => {
            console.warn("Холболтын алдаа:", err);
          });
        });

        this.peer.on('error', (err) => {
          console.warn("Peer error:", err);
          this.tryBroadcastJoin();
        });
      } else {
        this.tryBroadcastJoin();
      }
    } catch (e) {
      this.tryBroadcastJoin();
    }

    // Мөн орон нутгийн BroadcastChannel-аар шууд join илгээх
    this.tryBroadcastJoin();

    // Хүлээх дэлгэц харуулах
    document.getElementById('waitAvatar').textContent = this.myAvatar;
    document.getElementById('waitName').textContent = this.myName;
    this.showView('playerWaitingView');
  }

  tryBroadcastJoin() {
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage({
        type: 'player_join',
        name: this.myName,
        avatar: this.myAvatar,
        senderId: this.myId
      });
    }
  }

  // Тоглогч сүлжээнээс мэдээлэл авах
  handlePlayerReceivedData(data) {
    if (!data || !data.type) return;

    // Шүүлтүүр: хэрэв targetId заасан бол өөрт ирсэн эсэхийг шалгах
    if (data.targetId && data.targetId !== this.myId) return;

    if (data.type === 'join_success') {
      sounds.playPlayerJoin();
      this.showToast("Тоглоомд амжилттай орлоо! 🎉");
    }

    else if (data.type === 'get_ready') {
      this.showView('playerWaitingView');
      document.getElementById('waitMsg').textContent = `Бэлтгээрэй! Асуулт эхэлж байна: ${data.count}`;
      sounds.playTick(true);
    }

    else if (data.type === 'question_start') {
      this.hasAnswered = false;
      this.showView('playerQuizView');
      document.getElementById('playerQPreview').textContent = data.question;
      document.getElementById('playerQCounter').textContent = `Асуулт ${data.questionIndex + 1} / ${data.totalQuestions}`;
      document.getElementById('playerTouchButtons').style.display = 'grid';
      document.getElementById('playerAnsweredState').style.display = 'none';

      // 4 товчны текст болон дүрсийг шинэчлэх
      for (let i = 0; i < 4; i++) {
        const btn = document.getElementById(`pBtn_${i}`);
        const label = document.getElementById(`pLabel_${i}`);
        if (label && data.options[i]) {
          label.textContent = data.options[i];
        }
      }
    }

    else if (data.type === 'question_result') {
      this.showView('playerResultView');
      const card = document.getElementById('playerResultCard');
      const icon = document.getElementById('resIcon');
      const title = document.getElementById('resTitle');
      const points = document.getElementById('resPoints');
      const streak = document.getElementById('resStreak');

      if (data.isCorrect) {
        card.className = 'player-result-card result-correct';
        icon.textContent = '🎉';
        title.textContent = 'ЗӨВ ХАРИУЛЛАА!';
        points.textContent = `+${data.pointsEarned} оноо`;
        streak.textContent = data.streak > 1 ? `🔥 ${data.streak} дараалсан зөв!` : '';
        sounds.playCorrect();
      } else {
        card.className = 'player-result-card result-wrong';
        icon.textContent = '😢';
        title.textContent = 'БУРУУ БАЙЛАА';
        points.textContent = `+0 оноо`;
        streak.textContent = 'Дараагийн асуулт дээр хичээгээрэй!';
        sounds.playWrong();
      }

      this.myScore = data.totalScore;
      document.getElementById('playerMyScore').textContent = `${this.myScore.toLocaleString()} оноо`;
    }

    else if (data.type === 'leaderboard_view') {
      this.showView('playerWaitingView');
      document.getElementById('waitMsg').textContent = `Дэлгэц дээр онооны самбарыг харж байна... 👀`;
    }

    else if (data.type === 'game_over') {
      this.showView('playerResultView');
      const card = document.getElementById('playerResultCard');
      const icon = document.getElementById('resIcon');
      const title = document.getElementById('resTitle');
      const points = document.getElementById('resPoints');
      const streak = document.getElementById('resStreak');

      card.className = 'player-result-card result-correct';
      icon.textContent = '🏆';
      title.textContent = 'ТОГЛООМ ДУУССАН!';
      points.textContent = `Нийт: ${this.myScore.toLocaleString()} оноо`;

      const myRankObj = data.topPlayers.find(p => p.name === this.myName);
      streak.textContent = myRankObj ? `Та ${myRankObj.rank}-р байранд орлоо!` : '';
      sounds.playFanfare();

      if (typeof confetti === 'function') {
        confetti({ particleCount: 120, spread: 80, origin: { y: 0.6 } });
      }
    }
  }

  // Тоглогч 4 өнгийн нэг сонголтыг дарах
  submitAnswer(choiceIndex) {
    if (this.hasAnswered) return;
    this.hasAnswered = true;

    sounds.playPop();

    // UI-г хариулсан төлөвт шилжүүлэх
    document.getElementById('playerTouchButtons').style.display = 'none';
    document.getElementById('playerAnsweredState').style.display = 'flex';

    const answerMsg = {
      type: 'player_answer',
      senderId: this.myId,
      answerIndex: choiceIndex,
      timeLeft: this.timeLeft
    };

    if (this.hostConn && this.hostConn.open) {
      try { this.hostConn.send(answerMsg); } catch(e){}
    }
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage(answerMsg);
    }
  }

  // Сүлжээний нийтлэг мессеж боловсруулах
  handleNetworkMessage(data, source) {
    if (this.role === 'host') {
      this.handleHostReceivedData(data, null);
    } else if (this.role === 'player') {
      this.handlePlayerReceivedData(data);
    }
  }

  // Дэлгэц солих туслах функц
  showView(viewId) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const target = document.getElementById(viewId);
    if (target) target.classList.add('active');
  }
}

const game = new GameManager();
