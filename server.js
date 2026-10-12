'use strict';
// 양세찬 게임 — 외부 npm 패키지 없이 실행되는 Node.js 웹소켓 서버
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = path.join(__dirname, 'public');
const FILE = path.join(process.env.DATA_DIR || path.join(__dirname, 'data'), 'rooms.json');
const rooms = new Map();
const MAX_PLAYERS = 12;
const RANK_POINTS = [100, 80, 60];
const MAX_BODY = 8192;

function load() {
  try {
    const saved = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    for (const room of saved.rooms || []) {
      if (!room?.code || !Array.isArray(room.members)) continue;
      room.clients = new Set();
      room.log ||= [];
      room.chat ||= [];
      room.scores ||= {};
      room.history ||= [];
      room.topics ||= {};
      room.winners ||= [];
      room.roundNo ||= 0;
      room.stage ||= 'setup';
      room.gameMode ||= 'classic';
      room.turnSteps ||= 0;
      // 서버 재시작 뒤에는 누가 접속 중인지 재확인하므로 대기 중인 투표를 취소합니다.
      room.pending = null;
      rooms.set(room.code, room);
    }
    console.log(`저장된 게임방 ${rooms.size}개를 불러왔습니다.`);
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('저장 데이터 읽기 실패:', error.message);
  }
}
function persist() {
  const serializable = [...rooms.values()].map(({ clients, ...room }) => room);
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ version: 1, rooms: serializable }, null, 2));
  fs.renameSync(tmp, FILE);
}
function id(n = 15) { return crypto.randomBytes(n).toString('hex'); }
function roomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let value;
  do { value = Array.from(crypto.randomBytes(6), v => chars[v % chars.length]).join(''); }
  while (rooms.has(value));
  return value;
}
function cleanName(name) { return String(name || '').trim().replace(/\s+/g, ' ').slice(0, 18); }
function cleanTopic(value) { return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 50); }
function normalizeAnswer(value) {
  return String(value || '').normalize('NFKC').toLocaleLowerCase('ko-KR').replace(/[\s.,!?。！？]+/g, '');
}
function hostShow(room) { return room.gameMode === 'host_show'; }
function challengers(room) { return players(room).filter(u => u.id !== room.hostId); }
function threshold(room) { return Math.floor(challengers(room).length / 2) + 1; }
function topicCount(room) { return (hostShow(room) ? challengers(room) : players(room)).filter(u => !!room.topics[u.id]).length; }
function fail(message, status = 400) { const e = new Error(message); e.status = status; throw e; }
function players(room) { return room.members.filter(u => u.role === 'player'); }
function member(room, token) { return room.members.find(u => u.token === token); }
function online(room, uid) { return [...room.clients].some(ws => !ws.dead && ws.userId === uid); }
function activePlayers(room) { return players(room).filter(u => online(room, u.id)); }
function playerOrder(room) { return players(room).map(u => u.id); }
function rightOf(room, userId) {
  const people = players(room);
  const index = people.findIndex(u => u.id === userId);
  return index < 0 || people.length < 2 ? null : people[(index + 1) % people.length];
}
function currentId(room) { return room.turnOrder?.[room.cursor] || null; }
function note(room, message) {
  room.log.unshift({ id: id(5), message, at: Date.now() });
  room.log = room.log.slice(0, 12);
}
function appendChat(room, data) {
  room.chat ||= [];
  room.chat.push({ id: id(6), at: Date.now(), ...data });
  if (room.chat.length > 80) room.chat = room.chat.slice(-80);
}
function systemChat(room, text) { appendChat(room, { kind: 'system', text }); }
function createRoom(name) {
  name = cleanName(name);
  if (!name) fail('닉네임을 입력해 주세요.');
  const code = roomCode();
  const host = { id: id(8), token: id(24), name, role: 'player' };
  const room = {
    code, hostId: host.id, stage: 'setup', members: [host], clients: new Set(),
    topics: {}, scores: { [host.id]: { name, total: 0, wins: 0 } },
    history: [], winners: [], roundNo: 0, turnOrder: [], cursor: 0,
    pending: null, lastOutcome: null, log: [], chat: [], gameMode: 'classic',
    turnSteps: 0, createdAt: Date.now()
  };
  rooms.set(code, room);
  note(room, `${name}님이 게임방을 만들었어요.`);
  systemChat(room, `${name}님이 채팅방을 열었어요. 👋`);
  persist();
  return { code, token: host.token, role: host.role, userId: host.id };
}
function joinRoom(code, name, mode) {
  code = String(code || '').toUpperCase().trim();
  const room = rooms.get(code);
  if (!room) fail('방을 찾을 수 없어요. 초대 코드가 맞는지 확인해 주세요.', 404);
  name = cleanName(name);
  if (!name) fail('닉네임을 입력해 주세요.');
  const role = mode === 'spectator' ? 'spectator' : 'player';
  if (role === 'player') {
    if (room.stage !== 'setup') fail('게임이 진행 중이에요. 관전자 모드로 입장해 주세요.');
    if (players(room).length >= MAX_PLAYERS) fail('참가자 자리가 모두 찼어요. 관전자 모드로 입장할 수 있어요.');
    if (players(room).some(u => u.name.toLowerCase() === name.toLowerCase())) fail('이미 사용 중인 닉네임이에요.');
  }
  const user = { id: id(8), token: id(24), name, role };
  room.members.push(user);
  systemChat(room, `${name}님이 ${role === 'spectator' ? '관전석에' : '게임에'} 입장했어요.`);
  if (role === 'player') {
    room.scores[user.id] = { name, total: 0, wins: 0 };
    room.topics = {}; // 순서가 바뀌면 오른쪽 이웃이 달라져 주제를 다시 입력받음
    note(room, `${name}님이 참가했어요. 주제를 다시 지정해 주세요.`);
  }
  persist();
  broadcast(room);
  return { code, token: user.token, role, userId: user.id };
}
function rejoinRoom(code, token) {
  const room = rooms.get(String(code || '').toUpperCase());
  const user = room && member(room, token);
  if (!user) fail('이전 입장 정보를 찾을 수 없어요. 새로 입장해 주세요.', 404);
  return { code: room.code, token: user.token, role: user.role, userId: user.id };
}
function publicState(room, viewer) {
  const people = players(room);
  const own = people.find(u => u.id === viewer.id);
  const turn = currentId(room);
  const target = own && !hostShow(room) && rightOf(room, viewer.id);
  const topics = {};
  for (const u of people) {
    // 본인의 주제는 서버에서 아예 전달하지 않음.
    const t = room.topics[u.id];
    topics[u.id] = t ? (hostShow(room) ? (viewer.id === room.hostId ? t.text : null) : (u.id === viewer.id ? null : t.text)) : null;
  }
  const eligible = room.pending?.type === 'answer' ? activePlayers(room).filter(u => u.id !== room.pending.actorId).map(u => u.id) : [];
  const votes = room.pending?.votes || {};
  return {
    code: room.code, stage: room.stage, roundNo: room.roundNo, gameMode: room.gameMode || 'classic',
    turnSteps: room.turnSteps || 0, maxTurns: hostShow(room) ? challengers(room).length * 4 : 0,
    threshold: hostShow(room) ? threshold(room) : 0, challengerCount: hostShow(room) ? challengers(room).length : 0,
    me: { id: viewer.id, name: viewer.name, role: viewer.role, host: viewer.id === room.hostId },
    hostId: room.hostId,
    people: people.map(u => ({ id: u.id, name: u.name, online: online(room, u.id), finished: room.winners.some(w => w.id === u.id), subjectReady: !!room.topics[u.id] })),
    spectatorCount: room.members.filter(u => u.role === 'spectator' && online(room, u.id)).length,
    topics,
    myRightTarget: target ? { id: target.id, name: target.name, assigned: !!room.topics[target.id], text: room.topics[target.id]?.text || '' } : null,
    readyCount: topicCount(room),
    topicTargets: viewer.id === room.hostId && hostShow(room) ? challengers(room).map(u => ({ id: u.id, name: u.name, text: room.topics[u.id]?.text || '', assigned: !!room.topics[u.id] })) : [],
    canStart: room.stage === 'setup' && people.length >= 2 && (hostShow(room) ? challengers(room) : people).every(u => !!room.topics[u.id]) && people.every(u => online(room, u.id)),
    turnId: turn,
    firstId: room.firstId || null,
    pending: room.pending ? {
      type: room.pending.type, actorId: room.pending.actorId, text: room.pending.text || '',
      reply: room.pending.reply || '',
      correct: Object.values(votes).filter(v => v === 'correct').length,
      wrong: Object.values(votes).filter(v => v === 'wrong').length,
      total: eligible.length,
      required: Math.floor(eligible.length / 2) + 1,
      myVote: votes[viewer.id] || null,
      canVote: eligible.includes(viewer.id) && !votes[viewer.id]
    } : null,
    winners: room.winners.map(w => ({ ...w })),
    scoreboard: Object.entries(room.scores).map(([userId, s]) => ({ userId, name: s.name, total: s.total, wins: s.wins })).sort((a, b) => b.total - a.total || b.wins - a.wins || a.name.localeCompare(b.name, 'ko')),
    history: room.history.slice(-10).reverse(),
    lastOutcome: room.lastOutcome,
    log: room.log.slice(0, 6),
    chat: (room.chat || []).slice(-60)
  };
}
function finishHostShow(room, winnerSide, forced = false) {
  room.hostOutcome = { winnerSide, correctCount: room.winners.length, required: threshold(room),
    lapsUsed: Math.min(4, Math.ceil((room.turnSteps + 1) / Math.max(1, challengers(room).length))) };
  note(room, winnerSide === 'challengers' ? '🎊 Host Show! 도전자팀의 승리!' : winnerSide === 'host' ? '👑 Host Show! 호스트의 승리!' : 'Host Show! 게임 종료');
  finishRound(room, forced);
}
function nextTurn(room) {
  const size = room.turnOrder.length;
  if (hostShow(room)) {
    if (!size) return;
    for (let i = 0; i < size; i++) {
      room.turnSteps = (room.turnSteps || 0) + 1;
      if (room.turnSteps >= size * 4) return finishHostShow(room, 'host');
      room.cursor = (room.cursor + 1) % size;
      const uid = room.turnOrder[room.cursor];
      if (!room.winners.some(w => w.id === uid) && online(room, uid)) return;
    }
    return;
  }
  for (let i = 0; i < size; i++) {
    room.cursor = (room.cursor + 1) % size;
    const u = room.turnOrder[room.cursor];
    if (!room.winners.some(w => w.id === u) && online(room, u)) return;
  }
  // 게임 가능한 사람이 다시 접속하면 정상적으로 이어갈 수 있도록 현재 순서 유지
  room.cursor = Math.max(0, room.cursor);
}
function finishRound(room, forced = false) {
  const outcome = {
    round: room.roundNo,
    at: Date.now(),
    winners: room.winners.map(w => ({ ...w })),
    mode: room.gameMode || 'classic',
    hostOutcome: room.hostOutcome || null,
    forced
  };
  room.history.push(outcome);
  room.lastOutcome = outcome;
  room.stage = 'setup';
  room.topics = {};
  room.winners = [];
  room.pending = null;
  room.turnOrder = [];
  room.cursor = 0;
  room.firstId = null;
  room.turnSteps = 0;
  room.hostOutcome = null;
  note(room, `제${outcome.round}판이 종료됐어요. 새로운 주제를 적어 주세요!`);
}
function resolveVotes(room) {
  const pending = room.pending;
  if (!pending || pending.type !== 'answer') return;
  const eligible = activePlayers(room).filter(u => u.id !== pending.actorId).map(u => u.id);
  const required = Math.floor(eligible.length / 2) + 1;
  const values = eligible.map(uid => pending.votes[uid]);
  const yes = values.filter(v => v === 'correct').length;
  const no = values.filter(v => v === 'wrong').length;
  if (yes < required && no < required && values.some(v => !v)) return;
  const actor = room.members.find(u => u.id === pending.actorId);
  room.pending = null;
  if (yes >= required) {
    const rank = room.winners.length + 1;
    const points = RANK_POINTS[rank - 1] || 0;
    room.winners.push({ id: actor.id, name: actor.name, rank, points });
    room.scores[actor.id].total += points;
    room.scores[actor.id].wins += 1;
    note(room, `🎉 ${actor.name}님 정답! ${rank}등 +${points}점`);
    const stillEligible = players(room).some(u => !room.winners.some(w => w.id === u.id));
    if (room.winners.length >= Math.min(3, players(room).length) || !stillEligible) {
      finishRound(room);
      return;
    }
  } else {
    note(room, `${actor.name}님의 정답 시도는 오답으로 처리됐어요.`);
  }
  nextTurn(room);
}
function onDisconnected(room) {
  if (room.stage !== 'play') return;
  const actorId = room.pending?.actorId;
  if (actorId && !online(room, actorId)) {
    room.pending = null;
    nextTurn(room);
    note(room, '진행자가 연결을 끊어 다음 차례로 넘어갔어요.');
  } else if (room.pending?.type === 'answer') {
    resolveVotes(room);
  } else if (!online(room, currentId(room))) {
    nextTurn(room);
  }
}
function command(room, user, commandName, payload = {}) {
  const isHost = user.id === room.hostId;
  const playing = room.stage === 'play';
  const setup = room.stage === 'setup';
  const isActor = playing && user.id === currentId(room);
  const pend = room.pending;
  switch (commandName) {
    case 'chat': {
      if (!room.members.some(u => u.id === user.id)) fail('채팅방에서 퇴장한 사용자예요.');
      if (typeof payload.text !== 'string') fail('메시지를 입력해 주세요.');
      const text = payload.text.replace(/[\x00-\x1f\x7f]/g, ' ').trim();
      if (!text) fail('메시지를 입력해 주세요.');
      if ([...text].length > 300) fail('채팅은 300자 이내로 입력해 주세요.');
      const now = Date.now();
      if (now - (user.lastChatAt || 0) < 850) fail('채팅은 잠깐 간격을 두고 전송해 주세요.');
      user.lastChatAt = now;
      appendChat(room, { kind: 'message', userId: user.id, name: user.name, role: user.role, text });
      break;
    }
    case 'set_mode': {
      if (!isHost || !setup) fail('대기실에서 호스트만 모드를 바꿀 수 있어요.');
      if (!['classic', 'host_show'].includes(payload.mode)) fail('지원하지 않는 게임 모드예요.');
      room.gameMode = payload.mode;
      room.topics = {};
      room.turnSteps = 0;
      note(room, hostShow(room) ? '👑 Host Show! 모드 선택 — 호스트가 주제를 배정합니다.' : '🎭 클래식 모드 선택');
      break;
    }
    case 'set_topic': {
      if (!setup || user.role !== 'player') fail('지금은 주제를 작성할 수 없어요.');
      const target = hostShow(room) ? challengers(room).find(u => u.id === payload.targetId) : rightOf(room, user.id);
      if (hostShow(room) && !isHost) fail('Host Show!에서는 호스트만 주제를 정할 수 있어요.');
      if (!target) fail('주제를 지정할 도전자가 없어요.');
      const topic = cleanTopic(payload.topic);
      if (!topic) fail('주제를 한 글자 이상 입력해 주세요.');
      room.topics[target.id] = { authorId: user.id, text: topic };
      note(room, hostShow(room) ? `호스트가 ${target.name}님의 주제를 정했어요.` : `${user.name}님이 오른쪽 사람의 주제를 확정했어요.`);
      break;
    }
    case 'start': {
      if (!isHost || !setup) fail('호스트만 게임을 시작할 수 있어요.');
      const p = players(room);
      if (p.length < 2) fail('최소 2명의 참가자가 필요해요.');
      if (p.some(u => !online(room, u.id))) fail('모든 참가자가 접속해야 시작할 수 있어요. 오프라인 참가자를 내보내거나 재접속해 주세요.');
      if ((hostShow(room) ? challengers(room) : p).some(u => !room.topics[u.id])) fail('모든 도전자의 주제가 입력돼야 시작할 수 있어요.');
      room.stage = 'play';
      room.roundNo += 1;
      room.winners = [];
      const playingPeople = hostShow(room) ? challengers(room) : p;
      room.turnOrder = playingPeople.map(u => u.id);
      room.turnSteps = 0;
      room.hostOutcome = null;
      room.cursor = crypto.randomInt(playingPeople.length);
      room.firstId = currentId(room);
      room.lastOutcome = null;
      room.pending = null;
      note(room, `🎲 제${room.roundNo}판 ${hostShow(room) ? 'Host Show!' : '클래식'} 시작! ${playingPeople[room.cursor].name}님이 첫 차례예요.`);
      break;
    }
    case 'question': {
      if (!isActor || pend) fail('현재 차례에만 질문할 수 있어요.');
      room.pending = { type: 'question', actorId: user.id, text: String(payload.text || '').trim().slice(0, 100) };
      note(room, `${user.name}님이 질문을 선택했어요.`);
      break;
    }
    case 'host_reply': {
      if (!isHost || !playing || !hostShow(room) || pend?.type !== 'question') fail('지금은 호스트가 답변할 차례가 아니에요.');
      const reply = String(payload.reply || '').trim().slice(0, 150);
      if (!reply) fail('질문에 대한 답변을 입력해 주세요.');
      note(room, `👑 호스트 답변: ${reply}`);
      room.pending = null;
      nextTurn(room);
      break;
    }
    case 'confirm_question': {
      if (hostShow(room)) fail('Host Show!에서는 호스트가 답변해야 다음 차례로 넘어가요.');
      if (!isActor || pend?.type !== 'question' || pend.actorId !== user.id) fail('질문을 확인할 수 없어요.');
      room.pending = null;
      note(room, `${user.name}님이 질문을 마치고 다음 사람에게 넘겼어요.`);
      nextTurn(room);
      break;
    }
    case 'answer': {
      if (!isActor || pend) fail('현재 차례에만 정답을 시도할 수 있어요.');
      const text = String(payload.text || '').trim().slice(0, 100);
      if (!text) fail('자동 판정을 위해 정답을 입력해 주세요.');
      const expected = room.topics[user.id]?.text;
      if (!expected) fail('비밀 주제가 준비되지 않았어요.');
      if (normalizeAnswer(text) === normalizeAnswer(expected)) {
        const rank = room.winners.length + 1;
        const points = hostShow(room) ? 0 : (RANK_POINTS[rank - 1] || 0);
        room.winners.push({ id: user.id, name: user.name, rank, points });
        if (!hostShow(room)) {
          room.scores[user.id].total += points;
          room.scores[user.id].wins += 1;
        }
        note(room, `🎉 ${user.name}님 자동 정답! ${hostShow(room) ? '도전자 ' + room.winners.length + '/' + challengers(room).length : rank + '등 +' + points + '점'}`);
        if (hostShow(room) && room.winners.length >= threshold(room)) return finishHostShow(room, 'challengers');
        if (!hostShow(room) && room.winners.length >= Math.min(3, players(room).length)) return finishRound(room);
      } else {
        note(room, `❌ ${user.name}님의 정답 시도는 오답이에요: ${text}`);
      }
      nextTurn(room);
      break;
    }
    case 'vote': {
      if (!playing || pend?.type !== 'answer') fail('정답은 이제 서버에서 자동으로 판정해요.');
      if (user.role !== 'player' || user.id === pend.actorId || !online(room, user.id)) fail('이 투표에 참여할 수 없어요.');
      if (pend.votes[user.id]) fail('이미 투표했어요.');
      if (!['correct', 'wrong'].includes(payload.vote)) fail('정답 또는 오답을 골라 주세요.');
      pend.votes[user.id] = payload.vote;
      resolveVotes(room);
      break;
    }
    case 'host_skip': {
      if (!isHost || !playing) fail('호스트만 넘길 수 있어요.');
      room.pending = null;
      note(room, '호스트가 현재 차례를 넘겼어요.');
      nextTurn(room);
      break;
    }
    case 'end_round': {
      if (!isHost || !playing) fail('호스트만 판을 종료할 수 있어요.');
      if (hostShow(room)) finishHostShow(room, 'cancelled', true);
      else finishRound(room, true);
      break;
    }
    case 'remove_player': {
      if (!isHost || !setup) fail('대기실에서만 참가자를 내보낼 수 있어요.');
      const target = players(room).find(u => u.id === payload.userId && u.id !== room.hostId);
      if (!target) fail('내보낼 수 없는 참가자예요.');
      room.members = room.members.filter(u => u.id !== target.id);
      for (const ws of room.clients) if (ws.userId === target.id) ws.close();
      room.topics = {};
      note(room, `${target.name}님이 퇴장했어요. 주제를 다시 지정해 주세요.`);
      systemChat(room, `${target.name}님이 게임방에서 퇴장했어요.`);
      break;
    }
    case 'rename': {
      if (!setup) fail('대기실에서만 닉네임을 바꿀 수 있어요.');
      const name = cleanName(payload.name);
      if (!name) fail('닉네임을 입력해 주세요.');
      if (user.role === 'player' && players(room).some(u => u.id !== user.id && u.name.toLowerCase() === name.toLowerCase())) fail('이미 사용 중인 닉네임이에요.');
      user.name = name;
      if (room.scores[user.id]) room.scores[user.id].name = name;
      note(room, `닉네임이 ${name}(으)로 변경됐어요.`);
      break;
    }
    default: fail('지원하지 않는 동작이에요.');
  }
  persist();
  broadcast(room);
}

// 최소한의 웹소켓 전송 구현. 표준 브라우저의 마스킹된 텍스트 프레임을 처리합니다.
class TinySocket {
  constructor(socket) {
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.dead = false;
    socket.on('data', data => this.onData(data));
    socket.on('close', () => this.close());
    socket.on('end', () => this.close());
    socket.on('error', () => this.close());
  }
  send(obj) {
    if (this.dead) return;
    const data = Buffer.from(JSON.stringify(obj), 'utf8');
    this.writeFrame(0x1, data);
  }
  writeFrame(opcode, data = Buffer.alloc(0)) {
    if (this.dead || this.socket.destroyed) return;
    let head;
    if (data.length < 126) head = Buffer.from([0x80 | opcode, data.length]);
    else if (data.length < 65536) { head = Buffer.alloc(4); head[0] = 0x80 | opcode; head[1] = 126; head.writeUInt16BE(data.length, 2); }
    else { head = Buffer.alloc(10); head[0] = 0x80 | opcode; head[1] = 127; head.writeBigUInt64BE(BigInt(data.length), 2); }
    this.socket.write(Buffer.concat([head, data]));
  }
  onData(data) {
    if (this.dead) return;
    this.buffer = Buffer.concat([this.buffer, data]);
    if (this.buffer.length > 200000) return this.close();
    while (this.buffer.length >= 2) {
      const first = this.buffer[0], second = this.buffer[1];
      const fin = !!(first & 0x80), opcode = first & 0x0f;
      if (!fin) return this.close(); // 앱은 작은 JSON 단일 프레임만 사용
      const masked = !!(second & 0x80);
      if (!masked) return this.close();
      let offset = 2, len = second & 0x7f;
      if (len === 126) { if (this.buffer.length < 4) return; len = this.buffer.readUInt16BE(2); offset = 4; }
      else if (len === 127) {
        if (this.buffer.length < 10) return;
        const big = this.buffer.readBigUInt64BE(2);
        if (big > 16384n) return this.close();
        len = Number(big); offset = 10;
      }
      if (len > 16384) return this.close();
      if (this.buffer.length < offset + 4 + len) return;
      const mask = this.buffer.subarray(offset, offset + 4);
      const message = Buffer.from(this.buffer.subarray(offset + 4, offset + 4 + len));
      for (let i = 0; i < len; i++) message[i] ^= mask[i % 4];
      this.buffer = this.buffer.subarray(offset + 4 + len);
      if (opcode === 0x8) { this.close(); return; }
      if (opcode === 0x9) { this.writeFrame(0xA, message); continue; }
      if (opcode !== 0x1) continue;
      let payload;
      try { payload = JSON.parse(message.toString('utf8')); }
      catch { this.send({ type: 'error', message: '잘못된 요청 형식이에요.' }); continue; }
      try {
        if (!payload || typeof payload !== 'object') throw new Error('잘못된 요청이에요.');
        command(this.room, this.user, payload.action, payload);
      } catch (err) { this.send({ type: 'error', message: err.message || '오류가 발생했어요.' }); }
    }
  }
  close() {
    if (this.dead) return;
    this.dead = true;
    this.socket.destroy();
    if (this.room) {
      this.room.clients.delete(this);
      onDisconnected(this.room);
      persist();
      broadcast(this.room);
    }
  }
}
function broadcast(room) {
  for (const client of room.clients) if (!client.dead) client.send({ type: 'state', state: publicState(room, client.user) });
}
function respond(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let text = '';
    req.on('data', chunk => { text += chunk; if (text.length > MAX_BODY) { reject(new Error('요청이 너무 커요.')); req.destroy(); } });
    req.on('end', () => { try { resolve(JSON.parse(text)); } catch { reject(new Error('잘못된 JSON 요청이에요.')); } });
    req.on('error', reject);
  });
}
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon' };
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/api/health') return respond(res, 200, { ok: true, rooms: rooms.size });
    if (req.method === 'POST' && ['/api/create', '/api/join', '/api/rejoin'].includes(url.pathname)) {
      const body = await readBody(req);
      const result = url.pathname === '/api/create' ? createRoom(body.name)
        : url.pathname === '/api/join' ? joinRoom(body.code, body.name, body.mode)
        : rejoinRoom(body.code, body.token);
      return respond(res, 200, result);
    }
    if (req.method !== 'GET') return respond(res, 405, { error: '허용되지 않은 요청이에요.' });
    let resource = url.pathname === '/' ? '/index.html' : url.pathname;
    if (!['/index.html', '/style.css', '/app.js', '/favicon.svg', '/chat.js', '/chat.css'].includes(resource)) return respond(res, 404, { error: '페이지를 찾을 수 없어요.' });
    const file = path.join(ROOT, resource);
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options':'nosniff' });
    fs.createReadStream(file).pipe(res);
  } catch (err) {
    if (!res.headersSent) respond(res, err.status || 400, { error: err.message || '서버 오류가 발생했어요.' });
    else res.end();
  }
});
server.on('upgrade', (req, socket, head) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/ws') throw new Error('연결 경로가 올바르지 않아요.');
    const room = rooms.get(url.searchParams.get('room')?.toUpperCase());
    const user = room && member(room, url.searchParams.get('token'));
    const key = req.headers['sec-websocket-key'];
    if (!user || !key || req.headers.upgrade?.toLowerCase() !== 'websocket') throw new Error('접속 권한이 없어요.');
    const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n\r\n');
    const ws = new TinySocket(socket);
    ws.room = room; ws.user = user; ws.userId = user.id;
    room.clients.add(ws);
    if (head.length) ws.onData(head);
    if (room.stage === 'play' && !room.pending && (!online(room, currentId(room)) || room.winners.some(w => w.id === currentId(room)))) nextTurn(room);
    broadcast(room);
  } catch {
    socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
  }
});
const heartbeats = setInterval(() => {
  for (const room of rooms.values()) for (const client of room.clients) client.writeFrame(0x9);
}, 25000);
heartbeats.unref();
load();
if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`\n🎭 양세찬 게임 서버 실행 중!`);
    console.log(`  내 컴퓨터: http://localhost:${PORT}`);
    console.log(`  같은 와이파이: http://[호스트PC의 IP]:${PORT}`);
    console.log('  인터넷 친구 초대: README.md의 Cloudflare Tunnel 안내 참고\n');
  });
}
module.exports = { server, rooms, createRoom, joinRoom, rejoinRoom, command, publicState, players, broadcast, resolveVotes, finishRound, normalizeAnswer };
