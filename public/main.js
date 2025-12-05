const mainMenu=document.getElementById('mainMenu');
const onlineMenu=document.getElementById('onlineMenu');
const lobby=document.getElementById('lobby');
const game=document.getElementById('game');

const playerNameInput=document.getElementById('playerName');
const roomIdInput=document.getElementById('roomIdInput');
const loginMsg=document.getElementById('loginMsg');
const playersListDiv=document.getElementById('playersList');
const btnStart=document.getElementById('btnStart');
const roomIdDisplay=document.getElementById('roomIdDisplay');

const canvas=document.getElementById('gameCanvas');
const ctx=canvas.getContext('2d');

let roomId, playerColor, playerName, isHost=false;
let players=[];

// ----- القوائم -----
document.getElementById('btnOnline').onclick=()=>{
  mainMenu.classList.add('hidden');
  onlineMenu.classList.remove('hidden');
};
document.getElementById('btnBackOnline').onclick=()=>{
  onlineMenu.classList.add('hidden');
  mainMenu.classList.remove('hidden');
};
document.getElementById('btnBackLobby').onclick=()=>{
  lobby.classList.add('hidden');
  onlineMenu.classList.remove('hidden');
};
document.getElementById('btnBackGame').onclick=()=>{
  game.classList.add('hidden');
  lobby.classList.remove('hidden');
};

// ----- الغرف -----
document.getElementById('btnCreate').onclick=()=>{
  playerName=playerNameInput.value.trim();
  if(!playerName){ loginMsg.textContent='ادخل اسمك'; return; }
  createRoom(playerName,(res)=>{
    roomId=res.roomId;
    players=res.players;
    playerColor=players[0].color;
    isHost=res.host;
    enterLobby();
  });
};

document.getElementById('btnJoin').onclick=()=>{
  playerName=playerNameInput.value.trim();
  const rId=roomIdInput.value.trim();
  if(!playerName||!rId){ loginMsg.textContent='ادخل اسمك ورمز الغرفة'; return; }
  joinRoom(playerName,rId,(res)=>{
    if(res.error){ loginMsg.textContent=res.error; return; }
    roomId=res.roomId;
    players=res.players;
    playerColor=players.find(p=>p.id===socket.id).color;
    isHost=res.host;
    enterLobby();
  });
};

function enterLobby(){
  onlineMenu.classList.add('hidden');
  lobby.classList.remove('hidden');
  roomIdDisplay.textContent=roomId;
  updatePlayersList(players);
  btnStart.style.display=isHost?'inline-block':'none';
}

btnStart.onclick=()=>startGame(roomId);

function updatePlayersList(players){
  playersListDiv.innerHTML='';
  players.forEach(p=>{
    const div=document.createElement('div');
    div.className='player';
    div.textContent=p.name+(p.id===socket.id?' (انت)':'');
    div.style.background=p.color;
    playersListDiv.appendChild(div);
  });
}

// ----- استقبال الاحداث -----
window.addEventListener('online_updatePlayers',(e)=>{ players=e.detail; updatePlayersList(players); });
window.addEventListener('online_startGame',(e)=>{
  players=e.detail;
  lobby.classList.add('hidden');
  game.classList.remove('hidden');
  gameInfo.textContent='اللاعبون: '+players.map(p=>p.name).join(', ');
  initGame();
});
window.addEventListener('online_receiveAction',(e)=>handleAction(e.detail));

// ----- اللعبة -----
let squares=[];
function initGame(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  squares=[];
  const sqSize=50;
  players.forEach((p,i)=>{
    const x=50+i*60, y=50;
    squares.push({x,y,size:sqSize,color:p.color,owner:p.id});
    ctx.fillStyle=p.color;
    ctx.fillRect(x,y,sqSize,sqSize);
  });
  canvas.onclick=(ev)=>{
    const x=ev.offsetX, y=ev.offsetY;
    const action={x,y,color:playerColor,id:socket.id};
    sendAction(roomId,action);
    handleAction(action);
  };
}

function handleAction(action){
  ctx.fillStyle=action.color;
  ctx.fillRect(action.x-10, action.y-10, 20, 20);
}
