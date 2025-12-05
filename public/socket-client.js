const socket = io();

function createRoom(name, cb){ socket.emit('createRoom', name, cb); }
function joinRoom(name, roomId, cb){ socket.emit('joinRoom', name, roomId, cb); }
function startGame(roomId){ socket.emit('startGame', roomId); }
function sendAction(roomId, action){ socket.emit('action',{roomId,action}); }

socket.on('updatePlayers', (players)=>{
  window.dispatchEvent(new CustomEvent('online_updatePlayers',{detail:players}));
});
socket.on('startGame', (players)=>{
  window.dispatchEvent(new CustomEvent('online_startGame',{detail:players}));
});
socket.on('receiveAction', (action)=>{
  window.dispatchEvent(new CustomEvent('online_receiveAction',{detail:action}));
});
