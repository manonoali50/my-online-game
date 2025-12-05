const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname + '/public')); // ملفات اللعبة داخل مجلد public

let rooms = {}; // { roomId: { players: [], started: false, hostId: socket.id } }

function getRandomColor(usedColors) {
  const colors = ['#e53935','#8e24aa','#3949ab','#00897b','#f4511e','#fb8c00','#43a047','#1e88e5'];
  const available = colors.filter(c => !usedColors.includes(c));
  return available[Math.floor(Math.random()*available.length)];
}

io.on('connection', socket => {
  console.log('User connected:', socket.id);

  socket.on('createRoom', (data, callback) => {
    const roomId = Math.random().toString(36).substring(2,8);
    const color = getRandomColor([]);
    rooms[roomId] = {
      hostId: socket.id,
      started: false,
      players: [{ id: socket.id, name: data.name, color }]
    };
    socket.join(roomId);
    callback({ roomId, players: rooms[roomId].players, host:true });
  });

  socket.on('joinRoom', (data, callback) => {
    const room = rooms[data.roomId];
    if(!room) return callback({ error:'Room not found' });
    if(room.players.length >= 4) return callback({ error:'Room full' });

    const usedColors = room.players.map(p=>p.color);
    const color = getRandomColor(usedColors);

    const player = { id: socket.id, name: data.name, color };
    room.players.push(player);
    socket.join(data.roomId);

    io.to(data.roomId).emit('updatePlayers', room.players);
    callback({ roomId: data.roomId, players: room.players, host:false });
  });

  socket.on('startGame', (roomId) => {
    const room = rooms[roomId];
    if(!room) return;
    if(room.players.length < 2) return;

    room.started = true;
    io.to(roomId).emit('startGame', room.players);
  });

  socket.on('sendAction', (data) => {
    const roomId = data.roomId;
    const action = data.action;
    socket.to(roomId).emit('receiveAction', action);
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    for(const roomId in rooms){
      const room = rooms[roomId];
      const idx = room.players.findIndex(p=>p.id === socket.id);
      if(idx !== -1){
        room.players.splice(idx,1);
        if(room.players.length === 0) delete rooms[roomId];
        else if(room.hostId === socket.id) room.hostId = room.players[0].id;
        io.to(roomId).emit('updatePlayers', room.players);
      }
    }
  });
});

server.listen(PORT, ()=>console.log(`Server running on port ${PORT}`));
