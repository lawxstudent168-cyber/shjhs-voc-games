<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const db = useSupabaseClient(), route = useRoute(), student = useCookie('currentStudent');
const words = ref([]), boardWords = ref([]), owned = ref({});
const players = ref([{name:'你',cash:1500,pos:0},{name:'電腦',cash:1500,pos:0}]);
const turn = ref(0), round = ref(1), die = ref('—'), dice = ref([1,1]), rolling = ref(false);
const done = ref(false), question = ref(null), answer = ref('');
const message = ref('載入題庫…'), aiStatus = ref(''), aiBusy = ref(false), playerBusy = ref(false);
const selectedMap = ref('taiwan');
const mistakes = ref(0), rightWords = ref([]), wrongWords = ref([]), startedAt = Date.now();
let aiTimer = null;

const me = computed(() => players.value[turn.value]);
const owner = id => owned.value[id] ?? -1;
const price = id => 100 + Math.max(0, Math.floor(boardWords.value.findIndex(w => w.id === id) / 4)) * 25;
const shuffle = arr => {
 const result = [...arr];
 for (let i = result.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [result[i], result[j]] = [result[j], result[i]];
 }
 return result;
};
const pause = ms => new Promise(resolve => window.setTimeout(resolve, ms));
const dieSymbols = ['⚀','⚁','⚂','⚃','⚄','⚅'];
const maps = [
 {id:'taiwan',name:'台灣',flag:'🇹🇼',color:'#c43c43',fill:'#e8a2a4',outline:[[79,13],[86,19],[88,27],[84,34],[87,40],[83,47],[84,55],[80,63],[77,72],[73,79],[68,88],[63,82],[62,74],[65,66],[61,59],[64,51],[61,44],[65,36],[64,28],[69,20],[75,15]]},
 {id:'uk',name:'英國',flag:'🇬🇧',color:'#345b9d',fill:'#9eb6df',outline:[[81,12],[76,18],[79,24],[73,30],[77,36],[70,42],[75,48],[67,54],[73,60],[69,66],[76,72],[74,78],[80,85],[85,81],[84,75],[90,69],[86,63],[92,56],[86,49],[91,42],[86,35],[89,28],[84,22],[87,16]],islands:[[[47,33],[44,37],[46,42],[43,46],[46,51],[44,56],[48,60],[51,56],[50,51],[53,47],[50,42],[52,37]]]},
 {id:'us',name:'美國',flag:'🇺🇸',color:'#416ba2',fill:'#a6bedb',outline:[[23,31],[31,26],[42,28],[50,23],[61,27],[69,22],[79,27],[87,24],[96,29],[106,25],[115,30],[124,29],[132,35],[141,36],[145,44],[139,49],[132,51],[129,58],[132,65],[126,71],[123,78],[115,80],[110,85],[103,82],[96,86],[87,81],[78,84],[70,78],[61,81],[53,75],[44,77],[37,71],[30,68],[28,60],[23,56],[27,49],[21,43]]},
 {id:'australia',name:'澳洲',flag:'🇦🇺',color:'#318068',fill:'#9bcbb8',outline:[[46,27],[53,21],[62,23],[70,17],[79,21],[88,19],[96,24],[106,23],[114,29],[123,32],[130,39],[134,47],[130,54],[124,59],[118,65],[108,69],[100,76],[91,73],[83,78],[75,71],[66,74],[59,68],[51,64],[47,56],[41,52],[43,43],[39,36]]},
 {id:'canada',name:'加拿大',flag:'🇨🇦',color:'#c9424b',fill:'#e4a3a7',outline:[[23,27],[32,21],[42,24],[51,17],[61,22],[70,17],[80,21],[90,16],[100,22],[109,19],[118,24],[128,22],[138,29],[145,35],[139,41],[132,42],[128,49],[120,48],[115,56],[107,57],[103,65],[95,63],[88,69],[79,65],[70,70],[61,65],[52,71],[44,66],[37,68],[32,60],[25,59],[20,51],[16,44],[22,37]]}
];
const activeMap = computed(() => maps.find(m => m.id === selectedMap.value) || maps[0]);
const mapPoints = points => points.map(point => point.join(',')).join(' ');
const boardTiles = computed(() => {
 const polygon = activeMap.value.outline, count = boardWords.value.length;
 if (!count) return [];
 const center = polygon.reduce((sum, point) => [sum[0] + point[0] / polygon.length, sum[1] + point[1] / polygon.length], [0,0]);
 const segments = polygon.map((point, i) => {
  const next = polygon[(i + 1) % polygon.length];
  return {a:point,b:next,length:Math.hypot(next[0]-point[0],next[1]-point[1])};
 });
 const perimeter = segments.reduce((sum, segment) => sum + segment.length, 0);
 return boardWords.value.map((word, i) => {
  let distance = ((i + .5) / count) * perimeter, segment = segments[0];
  for (const item of segments) {
   if (distance <= item.length) { segment = item; break; }
   distance -= item.length;
  }
  const ratio = segment.length ? distance / segment.length : 0;
  const x = center[0] + (segment.a[0] + (segment.b[0]-segment.a[0])*ratio-center[0])*1.18;
  const y = center[1] + (segment.a[1] + (segment.b[1]-segment.a[1])*ratio-center[1])*1.18;
  return {word,index:i,left:Math.max(4,Math.min(96,x/160*100)),top:Math.max(6,Math.min(94,y)),key:word.id};
 });
});
function tileStyle(tile) { return {left:tile.left+'%',top:tile.top+'%'}; }
function ask(word) {
 const letters = [...word.en_us].map((letter,index) => /[a-z]/i.test(letter) ? index : -1).filter(index => index >= 0);
 const type = Math.random() < .5 || letters.length < 2 ? 'choice' : 'letters';
 const choices = shuffle([word,...shuffle(words.value.filter(item => item.id !== word.id)).slice(0,3)]);
 const masked = [...word.en_us], missing = [];
 if (type === 'letters') {
  const indexes = shuffle(letters).slice(0,2).sort((a,b) => a-b);
  for (const index of indexes) { missing.push(masked[index].toLowerCase()); masked[index] = '＿'; }
 }
 question.value = {word,type,choices,masked:masked.join(''),missing};
 answer.value = '';
}
async function endTurn() {
 question.value = null;
 turn.value = 1 - turn.value;
 if (turn.value === 0) round.value++;
 if (round.value > 20 || players.value.some(player => player.cash <= 0)) {
  done.value = true; aiStatus.value = '';
  if (student.value?.id) await db.from('game_records').insert([{student_id:student.value.id,game_type:'單字大富翁',version:route.query.version||null,volume:route.query.volume||null,unit_played:route.query.unit||null,score:players.value[0].cash,time_taken_seconds:Math.floor((Date.now()-startedAt)/1000),mistakes:mistakes.value,wrong_words:[...new Set(wrongWords.value)].join(', '),correct_words:[...new Set(rightWords.value)].join(', ')}]);
 }
}
async function respond(correct, automated = false) {
 if (!question.value) return;
 const word = question.value.word, player = me.value;
 if (turn.value === 0) {
  if (correct) rightWords.value.push(word.en_us);
  else { mistakes.value++; wrongWords.value.push(word.en_us); }
 }
 if (correct && player.cash >= price(word.id)) {
  owned.value[word.id] = turn.value; player.cash -= price(word.id);
  message.value = player.name+' 答對並買下「'+word.zh_tw+'」！';
 } else if (correct) message.value = player.name+' 答對了，但現金不足，無法買地。';
 else message.value = player.name+' 答錯了，答案是 '+word.en_us+'＝'+word.zh_tw+'。';
 question.value = null;
 if (automated) { aiStatus.value = message.value+' 稍後換你。'; await pause(1500); }
 await endTurn();
}
function submit() {
 if (!question.value || turn.value !== 0) return;
 const q = question.value;
 const correct = q.type === 'choice'
  ? answer.value === q.word.id
  : answer.value.trim().toLowerCase() === q.missing.join('');
 respond(correct);
}
async function animateDice() {
 rolling.value = true;
 for (let i = 0; i < 10; i++) {
  dice.value = [1+Math.floor(Math.random()*6),1+Math.floor(Math.random()*6)];
  await pause(75);
 }
 const total = dice.value[0] + dice.value[1];
 die.value = String(total);
 rolling.value = false;
 return total;
}
async function play(index) {
 if (turn.value !== index || question.value || done.value || aiBusy.value || playerBusy.value || !boardWords.value.length) return;
 const computer = index === 1, player = players.value[index];
 if (computer) { aiBusy.value = true; aiStatus.value = '🤖 電腦正在擲骰…'; }
 else playerBusy.value = true;
 try {
  const roll = await animateDice();
  if (computer) { aiStatus.value = '🤖 電腦擲出 '+roll+' 點，準備前進…'; await pause(650); }
  for (let step = 0; step < roll; step++) {
   await pause(computer ? 360 : 90);
   player.pos = (player.pos + 1) % boardWords.value.length;
   if (player.pos === 0 && boardWords.value.length > 1) { player.cash += 200; message.value = player.name+' 經過起點，領取 $200。'; }
   if (computer) aiStatus.value = '🤖 電腦前進中：第 '+(player.pos+1)+' 格「'+boardWords.value[player.pos].zh_tw+'」…';
  }
  const word = boardWords.value[player.pos], propertyOwner = owner(word.id);
  if (propertyOwner >= 0) {
   if (propertyOwner !== index) { player.cash -= 30; players.value[propertyOwner].cash += 30; message.value = player.name+' 踩到對手土地，支付 $30 租金。'; }
   else message.value = player.name+' 回到自己的土地：「'+word.zh_tw+'」。';
   if (computer) { aiStatus.value = '🤖 電腦停在「'+word.zh_tw+'」：'+message.value+' 即將換你。'; await pause(1500); }
   await endTurn(); return;
  }
  ask(word);
  if (computer) {
   aiStatus.value = '🤖 電腦停在「'+word.zh_tw+'」，正在思考'+(question.value.type === 'choice' ? '英文選擇' : '兩個字母')+'…';
   await pause(2300);
   await respond(Math.random() < .7, true);
  }
 } finally {
  aiBusy.value = false; playerBusy.value = false;
 }
}
watch(turn, next => {
 if (aiTimer) window.clearTimeout(aiTimer);
 if (next === 1 && !done.value) { aiStatus.value = '🤖 輪到電腦，稍候擲骰…'; aiTimer = window.setTimeout(() => play(1), 1500); }
 else if (next === 0) aiStatus.value = '';
});
watch(selectedMap, value => { if (typeof window !== 'undefined') localStorage.setItem('shjhs_monopoly_map',value); });
onMounted(async () => {
 selectedMap.value = localStorage.getItem('shjhs_monopoly_map') || 'taiwan';
 let query = db.from('vocabularies').select('id,en_us,zh_tw');
 for (const key of ['version','volume','unit']) if (route.query[key]) query = query.eq(key,route.query[key]);
 const {data,error} = await query.limit(500);
 words.value = (data || []).filter(word => word.en_us && word.zh_tw);
 boardWords.value = shuffle(words.value).slice(0,16);
 message.value = error ? '題庫載入失敗：'+error.message : boardWords.value.length ? '本局從所選單元抽出 '+boardWords.value.length+' 個單字；答對可買地，經過起點領 $200。' : '找不到單字，請返回選擇有單字的單元。';
});
onBeforeUnmount(() => { if (aiTimer) window.clearTimeout(aiTimer); });
</script>

<template>
<main class="page">
 <header class="page-header">
  <NuxtLink class="back-link" to="/">← 返回遊戲選單</NuxtLink>
  <div><h1>🏘️ 單字大富翁</h1><p>答對買地，踩到對手土地支付租金。</p></div>
 </header>
 <section class="scores">
  <div v-for="(player,i) in players" :key="i" :class="{active:turn===i}">
   <b>{{player.name}}</b><strong>$ {{player.cash}}</strong><span>位置 {{player.pos+1}} · 土地 {{Object.values(owned).filter(v=>v===i).length}}</span>
  </div>
  <div class="round-card">第 {{round}} / 20 回合</div>
 </section>
 <p class="message" role="status" aria-live="polite">{{message}}</p>
 <section v-if="boardWords.length" class="board-area">
  <div class="board-stage" aria-label="依國家輪廓排列的單字棋盤">
   <svg class="country-shape" viewBox="0 0 160 100" preserveAspectRatio="none" aria-hidden="true">
    <polygon :points="mapPoints(activeMap.outline)" :fill="activeMap.fill" :stroke="activeMap.color"/>
    <polygon v-for="(island,i) in activeMap.islands||[]" :key="i" :points="mapPoints(island)" :fill="activeMap.fill" :stroke="activeMap.color"/>
   </svg>
   <article v-for="tile in boardTiles" :key="tile.key" class="plot" :class="{you:owner(tile.word.id)===0,cpu:owner(tile.word.id)===1}" :style="tileStyle(tile)">
    <span v-if="tile.index===0" class="start-tag">起點</span>
    <b>{{tile.word.zh_tw}}</b><small>地價 {{ '$' + price(tile.word.id) }}</small>
    <small>{{owner(tile.word.id)<0?'待購':players[owner(tile.word.id)].name}}</small>
    <span v-if="players[0].pos===tile.index||players[1].pos===tile.index" class="tokens"><i v-if="players[0].pos===tile.index">🧑‍🎓</i><i v-if="players[1].pos===tile.index">🤖</i></span>
   </article>
   <section class="center-controls">
    <div class="map-picker" role="group" aria-label="選擇棋盤地圖">
     <button v-for="map in maps" :key="map.id" type="button" :class="{selected:selectedMap===map.id}" :style="{'--map-accent':map.color}" :aria-pressed="selectedMap===map.id" @click="selectedMap=map.id">{{map.flag}} {{map.name}}</button>
    </div>
    <div class="dice-area">
     <span class="dice-label">骰子點數合計</span>
     <div class="dice-display" :class="{rolling}" aria-live="polite"><span>{{dieSymbols[dice[0]-1]}}</span><span>{{dieSymbols[dice[1]-1]}}</span><b>{{die}}</b></div>
     <button v-if="turn===0" class="roll-button" type="button" :disabled="!!question||done||playerBusy||aiBusy" @click="play(0)">🎲 擲骰前進</button>
     <p v-else class="computer-turn">🤖 電腦回合進行中</p>
    </div>
    <p v-if="aiStatus" class="ai-status" role="status" aria-live="polite">{{aiStatus}}</p>
    <p v-else class="center-hint">答對即可購買這格單字土地</p>
   </section>
  </div>
 </section>
 <div v-if="question" class="overlay"><section class="modal">
  <template v-if="turn===1">
   <p class="modal-turn">🤖 電腦回合 · 正在思考答案</p><h2>「{{question.word.zh_tw}}」</h2>
   <p>{{question.type==='choice'?'電腦正在選擇英文單字':'電腦正在補出兩個字母'}}</p>
   <div class="thinking-dots" aria-label="電腦思考中"><i></i><i></i><i></i></div><p>請稍候看電腦的作答結果。</p>
  </template>
  <template v-else>
   <p class="modal-turn">你踩到一塊無主土地</p>
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
.page{height:100vh;height:100dvh;display:grid;grid-template-rows:auto auto auto minmax(0,1fr);gap:6px;overflow:hidden;padding:10px 18px;box-sizing:border-box;color:var(--text-main,#222);background:var(--bg-color,#f4f0e6)}
.page-header,.scores,.message,.board-area{width:min(100%,1180px);margin:0 auto}
.page-header{display:flex;align-items:center;gap:18px;min-height:48px}.page-header h1{margin:0;font-size:1.35rem}.page-header p{margin:2px 0 0;font-size:.84rem;opacity:.8}.back-link{white-space:nowrap}
.scores{display:flex;gap:8px}.scores>div{flex:1;display:grid;grid-template-columns:1fr auto;align-items:center;gap:2px 10px;min-height:48px;padding:6px 12px;border:2px solid #bdc9b9;border-radius:10px;background:#fff}.scores .active{border-color:#278443;box-shadow:0 0 0 2px #27844322}.scores strong{grid-column:2;grid-row:1/3;color:#168342;font-size:1.15rem}.scores span{font-size:.76rem}.scores .round-card{display:flex;justify-content:center;font-weight:800;color:#334b3b}
.message{min-height:32px;display:flex;align-items:center;padding:5px 12px;border-radius:9px;background:#fff;font-size:.88rem}
.board-area{min-height:0;height:100%;display:grid;place-items:center;overflow:hidden}
.board-stage{position:relative;width:min(100%,calc(160dvh - 320px));max-height:100%;aspect-ratio:16/10;overflow:visible;border-radius:22px;background:radial-gradient(ellipse at center,#f8fff4,#e2efd9 68%,#d0e3c7);box-shadow:0 12px 30px #244a3028}
.country-shape{position:absolute;inset:0;width:100%;height:100%;overflow:visible;filter:drop-shadow(0 4px 8px #243d3533)}.country-shape polygon{stroke-width:1.25;stroke-linejoin:round;fill-opacity:.48;stroke-opacity:.95}
.plot{z-index:1;position:absolute;display:flex;width:clamp(68px,7.8vw,94px);height:clamp(48px,6.6vh,62px);transform:translate(-50%,-50%);flex-direction:column;justify-content:center;align-items:center;gap:2px;overflow:hidden;padding:4px 5px;border:2px solid #d2d7ca;border-radius:9px;background:#fff;color:#253329;text-align:center;box-sizing:border-box;box-shadow:0 3px 7px #0002}
.plot.you{border-color:#1684d8;background:#e1f1ff}.plot.cpu{border-color:#dc4b3d;background:#ffe7e3}.plot b{display:-webkit-box;max-width:100%;overflow:hidden;font-size:clamp(.68rem,.88vw,.84rem);line-height:1.15;-webkit-line-clamp:2;-webkit-box-orient:vertical}.plot small{font-size:clamp(.52rem,.65vw,.64rem);line-height:1.1}.start-tag{position:absolute;top:1px;left:2px;padding:1px 4px;border-radius:4px;background:#39784c;color:#fff;font-size:.53rem;font-weight:800}.tokens{display:flex;position:absolute;right:3px;top:1px;gap:1px}.tokens i{font-style:normal;font-size:.76rem}
.center-controls{z-index:2;position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);display:flex;width:min(38%,370px);min-height:42%;flex-direction:column;justify-content:center;align-items:center;gap:clamp(5px,1vh,12px);padding:clamp(8px,1.1vw,15px);border:1px solid #a9c49f;border-radius:18px;background:#ffffffd9;text-align:center;box-sizing:border-box;box-shadow:0 8px 24px #355a3820;backdrop-filter:blur(3px)}
.map-picker{display:flex;width:100%;flex-wrap:wrap;justify-content:center;gap:4px}.map-picker button{padding:4px 7px;border:1px solid #bdc9b9;border-radius:18px;background:#fff;color:#344438;font-size:clamp(.62rem,.78vw,.75rem);font-weight:700;cursor:pointer}.map-picker button.selected{border:2px solid var(--map-accent);background:#f4f7f4}
.dice-area{display:grid;justify-items:center;gap:4px}.dice-label,.center-hint{margin:0;color:#506254;font-size:clamp(.65rem,.82vw,.8rem)}.dice-display{display:flex;align-items:center;justify-content:center;gap:4px;color:#27372b}.dice-display span{font-size:clamp(1.5rem,2.5vw,2.15rem);line-height:1}.dice-display b{min-width:1.2em;color:#a86e13;font-size:1.2rem}.dice-display.rolling{animation:dice-roll .16s linear infinite alternate}@keyframes dice-roll{from{transform:translateY(-4px) rotate(-9deg)}to{transform:translateY(3px) rotate(9deg)}}
.roll-button,.modal button,.modal input{padding:8px 13px;border:2px solid #347144;border-radius:9px;background:#72c984;color:#143b20;font:inherit;font-weight:800;cursor:pointer}.roll-button:disabled{opacity:.5;cursor:not-allowed}.computer-turn{margin:0;padding:6px 10px;border-radius:9px;background:#e9edf9;color:#36477b;font-size:.86rem;font-weight:800}.ai-status{max-width:100%;margin:0;padding:6px 9px;border:1px solid #aab9dc;border-radius:9px;background:#edf2ff;color:#283c77;font-size:clamp(.64rem,.8vw,.78rem);font-weight:800}.overlay{position:fixed;inset:0;z-index:10;display:grid;place-items:center;padding:18px;background:#142117bb}.modal{width:min(450px,100%);padding:24px;border-radius:18px;background:#fff;color:#233;text-align:center;box-shadow:0 16px 60px #0005}.modal-turn{margin-top:0;color:#46704e;font-weight:800}.answers,.modal form{display:grid;gap:9px}.modal input{width:100%;border-color:#d3d9d0;background:#fff;box-sizing:border-box;text-align:center;letter-spacing:.25em}.modal form button{background:#71c784}.masked-word{margin:10px 0;color:#243c2a;font-family:monospace;font-size:1.8rem;font-weight:900;letter-spacing:.24em}.thinking-dots{display:flex;justify-content:center;gap:7px;margin:16px 0}.thinking-dots i{width:11px;height:11px;border-radius:50%;background:#547dbe;animation:think 1s infinite ease-in-out}.thinking-dots i:nth-child(2){animation-delay:.15s}.thinking-dots i:nth-child(3){animation-delay:.3s}@keyframes think{0%,60%,100%{opacity:.35;transform:translateY(0)}30%{opacity:1;transform:translateY(-7px)}}
@media(max-width:700px){.page{height:auto;min-height:100dvh;overflow:visible;padding:12px}.page-header{gap:10px;flex-wrap:wrap}.page-header h1{font-size:1.2rem}.scores{flex-wrap:wrap}.scores>div{min-width:38%}.board-area{height:65vh;min-height:480px;overflow:auto}.board-stage{width:min(96vw,calc(160dvh - 320px));min-width:620px;max-height:none}.plot{width:76px;height:54px}.center-controls{width:38%;min-height:44%;gap:6px}.map-picker button{padding:3px 5px}}
</style>