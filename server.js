// server.js - simple authoritative room server for the game
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// serve static files from ./public
app.use(express.static('public'));

// In-memory rooms store (simple)
// rooms = { roomId: { hostId, players: { socketId: { id, name, color, joinedAt } }, started: bool } }
const rooms = {};

function makeRoomId(){ return crypto.randomBytes(3).toString('hex'); }

io.on('connection', socket => {
  console.log('conn', socket.id);

  socket.on('create-room', (data, cb) => {
    const nickname = (data && data.name) ? data.name : 'Host';
    const roomId = makeRoomId();
    rooms[roomId] = { hostId: socket.id, players: {}, started: false };
    rooms[roomId].players[socket.id] = { id: socket.id, name: nickname, joinedAt: Date.now(), color: data && data.color ? data.color : null };
    socket.join(roomId);
    // reply with room info
    cb && cb({ ok: true, roomId, players: Object.values(rooms[roomId].players), hostId: rooms[roomId].hostId });
    io.to(roomId).emit('room-update', { players: Object.values(rooms[roomId].players), hostId: rooms[roomId].hostId, started: rooms[roomId].started });
    console.log(`${socket.id} created ${roomId}`);
  });

  socket.on('join-room', (data, cb) => {
    const roomId = data && data.roomId;
    const name = (data && data.name) ? data.name : 'Guest';
    if(!roomId || !rooms[roomId]) return cb && cb({ ok:false, error:'ROOM_NOT_FOUND' });
    const r = rooms[roomId];
    // limit players to 4 (same as game)
    if(Object.keys(r.players).length >= 4) return cb && cb({ ok:false, error:'ROOM_FULL' });
    r.players[socket.id] = { id: socket.id, name, joinedAt: Date.now(), color: data && data.color ? data.color : null };
    socket.join(roomId);
    cb && cb({ ok:true, roomId, players: Object.values(r.players), hostId: r.hostId, started: r.started });
    io.to(roomId).emit('room-update', { players: Object.values(r.players), hostId: r.hostId, started: r.started });
    console.log(`${socket.id} joined ${roomId}`);
  });

  socket.on('leave-room', (data, cb) => {
    const roomId = data && data.roomId;
    if(!roomId || !rooms[roomId]) return cb && cb({ ok:false, error:'ROOM_NOT_FOUND' });
    const r = rooms[roomId];
    if(r.players[socket.id]) delete r.players[socket.id];
    socket.leave(roomId);
    // reassign host if needed
    if(r.hostId === socket.id){
      const keys = Object.keys(r.players);
      r.hostId = keys.length ? keys[0] : null;
    }
    // if empty destroy
    if(Object.keys(r.players).length === 0){ delete rooms[roomId];
      console.log(`room ${roomId} removed (empty)`);
    } else {
      io.to(roomId).emit('room-update', { players: Object.values(r.players), hostId: r.hostId, started: r.started });
    }
    cb && cb({ ok:true });
  });

  socket.on('start-game', (data, cb) => {
    const roomId = data && data.roomId;
    if(!roomId || !rooms[roomId]) return cb && cb({ ok:false, error:'ROOM_NOT_FOUND' });
    const r = rooms[roomId];
    if(socket.id !== r.hostId) return cb && cb({ ok:false, error:'ONLY_HOST' });
    r.started = true;
    // create players list payload
    const players = Object.values(r.players).map(p => ({ id: p.id, name: p.name, color: p.color }));
    io.to(roomId).emit('game-start', { players, hostId: r.hostId });
    io.to(roomId).emit('room-update', { players, hostId: r.hostId, started: r.started });
    cb && cb({ ok:true });
  });

  // generic game action (e.g., move)
  socket.on('game-action', (data, cb) => {
    const roomId = data && data.roomId;
    const action = data && data.action;
    if(!roomId || !rooms[roomId]) return cb && cb({ ok:false, error:'ROOM_NOT_FOUND' });
    // broadcast to others in room (including sender, so clients stay in sync)
    io.to(roomId).emit('game-action', { from: socket.id, action });
    cb && cb({ ok:true });
  });

  socket.on('disconnect', () => {
    // remove from any rooms
    for(const roomId of Object.keys(rooms)){
      const r = rooms[roomId];
      if(r.players && r.players[socket.id]){
        delete r.players[socket.id];
        if(r.hostId === socket.id){
          const keys = Object.keys(r.players);
          r.hostId = keys.length ? keys[0] : null;
        }
        if(Object.keys(r.players).length === 0){ delete rooms[roomId]; console.log(`room ${roomId} deleted (empty)`); }
        else io.to(roomId).emit('room-update', { players: Object.values(r.players), hostId: r.hostId, started: r.started });
      }
    }
    console.log('disconnect', socket.id);
  });

});

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=> console.log('Server listening on', PORT));