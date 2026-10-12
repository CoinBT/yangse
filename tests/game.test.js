'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { server, rooms } = require('../server.js');

function waitFor(client, predicate, waitMs = 4000) {
  if (client.state && predicate(client.state)) return Promise.resolve(client.state);
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { client.watchers.delete(handle); reject(new Error('게임 상태 타임아웃')); }, waitMs);
    const handle = (state) => {
      if (predicate(state)) {
        clearTimeout(timeout);
        client.watchers.delete(handle);
        resolve(state);
      }
    };
    client.watchers.add(handle);
  });
}
async function openClient(base, session) {
  const ws = new WebSocket(base.replace('http', 'ws') + `/ws?room=${session.code}&token=${session.token}`);
  const client = { ws, session, state:null, watchers:new Set() };
  ws.addEventListener('message', evt => {
    const data = JSON.parse(evt.data);
    if (data.type === 'state') {
      client.state = data.state;
      for (const callback of client.watchers) callback(client.state);
    } else if (data.type === 'error') {
      client.lastError = data.message;
    }
  });
  await waitFor(client, s => s.me.id === session.userId);
  return client;
}
function send(client, action, payload = {}) { client.ws.send(JSON.stringify({action, ...payload})); }
async function request(base, path, data) {
  const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}

test('세 참가자의 주제 비공개, 질문, 랜덤 시작, 자동 정답 판정, 점수 누적, 관전', async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const clients = [];
  try {
    const a = await request(base, '/api/create', { name: 'A' });
    const aClient = await openClient(base, a); clients.push(aClient);
    const b = await request(base, '/api/join', { code:a.code, name: 'B', mode:'player' });
    const bClient = await openClient(base, b); clients.push(bClient);
    const c = await request(base, '/api/join', { code:a.code, name: 'C', mode:'player' });
    const cClient = await openClient(base, c); clients.push(cClient);
    const spec = await request(base, '/api/join', { code:a.code, name:'viewer', mode:'spectator' });
    const specClient = await openClient(base, spec); clients.push(specClient);
    await waitFor(aClient, s => s.people.length === 3 && s.spectatorCount === 1);
    send(aClient, 'set_topic', { topic:'사과' });  // A => B
    send(bClient, 'set_topic', { topic:'바나나' }); // B => C
    send(cClient, 'set_topic', { topic:'피카츄' }); // C => A
    await waitFor(aClient, s => s.readyCount === 3);
    assert.equal(aClient.state.topics[a.userId], null);
    assert.equal(aClient.state.topics[b.userId], '사과');
    assert.equal(bClient.state.topics[b.userId], null);
    assert.equal(specClient.state.me.role, 'spectator');
    assert.equal(aClient.state.canStart, true);
    send(aClient, 'start');
    const startState = await waitFor(aClient, s => s.stage === 'play' && s.firstId);
    assert.ok([a.userId, b.userId, c.userId].includes(startState.firstId));
    assert.equal(startState.turnId, startState.firstId);
    let current = clients.find(x => x.session.userId === aClient.state.turnId);
    send(current, 'question', { text:'제가 과일인가요?' });
    await waitFor(aClient, s => s.pending?.type === 'question');
    assert.equal(aClient.state.pending.text, '제가 과일인가요?');
    send(current, 'confirm_question');
    await waitFor(aClient, s => !s.pending && s.turnId !== current.session.userId);
    // 오답 입력은 투표 없이 즉시 처리하고 다음 차례로 넘어간다.
    current = clients.find(x => x.session.userId === aClient.state.turnId);
    const wrongActorId = current.session.userId;
    send(current, 'answer', { text: '틀린 정답' });
    await waitFor(aClient, s => !s.pending && s.turnId !== wrongActorId);
    assert.equal(aClient.state.winners.length, 0, '오답은 득점하지 않음');

    const answerMap = { [a.userId]: '피카츄', [b.userId]: '사과', [c.userId]: '바나나' };
    for (let rank = 0; rank < 3; rank++) {
      current = clients.find(x => x.session.userId === aClient.state.turnId);
      assert.ok(current, '활성 참가자 존재');
      send(current, 'answer', { text: answerMap[current.session.userId] });
      if (rank < 2) await waitFor(aClient, s => s.winners.length === rank + 1);
      else await waitFor(aClient, s => s.stage === 'setup' && s.lastOutcome?.winners.length === 3);
    }
    assert.deepEqual(aClient.state.lastOutcome.winners.map(w => w.points), [100,80,60]);
    assert.equal(aClient.state.scoreboard.reduce((n,score) => n + score.total,0), 240);
    assert.equal(aClient.state.history.length, 1);
    assert.equal(aClient.state.readyCount, 0);
    assert.ok(rooms.get(a.code), '방 상태가 유지됨');
  } finally {
    clients.forEach(c => c.ws.close());
    await new Promise(resolve => server.close(resolve));
  }
});

test('참가자는 12명으로 제한, 관전자는 별도 제한 없음', () => {
  const { createRoom, joinRoom, players } = require('../server.js');
  const roomOwner = createRoom('호스트');
  for (let i=1; i<12; i++) joinRoom(roomOwner.code, `참가자${i}`, 'player');
  assert.equal(players(rooms.get(roomOwner.code)).length, 12);
  assert.throws(() => joinRoom(roomOwner.code, '13번째', 'player'), /모두 찼/);
  for (let i=1; i<=25; i++) joinRoom(roomOwner.code, `관전자${i}`, 'spectator');
  assert.equal(rooms.get(roomOwner.code).members.filter(m => m.role === 'spectator').length, 25);
});
