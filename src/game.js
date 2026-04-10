import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RetroTVShader } from './shaders.js';

export class QuizGame {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a001a);
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    
    this.questions = [];
    this.players = [];
    this.timerInterval = null;
    this.isPaused = false;
    this.isOnline = false;
    this.isHost = false;
    this.timeLeft = 30;

    this.soundCorrect = new Audio('/correct.mp3');
    this.soundWrong = new Audio('/wrong.mp3');
    this.soundCorrect.volume = 0.8;
    this.soundWrong.volume = 0.8;
    
    this.init();
    
    window.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'm' && this.categoryBox && this.categoryBox.textContent !== "KONIEC GRY!") {
        if (!this.isOnline && this.playersData) {
          this.togglePause(); 
        } else if (this.isOnline && this.isHost && this.socket) {
          this.socket.emit('togglePause', { roomId: this.currentRoom });
        }
      }
    });
  }

  init() {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.container.appendChild(this.renderer.domElement);
    const light = new THREE.PointLight(0xffffff, 2, 100);
    light.position.set(0, 5, 5);
    this.scene.add(light);
    this.scene.add(new THREE.AmbientLight(0x404040));
    this.camera.position.z = 8;
    this.camera.position.y = 2;
    this.camera.lookAt(0, 0.5, 0);

    this.initPostProcessing();
    window.addEventListener('resize', () => this.onWindowResize());
    this.animate();
  }

  quit() {
    clearInterval(this.timerInterval);
    this.isPaused = false;
    this.isOnline = false;
    this.isHost = false;
    if(this.pauseOverlay) this.pauseOverlay.style.display = 'none';
    this.players.forEach(p => this.scene.remove(p));
    this.players = [];
    this.playersData = null;
    
    if(this.socket) {
      this.socket.off('newQuestion');
      this.socket.off('timerTick');
      this.socket.off('roundResult');
      this.socket.off('gameOver');
      this.socket.off('gamePaused');
      this.socket.off('gameResumed');
    }
  }

  createPlayers() {
    this.players.forEach(p => this.scene.remove(p));
    this.players = [];
    const colors = [0x00ffff, 0x00ff00, 0xffff00, 0xff00ff];
    const textureLoader = new THREE.TextureLoader();

    for(let i = 0; i < this.numPlayers; i++) {
      const geometry = new THREE.CapsuleGeometry(0.5, 1, 16, 16);
      const materialOpts = { color: 0xffffff, emissive: colors[i], emissiveIntensity: 0.8 };
      if (this.playersData[i] && this.playersData[i].avatar) materialOpts.map = textureLoader.load(this.playersData[i].avatar);

      const material = new THREE.MeshPhongMaterial(materialOpts);
      const char = new THREE.Mesh(geometry, material);
      const offset = (this.numPlayers - 1) / 2;
      char.position.x = (i - offset) * 2.5;
      this.players.push(char);
      this.scene.add(char);
    }
  }

  initPostProcessing() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 2.0, 0.1, 0.5);
    this.composer.addPass(bloomPass);
    this.composer.addPass(new ShaderPass(RetroTVShader));
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    if (!this.isPaused) {
      this.players.forEach((p, i) => {
        p.position.y = Math.sin(Date.now() * 0.003 + i) * 0.2 + 0.5;
        if (this.isOnline) {
          p.rotation.y += 0.01;
        } else if (this.statusBar && i === this.currentPlayer) {
          p.rotation.y += 0.02; 
        } else {
          p.rotation.y = 0;
        }
      });
    }
    this.composer.render();
  }

  togglePause() {
    this.isPaused = !this.isPaused;
    if (this.isPaused) {
      clearInterval(this.timerInterval);
      if(this.pauseOverlay) {
        document.getElementById('pause-text').textContent = "PAUZA";
        this.pauseOverlay.style.display = 'flex';
      }
    } else {
      if(this.pauseOverlay) this.pauseOverlay.style.display = 'none';
      this.resumeTimer();
    }
  }

  playSound(type) {
    if (type === 'correct') {
      this.soundCorrect.currentTime = 0;
      this.soundCorrect.play().catch(e => console.log("Audio blocked", e));
    } else {
      this.soundWrong.currentTime = 0;
      this.soundWrong.play().catch(e => console.log("Audio blocked", e));
    }
  }

  // ==========================================
  //         TRYB LOKALNY (HOT-SEAT)
  // ==========================================
  async start(playersData, numRounds, questionsPerRound, selectedCats) {
    this.isOnline = false;
    this.playersData = playersData;
    this.numPlayers = playersData.length;
    this.numRounds = numRounds;
    this.questionsPerRound = questionsPerRound;
    this.selectedCats = selectedCats;
    
    this.currentRound = 1;
    this.questionsInCurrentRound = 0;
    this.scores = new Array(this.numPlayers).fill(0);
    this.currentPlayer = 0;
    this.currentQuestionIndex = 0;
    this.isPaused = false;

    this.categoryBox = document.getElementById('category-box');
    this.questionBox = document.getElementById('question-box');
    this.optionsBox = document.getElementById('options-box');
    this.turnIndicator = document.getElementById('turn-indicator');
    this.statusBar = document.getElementById('player-status-bar');
    this.timerBox = document.getElementById('timer-box');
    this.roundIndicator = document.getElementById('round-indicator');
    this.pauseOverlay = document.getElementById('pause-overlay');

    this.createPlayers();
    await this.loadQuestions();
  }

  async loadQuestions() {
    try {
      const response = await fetch('/questions.json');
      const data = await response.json();
      let filteredData = data.filter(q => this.selectedCats.includes(q.category));
      this.questions = filteredData.sort(() => Math.random() - 0.5);
      if(this.questions.length === 0) {
        this.questionBox.textContent = "Brak pytań w wybranych kategoriach!";
        return;
      }
      this.updateStatusBar();
      this.showCurrentQuestion();
    } catch (error) {
      this.questionBox.textContent = "Błąd wczytywania pytań!";
    }
  }

  showCurrentQuestion() {
    if (this.currentRound > this.numRounds || this.currentQuestionIndex >= this.questions.length) {
      this.endGame(); 
      return;
    }

    const q = this.questions[this.currentQuestionIndex];
    const pData = this.playersData[this.currentPlayer];
    const playerColor = `#${this.players[this.currentPlayer].material.emissive.getHexString()}`;
    const isSpecialization = pData.specialization === q.category;

    this.roundIndicator.textContent = `RUNDA ${this.currentRound} / ${this.numRounds} | PYTANIE ${this.questionsInCurrentRound + 1} / ${this.questionsPerRound}`;
    this.categoryBox.textContent = q.category.toUpperCase() + (isSpecialization ? " (⭐ TWOJA SPECJALIZACJA!)" : "");
    this.questionBox.textContent = q.question;
    this.turnIndicator.textContent = `TURA: ${pData.name.toUpperCase()}`;
    this.turnIndicator.style.color = playerColor;

    this.optionsBox.innerHTML = '';
    q.answers.forEach((ans, idx) => {
      const btn = document.createElement('button');
      btn.className = 'quiz-option';
      btn.textContent = ans;
      btn.disabled = this.isPaused;
      btn.addEventListener('click', () => { if(!this.isPaused) this.checkAnswer(idx); });
      this.optionsBox.appendChild(btn);
    });

    this.timeLeft = 30;
    this.resumeTimer();
  }

  resumeTimer() {
    clearInterval(this.timerInterval);
    this.timerBox.textContent = `00:${this.timeLeft < 10 ? '0'+this.timeLeft : this.timeLeft}`;
    this.timerInterval = setInterval(() => {
      this.timeLeft--;
      this.timerBox.textContent = `00:${this.timeLeft < 10 ? '0'+this.timeLeft : this.timeLeft}`;
      if (this.timeLeft <= 0) this.checkAnswer(-1); 
    }, 1000);
  }

  checkAnswer(selectedIndex) {
    clearInterval(this.timerInterval);
    if(this.timerBox) this.timerBox.textContent = "Koniec!";

    const btns = Array.from(this.optionsBox.children);
    btns.forEach(b => b.disabled = true);

    const q = this.questions[this.currentQuestionIndex];
    const isSpec = this.playersData[this.currentPlayer].specialization === q.category;
    
    let pointsEarned = 0;

    if (selectedIndex === q.correct) {
      this.playSound('correct');
      pointsEarned = isSpec ? 2 : 1;
      this.scores[this.currentPlayer] += pointsEarned;
      
      this.turnIndicator.textContent = `🎉 DOBRA ODPOWIEDŹ! ZDOBYWASZ +${pointsEarned} PKT!`;
      this.turnIndicator.style.color = "#00ff00"; 
      this.turnIndicator.style.textShadow = "0 0 10px #00ff00";
    } else {
      this.playSound('wrong');
      if (isSpec) {
        pointsEarned = -1;
        this.scores[this.currentPlayer] += pointsEarned;
      }
      
      if (selectedIndex === -1) {
        this.turnIndicator.textContent = `⏰ CZAS MINĄŁ! (${pointsEarned} PKT)`;
      } else {
        this.turnIndicator.textContent = `❌ ZŁA ODPOWIEDŹ! (${pointsEarned} PKT)`;
      }
      this.turnIndicator.style.color = "#ff0000"; 
      this.turnIndicator.style.textShadow = "0 0 10px #ff0000";
    }

    btns.forEach((btn, idx) => {
      if (idx === q.correct) {
        btn.style.background = '#00ff00'; 
        btn.style.color = '#000'; 
        btn.style.borderColor = '#00ff00';
      } else if (idx === selectedIndex) {
        btn.style.background = '#ff0000'; 
        btn.style.color = '#fff'; 
        btn.style.borderColor = '#ff0000';
      } else {
        btn.style.opacity = '0.4'; 
      }
    });

    this.updateStatusBar(); 

    setTimeout(() => {
      this.currentPlayer = (this.currentPlayer + 1) % this.numPlayers;
      this.currentQuestionIndex++;
      this.questionsInCurrentRound++;

      if (this.questionsInCurrentRound >= this.questionsPerRound) {
        this.currentRound++;
        this.questionsInCurrentRound = 0;
      }
      
      this.showCurrentQuestion();
    }, 3000);
  }

  // ==========================================
  //         TRYB MULTIPLAYER (ONLINE)
  // ==========================================
  startOnline(serverPlayers, socket, roomId, isHost) {
    this.isOnline = true;
    this.isHost = isHost;
    this.numPlayers = serverPlayers.length;
    this.socket = socket;
    this.currentRoom = roomId;
    this.isPaused = false;
    
    this.playersData = serverPlayers.map(p => ({ name: p.name, avatar: null, specialization: '' }));
    this.scores = serverPlayers.map(p => p.score);

    this.categoryBox = document.getElementById('category-box');
    this.questionBox = document.getElementById('question-box');
    this.optionsBox = document.getElementById('options-box');
    this.turnIndicator = document.getElementById('turn-indicator');
    this.statusBar = document.getElementById('player-status-bar');
    this.timerBox = document.getElementById('timer-box');
    this.roundIndicator = document.getElementById('round-indicator');
    this.pauseOverlay = document.getElementById('pause-overlay');
    
    if (this.pauseOverlay) this.pauseOverlay.style.display = 'none';

    this.createPlayers();
    this.updateStatusBar();

    this.socket.off('newQuestion');
    this.socket.off('timerTick');
    this.socket.off('roundResult');
    this.socket.off('gameOver');
    this.socket.off('gamePaused');
    this.socket.off('gameResumed');

    this.socket.on('newQuestion', (data) => {
      this.roundIndicator.textContent = `RUNDA ${data.roundNumber} / ${data.totalRounds} | PYTANIE ${data.qInRound} / ${data.questionsPerRound}`;
      this.categoryBox.textContent = data.question.category.toUpperCase() + " (ONLINE)";
      this.questionBox.textContent = data.question.question;
      this.turnIndicator.textContent = "SZYBKO, WYBIERZ ODPOWIEDŹ!";
      this.turnIndicator.style.color = "#00ff00";
      
      this.optionsBox.innerHTML = '';
      data.question.answers.forEach((ans, idx) => {
        const btn = document.createElement('button');
        btn.className = 'quiz-option';
        btn.textContent = ans;
        btn.addEventListener('click', () => {
          this.socket.emit('submitAnswer', { roomId: this.currentRoom, answerIndex: idx });
          Array.from(this.optionsBox.children).forEach(b => b.disabled = true);
          btn.style.boxShadow = "0 0 15px #ff00ff";
          btn.style.borderColor = "#ff00ff";
          
          this.turnIndicator.textContent = "ODPOWIEDŹ ZAPISANA! CZEKAMY NA INNYCH...";
          this.turnIndicator.style.color = "#00ffff"; 
          this.turnIndicator.style.textShadow = "0 0 8px #00ffff";
        });
        this.optionsBox.appendChild(btn);
      });
    });

    this.socket.on('timerTick', (timeLeft) => {
      if(this.timerBox) this.timerBox.textContent = `00:${timeLeft < 10 ? '0'+timeLeft : timeLeft}`;
    });

    this.socket.on('roundResult', (data) => {
      const myAnswer = data.answers[this.socket.id];
      const myPoints = data.pointsGained ? (data.pointsGained[this.socket.id] || 0) : 0;

      if (myAnswer === data.correctIndex) {
        this.playSound('correct');
        this.turnIndicator.textContent = `🎉 DOBRA ODPOWIEDŹ! ZDOBYWASZ +${myPoints} PKT!`;
        this.turnIndicator.style.color = "#00ff00"; 
        this.turnIndicator.style.textShadow = "0 0 10px #00ff00";
      } else {
        this.playSound('wrong');
        if (myAnswer !== undefined) {
          this.turnIndicator.textContent = `❌ ZŁA ODPOWIEDŹ! (0 PKT)`;
        } else {
          this.turnIndicator.textContent = `⏰ BRAK ODPOWIEDZI! (0 PKT)`;
        }
        this.turnIndicator.style.color = "#ff0000"; 
        this.turnIndicator.style.textShadow = "0 0 10px #ff0000";
      }

      if(this.timerBox) this.timerBox.textContent = "Koniec czasu!";

      const btns = Array.from(this.optionsBox.children);
      btns.forEach((btn, idx) => {
        if (idx === data.correctIndex) {
          btn.style.background = '#00ff00'; btn.style.color = '#000'; btn.style.borderColor = '#00ff00';
        } else {
          btn.style.opacity = '0.4'; 
        }

        const whoPicked = [];
        for (let [socketId, ansIdx] of Object.entries(data.answers)) {
          if (ansIdx === idx) {
            const p = data.players.find(pl => pl.id === socketId);
            if (p) whoPicked.push(p.name);
          }
        }

        if (whoPicked.length > 0) {
          const badge = document.createElement('div');
          badge.style.fontSize = '0.9rem'; badge.style.marginTop = '10px';
          badge.style.color = idx === data.correctIndex ? '#000' : '#ff00ff';
          badge.style.fontWeight = 'bold'; badge.style.textShadow = 'none';
          badge.textContent = `Wybrali: ${whoPicked.join(', ')}`;
          btn.appendChild(badge);
        }
      });

      data.players.forEach((sp, i) => { if(this.scores.length > i) this.scores[i] = sp.score; });
      this.updateStatusBar();
    });

    this.socket.on('gamePaused', () => {
      this.isPaused = true;
      if(this.pauseOverlay) {
        document.getElementById('pause-text').textContent = "HOST ZATRZYMAŁ GRĘ";
        this.pauseOverlay.style.display = 'flex';
      }
    });

    this.socket.on('gameResumed', () => {
      this.isPaused = false;
      if(this.pauseOverlay) this.pauseOverlay.style.display = 'none';
    });

    this.socket.on('gameOver', (data) => {
      if(this.timerBox) this.timerBox.textContent = "";
      if(this.roundIndicator) this.roundIndicator.textContent = "";
      this.categoryBox.textContent = "KONIEC GRY ONLINE!";
      
      let maxScore = Math.max(...data.players.map(p => p.score));
      let winners = data.players.filter(p => p.score === maxScore).map(p => p.name);
      
      this.questionBox.textContent = `Wygrywa: ${winners.join(', ')} z wynikiem ${maxScore} pkt!`;
      this.optionsBox.innerHTML = '<button class="start-btn" onclick="location.reload()">Wróć do Menu</button>';
      this.turnIndicator.textContent = '';
    });
  }

  updateStatusBar() {
    if(!this.statusBar) return;
    this.statusBar.innerHTML = '';
    for(let i = 0; i < this.numPlayers; i++) {
      const div = document.createElement('div');
      div.className = 'player-score';
      div.style.display = 'flex'; div.style.alignItems = 'center'; div.style.gap = '10px';
      
      const pData = this.playersData[i];
      const avatarHtml = pData.avatar ? `<img src="${pData.avatar}" class="avatar-preview-img" style="border-color: #${this.players[i].material.emissive.getHexString()}">` : '';
      const specText = pData.specialization ? `Spec: ${pData.specialization}` : (this.isOnline ? '' : `Brak spec.`);
      
      div.innerHTML = `${avatarHtml} <span><strong>${pData.name}: ${this.scores[i]} pkt</strong><span class="bonus-info">${specText}</span></span>`;
      div.style.color = `#${this.players[i].material.emissive.getHexString()}`;
      div.style.borderColor = `#${this.players[i].material.emissive.getHexString()}`;
      this.statusBar.appendChild(div);
    }
  }

  endGame() {
    clearInterval(this.timerInterval);
    if(this.timerBox) this.timerBox.textContent = "";
    if(this.roundIndicator) this.roundIndicator.textContent = "";
    
    let maxScore = Math.max(...this.scores);
    let winners = this.scores.map((s, i) => s === maxScore ? this.playersData[i].name : null).filter(n => n !== null);
    
    if(this.categoryBox) this.categoryBox.textContent = "KONIEC GRY!";
    if(this.questionBox) this.questionBox.textContent = `Wygrywa: ${winners.join(', ')} z wynikiem ${maxScore} pkt!`;
    if(this.optionsBox) this.optionsBox.innerHTML = '<button class="start-btn" onclick="location.reload()">Zagraj od nowa</button>';
    if(this.turnIndicator) this.turnIndicator.textContent = '';
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
  }
}