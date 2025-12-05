// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET","POST"]
  }
});

const PORT = process.env.PORT || 3000;

// تخزين الغرف واللاعبين
const rooms = {}; 
// rooms = {
//   roomId1: { players: [{playerId,name,color,isHost,socketId},...], started: false },
//   roomId2: {...}
// }

app.use(express.static('public')); // ملفات HTML/CSS/JS

io.on('connection', (socket) => {

  console.log('New client connected:', socket.id);

  socket.on('createRoom', ({ roomId, playerId, name, color }) => {
    rooms[roomId] = {
      players: [{ playerId, name, color, isHost: true, socketId: socket.id }],
      started: false
    };
    socket.join(roomId);
    io.to(roomId).emit('updatePlayers', rooms[roomId].players);
  });

  socket.on('joinRoom', ({ roomId, playerId, name, color }) => {
    if(!rooms[roomId]) {
      socket.emit('error', 'الغرفة غير موجودة');
      return;
    }
    const isHost = false;
    rooms[roomId].players.push({ playerId, name, color, isHost, socketId: socket.id });
    socket.join(roomId);
    io.to(roomId).emit('updatePlayers', rooms[roomId].players);
  });

  socket.on('leaveRoom', ({ roomId, playerId }) => {
    if(!rooms[roomId]) return;
    rooms[roomId].players = rooms[roomId].players.filter(p=>p.playerId!==playerId);
    // إذا لم يبق أحد، حذف الغرفة
    if(rooms[roomId].players.length === 0){
      delete rooms[roomId];
    } else {
      // تعيين هوست جديد إذا خرج الهوست
      if(!rooms[roomId].players.some(p=>p.isHost)){
        rooms[roomId].players[0].isHost = true;
      }
      io.to(roomId).emit('updatePlayers', rooms[roomId].players);
    }
  });

  socket.on('startGame', ({ roomId }) => {
    if(!rooms[roomId]) return;
    rooms[roomId].started = true;
    io.to(roomId).emit('gameStarted', rooms[roomId].players);
  });

  socket.on('playerAction', ({ roomId, playerId, action }) => {
    if(!rooms[roomId]) return;
    socket.to(roomId).emit('playerAction', { playerId, action });
  });

  socket.on('disconnect', () => {
    // إزالة اللاعب من أي غرفة كان فيها
    for(const roomId in rooms){
      const room = rooms[roomId];
      const index = room.players.findIndex(p=>p.socketId === socket.id);
      if(index !== -1){
        room.players.splice(index,1);
        if(room.players.length===0){
          delete rooms[roomId];
        } else {
          if(!room.players.some(p=>p.isHost)){
            room.players[0].isHost = true;
          }
          io.to(roomId).emit('updatePlayers', room.players);
        }
      }
    }
  });

});

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
