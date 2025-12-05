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
      alert('تم إنشاء الغرفة: ' + roomId + '\nانت المضيف.');
      window.updateRoomPlayers && window.updateRoomPlayers(d.players || []);
      document.getElementById('roomInfo').textContent = 'رمز الغرفة: ' + roomId;
    } else if(t==='joined'){
      roomId = d.roomId; playerIndex = d.playerIndex; isHost = d.isHost;
      alert('انضممت للغرفة: ' + roomId + (isHost? ' (مضيف)':''));
      window.updateRoomPlayers && window.updateRoomPlayers(d.players || []);
      document.getElementById('roomInfo').textContent = 'رمز الغرفة: ' + roomId;
    } else if(t==='player_joined' || t==='player_left' || t==='host_changed'){
      // request state update
      window._debugLog('room event: ' + t);
      // server should send full state periodically; if d.players provided, update
      if(d && d.players) window.updateRoomPlayers(d.players);
    } else if(t==='state'){
      if(d && d.state){
        if(waitingForStart){ waitingForStart = false; window._debugLog && window._debugLog('Starting online game from state'); if(window.startOnlineGame){ window.startOnlineGame(d.state); } }
        window.applyState && window.applyState(d.state);
        document.getElementById('roomInfo') && (document.getElementById('roomInfo').textContent = 'رمز الغرفة: ' + (roomId||'—'));
        if(d.players) window.updateRoomPlayers(d.players);
      }
    } else if(t==='error'){
      alert('خطأ: ' + (d && d.message));
    } else if(t==='game_started'){ waitingForStart = true; window._debugLog && window._debugLog('game_started received'); } else if(t==='state'){
      window._debugLog('game started');
    }
  }

  window.socketClient = {
    createRoom(opts){ send('create_room', opts || {}); },
    joinRoom(opts){ send('join_room', opts || {}); },
    leaveRoom(){ send('leave_room', {roomId}); roomId=null; playerIndex=null; isHost=false; },
    sendAction(action){ send('action', { action, roomId }); },
    startGame(opts){ send('start_game', { roomId, prodRate: (opts && opts.prodRate) || 900 }); }
  };
})();
