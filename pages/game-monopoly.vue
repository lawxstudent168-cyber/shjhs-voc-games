<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import maps from '~/data/monopoly-maps.json';

const db=useSupabaseClient(), route=useRoute(), student=useCookie('currentStudent');
const words=ref([]), boardWords=ref([]), owned=ref({});
const players=ref([{name:'你',cash:1500,pos:0,direction:1},{name:'電腦',cash:1500,pos:0,direction:1}]);
const turn=ref(0), round=ref(1), die=ref('—'), dice=ref([1,1]), rolling=ref(false), done=ref(false);
const question=ref(null), answer=ref(''), message=ref('載入題庫…'), aiStatus=ref('');
const aiBusy=ref(false), playerBusy=ref(false), selectedMap=ref('taiwan');
const mistakes=ref(0), rightWords=ref([]), wrongWords=ref([]), startedAt=Date.now();
let aiTimer=null;

const activeMap=computed(()=>maps.find(map=>map.id===selectedMap.value)||maps[0]);
const owner=id=>owned.value[id]??-1;
const price=id=>100+Math.max(0,Math.floor(boardWords.value.findIndex(word=>word.id===id)/4))*25;
const shuffle=items=>{
 const result=[...items];
 for(let i=result.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}
 return result;
};
const pause=ms=>new Promise(resolve=>window.setTimeout(resolve,ms));
const dieSymbols=['⚀','⚁','⚂','⚃','⚄','⚅'];
const routeStops=computed(()=>{
 const cityList=activeMap.value.cities||[], count=Math.min(boardWords.value.length,cityList.length,12);
 if(!count)return [];
 return boardWords.value.slice(0,count).map((word,index)=>{
  const cityIndex=count===1?0:Math.round(index*(cityList.length-1)/(count-1));
  return {...cityList[cityIndex],index,word};
 });
});
const routePoints=computed(()=>routeStops.value.map(stop=>stop.x+','+stop.y).join(' '));
function stopStyle(stop){return {left:(stop.x/10)+'%',top:(stop.y/6.8)+'%'};}
function ask(word){
 const letters=[...word.en_us].map((letter,index)=>/[a-z]/i.test(letter)?index:-1).filter(index=>index>=0);
 const type=Math.random()<.5||letters.length<2?'choice':'letters';
 const choices=shuffle([word,...shuffle(words.value.filter(item=>item.id!==word.id)).slice(0,3)]);
 const masked=[...word.en_us], missing=[];
 if(type==='letters'){
  const indexes=shuffle(letters).slice(0,2).sort((a,b)=>a-b);
  for(const index of indexes){missing.push(masked[index].toLowerCase());masked[index]='＿';}
 }
 question.value={word,type,choices,masked:masked.join(''),missing};
 answer.value='';
}
function advance(player){
 const last=routeStops.value.length-1;
 if(last<1)return;
 let next=player.pos+player.direction;
 if(next>last){player.direction=-1;next=last-1;}
 else if(next<0){player.direction=1;next=1;player.cash+=200;message.value=player.name+' 經過起點，領取 $200。';}
 player.pos=next;
}
async function endTurn(){
 question.value=null;turn.value=1-turn.value;
 if(turn.value===0)round.value++;
 if(round.value>20||players.value.some(player=>player.cash<=0)){
  done.value=true;aiStatus.value='';
  if(student.value?.id)await db.from('game_records').insert([{student_id:student.value.id,game_type:'單字大富翁',version:route.query.version||null,volume:route.query.volume||null,unit_played:route.query.unit||null,score:players.value[0].cash,time_taken_seconds:Math.floor((Date.now()-startedAt)/1000),mistakes:mistakes.value,wrong_words:[...new Set(wrongWords.value)].join(', '),correct_words:[...new Set(rightWords.value)].join(', ')}]);
 }
}
async function respond(correct,automated=false){
 if(!question.value)return;
 const word=question.value.word, player=players.value[turn.value];
 if(turn.value===0){if(correct)rightWords.value.push(word.en_us);else{mistakes.value++;wrongWords.value.push(word.en_us);}}
 if(correct&&player.cash>=price(word.id)){owned.value[word.id]=turn.value;player.cash-=price(word.id);message.value=player.name+' 答對並買下「'+word.zh_tw+'」！';}
 else if(correct)message.value=player.name+' 答對了，但現金不足，無法買地。';
 else message.value=player.name+' 答錯了，答案是 '+word.en_us+'＝'+word.zh_tw+'。';
 question.value=null;
 if(automated){aiStatus.value=message.value+' 稍後換你。';await pause(1500);}
 await endTurn();
}
function submit(){
 if(!question.value||turn.value!==0)return;
 const q=question.value;
 const correct=q.type==='choice'?answer.value===q.word.id:answer.value.trim().toLowerCase()===q.missing.join('');
 respond(correct);
}
async function animateDice(){
 rolling.value=true;
 for(let i=0;i<12;i++){dice.value=[1+Math.floor(Math.random()*6),1+Math.floor(Math.random()*6)];await pause(70);}
 const total=dice.value[0]+dice.value[1];die.value=String(total);rolling.value=false;return total;
}
async function play(index){
 if(turn.value!==index||question.value||done.value||aiBusy.value||playerBusy.value||!routeStops.value.length)return;
 const computer=index===1, player=players.value[index];
 if(computer){aiBusy.value=true;aiStatus.value='🤖 電腦正在擲骰…';}else playerBusy.value=true;
 try{
  const roll=await animateDice();
  if(computer){aiStatus.value='🤖 電腦擲出 '+roll+' 點，準備前往城市…';await pause(650);}
  for(let step=0;step<roll;step++){
   await pause(computer?340:90);advance(player);
   if(computer){const stop=routeStops.value[player.pos];aiStatus.value='🤖 電腦前往第 '+(player.pos+1)+' 站：'+stop.name+'…';}
  }
  const stop=routeStops.value[player.pos], word=stop.word, propertyOwner=owner(word.id);
  if(propertyOwner>=0){
   if(propertyOwner!==index){player.cash-=30;players.value[propertyOwner].cash+=30;message.value=player.name+' 到了對手的城市土地，支付 $30 租金。';}
   else message.value=player.name+' 回到自己的城市土地：「'+stop.name+'」。';
   if(computer){aiStatus.value='🤖 電腦停在「'+stop.name+'」：'+message.value+' 即將換你。';await pause(1400);}
   await endTurn();return;
  }
  ask(word);
  if(computer){
   aiStatus.value='🤖 電腦停在「'+stop.name+'」，正在思考'+(question.value.type==='choice'?'英文選擇':'兩個字母')+'…';
   await pause(2300);await respond(Math.random()<.7,true);
  }
 }finally{aiBusy.value=false;playerBusy.value=false;}
}
watch(turn,next=>{
 if(aiTimer)window.clearTimeout(aiTimer);
 if(next===1&&!done.value){aiStatus.value='🤖 輪到電腦，稍候擲骰…';aiTimer=window.setTimeout(()=>play(1),1500);}
 else if(next===0)aiStatus.value='';
});
watch(selectedMap,value=>{if(typeof window!=='undefined')localStorage.setItem('shjhs_monopoly_map',value);});
onMounted(async()=>{
 selectedMap.value=localStorage.getItem('shjhs_monopoly_map')||'taiwan';
 let query=db.from('vocabularies').select('id,en_us,zh_tw');
 for(const key of ['version','volume','unit'])if(route.query[key])query=query.eq(key,route.query[key]);
 const {data,error}=await query.limit(500);
 words.value=(data||[]).filter(word=>word.en_us&&word.zh_tw);
 boardWords.value=shuffle(words.value).slice(0,12);
 message.value=error?'題庫載入失敗：'+error.message:boardWords.value.length?'本局抽出最多 12 個單字，沿主要城市路線前進；到終點後折返。':'找不到單字，請返回選擇有單字的單元。';
});
onBeforeUnmount(()=>{if(aiTimer)window.clearTimeout(aiTimer);});
</script>

<template>
<main class="page">
 <header class="topbar">
  <div class="title-block"><NuxtLink class="back-link" to="/">← 遊戲選單</NuxtLink><div><h1>🏘️ 單字大富翁</h1><p>沿城市路線移動，答對買下該站單字</p></div></div>
  <nav class="map-picker" aria-label="選擇國家地圖">
   <button v-for="map in maps" :key="map.id" type="button" :class="{selected:selectedMap===map.id}" :aria-pressed="selectedMap===map.id" @click="selectedMap=map.id">{{map.flag}} {{map.name}}</button>
  </nav>
  <div class="dice-controls">
   <div class="dice-display" :class="{rolling}" aria-live="polite"><span>{{dieSymbols[dice[0]-1]}}</span><span>{{dieSymbols[dice[1]-1]}}</span><b>{{die}}</b></div>
   <button class="roll-button" type="button" :disabled="turn!==0||!!question||done||playerBusy||aiBusy||!routeStops.length" @click="play(0)">🎲 擲骰</button>
  </div>
 </header>
 <section class="scores">
  <div v-for="(player,i) in players" :key="i" :class="{active:turn===i}"><b>{{player.name}}</b><strong>$ {{player.cash}}</strong><span>{{player.pos+1}} / {{routeStops.length}} 站 · 土地 {{Object.values(owned).filter(v=>v===i).length}}</span></div>
  <div class="round-card">第 {{round}} / 20 回合</div>
 </section>
 <section v-if="routeStops.length" class="map-layout">
  <div class="map-canvas" :aria-label="activeMap.name+'城市路線地圖'">
   <svg class="map-svg" :viewBox="activeMap.viewBox" preserveAspectRatio="xMidYMid meet" role="img" :aria-label="activeMap.name+'國界與城市路線'">
    <path v-for="(shape,i) in activeMap.shapes" :key="i" class="country-outline" :d="shape"/>
    <polyline v-if="routeStops.length>1" class="city-route" :points="routePoints"/>
    <g v-for="(stop,i) in routeStops" :key="stop.name" class="city-marker">
     <circle :cx="stop.x" :cy="stop.y" :r="i===0?17:14" :class="{start:i===0,owned:owner(stop.word.id)>=0}"/>
     <text class="city-number" :x="stop.x" :y="stop.y+5">{{i+1}}</text>
     <text v-if="players[0].pos===i" class="player-token" :x="stop.x-12" :y="stop.y-19">🧑‍🎓</text>
     <text v-if="players[1].pos===i" class="player-token" :x="stop.x+4" :y="stop.y-19">🤖</text>
    </g>
   </svg>
   <div class="map-caption">{{activeMap.flag}} {{activeMap.name}} · 依城市座標連線</div>
  </div>
  <aside class="route-panel">
   <header><strong>城市路線</strong><span>到終點後折返</span></header>
   <ol>
    <li v-for="(stop,i) in routeStops" :key="stop.name" :class="{you:players[0].pos===i,cpu:players[1].pos===i,owned:owner(stop.word.id)>=0}">
     <span class="route-number">{{i+1}}</span>
     <div class="stop-copy"><b>{{stop.name}}</b><span>{{stop.word.zh_tw}}</span></div>
     <span class="stop-owner">{{owner(stop.word.id)<0?'待購':players[owner(stop.word.id)].name}}</span>
     <span v-if="players[0].pos===i||players[1].pos===i" class="stop-token">{{players[0].pos===i?'🧑‍🎓':''}}{{players[1].pos===i?'🤖':''}}</span>
    </li>
   </ol>
   <p v-if="aiStatus" class="ai-status" role="status" aria-live="polite">{{aiStatus}}</p>
  </aside>
 </section>
 <p class="message" role="status" aria-live="polite">{{message}}</p>
 <div v-if="question" class="overlay"><section class="modal">
  <template v-if="turn===1">
   <p class="modal-turn">🤖 電腦回合 · 正在思考答案</p><h2>「{{question.word.zh_tw}}」</h2>
   <p>{{question.type==='choice'?'電腦正在選擇英文單字':'電腦正在補出兩個字母'}}</p>
   <div class="thinking-dots" aria-label="電腦思考中"><i></i><i></i><i></i></div><p>請稍候看電腦的作答結果。</p>
  </template>
  <template v-else>
   <p class="modal-turn">你停在 {{routeStops[players[0].pos]?.name}}，踩到無主土地</p>
   <template v-if="question.type==='choice'">
    <h2>「{{question.word.zh_tw}}」對應哪個英文單字？</h2>
    <div class="answers"><button v-for="choice in question.choices" :key="choice.id" type="button" @click="answer=choice.id;submit()">{{choice.en_us}}</button></div>
   </template>
   <form v-else @submit.prevent="submit">
    <h2>請補出英文單字缺少的兩個字母</h2><p class="masked-word">{{question.masked}}</p>
    <input v-model="answer" autofocus autocomplete="off" maxlength="2" minlength="2" pattern="[A-Za-z]{2}" required placeholder="輸入兩個字母">
    <button type="submit">確認答案</button>
   </form>
  </template>
 </section></div>
 <div v-if="done" class="overlay"><section class="modal"><h1>🏁 {{players[0].cash===players[1].cash?'平手':players[0].cash>players[1].cash?'你贏了！':'電腦獲勝'}}</h1><p>你：{{players[0].cash}} 元　電腦：{{players[1].cash}} 元</p><NuxtLink to="/">回遊戲選單</NuxtLink></section></div>
</main>
</template>

<style scoped>
.page{height:100vh;height:100dvh;display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;gap:8px;overflow:hidden;padding:10px 16px;box-sizing:border-box;color:var(--text-main,#222);background:var(--bg-color,#f4f0e6)}
.topbar,.scores,.map-layout,.message{width:min(100%,1440px);margin:0 auto}.topbar{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:54px}.title-block{display:flex;align-items:center;gap:12px;white-space:nowrap}.title-block h1{margin:0;font-size:1.25rem}.title-block p{margin:2px 0 0;font-size:.78rem;opacity:.78}.back-link{font-size:.82rem}
.map-picker{display:flex;flex-wrap:wrap;justify-content:center;gap:5px}.map-picker button{padding:6px 9px;border:1px solid #becab9;border-radius:18px;background:#fff;color:#344438;font-size:.82rem;font-weight:700;cursor:pointer}.map-picker button.selected{border:2px solid #39784c;background:#eaf3e7}
.dice-controls{display:flex;align-items:center;gap:8px}.dice-display{display:flex;align-items:center;gap:3px;padding:4px 8px;border:1px solid #d8c398;border-radius:10px;background:#fffaf0}.dice-display span{font-size:1.55rem;line-height:1}.dice-display b{min-width:1.1em;color:#a86e13;font-size:1.1rem;text-align:center}.dice-display.rolling{animation:tumble .14s linear infinite alternate}@keyframes tumble{from{transform:translateY(-3px) rotate(-8deg)}to{transform:translateY(3px) rotate(8deg)}}
.roll-button,.modal button,.modal input{padding:8px 12px;border:2px solid #347144;border-radius:9px;background:#72c984;color:#143b20;font:inherit;font-weight:800;cursor:pointer}.roll-button:disabled{opacity:.48;cursor:not-allowed}
.scores{display:flex;gap:8px}.scores>div{flex:1;display:grid;grid-template-columns:1fr auto;align-items:center;gap:2px 8px;min-height:42px;padding:5px 10px;border:2px solid #bdc9b9;border-radius:9px;background:#fff}.scores .active{border-color:#278443;box-shadow:0 0 0 2px #27844322}.scores strong{grid-column:2;grid-row:1/3;color:#168342;font-size:1.05rem}.scores span{font-size:.74rem}.scores .round-card{display:flex;justify-content:center;align-items:center;font-weight:800;color:#334b3b}
.map-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(260px,320px);gap:10px;min-height:0}.map-canvas{position:relative;min-width:0;min-height:0;overflow:hidden;border:1px solid #bdcdb3;border-radius:16px;background:radial-gradient(ellipse at center,#fbfff6,#e7f1df);box-shadow:0 8px 22px #244a3017}.map-svg{position:absolute;inset:0;width:100%;height:100%}.country-outline{fill:#bad8bd;fill-opacity:.54;stroke:#527a5b;stroke-width:1.1;stroke-linejoin:round;vector-effect:non-scaling-stroke}.city-route{fill:none;stroke:#d38c29;stroke-width:3;stroke-dasharray:7 5;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}.city-marker circle{fill:#fff;stroke:#485f4b;stroke-width:2;vector-effect:non-scaling-stroke}.city-marker circle.start{fill:#ffe8a9;stroke:#b47716;stroke-width:3}.city-marker circle.owned{fill:#cce6d1}.city-number{fill:#26392b;text-anchor:middle;font-size:18px;font-weight:900;pointer-events:none}.player-token{font-size:22px;text-anchor:middle;paint-order:stroke;stroke:#fff;stroke-width:2px;stroke-linejoin:round}.map-caption{position:absolute;right:9px;bottom:7px;padding:4px 8px;border-radius:14px;background:#ffffffd9;color:#4d5e4e;font-size:.68rem}
.route-panel{display:flex;min-height:0;flex-direction:column;overflow:hidden;border:1px solid #bdcdb3;border-radius:15px;background:#fff;box-shadow:0 8px 22px #244a3012}.route-panel>header{display:flex;align-items:baseline;justify-content:space-between;padding:9px 12px;border-bottom:1px solid #e0e8db}.route-panel>header strong{font-size:1rem}.route-panel>header span{font-size:.7rem;color:#667366}.route-panel ol{display:flex;min-height:0;flex:1;flex-direction:column;gap:3px;overflow:auto;margin:0;padding:7px;list-style:none}.route-panel li{position:relative;display:flex;min-height:34px;align-items:center;gap:8px;padding:4px 7px;border:1px solid transparent;border-radius:8px;background:#f7f9f5}.route-panel li.you{border-color:#1884d5;background:#e8f4ff}.route-panel li.cpu{border-color:#df594d;background:#fff0ed}.route-panel li.owned:not(.you):not(.cpu){background:#eff7ef}.route-number{display:grid;width:24px;height:24px;flex:none;place-items:center;border-radius:50%;background:#e7e9e2;color:#344538;font-size:.73rem;font-weight:900}.stop-copy{display:flex;min-width:0;flex:1;flex-direction:column;line-height:1.15}.stop-copy b{font-size:.78rem}.stop-copy span{overflow:hidden;color:#425849;font-size:.78rem;text-overflow:ellipsis;white-space:nowrap}.stop-owner{color:#667366;font-size:.65rem}.stop-token{font-size:.85rem;white-space:nowrap}.ai-status{margin:0;padding:8px 10px;border-top:1px solid #d8e2f5;background:#edf2ff;color:#283c77;font-size:.75rem;font-weight:800}
.message{min-height:26px;display:flex;align-items:center;padding:4px 10px;border-radius:8px;background:#fff;font-size:.8rem}
.overlay{position:fixed;inset:0;z-index:10;display:grid;place-items:center;padding:18px;background:#142117bb}.modal{width:min(440px,100%);padding:23px;border-radius:18px;background:#fff;color:#233;text-align:center;box-shadow:0 16px 60px #0005}.modal h2{font-size:1.25rem}.modal-turn{margin-top:0;color:#46704e;font-weight:800}.answers,.modal form{display:grid;gap:9px}.modal input{width:100%;border-color:#d3d9d0;background:#fff;box-sizing:border-box;text-align:center;letter-spacing:.25em}.modal form button{background:#71c784}.masked-word{margin:10px 0;color:#243c2a;font-family:monospace;font-size:1.8rem;font-weight:900;letter-spacing:.24em}.thinking-dots{display:flex;justify-content:center;gap:7px;margin:16px 0}.thinking-dots i{width:11px;height:11px;border-radius:50%;background:#547dbe;animation:think 1s infinite ease-in-out}.thinking-dots i:nth-child(2){animation-delay:.15s}.thinking-dots i:nth-child(3){animation-delay:.3s}@keyframes think{0%,60%,100%{opacity:.35;transform:translateY(0)}30%{opacity:1;transform:translateY(-7px)}}
@media(max-width:850px){.page{height:auto;min-height:100dvh;overflow:auto;padding:10px}.topbar{flex-wrap:wrap;justify-content:flex-start}.title-block{width:100%}.map-layout{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(360px,55vh) auto}.route-panel{max-height:44vh}.route-panel ol{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.dice-controls{margin-left:auto}}
</style>