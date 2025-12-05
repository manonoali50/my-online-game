// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;

// rooms structure:
// rooms[roomId] = { hostSocketId, players: [ { id: socketId, name, color } ] }
const rooms = {};

app.use(express.static('public'));

function genColor(existingColors){
  const palette = ['#e53935','#8e24aa','#3949ab','#00897b','#f4511e','#fb8c00','#43a047','#1e88e5','#3399ff','#ffe047'];
  for(const c of palette) if(!existingColors.includes(c)) return c;
  // fallback random
  return '#' + Math.floor(Math.random()*16777215).toString(16);
}

function genRoomId(){
  return Math.random().toString(36).slice(2,8).toUpperCase();
}

io.on('connection', (socket) => {
  console.log('client connected', socket.id);

  socket.on('createRoom', (payload, cb) => {
    const name = (payload && payload.name) ? payload.name : 'Guest';
    const roomId = genRoomId();
    const color = genColor([]);
    rooms[roomId] = { hostSocketId: socket.id, players: [ { id: socket.id, name, color } ] };
    socket.join(roomId);
    // respond to creator with room info
    const data = { roomId, players: rooms[roomId].players, host: true };
    if(typeof cb === 'function') cb(data);
    io.to(roomId).emit('updatePlayers', { roomId, players: rooms[roomId].players });
    console.log(`room ${roomId} created by ${socket.id}`);
  });

  socket.on('joinRoom', (payload, cb) => {
    const { name, roomId } = payload || {};
    if(!roomId || !rooms[roomId]) {
      if(typeof cb === 'function') cb({ error: 'الغرفة غير موجودة' });
      return;
    }
    const existingColors = rooms[roomId].players.map(p=>p.color);
    const color = genColor(existingColors);
    const player = { id: socket.id, name: name || 'Guest', color };
    rooms[roomId].players.push(player);
    socket.join(roomId);
    const isHost = rooms[roomId].hostSocketId === socket.id;
    if(typeof cb === 'function') cb({ roomId, players: rooms[roomId].players, host: isHost });
    io.to(roomId).emit('updatePlayers', { roomId, players: rooms[roomId].players });
    console.log(`${socket.id} joined room ${roomId}`);
  });

  socket.on('leaveRoom', (payload) => {
    const { roomId } = payload || {};
    if(!roomId || !rooms[roomId]) return;
    const room = rooms[roomId];
    room.players = room.players.filter(p => p.id !== socket.id);
    socket.leave(roomId);
    if(room.players.length === 0){
      delete rooms[roomId];
      console.log(`room ${roomId} deleted (empty)`);
    } else {
      if(room.hostSocketId === socket.id){
        room.hostSocketId = room.players[0].id;
      }
      io.to(roomId).emit('updatePlayers', { roomId, players: room.players });
    }
  });

  socket.on('startGame', (payload) => {
    const { roomId } = payload || {};
    if(!roomId || !rooms[roomId]) return;
    // only host can trigger start (server-side safety)
    if(rooms[roomId].hostSocketId !== socket.id){
      // ignore
      return;
    }
    const players = rooms[roomId].players.map(p => ({ id: p.id, name: p.name, color: p.color }));
    io.to(roomId).emit('gameStarted', { roomId, players });
    console.log(`gameStarted in ${roomId} by host ${socket.id}`);
  });

  socket.on('playerAction', (payload) => {
    const { roomId, action } = payload || {};
    if(!roomId || !rooms[roomId]) return;
    // broadcast to others in room
    socket.to(roomId).emit('playerAction', { playerId: socket.id, action });
  });

  socket.on('disconnect', () => {
    // remove from any room
    for(const roomId of Object.keys(rooms)){
      const room = rooms[roomId];
      const idx = room.players.findIndex(p => p.id === socket.id);
      if(idx !== -1){
        room.players.splice(idx, 1);
        socket.leave(roomId);
        if(room.players.length === 0){
          delete rooms[roomId];
          console.log(`room ${roomId} removed (empty after disconnect)`);
        } else {
          if(room.hostSocketId === socket.id){
            room.hostSocketId = room.players[0].id;
          }
          io.to(roomId).emit('updatePlayers', { roomId, players: room.players });
        }
        break;
      }
    }
    console.log('client disconnected', socket.id);
  });

});

server.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
