const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

// --------- بيانات الغرف واللاعبين ---------
let rooms = {}; // roomId : { players: [], hostId }

function generateRoomId(){
  return Math.random().toString(36).substring(2, 7).toUpperCase();
}

// ----- Socket.io -----
io.on('connection', socket => {

  socket.on('createRoom', (playerName, callback) => {
    const roomId = generateRoomId();
    rooms[roomId] = { players: [], hostId: socket.id };
    const color = '#' + Math.floor(Math.random()*16777215).toString(16);
    const player = { id: socket.id, name: playerName, color };
    rooms[roomId].players.push(player);
    socket.join(roomId);
    callback({ roomId, players: rooms[roomId].players, host: true });
    io.to(roomId).emit('updatePlayers', rooms[roomId].players);
  });

  socket.on('joinRoom', (playerName, roomId, callback) => {
    if(!rooms[roomId]) return callback({ error: 'الغرفة غير موجودة' });
    const color = '#' + Math.floor(Math.random()*16777215).toString(16);
    const player = { id: socket.id, name: playerName, color };
    rooms[roomId].players.push(player);
    socket.join(roomId);
    callback({ roomId, players: rooms[roomId].players, host: rooms[roomId].hostId === socket.id });
    io.to(roomId).emit('updatePlayers', rooms[roomId].players);
  });

  socket.on('startGame', (roomId)=>{
    if(!rooms[roomId]) return;
    io.to(roomId).emit('startGame', rooms[roomId].players);
  });

  socket.on('action', ({roomId, action})=>{
    socket.to(roomId).emit('receiveAction', action);
  });

  socket.on('disconnect', ()=>{
    for(const roomId in rooms){
      const room = rooms[roomId];
      const idx = room.players.findIndex(p=>p.id===socket.id);
      if(idx!==-1){
        room.players.splice(idx,1);
        if(room.players.length===0){
          delete rooms[roomId];
        } else {
          if(room.hostId===socket.id){
            room.hostId = room.players[0].id;
          }
          io.to(roomId).emit('updatePlayers', room.players);
        }
        break;
      }
    }
  });

});

http.listen(PORT, ()=>console.log(`Server running on port ${PORT}`));
