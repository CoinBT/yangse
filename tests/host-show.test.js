'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { rooms, createRoom, joinRoom, command, publicState, normalizeAnswer } = require('../server.js');

function makeGame(names) {
  const owner = createRoom('방장');
  const room = rooms.get(owner.code);
  for (const name of names) joinRoom(owner.code, name, 'player');
  const spectators = joinRoom(owner.code, '관중', 'spectator');
  for (const person of room.members) {
    room.clients.add({ user: person, userId: person.id, dead: false, send() {} });
  }
  const host = room.members.find(p => p.id === owner.userId);
  const contest = room.members.filter(p => p.role === 'player' && p.id !== host.id);
  const spec = room.members.find(p => p.id === spectators.userId);
  return { room, host, contest, spec };
}

function setAllTopics(room, host, contest) {
  command(room, host, 'set_mode', { mode: 'host_show' });
  for (let i = 0; i < contest.length; i++) {
    command(room, host, 'set_topic', { targetId: contest[i].id, topic: '정답' + (i + 1) });
  }
}

test('정답 인식: 대소문자·공백·문장부호를 무시하되 동의어는 비교하지 않는다', () => {
  assert.equal(normalizeAnswer(' 손 흥 민 ! '), normalizeAnswer('손흥민'));
  assert.equal(normalizeAnswer(' PiKaChu? '), normalizeAnswer('pikachu'));
  assert.notEqual(normalizeAnswer('고양이'), normalizeAnswer('냥이'));
});

test('Host Show: 호스트만 주제를 배정하며 도전자와 관전자에게 비밀 주제가 전달되지 않는다', () => {
  const {room,host,contest,spec} = makeGame(['가', '나', '다']);
  command(room, host, 'set_mode', { mode: 'host_show' });
  assert.throws(() => command(room, contest[0], 'set_topic', { targetId: contest[1].id, topic:'탈취' }), /호스트만/);
  setAllTopics(room, host, contest);
  assert.equal(publicState(room, host).topicTargets.length, 3);
  assert.equal(publicState(room, host).topics[contest[1].id], '정답2');
  assert.equal(publicState(room, contest[0]).topics[contest[1].id], null);
  assert.equal(publicState(room, contest[0]).topics[contest[0].id], null);
  assert.equal(publicState(room, spec).topics[contest[1].id], null);
  assert.equal(publicState(room, contest[0]).topicTargets.length, 0);
  assert.equal(publicState(room, host).canStart, true);
});

test('Host Show: 질문은 호스트가 답변해야 진행되며, 과반수가 맞히면 즉시 도전자 승리', () => {
  const {room, host, contest} = makeGame(['가', '나', '다']);
  setAllTopics(room, host, contest);
  command(room, host, 'start');
  assert.equal(room.stage, 'play');
  assert.equal(room.turnOrder.length, 3);
  assert.equal(publicState(room, host).threshold, 2);
  let actor = room.members.find(p => p.id === room.turnOrder[room.cursor]);
  command(room, actor, 'question', { text:'생물인가요?' });
  assert.equal(room.pending.type, 'question');
  assert.throws(() => command(room, actor, 'confirm_question'), /호스트가 답변/);
  assert.throws(() => command(room, actor, 'host_reply', {reply:'네'}), /호스트가 답변/);
  command(room, host, 'host_reply', { reply:'아니요' });
  assert.equal(room.pending, null);
  assert.equal(room.turnSteps, 1);
  for (let i=0; i<2; i++) {
    actor = room.members.find(p => p.id === room.turnOrder[room.cursor]);
    command(room, actor, 'answer', { text:room.topics[actor.id].text });
  }
  assert.equal(room.stage, 'setup');
  assert.equal(room.lastOutcome.hostOutcome.winnerSide, 'challengers');
  assert.equal(room.lastOutcome.hostOutcome.correctCount, 2);
  assert.equal(room.lastOutcome.hostOutcome.required, 2);
  assert.equal(Object.values(room.scores).reduce((acc, p) => acc + p.total, 0), 0, 'Host Show에서는 클래식 점수에 영향 없음');
});

test('Host Show: 4바퀴 안에 과반수가 성공하지 못하면 호스트 승리', () => {
  const {room, host, contest} = makeGame(['가', '나', '다']);
  setAllTopics(room, host, contest);
  command(room, host, 'start');
  for (let i=0; i<12; i++) {
    assert.equal(room.stage, 'play', '4바퀴 이전에는 자동 종료하지 않음');
    const actor = room.members.find(p => p.id === room.turnOrder[room.cursor]);
    command(room, actor, 'answer', { text:'분명히 오답' });
  }
  assert.equal(room.stage, 'setup');
  assert.equal(room.lastOutcome.hostOutcome.winnerSide, 'host');
  assert.equal(room.lastOutcome.hostOutcome.lapsUsed, 4);
  assert.equal(room.history.length, 1);
  assert.equal(room.lastOutcome.winners.length, 0);
});

test('Host Show: 라운드 중 호스트가 모드를 바꾸거나 타인의 정답을 시도할 수 없음', () => {
  const {room,host,contest} = makeGame(['가', '나']);
  setAllTopics(room, host, contest);
  command(room, host, 'start');
  assert.throws(() => command(room, host, 'set_mode', {mode:'classic'}), /대기실/);
  assert.throws(() => command(room, host, 'answer', {text:'정답1'}), /현재 차례/);
  command(room, host, 'end_round');
  assert.equal(room.lastOutcome.hostOutcome.winnerSide, 'cancelled');
  command(room, host, 'set_mode', {mode:'classic'});
  assert.equal(room.gameMode, 'classic');
  assert.equal(Object.keys(room.topics).length, 0);
});