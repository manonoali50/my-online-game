const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.static('public'));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

const HEX = 34;
const colorPool = ['#ff5555','#3399ff','#00c48c','#ffe047'];


// --- Added validation helpers to protect against corrupted grids ---
function isFiniteNumber(n){
  return typeof n === 'number' && isFinite(n) && Math.abs(n) < 1e7;
}
function validateCell(c){
  if(!c || typeof c !== 'object') return false;
  if(!isFiniteNumber(c.x) || !isFiniteNumber(c.y)) return false;
  if(!('troops' in c) || typeof c.troops !== 'number' || !isFinite(c.troops) || c.troops < 0 || c.troops > 1e6) return false;
  if(!('neighbors' in c) || !Array.isArray(c.neighbors)) return false;
  if(c.neighbors.length > 20) return false;
  if(c.owner !== null && (typeof c.owner !== 'number' || !Number.isInteger(c.owner) || c.owner < 0 || c.owner > 1000)) return false;
  return true;
}
function validateGrid(grid){
  if(!Array.isArray(grid)) return false;
  if(grid.length < 20 || grid.length > 4000) return false;
  for(let i=0;i<grid.length;i++){
    if(!validateCell(grid[i])) return false;
  }
  return true;
}

function ensureValidRoomGrid(room){
  try{
    if(!validateGrid(room.grid)){
      console.warn('Invalid grid detected for room', room.id, '— rebuilding grid to safe defaults.');
      room.grid = buildGridForServer(Math.max(8,10), Math.max(6,8));
      const playersArr = room.players.map(p=>({ws:p.ws, index:p.index, capital:p.capital||null, alive:true}));
      seedCapitalsForPlayers(room.grid, playersArr);
      for(const pa of playersArr){
        const rp = room.players.find(p=>p.index===pa.index);
        if(rp) rp.capital = pa.capital;
      }


function clampNumber(v, minV, maxV){ if(typeof v !== 'number' || !isFinite(v)) return minV; return Math.max(minV, Math.min(maxV, v)); }

function sanitizeCellForSend(cell){
  return {
    x: clampNumber(cell.x, -1e6, 1e6),
    y: clampNumber(cell.y, -1e6, 1e6),
    owner: (cell.owner === null ? null : (Number.isInteger(cell.owner) ? cell.owner : null)),
    troops: clampNumber(Math.floor(Number(cell.troops) || 0), 0, 1000000),
    neighbors: Array.isArray(cell.neighbors) ? cell.neighbors.filter(n=>Number.isInteger(n) && n>=0 && n<10000).slice(0,40) : []
  };
}

function sanitizeState(room){
  try{
    const safeGrid = room.grid.map(sanitizeCellForSend);
    const safePlayers = room.players.map(p=>({ index: p.index, name: p.name||('P'+(p.index+1)), isHost: (room.host===p.index), capital: (typeof p.capital==='number' ? p.capital : null), alive: !!p.alive, color: p.color||'#999' }));
    return { grid: safeGrid, players: safePlayers };
  }catch(e){
    console.warn('sanitizeState failed', e);
    return { grid: buildGridForServer(Math.max(8,10), Math.max(6,8)).map(sanitizeCellForSend), players: room.players.map(p=>({ index: p.index, name: p.name||('P'+(p.index+1)), isHost: (room.host===p.index), capital: null, alive: !!p.alive, color: p.color||'#999' })) };
  }
}
    }
  }catch(e){ console.warn('ensureValidRoomGrid failed', e); }
}

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

function seedCapitalsForPlayers(grid, playersArr){
  const xs = grid.map(c=>c.x), ys = grid.map(c=>c.y);
  const cxMin = Math.min(...xs), cxMax = Math.max(...xs);
  const cyMin = Math.min(...ys), cyMax = Math.max(...ys);
  const corners = [[cxMin,cyMin],[cxMax,cyMin],[cxMin,cyMax],[cxMax,cyMax]];
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
    const room = { id: roomId, players: [], host: null, maxPlayers, grid: buildGridForServer(defaultCols, defaultRows), prodTimer:null, running:false };
    rooms[roomId] = room;
    const player = { ws, index: 0, name: d.name || ('P1'), alive:true, capital:null, color: colorPool[0 % colorPool.length] };
    room.players.push(player); room.host = player.index;
    ws.send(JSON.stringify({ t:'room_created', d:{ roomId, playerIndex:player.index, isHost:true, players: room.players.map(p=>({index:p.index,name:p.name,isHost:true,color:p.color})) } }));
  } else if(t==='join_room'){
    const room = rooms[d.roomId];
    if(!room){ ws.send(JSON.stringify({t:'error', d:{message:'الغرفة غير موجودة'}})); return; }
    if(room.players.length >= room.maxPlayers){ ws.send(JSON.stringify({t:'error', d:{message:'الغرفة ممتلئة'}})); return; }
    const idx = room.players.length;
    // assign next available color (non-repeating)
    const used = new Set(room.players.map(p=>p.color));
    let color = colorPool[idx % colorPool.length];
    for(const c of colorPool){ if(!used.has(c)){ color=c; break; } }
    const player = { ws, index: idx, name: 'P'+(idx+1), alive:true, capital:null, color };
    room.players.push(player);
    // notify joining player
    ws.send(JSON.stringify({ t:'joined', d:{ roomId: room.id, playerIndex: player.index, isHost: room.host===player.index, players: room.players.map(p=>({index:p.index,name:p.name,isHost:(room.host===p.index),color:p.color})) } }));
    // notify others
    broadcast(room, { t:'player_joined', d:{ index: player.index, players: room.players.map(p=>({index:p.index,name:p.name,isHost:(room.host===p.index),color:p.color})) } });
  } else if(t==='leave_room'){
    const room = rooms[d.roomId]; if(!room) return;
    const i = room.players.findIndex(p=>p.ws===ws);
    if(i!==-1){ const left = room.players.splice(i,1)[0]; broadcast(room,{t:'player_left', d:{index:left.index, players:room.players.map(p=>({index:p.index,name:p.name,isHost:(room.host===p.index),color:p.color}))}}); if(room.host===left.index){ if(room.players.length>0){ room.host = room.players[0].index; broadcast(room,{t:'host_changed', d:{host:room.host}}); } } if(room.players.length===0){ if(room.prodTimer) clearInterval(room.prodTimer); delete rooms[room.id]; } }
  } else if(t==='host_grid'){
    const room = rooms[d.roomId];
    if(!room) { ws.send(JSON.stringify({t:'error', d:{message:'الغرفة غير موجودة'}})); return; }
    if(d.grid && Array.isArray(d.grid) && d.grid.length>0){
      if(validateGrid(d.grid)){
        room.grid = d.grid;
      } else {
        console.warn('Rejected invalid host_grid from client for room', room.id);
        ws.send(JSON.stringify({t:'error', d:{message:'invalid_grid'}}));
        return;
      }
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
    // always reset previous running state and grid (unless host provided a grid earlier)
    room.running = true;
    // if host previously provided a grid it's already in room.grid; otherwise generate fresh grid
    if(!room.grid || room.grid.length===0) room.grid = buildGridForServer(Math.max(8,10), Math.max(6,8));
    // reset all ownership/troops
    room.grid.forEach(c=>{ c.owner = null; c.troops = 0; });
    const playersArr = room.players.map(p=>({ws:p.ws, index:p.index, capital:p.capital||null, alive:true}));
    // seed capitals for this match (ensures fresh starts)
    seedCapitalsForPlayers(room.grid, playersArr);
    // save capitals back to room players
    for(const pa of playersArr){
      const rp = room.players.find(p=>p.index===pa.index);
      if(rp) rp.capital = pa.capital;
      if(rp) rp.alive = true;
    }
    // broadcast players (include color)
    const playersForState = room.players.map(p=>({ index:p.index, name:p.name, isHost:(room.host===p.index), capital:p.capital, alive:p.alive, color:p.color }));
    room.prodTimer = setInterval(()=>{
      ensureValidRoomGrid(room);
      for(const c of room.grid){ if(c.owner != null) c.troops++; }
      // check victory
      const alivePlayers = room.players.filter(p=>p.alive);
      if(alivePlayers.length <= 1){
        // game over
        clearInterval(room.prodTimer);
        room.running = false;
        const winner = alivePlayers.length===1 ? alivePlayers[0].index : null;
        const __safe_state = sanitizeState(room);
        broadcast(room, { t:'game_over', d:{ winner, winnerName: winner!=null ? alivePlayers[0].name : null, state: __safe_state } });
        return;
      }
      const __safe_state = sanitizeState(room);
    broadcast(room, { t:'state', d:{ state: __safe_state } });
    }, Math.max(50, (d.prodRate||100)));
    ensureValidRoomGrid(room);
    broadcast(room, { t:'game_started', d:{} });
    const __safe_state = sanitizeState(room);
    broadcast(room, { t:'state', d:{ state: __safe_state } });
    } else if(t==='action'){
    const room = findRoomByWs(ws);
    if(!room) return;
    const action = d.action;
    if(action.type==='move'){
      moveTroopsServer(room.grid, room.players, action.from, action.to, action.ratio);
      // prepare players for state with color field
      const playersForState = room.players.map(p=>({ index:p.index, name:p.name, isHost:(room.host===p.index), capital:p.capital, alive:p.alive, color:p.color }));
      const __safe_state = sanitizeState(room);
    broadcast(room, { t:'state', d:{ state: __safe_state } });
    // after move check victory
      const alivePlayers = room.players.filter(p=>p.alive);
      if(alivePlayers.length <= 1){
        if(room.prodTimer) clearInterval(room.prodTimer);
        room.running = false;
        const winner = alivePlayers.length===1 ? alivePlayers[0].index : null;
        const __safe_state = sanitizeState(room);
        broadcast(room, { t:'game_over', d:{ winner, winnerName: winner!=null ? alivePlayers[0].name : null, state: __safe_state } });
      }
    }
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
