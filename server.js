const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.static('public'));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

function buildGrid(W = 10, H = 8, HEX = 34){
  const grid = [];
  const cols = Math.max(8, W);
  const rows = Math.max(6, H);
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

function seedCapitalsForPlayers(grid, playersArr){
  // corners
  const xs = grid.map(c=>c.x), ys = grid.map(c=>c.y);
  const cxMin = Math.min(...xs), cxMax = Math.max(...xs);
  const cyMin = Math.min(...ys), cyMax = Math.max(...ys);
  const corners = [[cxMin,cyMin],[cxMax,cyMin],[cxMin,cyMax],[cxMax,cyMax]];
  // shuffle corners and assign first N unique corners
  const shuffled = corners.sort(()=>Math.random()-0.5);
  for(let p=0;p<playersArr.length;p++){
    const pt = shuffled[p % shuffled.length];
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

function moveTroopsServer(grid, players, fromIdx, toIdx, ratio){
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
      // eliminate defeated owner's cells
      if(defeatedOwner != null){
        // if defeated owner had a capital that's taken, mark alive false
        const defPlayer = players.find(p=>p.index === defeatedOwner);
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

const rooms = {}; // roomId -> room object

wss.on('connection', function connection(ws, req){
  ws.id = uuidv4();
  ws.on('message', function incoming(message){
    try{
      const msg = JSON.parse(message);
      handleMessage(ws, msg);
    }catch(e){ console.error('invalid message', e); }
  });
  ws.on('close', ()=>{
    // remove from any room
    for(const rid in rooms){
      const room = rooms[rid];
      const idx = room.players.findIndex(p=>p.ws === ws);
      if(idx!==-1){
        const left = room.players.splice(idx,1)[0];
        broadcast(room, { t:'player_left', d:{index:left.index} });
        // if host left, transfer host to first player
        if(room.host === left.index){
          if(room.players.length>0){ room.host = room.players[0].index; broadcast(room,{t:'host_changed', d:{host:room.host}}); }
        }
        // if no players left, clear room
        if(room.players.length===0){
          clearInterval(room.prodTimer);
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
    const room = {
      id: roomId, players: [], host: null, maxPlayers, grid: buildGrid(), playersInfo: [], prodTimer:null, running:false
    };
    rooms[roomId] = room;
    // add creator as first player
    const player = { ws, index: 0, name: d.name || ('P1'), alive:true, capital:null };
    room.players.push(player); room.host = player.index; room.playersInfo.push(player);
    ws.send(JSON.stringify({ t:'room_created', d:{roomId, playerIndex:player.index, isHost:true} }));
  } else if(t==='join_room'){
    const room = rooms[d.roomId];
    if(!room){ ws.send(JSON.stringify({t:'error', d:{message:'الغرفة غير موجودة'}})); return; }
    if(room.players.length >= room.maxPlayers){ ws.send(JSON.stringify({t:'error', d:{message:'الغرفة ممتلئة'}})); return; }
    const idx = room.players.length;
    const player = { ws, index: idx, name: 'P'+(idx+1), alive:true, capital:null };
    room.players.push(player); room.playersInfo.push(player);
    ws.send(JSON.stringify({ t:'joined', d:{roomId:room.id, playerIndex:player.index, isHost: room.host === player.index} }));
    broadcast(room, { t:'player_joined', d:{index:player.index} });
  } else if(t==='leave_room'){
    const room = rooms[d.roomId]; if(!room) return;
    const i = room.players.findIndex(p=>p.ws===ws);
    if(i!==-1){ const left = room.players.splice(i,1)[0]; broadcast(room,{t:'player_left', d:{index:left.index}}); if(room.host===left.index){ if(room.players.length>0){ room.host = room.players[0].index; broadcast(room,{t:'host_changed', d:{host:room.host}}); } } if(room.players.length===0){ clearInterval(room.prodTimer); delete rooms[room.id]; } }
  } else if(t==='action'){
    handleAction(ws, d.action);
  } else if(t==='start_game'){
    const room = rooms[d.roomId]; if(!room) return;
    if(room.running) return;
    // prepare players array for seeding
    const playersArr = room.players.map(p=>({ws:p.ws, index:p.index, capital:null, alive:true}));
    seedCapitalsForPlayers(room.grid, playersArr);
    // copy capitals back to room players
    for(const pa of playersArr){
      const rp = room.players.find(p=>p.index===pa.index);
      if(rp) rp.capital = pa.capital;
    }
    room.running = true;
    // start production timer
    room.prodTimer = setInterval(()=>{
      for(const c of room.grid){ if(c.owner != null) c.troops++; }
      broadcast(room, { t:'state', d:{ state: { grid: room.grid, players: room.players.map(p=>({index:p.index, color:'#fff', name:p.name, capital:p.capital, alive:p.alive})) } } });
    }, Math.max(50, (d.prodRate||900)));
    // send initial full state
    broadcast(room, { t:'game_started', d:{} });
    broadcast(room, { t:'state', d:{ state: { grid: room.grid, players: room.players.map(p=>({index:p.index, color:'#fff', name:p.name, capital:p.capital, alive:p.alive})) } } });
  }
}

function handleAction(ws, action){
  // actions include move: {roomId, action:{type:'move', from, to, ratio}}
  if(action.type==='move'){
    const room = findRoomByWs(ws);
    if(!room) return;
    moveTroopsServer(room.grid, room.players, action.from, action.to, action.ratio);
    // broadcast updated state
    broadcast(room, { t:'state', d:{ state: { grid: room.grid, players: room.players.map(p=>({index:p.index, color:'#fff', name:p.name, capital:p.capital, alive:p.alive})) } } });
  }
}

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
