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

  function connect(){
    ws = new WebSocket(url);
    ws.onopen = ()=>{ window._debugLog && window._debugLog('WS connected: ' + url); };
    ws.onmessage = e=>{ 
      try{ const msg = JSON.parse(e.data); handle(msg); }catch(err){ window._debugLog('Invalid WS msg: '+ e.data); }
    };
    ws.onclose = ()=>{ window._debugLog('WS closed, reconnecting...'); if(reconnectTimer) clearTimeout(reconnectTimer); reconnectTimer = setTimeout(connect,1500); };
    ws.onerror = err=>{ window._debugLog('WS error: ' + (err && err.message ? err.message : err)); try{ ws.close(); }catch(e){} };
  }
  connect();

  function send(t,d){ 
    if(!ws || ws.readyState !== 1){ window._debugLog && window._debugLog('WS not ready'); return; } 
    ws.send(JSON.stringify({t,d})); 
  }

  function annotatePlayersWithMe(list){
    if(!Array.isArray(list)) return list;
    return list.map(p => (Object.assign({}, p, { isMe: (typeof playerIndex === 'number' && p.index === playerIndex) })));
  }

  function handle(msg){
    const t = msg.t, d = msg.d;
    window._debugLog && window._debugLog({t,d});
    if(t === 'room_created'){
      roomId = d.roomId; playerIndex = d.playerIndex; isHost = true;
      const players = annotatePlayersWithMe(d.players || []);
      window.updateRoomPlayers && window.updateRoomPlayers(players);
      const ri = document.getElementById('roomInfo'); if(ri) ri.textContent = 'رمز الغرفة: ' + roomId;
      alert('تم إنشاء الغرفة: ' + roomId + '\nانت المضيف.');
      return;
    }

    if(t === 'joined'){
      roomId = d.roomId; playerIndex = d.playerIndex; isHost = !!d.isHost;
      const players = annotatePlayersWithMe(d.players || []);
      window.updateRoomPlayers && window.updateRoomPlayers(players);
      const ri = document.getElementById('roomInfo'); if(ri) ri.textContent = 'رمز الغرفة: ' + roomId;
      alert('انضممت للغرفة: ' + roomId + (isHost? ' (مضيف)':'' ) );
      return;
    }

    if(t === 'player_joined' || t === 'player_left' || t === 'host_changed'){
      if(d && d.players){
        const players = annotatePlayersWithMe(d.players);
        window.updateRoomPlayers && window.updateRoomPlayers(players);
      }
      if(t === 'host_changed' && d && typeof d.host !== 'undefined'){
        isHost = (d.host === playerIndex);
      }
      return;
    }

    if(t === 'game_started'){
      waitingForStart = true;
      return;
    }

    if(t === 'state'){
      if(d && d.state){
        const s = d.state;
        if(Array.isArray(s.players)){
          s.players = annotatePlayersWithMe(s.players);
        }

        if(waitingForStart){
          waitingForStart = false;
          try{ if(window.startOnlineGame) window.startOnlineGame(s); }catch(e){}
        }

        try{ window.applyState && window.applyState(s); }catch(e){}

        if(d.players) {
          const players = annotatePlayersWithMe(d.players);
          window.updateRoomPlayers && window.updateRoomPlayers(players);
        }
      }
      return;
    }

    if(t === 'error'){
      try{ alert('خطأ: ' + (d && d.message)); }catch(e){}
      return;
    }
  }

  window.socketClient = {
    createRoom(opts){
      send('create_room', opts || {});
    },
    joinRoom(opts){
      send('join_room', opts || {});
    },
    leaveRoom(){
      send('leave_room', { roomId });
      roomId = null; playerIndex = null; isHost = false;
    },
    sendAction(action){
      send('action', { action, roomId });
    },
    startGame(opts){
      send('start_game', { roomId, prodRate: (opts && opts.prodRate) || 900 });
    },
    getRoomId(){ return roomId; },
    getPlayerIndex(){ return playerIndex; },
    amIHost(){ return isHost; }
  };
})();
