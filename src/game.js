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
    this.timeLeft = 30;
    
    this.init();
    
    // Zmiana na klawisz M i zabezpieczenie przed pauzowaniem na ekranie końca gry
    window.addEventListener('keydown', (e) => {
      if (e.key.toLowerCase() === 'm' && this.playersData && this.categoryBox && this.categoryBox.textContent !== "KONIEC GRY!") {
        this.togglePause();
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

  async start(playersData, numRounds, selectedCats) {
    this.playersData = playersData;
    this.numPlayers = playersData.length;
    this.numRounds = numRounds;
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

  quit() {
    // Czyszczenie interwałów, pauzy i modeli, aby wrócić czysto do menu
    clearInterval(this.timerInterval);
    this.isPaused = false;
    if(this.pauseOverlay) this.pauseOverlay.style.display = 'none';
    this.players.forEach(p => this.scene.remove(p));
    this.players = [];
    this.playersData = null; // Zabezpieczenie pauzy z poziomu menu
  }

  createPlayers() {
    this.players.forEach(p => this.scene.remove(p));
    this.players = [];

    const colors = [0x00ffff, 0x00ff00, 0xffff00, 0xff00ff];
    const textureLoader = new THREE.TextureLoader();

    for(let i = 0; i < this.numPlayers; i++) {
      const geometry = new THREE.CapsuleGeometry(0.5, 1, 16, 16);
      const materialOpts = { color: 0xffffff, emissive: colors[i], emissiveIntensity: 0.8 };

      if (this.playersData[i].avatar) {
        materialOpts.map = textureLoader.load(this.playersData[i].avatar);
      }

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
        if (this.statusBar && i === this.currentPlayer) p.rotation.y += 0.02; 
        else p.rotation.y = 0;
      });
    }
    this.composer.render();
  }

  togglePause() {
    this.isPaused = !this.isPaused;
    if (this.isPaused) {
      clearInterval(this.timerInterval);
      this.pauseOverlay.style.display = 'flex';
    } else {
      this.pauseOverlay.style.display = 'none';
      this.resumeTimer();
    }
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

    this.roundIndicator.textContent = `RUNDA ${this.currentRound}/${this.numRounds} | PYTANIE ${this.questionsInCurrentRound + 1}/10`;
    
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
      if (this.timeLeft <= 0) {
        this.checkAnswer(-1);
      }
    }, 1000);
  }

  checkAnswer(selectedIndex) {
    clearInterval(this.timerInterval);
    const q = this.questions[this.currentQuestionIndex];
    const isSpec = this.playersData[this.currentPlayer].specialization === q.category;
    
    if (selectedIndex === q.correct) {
      this.scores[this.currentPlayer] += isSpec ? 2 : 1;
    } else {
      if (isSpec && selectedIndex !== -1) { // jeśli to nie timeout, tylko zła odpowiedź
        this.scores[this.currentPlayer] -= 1;
      } else if (isSpec && selectedIndex === -1) {
        this.scores[this.currentPlayer] -= 1; // za timeout na swojej spec. też karzemy
      }
    }
    
    this.currentPlayer = (this.currentPlayer + 1) % this.numPlayers;
    this.currentQuestionIndex++;
    this.questionsInCurrentRound++;

    if (this.questionsInCurrentRound >= 10) {
      this.currentRound++;
      this.questionsInCurrentRound = 0;
    }
    
    this.updateStatusBar();
    this.showCurrentQuestion();
  }

  updateStatusBar() {
    this.statusBar.innerHTML = '';
    for(let i = 0; i < this.numPlayers; i++) {
      const div = document.createElement('div');
      div.className = 'player-score';
      div.style.display = 'flex';
      div.style.alignItems = 'center';
      div.style.gap = '10px';
      
      const avatarHtml = this.playersData[i].avatar ? `<img src="${this.playersData[i].avatar}" class="avatar-preview-img" style="border-color: #${this.players[i].material.emissive.getHexString()}">` : '';
      const specText = this.playersData[i].specialization ? `Spec: ${this.playersData[i].specialization}` : `Brak spec.`;
      
      div.innerHTML = `${avatarHtml} <span><strong>${this.playersData[i].name}: ${this.scores[i]} pkt</strong><span class="bonus-info">${specText}</span></span>`;
      div.style.color = `#${this.players[i].material.emissive.getHexString()}`;
      div.style.borderColor = `#${this.players[i].material.emissive.getHexString()}`;
      this.statusBar.appendChild(div);
    }
  }

  endGame() {
    clearInterval(this.timerInterval);
    this.timerBox.textContent = "";
    this.roundIndicator.textContent = "";
    
    let maxScore = Math.max(...this.scores);
    let winners = this.scores.map((s, i) => s === maxScore ? this.playersData[i].name : null).filter(n => n !== null);
    
    this.categoryBox.textContent = "KONIEC GRY!";
    this.questionBox.textContent = `Wygrywa: ${winners.join(', ')} z wynikiem ${maxScore} pkt!`;
    this.optionsBox.innerHTML = '<button class="start-btn" onclick="location.reload()">Zagraj od nowa</button>';
    this.turnIndicator.textContent = '';
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.composer.setSize(window.innerWidth, window.innerHeight);
  }
} 
