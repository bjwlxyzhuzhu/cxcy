/* ============================================================
   创新创业复杂游戏 · 共享引擎 engine.js
   提供：合成音乐(BGM) + 音效(SFX) + 最高分排行榜 + 攻略弹窗 + 音频开关UI
   全部基于 WebAudio / localStorage，零外部文件，file:// 双击即用。
   暴露全局：window.Sound / window.LB / window.GameKit
   ============================================================ */
(function(){
"use strict";

/* ---------- 音频引擎 ---------- */
const Sound={
  ctx:null, master:null, bgmGain:null,
  sfxOn:true, bgmOn:true, _bgmTimer:null, _bgm:null,
  init(){
    if(this.ctx)return;
    try{
      const AC=window.AudioContext||window.webkitAudioContext;
      this.ctx=new AC();
      this.master=this.ctx.createGain();this.master.gain.value=0.5;this.master.connect(this.ctx.destination);
      this.bgmGain=this.ctx.createGain();this.bgmGain.gain.value=0.0;this.bgmGain.connect(this.master);
    }catch(e){this.ctx=null;}
    try{this.sfxOn=localStorage.getItem('cxcy_sfx')!=='0';this.bgmOn=localStorage.getItem('cxcy_bgm')!=='0';}catch(e){}
  },
  resume(){ if(!this.ctx)this.init(); if(this.ctx&&this.ctx.state==='suspended')this.ctx.resume(); },
  _tone(freq,dur,type,vol,freq2){
    if(!this.ctx)return;
    const t=this.ctx.currentTime;
    const o=this.ctx.createOscillator(),g=this.ctx.createGain();
    o.type=type||'square';o.frequency.setValueAtTime(freq,t);
    if(freq2)o.frequency.exponentialRampToValueAtTime(Math.max(1,freq2),t+dur);
    g.gain.setValueAtTime(0.0001,t);
    g.gain.exponentialRampToValueAtTime(vol||0.2,t+0.008);
    g.gain.exponentialRampToValueAtTime(0.0001,t+dur);
    o.connect(g);g.connect(this.master);o.start(t);o.stop(t+dur+0.02);
  },
  _noise(dur,vol,hp){
    if(!this.ctx)return;
    const t=this.ctx.currentTime, n=Math.floor(this.ctx.sampleRate*dur);
    const buf=this.ctx.createBuffer(1,n,this.ctx.sampleRate),d=buf.getChannelData(0);
    for(let i=0;i<n;i++)d[i]=(Math.random()*2-1)*(1-i/n);
    const src=this.ctx.createBufferSource();src.buffer=buf;
    const g=this.ctx.createGain();g.gain.value=vol||0.2;
    const f=this.ctx.createBiquadFilter();f.type='highpass';f.frequency.value=hp||300;
    src.connect(f);f.connect(g);g.connect(this.master);src.start(t);
  },
  _arp(freqs,step,type,vol){freqs.forEach((f,i)=>setTimeout(()=>this._tone(f,step*1.6,type||'square',vol||0.16),i*step*1000));},
  sfx(name){
    if(!this.sfxOn)return; if(!this.ctx)this.init(); if(!this.ctx)return; this.resume();
    switch(name){
      case'shoot':this._tone(820,0.07,'square',0.10,520);break;
      case'hit':this._noise(0.06,0.18,800);this._tone(180,0.06,'square',0.10);break;
      case'explode':this._noise(0.28,0.28,200);this._tone(110,0.3,'sawtooth',0.12,40);break;
      case'jump':this._tone(320,0.13,'sine',0.18,720);break;
      case'jump2':this._tone(480,0.13,'sine',0.16,900);break;
      case'land':this._tone(150,0.08,'square',0.12,90);break;
      case'coin':this._tone(1180,0.06,'square',0.14);setTimeout(()=>this._tone(1560,0.09,'square',0.14),60);break;
      case'rotate':this._tone(420,0.04,'square',0.08,520);break;
      case'lock':this._tone(200,0.06,'square',0.12,150);break;
      case'select':this._tone(640,0.04,'triangle',0.10);break;
      case'match':this._tone(700,0.08,'triangle',0.16);setTimeout(()=>this._tone(1050,0.12,'triangle',0.16),70);break;
      case'clear':this._arp([523,659,784],0.06,'square',0.15);break;
      case'bigclear':this._arp([523,659,784,1046,1318],0.06,'square',0.17);break;
      case'levelup':this._arp([392,523,659,784],0.07,'triangle',0.18);break;
      case'powerup':this._arp([523,784,1046],0.05,'sine',0.18);break;
      case'bomb':this._noise(0.4,0.3,120);this._tone(90,0.45,'sawtooth',0.16,30);break;
      case'boss':this._tone(70,0.5,'sawtooth',0.18,55);setTimeout(()=>this._tone(80,0.5,'sawtooth',0.16,60),200);break;
      case'win':this._arp([523,659,784,1046,1318,1568],0.10,'square',0.2);break;
      case'gameover':this._arp([392,330,262,196],0.16,'sawtooth',0.18);break;
      case'tick':this._tone(900,0.03,'square',0.06);break;
    }
  },
  /* BGM：循环 8 拍简易芯片乐，按曲风传不同参数 */
  PATTERNS:{
    tetris:{tempo:0.26,wave:'square',bass:'triangle',notes:[330,392,494,392,440,392,330,294],bassN:[110,110,147,98]},
    shooter:{tempo:0.16,wave:'sawtooth',bass:'square',notes:[440,523,440,659,587,523,440,392],bassN:[110,98,131,123]},
    runner:{tempo:0.18,wave:'square',bass:'triangle',notes:[523,494,440,494,587,494,440,392],bassN:[131,123,110,98]},
    llk:{tempo:0.30,wave:'sine',bass:'sine',notes:[392,440,523,440,494,440,392,349],bassN:[98,110,123,98]},
    zuma:{tempo:0.24,wave:'triangle',bass:'sine',notes:[349,392,440,523,440,392,349,330],bassN:[87,98,110,98]}
  },
  startBGM(key){
    if(!this.ctx)this.init(); if(!this.ctx)return; this.resume();
    this.stopBGM();
    const p=this.PATTERNS[key]||this.PATTERNS.tetris; this._bgm=p;
    if(this.bgmGain)this.bgmGain.gain.setTargetAtTime(this.bgmOn?0.10:0.0,this.ctx.currentTime,0.1);
    let i=0;
    const playStep=()=>{
      if(!this.ctx){return;}
      const t=this.ctx.currentTime;
      const lead=p.notes[i%p.notes.length], bass=p.bassN[i%p.bassN.length];
      // lead
      const o=this.ctx.createOscillator(),g=this.ctx.createGain();
      o.type=p.wave;o.frequency.value=lead;
      g.gain.setValueAtTime(0.0001,t);g.gain.exponentialRampToValueAtTime(0.06,t+0.02);g.gain.exponentialRampToValueAtTime(0.0001,t+p.tempo*0.9);
      o.connect(g);g.connect(this.bgmGain);o.start(t);o.stop(t+p.tempo);
      // bass every 2 steps
      if(i%2===0){const bo=this.ctx.createOscillator(),bg=this.ctx.createGain();bo.type=p.bass;bo.frequency.value=bass;
        bg.gain.setValueAtTime(0.0001,t);bg.gain.exponentialRampToValueAtTime(0.07,t+0.02);bg.gain.exponentialRampToValueAtTime(0.0001,t+p.tempo*1.8);
        bo.connect(bg);bg.connect(this.bgmGain);bo.start(t);bo.stop(t+p.tempo*2);}
      i++;
    };
    playStep();
    this._bgmTimer=setInterval(playStep,p.tempo*1000);
  },
  stopBGM(){ if(this._bgmTimer){clearInterval(this._bgmTimer);this._bgmTimer=null;} },
  toggleBGM(){ this.bgmOn=!this.bgmOn; try{localStorage.setItem('cxcy_bgm',this.bgmOn?'1':'0');}catch(e){}
    if(this.ctx&&this.bgmGain)this.bgmGain.gain.setTargetAtTime(this.bgmOn?0.10:0.0,this.ctx.currentTime,0.1); return this.bgmOn; },
  toggleSFX(){ this.sfxOn=!this.sfxOn; try{localStorage.setItem('cxcy_sfx',this.sfxOn?'1':'0');}catch(e){} return this.sfxOn; }
};

/* ---------- 排行榜 ---------- */
const LB={
  _key(k){return 'cxcy_lb_'+k;},
  list(k){ try{const v=JSON.parse(localStorage.getItem(this._key(k))||'[]');return Array.isArray(v)?v:[];}catch(e){return [];} },
  submit(k,score){
    score=Math.round(score)||0;
    let l=this.list(k);
    const entry={s:score,d:new Date().toLocaleDateString('zh-CN')};
    l.push(entry);l.sort((a,b)=>b.s-a.s);l=l.slice(0,5);
    try{localStorage.setItem(this._key(k),JSON.stringify(l));}catch(e){}
    const rank=l.indexOf(entry)+1;        // 1..5，0 表示未进榜
    return {rank:rank>0?rank:0, list:l, best:l.length?l[0].s:0};
  },
  html(k,highlightScore){
    const l=this.list(k);
    if(!l.length)return '<div style="color:#64748b;font-size:12px">暂无记录，快来刷榜！</div>';
    const medal=['🥇','🥈','🥉','4.','5.'];
    return '<table style="width:100%;font-size:13px;border-collapse:collapse">'+
      l.map((e,i)=>{const hi=(highlightScore!=null&&e.s===highlightScore);
        return `<tr style="${hi?'background:rgba(251,191,36,.18);':''}border-bottom:1px solid rgba(148,163,184,.15)">
        <td style="padding:4px 6px;width:30px">${medal[i]}</td>
        <td style="padding:4px 6px;text-align:right;color:#fbbf24;font-weight:700">${e.s}</td>
        <td style="padding:4px 6px;text-align:right;color:#94a3b8;font-size:11px">${e.d}</td></tr>`;}).join('')+
      '</table>';
  }
};

/* ---------- UI 注入：音频开关 + 攻略按钮/弹窗 ---------- */
const GameKit={
  cfg:null,
  mount(cfg){
    this.cfg=cfg; Sound.init();
    // 样式
    if(!document.getElementById('gk-style')){
      const st=document.createElement('style');st.id='gk-style';
      st.textContent=`
      .gk-ctrls{position:fixed;top:12px;right:12px;display:flex;gap:6px;z-index:9998}
      .gk-btn{background:rgba(20,24,40,.85);border:1px solid #2e3a5f;color:#cbd5e1;border-radius:9px;
        width:38px;height:38px;font-size:17px;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)}
      .gk-btn.wide{width:auto;padding:0 12px;font-size:13px;font-weight:700;gap:5px}
      .gk-btn:hover{border-color:#6366f1;color:#fff}
      .gk-btn.off{opacity:.45}
      .gk-modal{position:fixed;inset:0;background:rgba(4,6,14,.82);z-index:9999;display:none;align-items:center;justify-content:center;padding:18px}
      .gk-modal.show{display:flex}
      .gk-card{background:#11162a;border:1px solid #2e3a5f;border-radius:18px;max-width:480px;width:100%;max-height:88vh;overflow:auto;padding:22px;color:#e2e8f0;box-shadow:0 20px 60px rgba(0,0,0,.5)}
      .gk-card h2{font-size:20px;margin-bottom:6px;background:linear-gradient(90deg,#a78bfa,#38bdf8);-webkit-background-clip:text;background-clip:text;color:transparent}
      .gk-card h3{font-size:14px;color:#7dd3fc;margin:14px 0 6px}
      .gk-card p,.gk-card li{font-size:13px;line-height:1.75;color:#cbd5e1}
      .gk-card ul{margin-left:18px}
      .gk-card .tip{background:#0d1322;border-left:3px solid #fbbf24;border-radius:6px;padding:8px 12px;margin:4px 0;font-size:13px}
      .gk-close{float:right;background:#1e2742;border:1px solid #2e3a5f;color:#cbd5e1;border-radius:8px;padding:6px 12px;cursor:pointer;font-size:13px}
      .gk-lb-wrap{margin-top:14px;background:#0d1322;border-radius:10px;padding:10px 12px}
      `;
      document.head.appendChild(st);
    }
    // 控件
    const wrap=document.createElement('div');wrap.className='gk-ctrls';
    const help=document.createElement('button');help.className='gk-btn wide';help.innerHTML='📖 攻略';
    const bgm=document.createElement('button');bgm.className='gk-btn'+(Sound.bgmOn?'':' off');bgm.textContent='🎵';bgm.title='背景音乐';
    const sfx=document.createElement('button');sfx.className='gk-btn'+(Sound.sfxOn?'':' off');sfx.textContent='🔊';sfx.title='音效';
    help.onclick=()=>this.openHelp();
    bgm.onclick=()=>{const on=Sound.toggleBGM();bgm.classList.toggle('off',!on);};
    sfx.onclick=()=>{const on=Sound.toggleSFX();sfx.classList.toggle('off',!on);if(on)Sound.sfx('select');};
    wrap.appendChild(help);wrap.appendChild(bgm);wrap.appendChild(sfx);
    document.body.appendChild(wrap);
    // 弹窗
    const modal=document.createElement('div');modal.className='gk-modal';modal.id='gk-modal';
    modal.innerHTML=`<div class="gk-card"><button class="gk-close" id="gk-x">关闭 ✕</button>
      <h2>${cfg.title} · 玩法与攻略</h2>
      <div id="gk-help">${cfg.help||''}</div>
      <h3>🏆 最高分排行榜</h3><div class="gk-lb-wrap" id="gk-lb"></div></div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click',e=>{if(e.target===modal)this.closeHelp();});
    document.getElementById('gk-x').onclick=()=>this.closeHelp();
  },
  openHelp(){const m=document.getElementById('gk-modal');if(!m)return;document.getElementById('gk-lb').innerHTML=LB.html(this.cfg.key);m.classList.add('show');},
  closeHelp(){const m=document.getElementById('gk-modal');if(m)m.classList.remove('show');},
  /* 游戏开始：恢复音频并放 BGM */
  begin(){ Sound.resume(); Sound.startBGM(this.cfg.bgm||this.cfg.key); },
  stop(){ Sound.stopBGM(); },
  /* 结束：提交分数，返回 {rank,best,list,html} 供结算面板使用 */
  finish(score){ const r=LB.submit(this.cfg.key,score); r.html=LB.html(this.cfg.key,Math.round(score)); return r; }
};

window.Sound=Sound; window.LB=LB; window.GameKit=GameKit;
})();
