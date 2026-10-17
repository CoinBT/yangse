'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRoom, joinRoom, rooms, command, publicState } = require('../server');

function mockHost() {
  const session = createRoom('호스트');
  const room = rooms.get(session.code);
  const host = room.members[0];
  const guest = joinRoom(room.code, '친구', 'player');
  const friend = room.members.find(m => m.id === guest.userId);
  return { room, host, friend };
}

test('호스트가 준비 중 다시 뽑으면 반드시 새 대분류, 모든 문제 초기화, 기존 점수 유지', () => {
  const { room, host, friend } = mockHost();
  room.topics[host.id] = { authorId: friend.id, text: '한국' };
  room.topics[friend.id] = { authorId: host.id, text: '일본' };
  room.scores[host.id].total = 240;
  const before = room.category;
  command(room, host, 'reroll_category');
  assert.notEqual(room.category, before);
  assert.deepEqual(room.topics, {});
  assert.equal(room.scores[host.id].total, 240);
  assert.equal(publicState(room, host).readyCount, 0);
  assert.equal(publicState(room, host).canStart, false);
});

test('비호스트는 대분류를 다시 뽑을 수 없다', () => {
  const { room, friend } = mockHost();
  const before = room.category;
  assert.throws(() => command(room, friend, 'reroll_category'), /호스트/);
  assert.equal(room.category, before);
});

test('진행 중에는 호스트도 다시 뽑을 수 없다', () => {
  const { room, host } = mockHost();
  room.stage = 'play';
  const before = room.category;
  assert.throws(() => command(room, host, 'reroll_category'), /게임 시작 전/);
  assert.equal(room.category, before);
});

test('Host Show! 준비 중에도 다시 뽑기 가능', () => {
  const { room, host, friend } = mockHost();
  command(room, host, 'set_mode', { mode: 'host_show' });
  room.topics[friend.id] = { authorId: host.id, text: '마인크래프트' };
  command(room, host, 'reroll_category');
  assert.equal(room.gameMode, 'host_show');
  assert.equal(publicState(room, host).readyCount, 0);
});
