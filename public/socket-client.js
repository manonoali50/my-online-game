(() => {
  if (!window || !document) return;

  const socket = io();

  let currentRoom = null;
  let myId = null;
  let myName = null;
  let isHost = false;
  let players = [];

  const onlineBtn = document.getElementById('onlineBtn');
  const lobbyModal = document.getElementById('lobbyModal');
  const nicknameInput = document.getElementById('nicknameInput');
  const createRoomBtn = document.getElementById('createRoomBtn');
  const joinRoomBtn = document.getElementById('joinRoomBtn');
  const roomIdInput = document.getElementById('roomIdInput');
  const playersList = document.getElementById('playersList');
  const startGameBtn = document.getElementById('startGameBtn');
  const leaveBtn = document.getElementById('leaveBtn');

  // ----- Console صغيرة للأخطاء -----
  const dbg = document.createElement('div');
  dbg.style.cssText = 'position:fixed;top:12px;right:12px;width:300px;height:200px;background:rgba(0,0,0,0.7);color:white;padding:8px;border-radius:8px;font-size:12px;overflow:auto;z-index:9999;';
  const closeBtn = document.createElement('button');
  closeBtn.innerText = 'x';
  closeBtn.style.cssText = 'position:absolute;top:4px;right:4px;padding:2px 6px;border:none;border-radius:4px;background:red;color:white;cursor:pointer;';
  closeBtn.onclick = () => dbg.style.display = 'none';
  dbg.appendChild(closeBtn);
  document.body.appendChild(dbg);

  function logDebug(msg){
    const p = document.createElement('div');
    p.innerText = msg;
    dbg.appendChild(p);
    dbg.scrollTop = dbg.scrollHeight;
    console.log(msg);
  }

  function randomColor(){
    const colors = ['#e53935','#8e24aa','#3949ab','#00897b','#f4511e','#fb8c00','#43a047','#1e88e5'];
    return colors[Math.floor(Math.random()*colors.length)];
  }

  function openLobby(){ lobbyModal.style.display='flex'; }
  function closeLobby(){ lobbyModal.style.display='none'; }

  onlineBtn.addEventListener('click', openLobby);

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
    myName = (nicknameInput.value||'Guest').trim();
    if(!myName) return alert('اكتب اسم');
    myId = 'p_'+Date.now()+'_'+Math.floor(Math.random()*1000);
    currentRoom = 'room_'+Math.floor(Math.random()*99999);
    isHost = true;

    socket.emit('createRoom', { roomId: currentRoom, playerId: myId, name: myName, color: randomColor() });
    roomIdInput.value = currentRoom;
    updateUIRoomCreated();
    closeLobby();
    logDebug('أنشأت غرفة كهوست: ' + currentRoom);
  });

  joinRoomBtn.addEventListener('click', ()=>{
    myName = (nicknameInput.value||'Guest').trim();
    if(!myName) return alert('اكتب اسم');
    const room = roomIdInput.value.trim();
    if(!room) return alert('اكتب معرف الغرفة');
    myId = 'p_'+Date.now()+'_'+Math.floor(Math.random()*1000);
    currentRoom = room;
    isHost = false;

    socket.emit('joinRoom', { roomId: currentRoom, playerId: myId, name: myName, color: randomColor() });
    updateUIRoomJoined();
    closeLobby();
    logDebug('انضممت لغرفة: ' + currentRoom);
  });

  leaveBtn.addEventListener('click', ()=>{
    if(currentRoom && myId){
      socket.emit('leaveRoom', { roomId: currentRoom, playerId: myId });
      cleanupLocal();
      closeLobby();
      logDebug('غادرت الغرفة');
    }
  });

  startGameBtn.addEventListener('click', ()=>{
    if(!isHost || !currentRoom) return;
    socket.emit('startGame', { roomId: currentRoom });
    logDebug('أرسل أمر بدأ اللعبة');
  });

  function renderPlayers(playersArr){
    playersList.innerHTML = '';
    playersArr.forEach(p=>{
      const div = document.createElement('div');
      div.className = 'playerItem';
      div.innerHTML = `<div style="display:flex;gap:8px;align-items:center"><div style="width:12px;height:12px;background:${p.color};border-radius:50%"></div><div>${escapeHtml(p.name)}</div></div>` + (p.isHost ? '<div class="hostBadge">Host</div>' : '');
      playersList.appendChild(div);
    });
    startGameBtn.disabled = !(isHost && playersArr.length>=2);
  }

  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

  function cleanupLocal(){
    currentRoom = null; myId = null; myName = null; isHost = false; players = [];
    playersList.innerHTML = '';
    leaveBtn.style.display = 'none';
    startGameBtn.style.display = 'none';
    createRoomBtn.disabled = false;
    joinRoomBtn.disabled = false;
  }

  // ----- استقبال تحديثات اللاعبين -----
  socket.on('updatePlayers', ({players: pls, roomId})=>{
    if(roomId === currentRoom){
      players = pls;
      renderPlayers(players);
      logDebug('تحديث اللاعبين: ' + players.map(p=>p.name).join(', '));
    }
  });

  // ----- بدء اللعبة -----
  socket.on('gameStarted', ({roomId, players: pls})=>{
    if(roomId !== currentRoom) return;
    players = pls;
    logDebug('اللعبة بدأت فعلياً!');
    startMultiplayerGame();
  });

  // ----- استقبال تحركات اللاعبين -----
  socket.on('playerAction', ({playerId, action})=>{
    if(!action) return;
    const ev = new CustomEvent('multiplayer_action', { detail: action });
    window.dispatchEvent(ev);
  });

  // ----- إرسال تحركاتنا -----
  window.multiplayer = {
    sendAction: (action)=>{
      if(currentRoom && myId) socket.emit('playerAction', { roomId: currentRoom, playerId: myId, action });
    },
    getCurrentRoom: ()=>currentRoom,
    isHost: ()=>isHost,
    getMyId: ()=>myId,
    getMyName: ()=>myName
  };

  // ----- دوال بدء اللعبة الفعلية -----
  function startMultiplayerGame(){
    // مثال: تهيئة الخريطة واللاعبين
    if(typeof initMap === 'function') initMap();
    if(typeof spawnPlayers === 'function') spawnPlayers(players);
    if(typeof startGameLoop === 'function') startGameLoop();
    logDebug('تم تهيئة الخريطة واللاعبين');
  }

})();
