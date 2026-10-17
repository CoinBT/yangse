'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const categories = require('../public/categories.json');
const { rooms, createRoom, joinRoom, command, finishRound } = require('../server');

test('대분류 400개 이상이며 빈 값과 중복이 없다', () => {
  assert.ok(categories.length >= 400, '플레이 가능한 대분류가 충분해야 해요.');
  assert.equal(new Set(categories).size, categories.length);
  assert.ok(categories.every(value => typeof value === 'string' && value.trim().length > 0 && value.length <= 30));
});

test('기존 대분류와 새 테마를 모두 포함한다', () => {
  for (const name of ['나라','게임','영화','애니메이션','음식','동물','스포츠','직업','유명인','장소','공룡','보드게임','디저트','우주','게임 캐릭터','판타지 종족']) {
    assert.ok(categories.includes(name), name + ' 항목이 빠졌어요.');
  }
});

test('서버는 공통 카탈로그에서 방과 다음 판의 대분류를 선정한다', () => {
  const session = createRoom('출제자');
  const room = rooms.get(session.code);
  assert.ok(categories.includes(room.category));
  room.stage = 'play';
  room.roundNo = 1;
  finishRound(room);
  assert.ok(categories.includes(room.category));
});

test('435개 풀에서 다시 뽑으면 결과가 달라지며 문제는 초기화된다', () => {
  const session = createRoom('호스트');
  const room = rooms.get(session.code);
  const host = room.members[0];
  const other = joinRoom(session.code,'참가자','player');
  const friend = room.members.find(player => player.id === other.userId);
  for (let i = 0; i < 20; i++) {
    const before = room.category;
    room.topics[friend.id] = {authorId:host.id,text:'정답'};
    command(room, host, 'reroll_category');
    assert.ok(categories.includes(room.category));
    assert.notEqual(room.category, before);
    assert.deepEqual(room.topics, {});
  }
});