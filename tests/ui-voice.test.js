'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createRoom,joinRoom,rooms,publicState,finishRound} = require('../server');

test('신규 방은 정해진 대분류에서 하나를 랜덤으로 배정한다', () => {
  const data = createRoom('출제자');
  const room = rooms.get(data.code);
  assert.ok(['나라','게임','영화','애니메이션','음식','동물','스포츠','직업','유명인','장소'].includes(room.category));
  const state = publicState(room,room.members[0]);
  assert.equal(state.category,room.category);
  assert.equal(state.stage,'setup');
});

test('라운드 종료 시 대분류가 설정되고 참가자 스코어는 보존된다', () => {
  const data = createRoom('진행자');
  const room = rooms.get(data.code);
  room.scores[room.hostId].total = 80;
  room.roundNo = 1;
  room.stage = 'play';
  finishRound(room);
  assert.equal(room.stage,'setup');
  assert.equal(room.scores[room.hostId].total,80);
  assert.ok(typeof room.category === 'string' && room.category.length);
});

test('음성 채팅 사용자 목록은 활성 참가자만 포함한다', () => {
  const owner = createRoom('호스트');
  joinRoom(owner.code,'도전자','player');
  const room = rooms.get(owner.code);
  const other = room.members[1];
  room.clients.add({voiceOn:true,dead:false,userId:owner.userId,user:room.members[0]});
  room.clients.add({voiceOn:true,dead:false,userId:other.id,user:other});
  room.clients.add({voiceOn:true,dead:false,userId:'guest',user:{role:'spectator'}});
  const state = publicState(room,room.members[0]);
  assert.deepEqual(state.voicePeers.sort(),[owner.userId,other.id].sort());
});