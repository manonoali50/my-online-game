// socket-client.js
(() => {
  // تأكد من أن الـ HTML يحتوي على عناصر متعلقة باللعبة
  if (!window || !document) return;

  const socket = io(); // اتصل بالسيرفر مباشرة

  let currentRoom = null;
  let myId = null;
  let myName = null;
  let isHost = false;

  const onlineBtn = document.getElementById('onlineBtn');
  const lobbyModal = document.getElementById('lobbyModal');
  const nicknameInput = document.getElementById('nicknameInput');
  const createRoomBtn = document.getElementById('createRoomBtn');
  const joinRoomBtn = document.getElementById('joinRoomBtn');
  const roomIdInput = document.getElementById('roomIdInput');
  const playersList = document.getElementById('playersList');
  const startGameBtn = document.getElementById('startGameBtn');
  const leaveBtn = document.getElementById('leaveBtn');

  function randomColor(){
    const colors = ['#e53935','#8e24aa','#3949ab','#00897b','#f4511e','#fb8c00','#43a047','#1e88e5'];
    return colors[Math.floor(Math.random()*colors.length)];
  }

  function openLobby(){
    lobbyModal.style.display = 'flex';
    lobbyModal.setAttribute('aria-hidden','false');
  }

  function closeLobby(){
    lobbyModal.style.display = 'none';
    lobbyModal.setAttribute('aria-hidden','true');
  }

  onlineBtn.addEventListener('click', ()=>{
    openLobby();
  });

  function updateUIRoomCreated(){
    leaveBtn.style.display = 'block';
    startGameBtn.style.display = 'block';
    createRoomBtn.disabled = true;
    joinRoomBtn.disabled = true;
    startGameBtn.disabled = false;
  }

  function updateUIRoomJoined(){
    leaveBtn.style.display = 'block';
    startGameBtn.style.display = 'block';
    createRoomBtn.disabled = true;
    joinRoomBtn.disabled = true;
  }

  createRoomBtn.addEventListener('click', ()=>{
    myName = (nicknameInput.value || 'Guest').trim();
    if(!myName) { alert('اكتب اسم'); return; }
    currentRoom = 'room_' + Math.floor(Math.random()*1000000);
    myId = 'p_' + Date.now() + '_' + Math.floor(Math.random()*1000);
    isHost = true;

    socket.emit('createRoom', { roomId: currentRoom, playerId: myId, name: myName, color: randomColor() });
    roomIdInput.value = currentRoom;
    updateUIRoomCreated();
  });

  joinRoomBtn.addEventListener('click', ()=>{
    myName = (nicknameInput.value || 'Guest').trim();
    if(!myName) { alert('اكتب اسم'); return; }
    const id = (roomIdInput.value || '').trim();
    if(!id){ alert('اكتب معرف الغرفة'); return; }
    currentRoom = id;
    myId = 'p_' + Date.now() + '_' + Math.floor(Math.random()*1000);
    isHost = false;

    socket.emit('joinRoom', { roomId: currentRoom, playerId: myId, name: myName, color: randomColor() });
    updateUIRoomJoined();
  });

  leaveBtn.addEventListener('click', ()=>{
    if(currentRoom && myId){
      socket.emit('leaveRoom', { roomId: currentRoom, playerId: myId });
      cleanupLocal();
      closeLobby();
    }
  });

  startGameBtn.addEventListener('click', ()=>{
    if(!isHost || !currentRoom) return;
    socket.emit('startGame', { roomId: currentRoom });
  });

  function renderPlayers(players){
    playersList.innerHTML = '';
    players.forEach(p=>{
      const div = document.createElement('div');
      div.className = 'playerItem';
      const isH = p.isHost;
      div.innerHTML = `<div style="display:flex;gap:8px;align-items:center"><div style="width:12px;height:12px;background:${p.color};border-radius:50%"></div><div>${escapeHtml(p.name)}</div></div>` + (isH ? '<div class="hostBadge">Host</div>' : '');
      playersList.appendChild(div);
    });
    startGameBtn.disabled = !(isHost && players.length>=2);
  }

  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m];}); }

  function cleanupLocal(){
    currentRoom = null;
    myId = null;
    myName = null;
    isHost = false;
    playersList.innerHTML = '';
    leaveBtn.style.display = 'none';
    startGameBtn.style.display = 'none';
    createRoomBtn.disabled = false;
    joinRoomBtn.disabled = false;
  }

  // استقبال التحديثات من السيرفر
  socket.on('updatePlayers', (players)=>{
    renderPlayers(players);
  });

  socket.on('gameStarted', (players)=>{
    const ev = new CustomEvent('multiplayer_start', { detail: { players: players, host: isHost } });
    window.dispatchEvent(ev);
    closeLobby();
  });

  // إرسال تحركات اللعبة
  window.multiplayer = {
    sendAction: (action)=>{
      if(currentRoom && myId){
        socket.emit('playerAction', { roomId: currentRoom, playerId: myId, action });
      }
    },
    getCurrentRoom: ()=>currentRoom,
    isHost: ()=>isHost,
    getMyId: ()=>myId,
    getMyName: ()=>myName
  };

  // استقبال تحركات الآخرين
  socket.on('playerAction', (data)=>{
    const a = data.action;
    if(!a) return;
    try{
      const ev = new CustomEvent('multiplayer_action', { detail: a });
      window.dispatchEvent(ev);
    }catch(err){ console.error('apply action error',err); }
  });

})();
