import React, { useEffect, useRef, useState } from 'react';
import { QuizGame } from './game.js';
import { io } from 'socket.io-client';

const socket = io('https://zerroty-server.onrender.com'); 

function App() {
  const mountRef = useRef(null);
  const gameRef = useRef(null);
  
  const [gameMode, setGameMode] = useState(null); 
  const [gameState, setGameState] = useState('selectMode'); 
  
  const [playersCount, setPlayersCount] = useState(2);
  const [roundsCount, setRoundsCount] = useState(10); 
  const [playersData, setPlayersData] = useState([{name: 'Gracz 1', avatar: null, specialization: ''}, {name: 'Gracz 2', avatar: null, specialization: ''}]);
  const [allCategories, setAllCategories] = useState([]);
  const [selectedCats, setSelectedCats] = useState([]);

  // Online
  const [playerName, setPlayerName] = useState('');
  const [joinRoomId, setJoinRoomId] = useState('');
  const [currentRoom, setCurrentRoom] = useState(null);
  const [lobbyPlayers, setLobbyPlayers] = useState([]);
  const [isHost, setIsHost] = useState(false);

  const currentRoomRef = useRef(null);
  const isHostRef = useRef(false);

  useEffect(() => { currentRoomRef.current = currentRoom; }, [currentRoom]);
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);

  useEffect(() => {
    gameRef.current = new QuizGame(mountRef.current);
    
    fetch('/questions.json').then(res => res.json()).then(data => {
        const cats = [...new Set(data.map(q => q.category))];
        setAllCategories(cats);
        setSelectedCats(cats);
    });

    socket.on('roomCreated', (data) => {
      setCurrentRoom(data.roomId);
      setIsHost(true);
      setGameState('lobbyOnline');
    });

    socket.on('lobbyUpdate', (players) => {
      setLobbyPlayers(players);
      setGameState(prevState => prevState === 'playingOnline' ? 'playingOnline' : 'lobbyOnline');
    });

    socket.on('errorMsg', (msg) => alert(msg));

    return () => {
      socket.off('roomCreated'); socket.off('lobbyUpdate'); socket.off('errorMsg');
      if (mountRef.current && mountRef.current.firstChild) mountRef.current.removeChild(mountRef.current.firstChild);
    };
  }, []);

  useEffect(() => {
    const handleGameStarted = (data) => {
      setGameState('playingOnline');
      gameRef.current.startOnline(data.players, socket, currentRoomRef.current, isHostRef.current);
    };
    socket.on('gameStarted', handleGameStarted);
    return () => socket.off('gameStarted', handleGameStarted);
  }, []);

  useEffect(() => {
    setPlayersData(prev => {
      const newData = [];
      for(let i=0; i<playersCount; i++) newData.push(prev[i] || {name: `Gracz ${i+1}`, avatar: null, specialization: ''});
      return newData;
    });
  }, [playersCount]);

  const toggleCategory = (cat) => setSelectedCats(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
  const updatePlayer = (index, field, value) => {
    const newData = [...playersData]; newData[index][field] = value; setPlayersData(newData);
  };
  const handleAvatarChange = (index, file) => { if(file) updatePlayer(index, 'avatar', URL.createObjectURL(file)); };

  const startLocalGame = () => {
    if(selectedCats.length === 0) return alert("Wybierz przynajmniej jedną kategorię!");
    setGameState('playing');
    gameRef.current.start(playersData, roundsCount, selectedCats);
  };

  // Zunifikowane wyjście do Menu Głównego
  const quitToMenu = () => {
    if (gameMode === 'online' && currentRoom) {
      socket.emit('leaveRoom', { roomId: currentRoom });
    }
    gameRef.current.quit();
    setGameState('selectMode');
    setGameMode(null);
    setCurrentRoom(null);
    setIsHost(false);
    setLobbyPlayers([]);
  };

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
    if(selectedCats.length === 0) return alert("Wybierz przynajmniej jedną kategorię!");
    socket.emit('startGame', { roomId: currentRoom, roundsCount: roundsCount, categories: selectedCats });
  };

  return (
    <>
      <div ref={mountRef} style={{ position: 'absolute', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 0 }} />
      
      <div id="pause-overlay">
        <span id="pause-text">PAUZA</span>
        <button className="start-btn" style={{ fontSize: '1.2rem', marginTop: '40px', letterSpacing: '2px' }} onClick={quitToMenu}>ZAKOŃCZ I WRÓĆ DO MENU</button>
      </div>

      {gameState === 'selectMode' && (
        <div id="main-menu">
          <h1>Zerroty: Wielki Quiz Y2K</h1>
          <h3 style={{ marginBottom: '30px', color: '#00ffff' }}>Wybierz tryb gry:</h3>
          <div style={{ display: 'flex', gap: '20px', justifyContent: 'center' }}>
            <button className="start-btn" onClick={() => { setGameMode('local'); setGameState('setupLocal'); }}>HOT-SEAT (Lokalnie)</button>
            <button className="start-btn" style={{ borderColor: '#00ff00', color: '#00ff00', textShadow: '0 0 10px #00ff00' }} onClick={() => { setGameMode('online'); setGameState('loginOnline'); }}>MULTIPLAYER (Online)</button>
          </div>
        </div>
      )}

      {gameState === 'setupLocal' && (
         <div id="main-menu" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
          <h2 style={{ color: '#00ffff' }}>TRYB HOT-SEAT</h2>
          <div className="menu-section">
            <h3>Kategorie:</h3>
            <div className="category-select-box">
              {allCategories.map(cat => <button key={cat} className={`cat-btn ${selectedCats.includes(cat) ? 'active' : ''}`} onClick={() => toggleCategory(cat)}>{cat}</button>)}
            </div>
          </div>
          <div className="menu-section">
            <h3>Liczba graczy:</h3>
            {[1, 2, 3, 4].map(num => <button key={num} className={`menu-btn ${playersCount === num ? 'active' : ''}`} onClick={() => setPlayersCount(num)}>{num}</button>)}
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
            <h3>Liczba pytań w rundzie:</h3>
            {[5, 10, 15, 20].map(num => <button key={num} className={`menu-btn ${roundsCount === num ? 'active' : ''}`} onClick={() => setRoundsCount(num)}>{num}</button>)}
          </div>
          <div style={{display: 'flex', gap: '10px', justifyContent: 'center'}}>
            <button className="start-btn" style={{ fontSize: '1rem', padding: '10px' }} onClick={() => setGameState('selectMode')}>Cofnij</button>
            <button className="start-btn" onClick={startLocalGame}>START GRY</button>
          </div>
        </div>
      )}

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

      {gameState === 'lobbyOnline' && (
        <div id="main-menu" style={{ width: '600px', maxHeight: '90vh', overflowY: 'auto' }}>
          <h2>POKÓJ: <span style={{ color: '#00ff00', letterSpacing: '3px' }}>{currentRoom}</span></h2>
          <div className="menu-section" style={{ textAlign: 'left', background: 'rgba(0,0,0,0.5)', padding: '20px', border: '1px dashed #555' }}>
            <h3 style={{ marginBottom: '15px' }}>Gracze ({lobbyPlayers.length}/4):</h3>
            {lobbyPlayers.map((p, index) => (
              <div key={p.id} style={{ fontSize: '1.2rem', margin: '10px 0', color: ['#00ffff', '#00ff00', '#ffff00', '#ff00ff'][index] }}>
                {index + 1}. {p.name} {p.id === socket.id ? '(Ty)' : (isHost && index === 0 ? '(Host)' : '')}
              </div>
            ))}
          </div>
          
          {isHost ? (
            <div>
              <div className="menu-section" style={{ marginTop: '20px' }}>
                <h3 style={{color: '#00ffff'}}>Wybierz Kategorie:</h3>
                <div className="category-select-box">
                  {allCategories.map(cat => <button key={cat} className={`cat-btn ${selectedCats.includes(cat) ? 'active' : ''}`} onClick={() => toggleCategory(cat)}>{cat}</button>)}
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <span style={{ marginRight: '10px', fontSize: '1.1rem' }}>Ilość pytań:</span>
                <select value={roundsCount} onChange={e => setRoundsCount(Number(e.target.value))} className="spec-select" style={{ fontSize: '1.1rem', padding: '5px' }}>
                  <option value={5}>5 pytań</option>
                  <option value={10}>10 pytań</option>
                  <option value={15}>15 pytań</option>
                  <option value={20}>20 pytań</option>
                  <option value={30}>30 pytań</option>
                </select>
              </div>
              <button className="start-btn" onClick={startOnlineGame}>ROZPOCZNIJ GRĘ ONLINE</button>
            </div>
          ) : (
            <p style={{ color: '#ffff00', fontSize: '1.2rem', marginTop: '20px' }}>Host wybiera kategorie. Oczekiwanie na start...</p>
          )}
          <br/>
          <button className="start-btn" style={{ fontSize: '1rem', padding: '10px', marginTop: '20px', borderColor: '#555', color: '#aaa' }} onClick={quitToMenu}>Wyjdź z pokoju</button>
        </div>
      )}

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
