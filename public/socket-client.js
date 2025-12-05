(function(){
  // Simple WebSocket client for rooms and syncing
  const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
  let ws = null;
  let mode = 'offline';
  let roomId = null;
  let playerId = null;
  let isHost = false;
  let handlers = {};
  const reconnectDelay = 1500;

  function connect(){
    ws = new WebSocket(url);
    ws.onopen = ()=>{ console.log('ws open'); };
    ws.onmessage = e=>{ try{ const msg=JSON.parse(e.data); handle(msg); }catch(err){ console.error('invalid msg',err); } };
    ws.onclose = ()=>{ console.log('ws closed'); setTimeout(()=>connect(), reconnectDelay); };
    ws.onerror = (err)=>{ console.error('ws err', err); ws.close(); };
  }
  connect();

  function send(t, d){ if(!ws||ws.readyState!==1) return; ws.send(JSON.stringify({t, d})); }

  function handle(msg){
    const t = msg.t, d = msg.d;
    if(t==='room_created'){
      roomId = d.roomId; playerId = d.playerIndex; mode='online'; isHost = true;
      alert('تم إنشاء الغرفة: ' + roomId + '\nانت المضيف. شارك الرمز للانضمام.');
    } else if(t==='joined'){
      roomId = d.roomId; playerId = d.playerIndex; mode='online'; isHost = d.isHost;
      alert('انضممت للغرفة: ' + roomId + (isHost? ' (مضيف)':''));
    } else if(t==='state'){
      // full state update
      window.applyState && window.applyState(d.state);
    } else if(t==='player_left'){
      alert('لاعب غادر الغرفة');
    } else if(t==='host_changed'){
      isHost = d.isHost;
      alert('المضيف تغير. هل أنت المضيف الآن؟ ' + isHost);
    } else if(t==='error'){
      alert('خطأ: ' + d.message);
    } else if(t==='game_started'){
      alert('اللعبة بدأت');
      // server will send state updates
    }
  }

  // public API
  window.socketClient = {
    mode:'offline',
    createRoom(opts){ send('create_room', {name: opts.name||null, maxPlayers: opts.maxPlayers||4}); },
    joinRoom(opts){ send('join_room', {roomId: opts.roomId}); },
    leaveRoom(){ if(roomId) send('leave_room', {roomId}); roomId=null; playerId=null; mode='offline'; },
    sendAction(action){ if(!roomId) return; send('action', {roomId, action}); },
    playerId:null
  };

})();
