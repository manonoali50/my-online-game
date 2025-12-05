/* socket-client.js - integrates socket.io multiplayer and exposes window.multiplayer */
const socket = io();

let currentRoom = null;
let myId = null;
let myName = null;
let isHost = false;
let currentPlayers = [];

// Minimal DOM ids are optional in your index.html; functions still work without them.
function randomColor(){ const colors = ['#e53935','#8e24aa','#3949ab','#00897b','#f4511e','#fb8c00','#43a047','#1e88e5']; return colors[Math.floor(Math.random()*colors.length)]; }

// Expose multiplayer API expected by the game code
window.multiplayer = {
  createRoom: (name)=> new Promise((res,rej)=> {
    socket.emit('create-room', { name, color: randomColor() }, (resp)=> {
      if(!resp || !resp.ok) return rej(resp);
      currentRoom = resp.roomId; myId = socket.id; myName = name; isHost = true; currentPlayers = resp.players || [];
      res(resp);
    });
  }),
  joinRoom: (roomId, name)=> new Promise((res,rej)=> {
    socket.emit('join-room', { roomId, name, color: randomColor() }, (resp)=> {
      if(!resp || !resp.ok) return rej(resp);
      currentRoom = roomId; myId = socket.id; myName = name; isHost = (socket.id === resp.hostId); currentPlayers = resp.players || [];
      res(resp);
    });
  }),
  leaveRoom: ()=> new Promise((res,rej)=> {
    if(!currentRoom) return res({ ok:true });
    socket.emit('leave-room', { roomId: currentRoom }, (resp)=> { currentRoom=null; myId=null; isHost=false; currentPlayers=[]; res(resp); });
  }),
  startGame: ()=> new Promise((res,rej)=> {
    if(!currentRoom) return rej({ ok:false, error:'NO_ROOM' });
    socket.emit('start-game', { roomId: currentRoom }, (resp)=> { res(resp); });
  }),
  sendAction: (action)=> { if(!currentRoom) return; socket.emit('game-action', { roomId: currentRoom, action }, ()=>{}); },
  getCurrentRoom: ()=> currentRoom,
  isHost: ()=> isHost,
  getMyId: ()=> socket.id,
  getMyName: ()=> myName
};

// Re-dispatch server events to window-level events so existing game code can listen
socket.on('room-update', (data)=> {
  const ev = new CustomEvent('multiplayer_room_update', { detail: data });
  window.dispatchEvent(ev);
});
socket.on('game-start', (data)=> {
  const ev = new CustomEvent('multiplayer_start', { detail: data });
  window.dispatchEvent(ev);
});
socket.on('game-action', (data)=> {
  const ev = new CustomEvent('multiplayer_action', { detail: data });
  window.dispatchEvent(ev);
});
console.log('socket-client loaded');