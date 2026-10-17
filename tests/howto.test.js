'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../public/index.html'),'utf8');
const ui=fs.readFileSync(path.join(__dirname,'../public/howto.js'),'utf8');
const style=fs.readFileSync(path.join(__dirname,'../public/howto.css'),'utf8');

test('메인과 게임방 왼쪽에 각각 How to Play 버튼이 있다',()=>{
 assert.equal((source.match(/data-howto-open/g)||[]).length,2);
 assert.match(source,/id="howToRoomButton"[^>]*data-howto-open/);
 assert.match(source,/class="howto-home-button"/);
});

test('기본, 클래식, Host Show!, 조작법 4개 탭과 설명이 있다',()=>{
 for(const section of ['basics','classic','host','controls']){
   assert.match(source,new RegExp('data-howto-tab="'+section+'"'));
   assert.match(source,new RegExp('data-howto-page="'+section+'"'));
 }
 for(const phrase of ['100점','80점','60점','과반수','4바퀴','음성채팅','대분류 다시 뽑기','Shift + Enter']){
   assert.ok(source.includes(phrase),phrase+' 설명 누락');
 }
});

test('설명창은 별도의 UI이며 게임 상태를 변경하지 않는다',()=>{
 assert.match(source,/id="howToOverlay" class="howto-overlay hidden" aria-hidden="true"/);
 assert.match(source,/role="dialog" aria-modal="true"/);
 assert.match(ui,/closeHowTo/);
 assert.match(ui,/event\.key === 'Escape'/);
 assert.ok(!/fetch\(|WebSocket\(|\bact\(/.test(ui));
 assert.match(style,/\.howto-overlay/);
 assert.match(style,/@media\(max-width:720px\)/);
});

test('설명창 리소스가 모두 연결되어 있다',()=>{
 assert.match(source,/<script src="\/howto\.js" defer><\/script>/);
 assert.match(source,/<link rel="stylesheet" href="\/howto\.css">/);
 assert.doesNotThrow(()=>new Function(ui));
});
