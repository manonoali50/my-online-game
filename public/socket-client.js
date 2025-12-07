(function(){
  const proto = (location.protocol === 'https:' ? 'wss://' : 'ws://');
  const host = location.host;
  const url = proto + host + '/ws';
  let ws = null;
  let roomId = null;
  let playerIndex = null;
  let isHost = false;

  function connect(){
    ws = new WebSocket(url);
    ws.onopen = ()=>{ window._debugLog && window._debugLog('WS connected: ' + url); };
    ws.onmessage = e=>{ 
      try{ const msg = JSON.parse(e.data); handle(msg); }catch(err){ window._debugLog && window._debugLog('Invalid WS msg: '+ e.data); }
    };
    ws.onclose = ()=>{ window._debugLog && window._debugLog('WS closed'); setTimeout(connect, 1000); };
    ws.onerror = ()=>{};
  }
  connect();

  function send(t, d){ if(!ws || ws.readyState!==1) return; ws.send(JSON.stringify({ t, d })); }

  function handle(msg){
    if(!msg || !msg.t) return;
    const t = msg.t, d = msg.d;
    switch(t){
      case 'room_created':
      case 'joined':
        roomId = (d.roomId || d.roomId) || (d.roomId);
        playerIndex = (d.playerIndex !== undefined) ? d.playerIndex : playerIndex;
        isHost = !!(d.isHost);
        // update lobby players UI if available
        if(d.players && window.updateLobbyUI) window.updateLobbyUI(d.players);
        break;
      case 'player_joined':
      case 'player_left':
      case 'host_changed':
        if(d.players && window.updateLobbyUI) window.updateLobbyUI(d.players);
        break;
      case 'host_grid_received':
        // ignore
        break;
      case 'game_started':
        // nothing extra here
        break;
      case 'state':
        try{
          const state = d.state || {};
          if(state.grid) window.grid = state.grid;
          if(state.players) window.players = state.players.map(p=>({ index:p.index, name:p.name, color:p.color || '#999', capital:p.capital, alive:!!p.alive }));
          // force immediate render/update without needing user input
          if(window.startOnlineGame) window.startOnlineGame(state);
          if(window.render) window.render();
        }catch(e){ console.warn('state handling failed', e); }
        break;
      case 'game_over':
        try{
          const state = d.state || {};
          if(state.grid) window.grid = state.grid;
          if(state.players) window.players = state.players;
          if(window.render) window.render();
        }catch(e){ console.warn('game_over handling failed', e); }
        break;
      case 'setCameraToBase':
        try{
          const base = d && d.base;
          if(typeof base === 'number' && window.grid && window.grid[base]){
            const cap = window.grid[base];
            if(window.cam){ window.cam.x = -cap.x; window.cam.y = -cap.y; if(window.cam.scale) window.cam.scale = Math.max(0.9,1.0); }
            if(window.render) window.render();
          } else if(base && base.x !== undefined && base.y !== undefined){
            if(window.cam){ window.cam.x = -base.x; window.cam.y = -base.y; if(window.cam.scale) window.cam.scale = Math.max(0.9,1.0); }
            if(window.render) window.render();
          }
        }catch(e){ console.warn('setCameraToBase failed', e); }
        break;
      case 'error':
        console.warn('server error', d && d.message);
        break;
      default:
        // unknown message
        break;
    }
  }

  window.socketClient = {
    createRoom(opts){ send('create_room', opts || {}); },
    joinRoom(opts){ send('join_room', opts || {}); },
    leaveRoom(){ send('leave_room', {roomId}); roomId=null; },
    sendAction(action){ send('action', { action, roomId }); },
    startGame(opts){ 
      if(isHost && window.grid && window.grid.length){
        // send host grid and players to server then start
        const playersForHost = (window.players || []).map(p=>({ index:p.index, capital:p.capital, name:p.name }));
        send('host_grid', { roomId, grid: window.grid, players: playersForHost });
        setTimeout(()=> send('start_game', { roomId, prodRate: (opts && opts.prodRate) || 900 }), 150);
      } else {
        send('start_game', { roomId, prodRate: (opts && opts.prodRate) || 900 });
      }
    },
    getPlayerIndex(){ return playerIndex; }
  };
})();
