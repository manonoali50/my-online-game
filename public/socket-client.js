(function(){
  const proto = (location.protocol === 'https:' ? 'wss://' : 'ws://');
  const host = location.host;
  const url = proto + host + '/ws';
  let ws = null;
  let waitingForStart = false;
  let roomId = null;
  let playerIndex = null;
  let isHost = false;
  let reconnectTimer = null;
  let __renderLoopStarted = false;

    function connect(){
    ws = new WebSocket(url);
    // expose raw socket for ping UI and other helpers
    window.socket = ws;
    // if index.html provided a hook to attach pong listener, call it
    try{ if(window._attachPongListener) window._attachPongListener(ws); }catch(e){}
    ws.onopen = ()=>{ window._debugLog && window._debugLog('WS connected: ' + url); };
    ws.onmessage = e=>{ 
      try{ const msg = JSON.parse(e.data); handle(msg); }catch(err){ window._debugLog('Invalid WS msg: '+ e.data); }
    };
    ws.onclose = ()=>{ window._debugLog('WS closed, reconnecting...'); reconnectTimer = setTimeout(connect,1500); };
    ws.onerror = err=>{ window._debugLog('WS error: ' + err); ws.close(); };
  }
  connect();

  function send(t,d){ if(!ws||ws.readyState!==1){ window._debugLog('WS not ready'); return; } ws.send(JSON.stringify({t,d})); }

  function handle(msg){
    const t = msg.t, d = msg.d;
    window._debugLog && window._debugLog({t,d});
    if(t==='room_created'){
      roomId = d.roomId; playerIndex = d.playerIndex; isHost = true;
      window.isInRoom = true;
      alert('تم إنشاء الغرفة: ' + roomId + '\nانت المضيف.');
      window.updateRoomPlayers && window.updateRoomPlayers(d.players || []);
      document.getElementById('roomInfo').textContent = 'رمز الغرفة: ' + roomId;
      const leaveBtn = document.getElementById('leaveRoomBtn');
      if(leaveBtn) leaveBtn.style.display = 'inline-block';
    } else if(t==='joined'){
      roomId = d.roomId; playerIndex = d.playerIndex; isHost = d.isHost;
      window.isInRoom = true;
      alert('انضممت للغرفة: ' + roomId + (isHost? ' (مضيف)':''));
      window.updateRoomPlayers && window.updateRoomPlayers(d.players || []);
      document.getElementById('roomInfo').textContent = 'رمز الغرفة: ' + roomId;
      const leaveBtn = document.getElementById('leaveRoomBtn');
      if(leaveBtn) leaveBtn.style.display = 'inline-block';
    } else if(t==='player_joined' || t==='player_left' || t==='host_changed'){
      window._debugLog('room event: ' + t);
      if(d && d.players) window.updateRoomPlayers(d.players);
    } else if(t==='state'){
      if(d && d.state){
        // ensure continuous rendering so UI updates without user interaction (mobile browsers)
        if(window.requestRender) window.requestRender();
        try{  }catch(e){}

        if(waitingForStart){ waitingForStart = false; window._debugLog && window._debugLog('Starting online game from state'); if(window.startOnlineGame){ window.startOnlineGame(d.state); } }
        window.lastStateFromServer = d.state; try{ if(window.applyState) window.applyState(d.state); }catch(e){ console.warn('applyState failed', e); }
        if(window.requestRender) window.requestRender();
        if(window.render) window.render(); if(window.requestRender) window.requestRender(); try{  }catch(e){}
        document.getElementById('roomInfo') && (document.getElementById('roomInfo').textContent = 'رمز الغرفة: ' + (roomId||'—'));
        if(d.players) window.updateRoomPlayers(d.players);
      }
    } else if(t==='update'){
      if(d && d.changes){
        // apply delta updates if the page provides a handler
        try{
          if(window.applyDelta) window.applyDelta({ changes: d.changes, players: d.players });
          if(window.requestRender) window.requestRender();
        }catch(e){ console.warn('applyDelta failed', e); }
      }
    } else if(t==='error'){
      alert('خطأ: ' + (d && d.message));
    } else if(t==='game_started'){ waitingForStart = true; window._debugLog && window._debugLog('game_started received'); } else if(t==='host_grid_received'){
      window._debugLog && window._debugLog('host grid received by server');
    
    } else if(t==='setCameraToBase'){
      try{
        const base = d && d.base;
        if(typeof base === 'number' && window.grid && window.grid[base]){
          const cap = window.grid[base];
          if(window.cam){
            window.cam.x = -cap.x;
            window.cam.y = -cap.y;
          }
          if(window.render) window.render(); if(window.requestRender) window.requestRender(); try{  }catch(e){}
        }
      }catch(e){ console.warn('Camera set failed', e); }

    } else if(t==='game_over'){
      // server declared game over
      try{
        const winner = d && d.winner;
        if(winner != null){
          if(window.applyState) window.applyState(d.state || {});
          if(window.victoryOverlay) {
            document.getElementById('victoryText').textContent = 'الفائز هو:';
            document.getElementById('victorName').textContent = (d.winnerName || ('P'+(winner+1)));
            document.getElementById('victoryOverlay').style.display = 'flex';
          }
        }
      }catch(e){ console.warn('game_over handling failed', e); }
    }
  }

  window.socketClient = {
    createRoom(opts){ send('create_room', opts || {}); },
    joinRoom(opts){ send('join_room', opts || {}); },
    leaveRoom(){ send('leave_room', {roomId}); roomId=null; playerIndex=null; isHost=false; window.isInRoom=false; const leaveBtn = document.getElementById('leaveRoomBtn'); if(leaveBtn) leaveBtn.style.display='none'; },
    sendAction(action){ send('action', { action, roomId }); },
    startGame(opts){ 
      if(isHost && window.grid && window.grid.length){
        send('host_grid', { roomId, grid: window.grid, players: (window.players || []).map(p=>({ index: p.index, capital: p.capital, name: p.name })) });
        setTimeout(()=> send('start_game', { roomId, prodRate: (opts && opts.prodRate) || 900 }), 150);
      } else {
        send('start_game', { roomId, prodRate: (opts && opts.prodRate) || 900 });
      }
    },
    getPlayerIndex(){ return playerIndex; }
  };
})();
