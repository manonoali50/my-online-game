const socket = io();

function createRoom(name, callback){
  socket.emit('createRoom', { name }, callback);
}

function joinRoom(name, roomId, callback){
  socket.emit('joinRoom', { name, roomId }, callback);
}

function startGame(roomId){
  socket.emit('startGame', roomId);
}

function sendAction(roomId, action){
  socket.emit('sendAction', { roomId, action });
}

// Events
socket.on('updatePlayers', (players)=>{
  const ev = new CustomEvent('online_updatePlayers', { detail: players });
  window.dispatchEvent(ev);
});

socket.on('startGame', (players)=>{
  const ev = new CustomEvent('online_startGame', { detail: players });
  window.dispatchEvent(ev);
});

socket.on('receiveAction', (action)=>{
  const ev = new CustomEvent('online_receiveAction', { detail: action });
  window.dispatchEvent(ev);
});
