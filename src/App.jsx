import React, { useEffect, useRef, useState } from 'react';
import { QuizGame } from './game.js';
import { io } from 'socket.io-client';

// Na razie łączymy się z lokalnym serwerem. 
const socket = io('http://localhost:3000');

function App() {
  const mountRef = useRef(null);
  const gameRef = useRef(null);
  
  // GŁÓWNE STANY
  const [gameMode, setGameMode] = useState(null); 
  const [gameState, setGameState] = useState('selectMode'); // selectMode, setupLocal, loginOnline, lobbyOnline, playing, playingOnline
  
  // STANY DLA HOT-SEAT (Lokalne)
  const [playersCount, setPlayersCount] = useState(2);
  const [roundsCount, setRoundsCount] = useState(3);
  const [playersData, setPlayersData] = useState([{name: 'Gracz 1', avatar: null, specialization: ''}, {name: 'Gracz 2', avatar: null, specialization: ''}]);
  const [allCategories, setAllCategories] = useState([]);
  const [selectedCats, setSelectedCats] = useState([]);

  // STANY DLA MULTIPLAYER (Online)
  const [playerName, setPlayerName] = useState('');
  const [joinRoomId, setJoinRoomId] = useState('');
  const [currentRoom, setCurrentRoom] = useState(null);
  const [lobbyPlayers, setLobbyPlayers] = useState([]);
  const [isHost, setIsHost] = useState(false);

  // Referencja do aktualnego pokoju (dla nasłuchów socket.io)
  const currentRoomRef = useRef(null);
  useEffect(() => { currentRoomRef.current = currentRoom; }, [currentRoom]);

  useEffect(() => {
    gameRef.current = new QuizGame(mountRef.current);
    
    // Pobieramy kategorie
    fetch('/questions.json')
      .then(res => res.json())
      .then(data => {
        const cats = [...new Set(data.map(q => q.category))];
        setAllCategories(cats);
        setSelectedCats(cats);
      })
      .catch(e => console.error("Błąd ładowania pytań", e));

    // NASŁUCHY SERWERA ONLINE
    socket.on('roomCreated', (data) => {
      setCurrentRoom(data.roomId);
      setIsHost(true);
      setGameState('lobbyOnline');
    });

    socket.on('lobbyUpdate', (players) => {
      setLobbyPlayers(players);
      setGameState(prevState => {
        if (prevState === 'playingOnline') return 'playingOnline';
        return 'lobbyOnline';
      });
    });

    socket.on('errorMsg', (msg) => alert(msg));

    return () => {
      socket.off('roomCreated');
      socket.off('lobbyUpdate');
      socket.off('errorMsg');
      if (mountRef.current && mountRef.current.firstChild) {
        mountRef.current.removeChild(mountRef.current.firstChild);
      }
    };
  }, []);

  // Osobny useEffect do startu gry online (żeby miał dostęp do najnowszego kodu pokoju)
  useEffect(() => {
    const handleGameStarted = (data) => {
      setGameState('playingOnline');
      // Odpalamy tryb online w silniku 3D!
      gameRef.current.startOnline(data.players, socket, currentRoomRef.current);
    };
    socket.on('gameStarted', handleGameStarted);
    return () => socket.off('gameStarted', handleGameStarted);
  }, []);


  // --- LOGIKA LOKALNA (HOT-SEAT) ---
  useEffect(() => {
    setPlayersData(prev => {
      const newData = [];
      for(let i=0; i<playersCount; i++) newData.push(prev[i] || {name: `Gracz ${i+1}`, avatar: null, specialization: ''});
      return newData;
    });
  }, [playersCount]);

  const toggleCategory = (cat) => setSelectedCats(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
  const updatePlayer = (index, field, value) => {
    const newData = [...playersData];
    newData[index][field] = value;
    setPlayersData(newData);
  };
  const handleAvatarChange = (index, file) => { if(file) updatePlayer(index, 'avatar', URL.createObjectURL(file)); };

  const startLocalGame = () => {
    if(selectedCats.length === 0) return alert("Wybierz przynajmniej jedną kategorię!");
    setGameState('playing');
    gameRef.current.start(playersData, roundsCount, selectedCats);
  };

  const quitToMenu = () => {
    gameRef.current.quit();
    setGameState('selectMode');
    setGameMode(null);
    setCurrentRoom(null);
  };

  // --- LOGIKA ONLINE ---
  const handleCreateRoom = () => {
    if (!playerName.trim()) return alert("Wpisz swój nick!");
    socket.emit('createRoom', { playerName });
  };

  const handleJoinRoom = () => {
    if (!playerName.trim()) return alert("Wpisz swój nick!");
    if (!joinRoomId.trim()) return alert("Wpisz kod pokoju!");
    socket.emit('joinRoom', { roomId: joinRoomId, playerName });
    setCurrentRoom(joinRoomId.toUpperCase());
  };

  const startOnlineGame = () => {
    socket.emit('startGame', { roomId: currentRoom });
  };

  return (
    <>
      <div ref={mountRef} style={{ position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 0 }} />
      
      {/* Ekran Pauzy (Tylko dla trybu lokalnego) */}
      <div id="pause-overlay">
        <span>PAUZA</span>
        <button className="start-btn" style={{ fontSize: '1.2rem', marginTop: '40px', letterSpacing: '2px' }} onClick={quitToMenu}>WRÓĆ DO MENU</button>
      </div>

      {/* 1. WYBÓR TRYBU */}
      {gameState === 'selectMode' && (
        <div id="main-menu">
          <h1>Zerroty: Wielki Quiz Y2K</h1>
          <h3 style={{ marginBottom: '30px', color: '#00ffff' }}>Wybierz tryb gry:</h3>
          <div style={{ display: 'flex', gap: '20px', justifyContent: 'center' }}>
            <button className="start-btn" onClick={() => { setGameMode('local'); setGameState('setupLocal'); }}>
              HOT-SEAT (Lokalnie)
            </button>
            <button className="start-btn" style={{ borderColor: '#00ff00', color: '#00ff00', textShadow: '0 0 10px #00ff00' }} onClick={() => { setGameMode('online'); setGameState('loginOnline'); }}>
              MULTIPLAYER (Online)
            </button>
          </div>
        </div>
      )}

      {/* 2A. SETUP HOT-SEAT */}
      {gameState === 'setupLocal' && (
         <div id="main-menu" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
          <h2 style={{ color: '#00ffff' }}>TRYB HOT-SEAT</h2>
          
          <div className="menu-section">
            <h3>Kategorie:</h3>
            <div className="category-select-box">
              {allCategories.map(cat => (
                <button key={cat} className={`cat-btn ${selectedCats.includes(cat) ? 'active' : ''}`} onClick={() => toggleCategory(cat)}>{cat}</button>
              ))}
            </div>
          </div>

          <div className="menu-section">
            <h3>Liczba graczy:</h3>
            {[1, 2, 3, 4].map(num => (
              <button key={num} className={`menu-btn ${playersCount === num ? 'active' : ''}`} onClick={() => setPlayersCount(num)}>{num}</button>
            ))}
          </div>

          <div className="menu-section">
            {playersData.map((p, i) => (
              <div key={i} className="player-setup">
                <input type="text" className="player-input" value={p.name} onChange={(e) => updatePlayer(i, 'name', e.target.value)} maxLength={12} />
                <label className="avatar-label">Avatar <input type="file" accept="image/*" style={{display: 'none'}} onChange={(e) => handleAvatarChange(i, e.target.files[0])} /></label>
                {p.avatar && <img src={p.avatar} className="avatar-preview-img" style={{borderColor: ['#00ffff', '#00ff00', '#ffff00', '#ff00ff'][i]}} alt="avatar" />}
                <select className="spec-select" value={p.specialization} onChange={(e) => updatePlayer(i, 'specialization', e.target.value)}>
                  <option value="">Brak spec.</option>
                  {selectedCats.map(c => <option key={c} value={c}>Spec: {c}</option>)}
                </select>
              </div>
            ))}
          </div>

          <div className="menu-section">
            <h3>Rundy (Po 10 pytań):</h3>
            {[3, 5, 10].map(num => (
              <button key={num} className={`menu-btn ${roundsCount === num ? 'active' : ''}`} onClick={() => setRoundsCount(num)}>{num}</button>
            ))}
          </div>

          <div style={{display: 'flex', gap: '10px', justifyContent: 'center'}}>
            <button className="start-btn" style={{ fontSize: '1rem', padding: '10px' }} onClick={() => setGameState('selectMode')}>Cofnij</button>
            <button className="start-btn" onClick={startLocalGame}>START GRY</button>
          </div>
        </div>
      )}

      {/* 2B. LOGIN ONLINE */}
      {gameState === 'loginOnline' && (
        <div id="main-menu">
          <h2 style={{ color: '#00ff00', textShadow: '0 0 10px #00ff00' }}>TRYB MULTIPLAYER</h2>
          <div className="menu-section">
            <h3>Twój nick:</h3>
            <input type="text" className="player-input" style={{ width: '200px', fontSize: '1.2rem', borderColor: '#00ff00', color: '#00ff00' }} value={playerName} onChange={e => setPlayerName(e.target.value)} maxLength={12} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '20px' }}>
            <div style={{ border: '1px solid #00ffff', padding: '20px' }}>
              <h3>Nowa Gra</h3>
              <button className="start-btn" style={{ padding: '10px 20px', fontSize: '1rem' }} onClick={handleCreateRoom}>Stwórz Pokój</button>
            </div>
            <div style={{ border: '1px solid #ff00ff', padding: '20px' }}>
              <h3>Dołącz do gry</h3>
              <input type="text" className="player-input" placeholder="Kod" value={joinRoomId} onChange={e => setJoinRoomId(e.target.value)} style={{ width: '100px', marginRight: '10px' }} maxLength={4} />
              <button className="start-btn" style={{ padding: '10px 20px', fontSize: '1rem', borderColor: '#ff00ff', color: '#ff00ff' }} onClick={handleJoinRoom}>Dołącz</button>
            </div>
          </div>
          <button className="start-btn" style={{ fontSize: '1rem', padding: '10px', marginTop: '20px' }} onClick={() => setGameState('selectMode')}>Wróć</button>
        </div>
      )}

      {/* 2C. LOBBY ONLINE */}
      {gameState === 'lobbyOnline' && (
        <div id="main-menu" style={{ width: '400px' }}>
          <h2>POKÓJ: <span style={{ color: '#00ff00', letterSpacing: '3px' }}>{currentRoom}</span></h2>
          <div className="menu-section" style={{ textAlign: 'left', background: 'rgba(0,0,0,0.5)', padding: '20px', border: '1px dashed #555' }}>
            <h3 style={{ marginBottom: '15px' }}>Gracze ({lobbyPlayers.length}/4):</h3>
            {lobbyPlayers.map((p, index) => (
              <div key={p.id} style={{ fontSize: '1.2rem', margin: '10px 0', color: ['#00ffff', '#00ff00', '#ffff00', '#ff00ff'][index] }}>
                {index + 1}. {p.name} {p.id === socket.id ? '(Ty)' : ''}
              </div>
            ))}
          </div>
          {isHost ? (
            <div>
              <p style={{ fontSize: '0.8rem', color: '#aaa', marginBottom: '10px' }}>Jesteś hostem. Kiedy wszyscy wejdą, kliknij start!</p>
              <button className="start-btn" onClick={startOnlineGame}>ROZPOCZNIJ ONLINE</button>
            </div>
          ) : (
            <p style={{ color: '#ffff00', fontSize: '1.2rem', marginTop: '20px' }}>Oczekiwanie na hosta...</p>
          )}
          <button className="start-btn" style={{ fontSize: '1rem', padding: '10px', marginTop: '30px', borderColor: '#555', color: '#aaa' }} onClick={() => { setGameState('selectMode'); }}>Wyjdź z pokoju</button>
        </div>
      )}

      {/* UI GRY (Używane przez Local i Online) */}
      <div id="ui-container" style={{ display: (gameState === 'playing' || gameState === 'playingOnline') ? 'flex' : 'none' }}>
        <div id="player-status-bar"></div>
        <div id="quiz-area">
          <div id="category-box">ŁADOWANIE...</div>
          <div id="timer-box">30</div>
          <div id="question-box">Podłączanie do serwera...</div>
          <div id="options-box"></div>
          <div id="turn-indicator"></div>
          <div id="round-indicator"></div>
        </div>
      </div>
    </>
  );
}

export default App; 
