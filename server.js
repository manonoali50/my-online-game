const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.static('public')); // ملفاتك في مجلد public

// هيكل الغرف
const rooms = {};

io.on('connection', (socket) => {
  console.log('player connected:', socket.id);

  // إنشاء غرفة
  socket.on('createRoom', ({ roomId, playerId, name, color }) => {
    rooms[roomId] = {
      players: [{ id: playerId, name, color, isHost: true }],
      gameStarted: false
    };
    socket.join(roomId);
    io.to(roomId).emit('updatePlayers', { roomId, players: rooms[roomId].players });
  });

  // الانضمام لغرفة
  socket.on('joinRoom', ({ roomId, playerId, name, color }) => {
    if (!rooms[roomId]) return socket.emit('error', 'الغرفة غير موجودة');
    // لا يمكن الانضمام إذا بدأت اللعبة
    if (rooms[roomId].gameStarted) return socket.emit('error', 'اللعبة بدأت بالفعل');
    rooms[roomId].players.push({ id: playerId, name, color, isHost: false });
    socket.join(roomId);
    io.to(roomId).emit('updatePlayers', { roomId, players: rooms[roomId].players });
  });

  // الخروج من الغرفة
  socket.on('leaveRoom', ({ roomId, playerId }) => {
    if (!rooms[roomId]) return;
    rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== playerId);
    socket.leave(roomId);
    if (rooms[roomId].players.length === 0) {
      delete rooms[roomId];
    } else {
      // إذا خرج الهوست، اجعل أول لاعب آخر هو الهوست الجديد
      if (!rooms[roomId].players.some(p => p.isHost)) {
        rooms[roomId].players[0].isHost = true;
      }
      io.to(roomId).emit('updatePlayers', { roomId, players: rooms[roomId].players });
    }
  });

  // بدء اللعبة (فقط الهوست)
  socket.on('startGame', ({ roomId }) => {
    if (!rooms[roomId]) return;
    const host = rooms[roomId].players.find(p => p.isHost);
    if (!host) return socket.emit('error', 'لا يوجد هوست للغرفة');
    // تحقق من أن الشخص الذي ضغط هو الهوست
    if (!rooms[roomId].players.some(p => p.id === host.id && p.id === socket.id)) {
      // هذا تأمين إضافي، الهوست الحقيقي فقط يرسل start
      return;
    }
    rooms[roomId].gameStarted = true;
    io.to(roomId).emit('gameStarted', { roomId, players: rooms[roomId].players });
  });

  // تحركات اللاعبين
  socket.on('playerAction', ({ roomId, playerId, action }) => {
    if (!rooms[roomId]) return;
    io.to(roomId).emit('playerAction', { playerId, action });
  });

  socket.on('disconnect', () => {
    console.log('player disconnected:', socket.id);
    // اختياري: تنظيف تلقائي إذا تريد إضافة إزالة اللاعب من أي غرفة
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
