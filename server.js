const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.static('public'));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

const HEX = 34;

function buildGridForServer(cols = 10, rows = 8){
  const grid = [];
  const startX = -cols * HEX * 0.85;
  const startY = -rows * HEX * 0.95;
  for(let r=0;r<rows;r++){
    for(let c=0;c<cols;c++){
      const x = startX + c * HEX * 1.7 + (r % 2 ? HEX * 0.85 : 0);
      const y = startY + r * HEX * 1.45;
      grid.push({ x, y, owner:null, troops:0, neighbors:[] });
    }
  }
  for(let i=0;i<grid.length;i++){
    const a = grid[i];
    for(let j=0;j<grid.length;j++){
      if(i===j) continue;
      const b = grid[j];
      if(Math.hypot(a.x - b.x, a.y - b.y) < HEX * 1.75) a.neighbors.push(j);
    }
  }
  return grid;
}

function shuffleArray(a){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

function seedCapitalsForPlayers(grid, playersArr){
  const xs = grid.map(c=>c.x), ys = grid.map(c=>c.y);
  const cxMin = Math.min(...xs), cxMax = Math.max(...xs);
  const cyMin = Math.min(...ys), cyMax = Math.max(...ys);
  let corners = [[cxMin,cyMin],[cxMax,cyMin],[cxMin,cyMax],[cxMax,cyMax]];
  corners = shuffleArray(corners);
  for(let p=0;p<playersArr.length;p++){
    const pt = corners[p % corners.length];
    let bestIdx=0, bestD=Infinity;
    for(let i=0;i<grid.length;i++){
      const d = Math.hypot(grid[i].x - pt[0], grid[i].y - pt[1]);
      if(d < bestD){ bestD = d; bestIdx = i; }
    }
    grid[bestIdx].owner = playersArr[p].index;
    grid[bestIdx].troops = 40;
    playersArr[p].capital = bestIdx;
  }
}

function moveTroopsServer(grid, playersArr, fromIdx, toIdx, ratio){
  if(!grid[fromIdx] || !grid[toIdx]) return;
  const f = grid[fromIdx], t = grid[toIdx];
  const send = Math.floor(f.troops * ratio);
  if(send <= 0) return;
  f.troops = Math.max(0, f.troops - send);
  if(t.owner === f.owner){ t.troops += send; }
  else {
    if(send > t.troops){
      const defeatedOwner = t.owner;
      t.owner = f.owner;
      t.troops = send - t.troops;
      if(defeatedOwner != null){
        const defPlayer = playersArr.find(p=>p.index === defeatedOwner);
        if(defPlayer && defPlayer.capital === toIdx){
          defPlayer.alive = false;
          for(const c of grid){ if(c.owner === defeatedOwner){ c.owner = null; c.troops = 0; } }
        }
      }
    } else {
      t.troops = Math.max(0, t.troops - send);
    }
  }
}

const colorPool = ['#3399ff','#ff5555','#ffe047','#8a60ff','#00c48c','#ff8800','#33ffaa','#aa33ff','#ff33aa'];

const rooms = {};

wss.on('connection', function connection(ws){
  ws.id = uuidv4();
  ws.on('message', function incoming(message){
    try{
      const msg = JSON.parse(message);
      handleMessage(ws, msg);
    } catch(e){ console.error('invalid msg', e); }
  });
  ws.on('close', ()=>{
    for(const rid in rooms){
      const room = rooms[rid];
      const idx = room.players.findIndex(p=>p.ws === ws);
      if(idx!==-1){
        const left = room.players.splice(idx,1)[0];
        broadcast(room, { t:'player_left', d:{index:left.index, players:room.players.map(p=>({index:p.index,name:p.name,isHost:(room.host===p.index),color:p.color}))} });
        if(room.host === left.index){
          if(room.players.length>0){ room.host = room.players[0].index; broadcast(room,{t:'host_changed', d:{host:room.host}}); }
        }
        if(room.players.length===0){
          if(room.prodTimer) clearInterval(room.prodTimer);
          delete rooms[rid];
        }
        break;
      }
    }
  });
});

function handleMessage(ws, msg){
  const t = msg.t, d = msg.d;
  if(t==='create_room'){
    const roomId = Math.random().toString(36).slice(2,8).toUpperCase();
    const maxPlayers = d.maxPlayers || 4;
    const defaultCols = Math.max(8, d.cols || 10);
    const defaultRows = Math.max(6, d.rows || 8);
    const room = { id: roomId, players: [], host: null, maxPlayers, grid: buildGridForServer(defaultCols, defaultRows), prodTimer:null, running:false, cols:defaultCols, rows:defaultRows, usedColors:[] };
    rooms[roomId] = room;
    const color = allocateColor(room);
    const player = { ws, index: 0, name: d.name || ('P1'), alive:true, capital:null, color };
    room.players.push(player); room.host = player.index;
    ws.send(JSON.stringify({ t:'room_created', d:{ roomId, playerIndex:player.index, isHost:true, players: room.players.map(p=>({index:p.index,name:p.name,isHost:true,color:p.color})) } }));
  } else if(t==='join_room'){
    const room = rooms[d.roomId];
    if(!room){ ws.send(JSON.stringify({t:'error', d:{message:'الغرفة غير موجودة'}})); return; }
    if(room.players.length >= room.maxPlayers){ ws.send(JSON.stringify({t:'error', d:{message:'الغرفة ممتلئة'}})); return; }
    const idx = room.players.length;
    const color = allocateColor(room);
    const player = { ws, index: idx, name: d.name || ('P'+(idx+1)), alive:true, capital:null, color };
    room.players.push(player);
    ws.send(JSON.stringify({ t:'joined', d:{ roomId: room.id, playerIndex: player.index, isHost: room.host===player.index, players: room.players.map(p=>({index:p.index,name:p.name,isHost:(room.host===p.index),color:p.color})) } }));
    broadcast(room, { t:'player_joined', d:{ index: player.index, players: room.players.map(p=>({index:p.index,name:p.name,isHost:(room.host===p.index),color:p.color})) } });
  } else if(t==='leave_room'){
    const room = rooms[d.roomId]; if(!room) return;
    const i = room.players.findIndex(p=>p.ws===ws);
    if(i!==-1){ const left = room.players.splice(i,1)[0]; if(left.color){ const ci = room.usedColors.indexOf(left.color); if(ci!==-1) room.usedColors.splice(ci,1); } broadcast(room,{t:'player_left', d:{index:left.index, players:room.players.map(p=>({index:p.index,name:p.name,isHost:(room.host===p.index),color:p.color}))}}); if(room.host===left.index){ if(room.players.length>0){ room.host = room.players[0].index; broadcast(room,{t:'host_changed', d:{host:room.host}}); } } if(room.players.length===0){ if(room.prodTimer) clearInterval(room.prodTimer); delete rooms[room.id]; } }
  } else if(t==='host_grid'){
    const room = rooms[d.roomId];
    if(!room) { ws.send(JSON.stringify({t:'error', d:{message:'الغرفة غير موجودة'}})); return; }
    if(d.grid && Array.isArray(d.grid) && d.grid.length>0){
      room.grid = d.grid;
    }
    if(d.players && Array.isArray(d.players)){
      for(const pd of d.players){
        const rp = room.players.find(p=>p.index===pd.index);
        if(rp){
          rp.capital = (typeof pd.capital !== 'undefined') ? pd.capital : rp.capital;
          rp.name = pd.name || rp.name;
        }
      }
    }
    ws.send(JSON.stringify({t:'host_grid_received', d:{ roomId: room.id }}));
  } else if(t==='start_game'){
    const room = rooms[d.roomId]; if(!room) return;
    if(room.running){
      room.grid = buildGridForServer(room.cols, room.rows);
      room.running = false;
      if(room.prodTimer) clearInterval(room.prodTimer);
    }
    const playersArr = room.players.map(p=>({ws:p.ws, index:p.index, capital:null, alive:p.alive, color:p.color, name:p.name}));
    seedCapitalsForPlayers(room.grid, playersArr);
    for(const pa of playersArr){
      const rp = room.players.find(p=>p.index===pa.index);
      if(rp) rp.capital = pa.capital;
    }
    room.running = true;
    room.prodTimer = setInterval(()=>{
      for(const c of room.grid){ if(c.owner != null) c.troops++; }
      broadcast(room, { t:'state', d:{ state: { grid: room.grid, players: room.players.map(p=>({index:p.index,name:p.name,isHost:(room.host===p.index),capital:p.capital,alive:p.alive,color:p.color})) } } });
    }, Math.max(50, (d.prodRate||300)));
    broadcast(room, { t:'game_started', d:{} });
    broadcast(room, { t:'state', d:{ state: { grid: room.grid, players: room.players.map(p=>({index:p.index,name:p.name,isHost:(room.host===p.index),capital:p.capital,alive:p.alive,color:p.color})) } } });
  } else if(t==='action'){
    const room = findRoomByWs(ws);
    if(!room) return;
    const action = d.action;
    if(action.type==='move'){
      moveTroopsServer(room.grid, room.players, action.from, action.to, action.ratio);
      broadcast(room, { t:'state', d:{ state: { grid: room.grid, players: room.players.map(p=>({index:p.index,name:p.name,isHost:(room.host===p.index),capital:p.capital,alive:p.alive,color:p.color})) } } });
    }
  } else if(t==='ping'){
    sendDirect(ws, { t:'pong', d:{ ts:d && d.ts ? d.ts : Date.now() } });
  }
}

function allocateColor(room){
  for(const c of colorPool){
    if(!room.usedColors.includes(c)){
      room.usedColors.push(c);
      return c;
    }
  }
  return colorPool[Math.floor(Math.random()*colorPool.length)];
}

function sendDirect(ws, msg){ try{ ws.send(JSON.stringify(msg)); }catch(e){} } 

function findRoomByWs(ws){
  for(const id in rooms){
    const r = rooms[id];
    if(r.players.some(p=>p.ws===ws)) return r;
  }
  return null;
}

function broadcast(room, msg){ const s = JSON.stringify(msg); for(const p of room.players) { try{ p.ws.send(s); }catch(e){ console.warn('send failed', e); } } }

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=> console.log('Server listening on', PORT));
