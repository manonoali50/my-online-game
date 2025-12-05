// public/socket-client.js
(function(){
  const socket = io();

  // UI elements (must exist in index.html)
  const createRoomBtn = document.getElementById('createRoomBtn');
  const joinRoomBtn = document.getElementById('joinRoomBtn');
  const nicknameInput = document.getElementById('nicknameInput');
  const roomIdInput = document.getElementById('roomIdInput');
  const playersList = document.getElementById('playersList');
  const startGameBtn = document.getElementById('startGameBtn');
  const leaveBtn = document.getElementById('leaveBtn');

  let currentRoom = null;
  let myName = null;
  let myId = null; // socket.id once connected
  let amHost = false;

  socket.on('connect', ()=> {
    myId = socket.id;
    console.log('socket connected', myId);
  });

  function renderPlayers(arr){
    playersList.innerHTML = '';
    if(!arr || arr.length===0) return;
    arr.forEach((p, idx)=>{
      const div = document.createElement('div');
      div.className = 'playerItem';
      const nameSpan = document.createElement('div');
      nameSpan.style.display = 'flex';
      nameSpan.style.gap = '8px';
      nameSpan.innerHTML = `<div style="width:12px;height:12px;background:${p.color};border-radius:50%;"></div><div>${p.name}${p.id===socket.id ? ' (انت)' : ''}</div>`;
      const right = document.createElement('div');
      if(idx===0) right.innerHTML = '<span class="hostBadge">Host</span>';
      div.appendChild(nameSpan);
      div.appendChild(right);
      playersList.appendChild(div);
    });
  }

  // create room
  createRoomBtn && createRoomBtn.addEventListener('click', ()=>{
    const name = (nicknameInput.value || 'Guest').trim();
    if(!name) return alert('اكتب اسمك');
    socket.emit('createRoom', { name }, (res)=>{
      if(res && res.roomId){
        currentRoom = res.roomId;
        amHost = true;
        renderPlayers(res.players);
        startGameBtn.disabled = false;
        startGameBtn.style.display = 'inline-block';
        leaveBtn.style.display = 'inline-block';
        roomIdInput.value = currentRoom;
        // notify game code
        window.dispatchEvent(new CustomEvent('multiplayer_room', { detail: { roomId: currentRoom, players: res.players, host: true } }));
      }
    });
  });

  // join room
  joinRoomBtn && joinRoomBtn.addEventListener('click', ()=>{
    const name = (nicknameInput.value || 'Guest').trim();
    const roomId = (roomIdInput.value || '').trim();
    if(!name) return alert('اكتب اسمك');
    if(!roomId) return alert('اكتب رمز الغرفة');
    socket.emit('joinRoom', { name, roomId }, (res)=>{
      if(res && res.error){
        alert(res.error);
        return;
      }
      if(res && res.roomId){
        currentRoom = res.roomId;
        amHost = !!res.host;
        renderPlayers(res.players);
        startGameBtn.disabled = !amHost;
        startGameBtn.style.display = amHost ? 'inline-block' : 'none';
        leaveBtn.style.display = 'inline-block';
        window.dispatchEvent(new CustomEvent('multiplayer_room', { detail: { roomId: currentRoom, players: res.players, host: amHost } }));
      }
    });
  });

  // leave
  leaveBtn && leaveBtn.addEventListener('click', ()=>{
    if(!currentRoom) return;
    socket.emit('leaveRoom', { roomId: currentRoom });
    currentRoom = null;
    amHost = false;
    playersList.innerHTML = '';
    startGameBtn.disabled = true;
    startGameBtn.style.display = 'none';
    leaveBtn.style.display = 'none';
    roomIdInput.value = '';
  });

  // start game (host)
  startGameBtn && startGameBtn.addEventListener('click', ()=>{
    if(!currentRoom) return;
    socket.emit('startGame', { roomId: currentRoom });
  });

  // socket listeners
  socket.on('updatePlayers', ({ roomId, players })=>{
    if(roomId !== currentRoom) return;
    renderPlayers(players);
    // enable start button for host
    if(socket.id === (players[0] && players[0].id)) {
      amHost = true;
      startGameBtn.disabled = !(players.length >= 2);
      startGameBtn.style.display = 'inline-block';
    } else {
      amHost = false;
      startGameBtn.disabled = true;
      startGameBtn.style.display = 'none';
    }
  });

  socket.on('gameStarted', ({ roomId, players })=>{
    if(roomId !== currentRoom) return;
    // dispatch start to game (the game's code listens for 'multiplayer_start')
    const hostFlag = amHost;
    window.dispatchEvent(new CustomEvent('multiplayer_start', { detail: { room: roomId, players: players, host: hostFlag } }));
    // hide lobby UI (index.html code will handle)
    // we keep players list updated
  });

  socket.on('playerAction', ({ playerId, action })=>{
    // forward to game logic
    window.dispatchEvent(new CustomEvent('multiplayer_action', { detail: action }));
  });

  // expose window.multiplayer used by the game code
  window.multiplayer = {
    sendAction: (action)=>{
      if(!currentRoom) return;
      socket.emit('playerAction', { roomId: currentRoom, action });
    },
    getCurrentRoom: ()=> currentRoom,
    isHost: ()=> amHost,
    getMyId: ()=> socket.id,
    getMyName: ()=> nicknameInput.value || 'Guest'
  };

})();
