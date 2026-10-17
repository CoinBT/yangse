(() => {
  'use strict';
  const button = document.getElementById('voiceToggle');
  const status = document.getElementById('voiceStatus');
  const output = document.getElementById('voiceRemoteAudio');
  let socket = null, localStream = null, enabled = false, roomState = null, starting = false;
  const peers = new Map();
  const iceServers = [{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}];
  function send(message) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message)); return true;
  }
  function setStatus(text) { status.textContent = text; }
  function ui() {
    button.textContent = enabled ? '🔴 음성채팅 Off' : '🎙 음성채팅 On';
    button.setAttribute('aria-pressed',String(enabled));
    button.disabled = starting || (roomState && roomState.me.role !== 'player');
    if (enabled) setStatus('🎤 마이크 켜짐 · 참가자 ' + (roomState?.voicePeers?.length || 1) + '명');
    else if (!starting && (!roomState || roomState.me.role === 'player')) setStatus('마이크 꺼짐');
    else if (roomState?.me.role !== 'player') setStatus('관전자는 텍스트 채팅만 가능');
  }
  function disconnect(id) {
    const p = peers.get(id);
    if (!p) return;
    peers.delete(id);
    try { p.pc.close(); } catch {}
    p.audio?.remove();
  }
  function resetPeers() { for (const id of [...peers.keys()]) disconnect(id); }
  function peerFor(id) {
    if (peers.has(id)) return peers.get(id);
    if (!localStream) return null;
    const pc = new RTCPeerConnection({iceServers});
    const audio = document.createElement('audio');
    audio.autoplay = true; audio.playsInline = true;
    audio.dataset.peer = id;
    output.appendChild(audio);
    const p = {pc,audio,offering:false,remoteSet:false,candidates:[]};
    peers.set(id,p);
    for (const track of localStream.getAudioTracks()) pc.addTrack(track,localStream);
    pc.onicecandidate = e => {
      if (e.candidate) send({action:'voice_signal',to:id,signal:{type:'candidate',candidate:e.candidate.toJSON()}});
    };
    pc.ontrack = e => {
      audio.srcObject = e.streams[0] || new MediaStream([e.track]);
      audio.play().catch(() => setStatus('🔊 소리 재생이 차단됐어요. 화면을 한 번 클릭해 주세요.'));
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') disconnect(id);
    };
    return p;
  }
  async function offer(id) {
    const p = peerFor(id);
    if (!p || p.offering || p.pc.signalingState !== 'stable') return;
    p.offering = true;
    try {
      const desc = await p.pc.createOffer();
      await p.pc.setLocalDescription(desc);
      send({action:'voice_signal',to:id,signal:{type:'offer',sdp:p.pc.localDescription.sdp}});
    } catch (e) { console.warn('음성 연결 제안 실패:',e); }
    finally { p.offering = false; }
  }
  async function processSignal(from,signal) {
    if (!enabled || !localStream || !roomState?.voicePeers?.includes(from)) return;
    const p = peerFor(from);
    if (!p) return;
    try {
      if (signal.type === 'offer') {
        if (typeof signal.sdp !== 'string') return;
        await p.pc.setRemoteDescription({type:'offer',sdp:signal.sdp});
        p.remoteSet = true;
        await flush(p);
        const answer = await p.pc.createAnswer();
        await p.pc.setLocalDescription(answer);
        send({action:'voice_signal',to:from,signal:{type:'answer',sdp:p.pc.localDescription.sdp}});
      } else if (signal.type === 'answer') {
        if (typeof signal.sdp !== 'string' || p.pc.signalingState !== 'have-local-offer') return;
        await p.pc.setRemoteDescription({type:'answer',sdp:signal.sdp});
        p.remoteSet = true;
        await flush(p);
      } else if (signal.type === 'candidate' && signal.candidate) {
        if (p.remoteSet) await p.pc.addIceCandidate(signal.candidate);
        else p.candidates.push(signal.candidate);
      }
    } catch (e) { console.warn('음성 연결 교환 실패:',e); }
  }
  async function flush(p) {
    for (const c of p.candidates.splice(0)) {
      try { await p.pc.addIceCandidate(c); } catch(e) { console.warn('ICE 처리 실패',e); }
    }
  }
  function syncPeers() {
    if (!enabled || !roomState?.voicePeers || !localStream) return;
    const selfId = roomState.me.id;
    const wanted = roomState.voicePeers.filter(id => id !== selfId);
    for (const id of [...peers.keys()]) if (!wanted.includes(id)) disconnect(id);
    for (const id of wanted) {
      if (!peers.has(id)) {
        peerFor(id);
        // ID 정렬로 하나의 단말기만 offer를 보내 충돌을 방지합니다.
        if (selfId < id) offer(id);
      }
    }
  }
  async function start() {
    if (starting || enabled || roomState?.me.role !== 'player') return;
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
      setStatus('이 브라우저는 음성채팅을 지원하지 않아요.'); return;
    }
    starting = true; ui(); setStatus('기본 마이크 사용 권한을 요청 중…');
    let errorMessage = '';
    try {
      // deviceId를 지정하지 않으면 브라우저/OS의 기본 입력장치를 사용합니다.
      localStream = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false});
      enabled = true;
      send({action:'voice_join'});
    } catch (e) {
      errorMessage = e?.name === 'NotAllowedError' ? '마이크 권한을 허용해 주세요.' : '마이크를 켤 수 없어요.';
    } finally { starting = false; ui(); if (errorMessage) setStatus(errorMessage); }
  }
  function stop() {
    enabled = false;
    send({action:'voice_leave'});
    resetPeers();
    localStream?.getTracks().forEach(t => t.stop());
    localStream = null; ui();
  }
  button.addEventListener('click',() => { if (enabled) stop(); else start(); });
  window.YSVoice = {
    attachSocket(ws) {
      if (socket && socket !== ws) resetPeers();
      socket = ws;
      ws.addEventListener('open',()=>{ if (enabled) send({action:'voice_join'}); });
      ws.addEventListener('close',()=>{ if (socket === ws) resetPeers(); });
      ws.addEventListener('message',event=>{
        if (socket !== ws) return;
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'voice_signal') processSignal(payload.from,payload.signal);
        } catch {}
      });
    },
    render(state) {
      roomState = state;
      if (state.me.role !== 'player' && enabled) stop();
      syncPeers(); ui();
    },
    shutdown:stop
  };
  ui();
})();