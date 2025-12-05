(() => {
  if (!window || !document) return;

  const socket = io();

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
  const dbg = document.getElementById('dbg');
  const dbgContent = document.getElementById('dbgContent');
  const dbgClose = document.getElementById('dbgClose');

  function log(msg){
    console.log(msg);
    if(dbgContent) {
      const div = document.createElement('div'); div.textContent = msg;
      dbgContent.appendChild(div);
      dbg.style.display='block';
    }
  }
  dbgClose.addEventListener('click',()=>{ dbg.style.display='none'; });

  function randomColor(){ const colors=['#e53935','#8e24aa','#3949ab','#00897b','#f4511e','#fb8c00','#43a047','#1e88e5']; return colors[Math.floor(Math.random()*colors.length)]; }

  function openLobby(){ lobbyModal.style.display='flex'; }
  function closeLobby(){ lobbyModal.style.display='none'; }

  onlineBtn.addEventListener('click', openLobby);

  function updateUIRoomCreated(){ leaveBtn.style.display='block'; startGameBtn.style.display='block'; createRoomBtn.disabled=true; joinRoomBtn.disabled=true; startGameBtn.disabled=false; }
  function updateUIRoomJoined(){ leaveBtn.style.display='block'; startGameBtn.style.display='block'; createRoomBtn.disabled=true; joinRoomBtn.disabled=true; }

  createRoomBtn.addEventListener('click',()=>{
    myName = (nicknameInput.value||'Guest').trim(); if(!myName){ alert('اكتب اسم'); return; }
    currentRoom = 'room_'+Math.floor(Math.random()*99999);
    myId = 'p_'+Date.now()+'_'+Math.floor(Math.random()*1000);
    isHost = true;
    socket.emit('createRoom',{roomId:currentRoom,playerId:myId,name:myName,color:randomColor()});
    roomIdInput.value = currentRoom; updateUIRoomCreated(); closeLobby(); log('أنشأت الغرفة: '+currentRoom);
  });

  joinRoomBtn.addEventListener('click',()=>{
    myName = (nicknameInput.value||'Guest').trim(); if(!myName){ alert('اكتب اسم'); return; }
    const room = roomIdInput.value.trim(); if(!room){ alert('اكتب معرف الغرفة'); return; }
    currentRoom = room;
    myId = 'p_'+Date.now()+'_'+Math.floor(Math.random()*1000);
    isHost = false;
    socket.emit('joinRoom',{roomId:currentRoom,playerId:myId,name:myName,color:randomColor()});
    updateUIRoomJoined(); closeLobby(); log('انضممت للغرفة: '+currentRoom);
  });

  leaveBtn.addEventListener('click',()=>{
    if(currentRoom && myId){ socket.emit('leaveRoom',{roomId:currentRoom,playerId:myId}); cleanupLocal(); closeLobby(); log('غادرت الغرفة'); }
  });

  startGameBtn.addEventListener('click',()=>{
    if(!isHost || !currentRoom) return;
    socket.emit('startGame',{roomId:currentRoom});
    log('أرسل أمر بدء اللعبة');
  });

  function renderPlayers(players){
    playersList.innerHTML='';
    players.forEach(p=>{
      const div=document.createElement('div');
      div.className='playerItem';
      div.innerHTML=`<div style="display:flex;gap:8px;align-items:center"><div style="width:12px;height:12px;background:${p.color};border-radius:50%"></div><div>${p.name}</div></div>`+(p.isHost?'<div class="hostBadge">Host</div>':'');
      playersList.appendChild(div);
    });
    startGameBtn.disabled = !(isHost && players.length>=2);
  }

  function cleanupLocal(){ currentRoom=null; myId=null; myName=null; isHost=false; playersList.innerHTML=''; leaveBtn.style.display='none'; startGameBtn.style.display='none'; createRoomBtn.disabled=false; joinRoomBtn.disabled=false; }

  socket.on('updatePlayers',({players,roomId})=>{ if(roomId===currentRoom) renderPlayers(players); });

  socket.on('gameStarted',({roomId,players})=>{
    if(roomId!==currentRoom) return;
    log('اللعبة بدأت'); 
    const ev=new CustomEvent('multiplayer_start',{detail:{players,host:isHost}});
    window.dispatchEvent(ev);
  });

  window.multiplayer={
    sendAction:(action)=>{ if(currentRoom&&myId){ socket.emit('playerAction',{roomId:currentRoom,playerId:myId,action}); }},
    getCurrentRoom:()=>currentRoom,
    isHost:()=>isHost,
    getMyId:()=>myId,
    getMyName:()=>myName
  };

  socket.on('playerAction',({playerId,action})=>{ if(!action) return; const ev=new CustomEvent('multiplayer_action',{detail:action}); window.dispatchEvent(ev); });

})();
