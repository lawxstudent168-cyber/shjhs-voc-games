<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
const db = useSupabaseClient(), route = useRoute(), student = useCookie('currentStudent');
const words = ref([]), owned = ref({}), players = ref([{name:'你',cash:1500,pos:0},{name:'電腦',cash:1500,pos:0}]);
const turn = ref(0), round = ref(1), die = ref('—'), done = ref(false), question = ref(null), answer = ref('');
const message = ref('載入題庫…'), aiStatus = ref(''), aiBusy = ref(false), selectedMap = ref('taiwan');
const mistakes = ref(0), rightWords = ref([]), wrongWords = ref([]), startedAt = Date.now();
let aiTimer = null;
const me = computed(() => players.value[turn.value]);
const owner = id => owned.value[id] ?? -1;
const price = id => 100 + Math.floor(words.value.findIndex(w => w.id === id) / 4) * 25;
const shuffle = arr => [...arr].sort(() => Math.random() - 0.5);
const pause = ms => new Promise(resolve => window.setTimeout(resolve, ms));
const maps = [
 {id:'taiwan',name:'台灣',flag:'🇹🇼',color:'#cc3941',paths:['M267 49 C247 68 243 98 248 124 C234 151 235 178 243 201 C231 229 231 254 244 280 C242 308 251 338 266 362 C276 379 285 375 294 356 C306 332 311 305 307 280 C320 252 319 227 309 201 C319 176 315 150 305 124 C310 96 300 67 283 50 C278 45 272 45 267 49Z']},
 {id:'uk',name:'英國',flag:'🇬🇧',color:'#36589a',paths:['M273 42 L260 56 264 76 251 93 259 111 244 130 251 149 236 168 245 187 230 206 240 225 229 245 241 264 234 284 248 301 241 322 258 339 255 357 271 370 282 352 278 334 291 317 280 298 294 280 282 262 296 244 283 224 294 205 281 186 293 168 279 150 290 131 276 111 286 92 273 74 280 57Z','M205 128 L195 139 199 154 191 169 200 184 195 199 207 212 218 200 216 183 225 167 217 152 224 138Z','M270 380 L281 377 285 386 279 397 268 393Z']},
 {id:'us',name:'美國',flag:'🇺🇸',color:'#416ba2',paths:['M71 142 L93 128 116 132 134 119 157 126 176 114 197 123 215 113 233 124 251 116 269 129 287 120 305 132 324 124 342 138 361 133 378 149 399 146 416 163 435 163 445 181 433 197 418 202 410 222 416 241 406 259 399 280 388 294 379 318 366 338 352 322 347 300 332 282 317 273 299 276 281 266 263 273 247 263 229 268 213 254 194 261 177 247 159 251 143 238 125 241 109 224 94 219 86 201 72 189 80 172Z','M426 244 L440 252 447 275 453 294 447 311 438 298 432 280 423 263Z']},
 {id:'australia',name:'澳洲',flag:'🇦🇺',color:'#338068',paths:['M103 195 L119 171 143 163 161 146 188 151 208 137 231 145 252 132 274 142 296 135 314 150 339 145 357 162 381 165 397 183 416 191 424 211 412 230 402 248 383 261 365 281 342 293 321 311 297 314 279 330 255 322 234 331 215 315 191 319 173 302 151 298 137 279 117 268 109 246 96 229Z','M369 339 L380 337 386 345 381 355 370 353Z']},
 {id:'canada',name:'加拿大',flag:'🇨🇦',color:'#c9424b',paths:['M83 151 L101 137 118 142 132 125 148 134 161 116 179 124 191 107 209 119 225 105 243 118 260 108 276 122 294 112 310 128 328 121 345 138 363 132 378 149 397 147 412 163 432 162 445 180 434 195 414 199 403 216 388 221 375 237 355 238 342 254 322 252 309 271 289 269 274 286 253 280 235 294 217 281 197 290 180 274 159 280 146 262 126 264 114 246 97 242 91 222 76 208 86 189 74 173Z','M92 102 L103 94 113 100 106 111Z','M137 83 L148 77 157 85 150 96Z','M192 77 L202 72 210 81 203 91Z','M245 81 L256 75 264 85 257 96Z','M312 91 L322 85 330 93 323 103Z','M367 101 L377 96 385 105 377 115Z']}
];
const activeMap = computed(() => maps.find(m => m.id === selectedMap.value) || maps[0]);
const gridSize = computed(() => Math.max(5, Math.ceil(words.value.length / 4) + 1));
const ringCells = computed(() => {
 const n = gridSize.value, cells = [];
 for (let c=1;c<=n;c++) cells.push({r:1,c});
 for (let r=2;r<=n;r++) cells.push({r,c:n});
 for (let c=n-1;c>=1;c--) cells.push({r:n,c});
 for (let r=n-1;r>=2;r--) cells.push({r,c:1});
 return cells;
});
const boardStyle = computed(() => ({'--grid-size':gridSize.value}));
const centerStyle = computed(() => ({gridColumn:'2 / span '+(gridSize.value-2),gridRow:'2 / span '+(gridSize.value-2)}));
function tileStyle(i) { const cell=ringCells.value[i]; return cell ? {gridColumn:cell.c,gridRow:cell.r} : {}; }
function ask(word) {
 question.value={word,type:Math.random()<.5?'meaning':'spell',choices:shuffle([word,...shuffle(words.value.filter(w=>w.id!==word.id)).slice(0,3)])};
 answer.value='';
}
async function endTurn() {
 question.value=null; turn.value=1-turn.value;
 if (turn.value===0) round.value++;
 if (round.value>20 || players.value.some(p=>p.cash<=0)) {
  done.value=true; aiStatus.value='';
  if (student.value?.id) await db.from('game_records').insert([{student_id:student.value.id,game_type:'單字大富翁',version:route.query.version||null,volume:route.query.volume||null,unit_played:route.query.unit||null,score:players.value[0].cash,time_taken_seconds:Math.floor((Date.now()-startedAt)/1000),mistakes:mistakes.value,wrong_words:[...new Set(wrongWords.value)].join(', '),correct_words:[...new Set(rightWords.value)].join(', ')}]);
 }
}
async function respond(correct, automated=false) {
 if (!question.value) return;
 const word=question.value.word, player=me.value;
 if (turn.value===0) { if(correct) rightWords.value.push(word.en_us); else {mistakes.value++;wrongWords.value.push(word.en_us);} }
 if(correct && player.cash>=price(word.id)) { owned.value[word.id]=turn.value;player.cash-=price(word.id);message.value=player.name+' 答對並買下 '+word.en_us+'！'; }
 else if(correct) message.value=player.name+' 答對了，但現金不足，無法買地。';
 else message.value=player.name+' 答錯了，答案是 '+word.en_us+'＝'+word.zh_tw+'。';
 question.value=null;
 if(automated) {aiStatus.value=message.value+' 稍後換你。';await pause(1700);aiBusy.value=false;}
 await endTurn();
}
function submit() {
 if(!question.value || turn.value!==0) return;
 const q=question.value;
 respond(q.type==='meaning' ? answer.value===q.word.id : answer.value.trim().toLowerCase()===q.word.en_us.trim().toLowerCase());
}
async function play(index) {
 if(turn.value!==index || question.value || done.value || aiBusy.value || !words.value.length) return;
 const computer=index===1, player=players.value[index];
 if(computer) aiBusy.value=true;
 const roll=2+Math.floor(Math.random()*11);die.value=String(roll);
 if(computer){aiStatus.value='🤖 電腦擲出 '+roll+' 點，準備前進…';await pause(850);}
 for(let step=0;step<roll;step++){
  await pause(computer?390:100);
  player.pos=(player.pos+1)%words.value.length;
  if(player.pos===0){player.cash+=200;message.value=player.name+' 經過起點，領取 $200。';}
  if(computer) aiStatus.value='🤖 電腦前進中：第 '+(player.pos+1)+' 格「'+words.value[player.pos].en_us+'」…';
 }
 const word=words.value[player.pos], propertyOwner=owner(word.id);
 if(propertyOwner>=0){
  if(propertyOwner!==index){player.cash-=30;players.value[propertyOwner].cash+=30;message.value=player.name+' 踩到對手土地，支付 $30 租金。';}
  else message.value=player.name+' 回到自己的土地：'+word.en_us+'。';
  if(computer){aiStatus.value='🤖 電腦停在「'+word.en_us+'」：'+message.value+' 即將換你。';await pause(1800);aiBusy.value=false;}
  await endTurn();return;
 }
 ask(word);
 if(computer){aiStatus.value='🤖 電腦停在「'+word.en_us+'」，正在思考'+(question.value.type==='meaning'?'中文意思':'英文拼字')+'…';await pause(2500);await respond(Math.random()<.7,true);}
}
watch(turn,next=>{
 if(aiTimer) window.clearTimeout(aiTimer);
 if(next===1&&!done.value){aiStatus.value='🤖 輪到電腦，稍候擲骰…';aiTimer=window.setTimeout(()=>play(1),1700);}
 else if(next===0) aiStatus.value='';
});
watch(selectedMap,value=>{if(typeof window!=='undefined')localStorage.setItem('shjhs_monopoly_map',value);});
onMounted(async()=>{
 selectedMap.value=localStorage.getItem('shjhs_monopoly_map')||'taiwan';
 let q=db.from('vocabularies').select('id,en_us,zh_tw');
 for(const key of ['version','volume','unit']) if(route.query[key]) q=q.eq(key,route.query[key]);
 const {data,error}=await q.limit(500);
 words.value=(data||[]).filter(w=>w.en_us&&w.zh_tw);
 message.value=error?'題庫載入失敗：'+error.message:words.value.length?'擲骰前進，答對買地、經過起點領 $200。電腦移動時會逐格提示。':'找不到單字，請返回選擇有單字的單元。';
});
onBeforeUnmount(()=>{if(aiTimer)window.clearTimeout(aiTimer);});
</script>
<template>
<main class="page">
 <header class="page-header"><NuxtLink to="/">← 返回遊戲選單</NuxtLink><h1>🏘️ 單字大富翁</h1><p>拼字或選中文答題買地，踩到對手土地支付租金。</p></header>
 <section class="scores">
  <div v-for="(p,i) in players" :key="i" :class="{active:turn===i}"><b>{{p.name}}</b><strong>$ {{p.cash}}</strong><span>位置 {{p.pos+1}} · 土地 {{Object.values(owned).filter(v=>v===i).length}}</span></div>
  <div class="round-card">第 {{round}} / 20 回合</div>
 </section>
 <p class="message" role="status" aria-live="polite">{{message}}</p>
 <div v-if="words.length" class="board-scroll">
  <section class="board" :style="boardStyle" aria-label="單字大富翁環形棋盤">
   <div class="map-watermark" :style="{color:activeMap.color}" aria-hidden="true"><svg viewBox="0 0 512 420" preserveAspectRatio="xMidYMid meet"><path v-for="(path,i) in activeMap.paths" :key="i" :d="path"/></svg><span>{{activeMap.flag}} {{activeMap.name}}</span></div>
   <article v-for="(w,i) in words" :key="w.id" class="plot" :class="{you:owner(w.id)===0,cpu:owner(w.id)===1}" :style="tileStyle(i)">
    <span v-if="i===0" class="start-tag">起點</span><b>{{w.en_us}}</b><span>{{w.zh_tw}}</span>
    <small>地價 {{'$'+price(w.id)}}</small><small>{{owner(w.id)<0?'待購':players[owner(w.id)].name}}</small>
    <span v-if="players[0].pos===i||players[1].pos===i" class="tokens"><i v-if="players[0].pos===i">🧑‍🎓</i><i v-if="players[1].pos===i">🤖</i></span>
   </article>
   <section class="center-panel" :style="centerStyle">
    <div class="map-picker" role="group" aria-label="選擇棋盤地圖">
     <button v-for="m in maps" :key="m.id" type="button" :class="{selected:selectedMap===m.id}" :style="{'--map-accent':m.color}" :aria-pressed="selectedMap===m.id" @click="selectedMap=m.id">{{m.flag}} {{m.name}}</button>
    </div>
    <div class="dice-area"><span class="dice-label">最後骰點</span><div class="die-face" aria-live="polite">🎲 {{die}}</div><button v-if="turn===0" class="roll-button" type="button" :disabled="!!question||done||aiBusy" @click="play(0)">🎲 擲骰前進</button><p v-else class="computer-turn">🤖 電腦回合進行中</p></div>
    <p v-if="aiStatus" class="ai-status" role="status" aria-live="polite">{{aiStatus}}</p><p v-else class="center-hint">答對即可購買這格單字土地</p><p class="map-caption">{{activeMap.name}}地圖主題</p>
   </section>
  </section>
 </div>
 <div v-if="question" class="overlay"><section class="modal" :aria-live="turn===1?'polite':undefined">
  <template v-if="turn===1"><p class="modal-turn">🤖 電腦回合 · 正在思考答案</p><h2 v-if="question.type==='meaning'">「{{question.word.en_us}}」的中文意思？</h2><h2 v-else>請拼出：{{question.word.zh_tw}}</h2><div class="thinking-dots" aria-label="電腦思考中"><i></i><i></i><i></i></div><p>電腦正在作答，請稍候看結果。</p></template>
  <template v-else><p class="modal-turn">你踩到一塊無主土地</p><template v-if="question.type==='meaning'"><h2>「{{question.word.en_us}}」的中文意思？</h2><div class="answers"><button v-for="choice in question.choices" :key="choice.id" type="button" @click="answer=choice.id;submit()">{{choice.zh_tw}}</button></div></template><form v-else @submit.prevent="submit"><h2>請拼出：{{question.word.zh_tw}}</h2><input v-model="answer" autofocus autocomplete="off" placeholder="輸入英文拼字"><button type="submit">確認答案</button></form></template>
 </section></div>
 <div v-if="done" class="overlay"><section class="modal"><h1>🏁 {{players[0].cash===players[1].cash?'平手':players[0].cash>players[1].cash?'你贏了！':'電腦獲勝'}}</h1><p>你：{{players[0].cash}} 元　電腦：{{players[1].cash}} 元</p><NuxtLink to="/">回遊戲選單</NuxtLink></section></div>
</main>
</template>
<style scoped>
.page{min-height:100vh;padding:22px;box-sizing:border-box;color:var(--text-main,#222);background:var(--bg-color,#f4f0e6)}.page-header,.scores,.message{max-width:1120px;margin:0 auto 16px}.page-header h1{margin:12px 0 4px}.page-header p{margin:0;opacity:.8}
.scores{display:flex;gap:10px}.scores>div{flex:1;display:grid;gap:5px;padding:12px;border:2px solid #bdc9b9;border-radius:12px;background:#fff}.scores .active{border-color:#278443;box-shadow:0 0 0 3px #27844322}.scores strong{color:#168342;font-size:1.4rem}.scores .round-card{display:flex;align-items:center;justify-content:center;color:#334b3b;font-weight:800}.message{padding:12px;border-radius:10px;background:#fff}
.board-scroll{max-width:1180px;margin:0 auto;overflow:auto;padding:5px 3px 14px}.board{--tile-size:max(72px,min(9vw,108px));position:relative;display:grid;grid-template-columns:repeat(var(--grid-size),minmax(0,1fr));grid-template-rows:repeat(var(--grid-size),minmax(72px,1fr));gap:5px;width:max(100%,calc(var(--grid-size)*var(--tile-size)));min-width:max(640px,calc(var(--grid-size)*var(--tile-size)));max-width:1180px;aspect-ratio:1;margin:auto;padding:10px;box-sizing:border-box;border:6px solid #39784c;border-radius:22px;background:radial-gradient(ellipse at center,#fbfff3,#e7f2d8 62%,#d5e6c7);box-shadow:0 14px 34px #244a3028}
.map-watermark{position:absolute;inset:11%;display:grid;place-items:center;overflow:hidden;opacity:.16;pointer-events:none}.map-watermark svg{width:75%;height:78%;fill:currentColor;filter:drop-shadow(0 8px 10px #244a3020)}.map-watermark span{position:absolute;right:4%;bottom:2%;padding:4px 9px;border-radius:20px;background:#ffffffd9;color:#354b3b;font-weight:800}
.plot{z-index:1;position:relative;display:flex;min-width:0;flex-direction:column;justify-content:center;align-items:center;gap:3px;overflow:hidden;padding:5px 3px;border:2px solid #d2d7ca;border-radius:9px;background:#fff;color:#253329;text-align:center;overflow-wrap:anywhere;box-shadow:0 2px 4px #0000000d}.plot.you{border-color:#2196f3;background:#e1f1ff}.plot.cpu{border-color:#ef5849;background:#ffe7e3}.plot b{font-size:clamp(.68rem,1vw,.9rem)}.plot>span:not(.tokens):not(.start-tag){font-size:clamp(.6rem,.8vw,.76rem)}.plot small{font-size:clamp(.55rem,.7vw,.68rem);line-height:1.15}.tokens{display:flex;gap:2px;min-height:17px}.tokens i{font-style:normal;font-size:.9rem}.start-tag{position:absolute;top:2px;left:2px;padding:2px 4px;border-radius:5px;background:#39784c;color:#fff;font-size:.58rem;font-weight:800}
.center-panel{z-index:2;display:flex;min-width:0;flex-direction:column;justify-content:center;align-items:center;gap:clamp(8px,1.4vw,18px);overflow:auto;padding:clamp(8px,2vw,22px);border:1px solid #aec7a2;border-radius:18px;background:#ffffffdf;text-align:center;box-shadow:0 8px 24px #355a3820;backdrop-filter:blur(4px)}
.map-picker{display:flex;width:100%;flex-wrap:wrap;justify-content:center;gap:5px}.map-picker button{display:inline-flex;align-items:center;gap:4px;padding:5px 8px;border:1px solid #bdc9b9;border-radius:20px;background:#fff;color:#344438;font-size:clamp(.65rem,.9vw,.82rem);font-weight:700;cursor:pointer}.map-picker button.selected{border-color:var(--map-accent);background:color-mix(in srgb,var(--map-accent) 13%,white);box-shadow:0 0 0 2px color-mix(in srgb,var(--map-accent) 22%,transparent)}
.dice-area{display:grid;justify-items:center;gap:6px}.dice-label,.center-hint,.map-caption{margin:0;color:#506254;font-size:clamp(.68rem,.95vw,.88rem)}.die-face{min-width:112px;padding:8px 18px;border:3px solid #d79c2f;border-radius:17px;background:linear-gradient(145deg,#fffdf5,#fff0c7);color:#27372b;font-size:clamp(1.5rem,3vw,2.3rem);font-weight:900;box-shadow:0 5px 0 #b78122,0 9px 15px #5d4a1e21}
.roll-button,.modal button,.modal input{padding:10px 17px;border:2px solid #347144;border-radius:10px;background:#72c984;color:#143b20;font:inherit;font-weight:800;cursor:pointer}.roll-button:disabled{opacity:.5;cursor:not-allowed}.computer-turn{margin:0;padding:8px 12px;border-radius:10px;background:#e9edf9;color:#36477b;font-weight:800}.ai-status{max-width:100%;margin:0;padding:8px 12px;border:1px solid #aab9dc;border-radius:10px;background:#edf2ff;color:#283c77;font-size:clamp(.68rem,.95vw,.9rem);font-weight:800}
.overlay{position:fixed;inset:0;z-index:10;display:grid;place-items:center;padding:18px;background:#142117bb}.modal{width:min(480px,100%);padding:26px;border-radius:18px;background:#fff;color:#233;text-align:center;box-shadow:0 16px 60px #0005}.modal-turn{margin-top:0;color:#46704e;font-weight:800}.answers,.modal form{display:grid;gap:9px}.modal input{border-color:#d3d9d0;background:#fff}.modal form button{background:#71c784}.thinking-dots{display:flex;justify-content:center;gap:7px;margin:18px 0}.thinking-dots i{width:11px;height:11px;border-radius:50%;background:#547dbe;animation:think 1s infinite ease-in-out}.thinking-dots i:nth-child(2){animation-delay:.15s}.thinking-dots i:nth-child(3){animation-delay:.3s}@keyframes think{0%,60%,100%{opacity:.35;transform:translateY(0)}30%{opacity:1;transform:translateY(-7px)}}
@media(max-width:650px){.page{padding:14px}.scores{flex-wrap:wrap}.scores>div{min-width:38%}.board{--tile-size:76px}.center-panel{gap:7px}.map-picker button{padding:4px 6px}}
</style>