'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { server } = require('../server');
let base;
before(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  base='http://127.0.0.1:'+server.address().port;
});
after(async()=>{await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));});

test('공개 홈페이지는 실제 소개 콘텐츠이고 게임은 /play로 분리한다',async()=>{
  const home=await fetch(base+'/');
  assert.equal(home.status,200);
  assert.match(home.headers.get('content-type'),/text\/html/);
  const body=await home.text();
  for (const keyword of ['무료 온라인','435개','Host Show!','/play','/guide','/privacy']) assert.ok(body.includes(keyword),keyword+' 누락');
  assert.doesNotMatch(body,/id="entryForm"/);
  const play=await fetch(base+'/play');
  assert.equal(play.status,200);
  const game=await play.text();
  assert.match(game,/id="entryForm"/);
  assert.match(game,/name="robots" content="noindex,follow"/);
  assert.match(game,/href="\/privacy"/);
});

test('예전 초대 링크를 새 /play 주소로 이동한다',async()=>{
  const response=await fetch(base+'/?room=ABC123',{redirect:'manual'});
  assert.equal(response.status,302);
  assert.equal(response.headers.get('location'),'/play?room=ABC123');
  const target=await fetch(base+response.headers.get('location'));
  assert.equal(target.status,200);
});

test('원본 규칙 / 정보 / 정책 / 문의 / 안전 안내가 탐색 가능하다',async()=>{
  const expectations={
    '/guide':['클래식','Host Show!','Shift+Enter'],
    '/faq':['자주 묻는 질문','음성채팅'],
    '/about':['서비스','광고'],
    '/privacy':['개인정보','로컬 스토리지'],
    '/terms':['이용약관','호스트'],
    '/safety':['개인 정보','호스트'],
    '/contact':['문의','GitHub']
  };
  for (const [path,terms] of Object.entries(expectations)){
    const response=await fetch(base+path);
    assert.equal(response.status,200,path);
    const body=await response.text();
    for (const phrase of terms)assert.ok(body.includes(phrase),path+': '+phrase);
  }
});

test('크롤러가 공개 페이지에 접근하고 게이트된 광고 코드를 사용한다',async()=>{
  const [robots,sitemap,css,ads]=await Promise.all([
    fetch(base+'/robots.txt'),fetch(base+'/sitemap.xml'),
    fetch(base+'/site.css'),fetch(base+'/ads.txt')
  ]);
  assert.equal(robots.status,200);
  assert.match(await robots.text(),/Sitemap:/);
  assert.equal(sitemap.status,200);
  const map=await sitemap.text();
  assert.match(map,/<urlset /);
  assert.ok(!map.includes('<loc>https://yangsechan-webgame.onrender.com/play</loc>'));
  assert.equal(css.status,200);
  assert.match(css.headers.get('content-type'),/text\/css/);
  if(!process.env.ADSENSE_CLIENT_ID)assert.equal(ads.status,404);
});

test('모르는 경로는 404이며 기존 게임 API가 유지된다',async()=>{
  assert.equal((await fetch(base+'/not-found-path')).status,404);
  const response=await fetch(base+'/api/health');
  assert.equal(response.status,200);
  assert.equal((await response.json()).ok,true);
  const create=await fetch(base+'/api/create',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'테스터'})});
  assert.equal(create.status,200);
  const game=await create.json();
  assert.match(game.code,/^[A-Z2-9]{6}$/);
});
