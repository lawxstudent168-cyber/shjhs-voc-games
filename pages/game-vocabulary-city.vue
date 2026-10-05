<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { CITY_HEIGHT, CITY_TOOLS, CITY_WIDTH, advanceCityMonth, cityMetrics, createCity, placeCityTile } from '~/lib/vocabulary-city';

const GAME_TYPE = '單字城市建造家';
const db = useSupabaseClient();
const route = useRoute();
const student = useCookie('currentStudent');
const lesson = {
  version: typeof route.query.version === 'string' ? route.query.version : '',
  volume: typeof route.query.volume === 'string' ? route.query.volume : '',
  unit: typeof route.query.unit === 'string' ? route.query.unit : ''
};
const city = ref(createCity());
const words = ref([]);
const loading = ref(true);
const selectedTool = ref('residential');
const selectedTile = ref(null);
const quiz = ref(null);
const notice = ref('正在載入本課單字與城市…');
const saveNotice = ref('');
const activeSeconds = ref(0);
const lastQuestionAt = ref(0);
const screen = ref('build');
const pending = ref(null);
const metrics = computed(() => cityMetrics(city.value));
const score = computed(() => city.value.correct.length * 10 + Math.min(300, Math.floor(city.value.population / 2)) + Math.min(100, Math.floor(city.value.happiness)));
const historyLink = computed(() => ({ path: '/history', query: { game: GAME_TYPE } }));
const leaderboardLink = computed(() => ({ path: '/leaderboard', query: { game: GAME_TYPE, ...lesson } }));
const groupedTools = computed(() => ['分區', '交通', '設施', '管理'].map(group => ({ group, tools: CITY_TOOLS.filter(tool => tool.group === group) })));
const selected = computed(() => selectedTile.value === null ? null : city.value.tiles[selectedTile.value]);
const tiles = computed(() => city.value.tiles.map((tile, id) => ({ ...tile, id, cx: 500 + (tile.x - tile.y) * 22, cy: 116 + (tile.x + tile.y) * 11 })));
const iconByKind = Object.fromEntries(CITY_TOOLS.map(tool => [tool.id, tool.icon]));
const nameByKind = Object.fromEntries(CITY_TOOLS.map(tool => [tool.id, tool.name]));
const colorByKind = { road: '#617586', residential: '#64a99e', commercial: '#ceaa68', industrial: '#987f9d', power: '#db8762', water: '#6bafc0', park: '#5fa86d', school: '#8ca6d5', hospital: '#db999b', fire: '#d97668', police: '#8e9cca' };
let timer = null;
let disposed = false;
let lastTick = 0;
let elapsedMs = 0;
let lastAdvancedAt = 0;
let savingRecord = false;
const storageKey = computed(() => `shjhs-vocabulary-city:v1:${student.value?.id || 'anon'}:${lesson.version}:${lesson.volume}:${lesson.unit}`);

function persist() {
  if (typeof localStorage === 'undefined' || !student.value?.id) return;
  try { localStorage.setItem(storageKey.value, JSON.stringify(city.value)); }
  catch { saveNotice.value = '瀏覽器儲存空間不足；請先匯出或清理空間。'; }
}
function chooseTile(id) {
  selectedTile.value = id;
  if (quiz.value || loading.value || words.value.length < 4) return;
  const tile = city.value.tiles[id];
  if (!tile) return;
  const tool = CITY_TOOLS.find(item => item.id === selectedTool.value);
  if (!tool) return;
  if (tile.terrain === 'water') { notice.value = '這裡是水域，不能建設。'; return; }
  if (tool.id === 'bulldoze' ? !tile.kind : !!tile.kind) {
    notice.value = tool.id === 'bulldoze' ? '這塊地沒有建設可拆除。' : '這塊地已有建設；先選拆除工具。'; return;
  }
  if (city.value.money < tool.cost) { notice.value = `資金不足，${tool.name}需要 $${tool.cost}。`; return; }
  const action = { id, kind: tool.id };
  if (tool.important || activeSeconds.value - lastQuestionAt.value >= 35) openQuiz(action);
  else applyAction(action);
}
function applyAction(action) {
  const result = placeCityTile(city.value, action.id, action.kind);
  notice.value = result.error || result.message;
  if (!result.error) persist();
}
function openQuiz(action) {
  const word = words.value[Math.floor(Math.random() * words.value.length)];
  const distractors = [...words.value.filter(item => item.en_us.toLowerCase() !== word.en_us.toLowerCase())]
    .sort(() => Math.random() - .5).slice(0, 3);
  quiz.value = { word, choices: [word, ...distractors].sort(() => Math.random() - .5) };
  pending.value = action;
  lastQuestionAt.value = activeSeconds.value;
}
function answer(choice) {
  if (!quiz.value) return;
  const word = quiz.value.word;
  const correct = choice.trim().toLowerCase() === word.en_us.trim().toLowerCase();
  if (correct) city.value.correct.push(word.en_us);
  else city.value.wrong.push(word.en_us);
  quiz.value = null;
  if (correct) {
    if (pending.value?.kind === 'relief') {
      city.value.money += 700; city.value.totalEarned += 700; city.value.reliefUsed = true;
      notice.value = `答對 ${word.en_us}！市政紓困金 $700 已入帳；每座城市限一次。`;
    } else if (pending.value) applyAction(pending.value);
    else { city.value.money += 80; city.value.totalEarned += 80; notice.value = `答對 ${word.en_us}！市政獎勵 $80。`; }
  } else notice.value = `答錯了。${word.zh_tw} 是 ${word.en_us}；這次建設未執行。`;
  pending.value = null;
  persist();
}
function cancelQuiz() { quiz.value = null; pending.value = null; notice.value = '已取消本次建設。'; }
function requestRelief() {
  if (city.value.money >= 200 || city.value.reliefUsed || quiz.value || words.value.length < 4) return;
  openQuiz({ kind: 'relief' });
}
function setTax(value) {
  city.value.taxRate = Number(value);
  notice.value = `稅率設為 ${city.value.taxRate}%，下個月生效。`;
  persist();
}
function newCity() {
  if (!confirm('建立新城市會覆蓋目前城市存檔。確定繼續？')) return;
  const name = prompt('為新城市命名', '晨光市');
  if (name === null) return;
  city.value = createCity(name.trim().slice(0, 20) || '晨光市');
  city.value.recordId = crypto.randomUUID();
  city.value.startedAt = Date.now();
  city.value.attemptNumber = 0;
  activeSeconds.value = 0; lastQuestionAt.value = 0;
  selectedTile.value = null; quiz.value = null; pending.value = null;
  notice.value = `歡迎來到 ${city.value.name}，先在道路旁規劃住宅和工作機會。`;
  saveNotice.value = '';
  persist();
}
async function saveRecord() {
  if (!student.value?.id || savingRecord) return;
  savingRecord = true;
  try {
    if (!city.value.recordId) city.value.recordId = crypto.randomUUID();
    if (!city.value.startedAt) city.value.startedAt = Date.now();
    if (!city.value.attemptNumber) {
      const { count, error } = await db.from('game_records').select('id', { count: 'exact', head: true })
        .eq('student_id', String(student.value.id)).eq('game_type', GAME_TYPE)
        .eq('version', lesson.version).eq('volume', lesson.volume).eq('unit_played', lesson.unit);
      if (error) throw error;
      city.value.attemptNumber = (count || 0) + 1;
    }
    const { error } = await db.from('game_records').upsert({
      id: city.value.recordId, student_id: String(student.value.id), game_type: GAME_TYPE,
      version: lesson.version, volume: lesson.volume, unit_played: lesson.unit,
      score: score.value, mistakes: city.value.wrong.length,
      correct_words: city.value.correct.join(', '), wrong_words: city.value.wrong.join(', '),
      attempt_number: city.value.attemptNumber, played_at: new Date(city.value.startedAt).toISOString(),
      time_taken_seconds: activeSeconds.value, device_info: navigator.userAgent
    }, { onConflict: 'id' });
    if (error) throw error;
    saveNotice.value = '成績和對錯單字已更新至學生紀錄。';
    persist();
  } catch (error) { saveNotice.value = `成績儲存失敗：${error.message}`; }
  finally { savingRecord = false; }
}

onMounted(async () => {
  if (!student.value?.id) { await navigateTo('/'); return; }
  if (!lesson.version || !lesson.volume || !lesson.unit) { loading.value = false; notice.value = '請先從首頁選擇課本、冊次和單元。'; return; }
  const { data, error } = await db.from('vocabularies').select('en_us,zh_tw')
    .eq('version', lesson.version).eq('volume', lesson.volume).eq('unit', lesson.unit).limit(1000);
  if (disposed) return;
  loading.value = false;
  if (error) { notice.value = `單字載入失敗：${error.message}`; return; }
  const seen = new Set();
  words.value = (data || []).filter(word => {
    const key = word.en_us?.trim().toLowerCase();
    if (!key || !word.zh_tw?.trim() || seen.has(key)) return false;
    seen.add(key); return true;
  });
  if (words.value.length < 4) { notice.value = '本課至少需要四筆不同單字。請回首頁選擇其他單元。'; return; }
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey.value) || 'null');
    if (saved?.version === 1 && saved.tiles?.length === CITY_WIDTH * CITY_HEIGHT && typeof saved.money === 'number') city.value = saved;
  } catch { /* Invalid or unavailable local save: use a new city. */ }
  city.value.recordId ||= crypto.randomUUID();
  city.value.startedAt ||= Date.now();
  city.value.correct ||= []; city.value.wrong ||= [];
  city.value.events ||= [];
  notice.value = `歡迎來到 ${city.value.name}！點選工具，再點地圖建設。`;
  lastTick = Date.now();
  timer = window.setInterval(() => {
    if (document.hidden || city.value.paused || quiz.value) { lastTick = Date.now(); return; }
    const now = Date.now();
    elapsedMs += Math.min(2000, Math.max(0, now - lastTick));
    lastTick = now;
    if (elapsedMs < 1000) return;
    activeSeconds.value += Math.floor(elapsedMs / 1000);
    elapsedMs %= 1000;
    if (activeSeconds.value - lastAdvancedAt >= 45) {
      lastAdvancedAt = activeSeconds.value;
      const report = advanceCityMonth(city.value);
      notice.value = `新月份：收入 $${report.income}，支出 $${report.expense}，人口 ${report.population}。`;
      persist();
      if (city.value.month % 3 === 0) saveRecord();
    }
  }, 1000);
});
onBeforeUnmount(() => { disposed = true; if (timer) clearInterval(timer); persist(); });
watch(() => city.value.paused, persist);
</script>

<template>
  <main class="city-page">
    <header class="city-header">
      <div><span class="eyebrow">VOCABULARY · CITY BUILDER</span><h1>單字城市建造家</h1><p>規劃街區、照顧市民，靠英文單字推動城市發展</p></div>
      <nav><NuxtLink to="/">← 首頁</NuxtLink><NuxtLink :to="historyLink">學習紀錄</NuxtLink><NuxtLink :to="leaderboardLink">英雄榜</NuxtLink></nav>
    </header>
    <div class="city-shell">
      <section class="city-main">
        <div class="city-bar"><div><span class="city-seal">◆</span><strong>{{ city.name }}</strong><small>第 {{ city.year }} 年 {{ city.month }} 月</small></div><div class="city-bar-actions"><button v-if="!loading&&words.length>=4&&activeSeconds-lastQuestionAt>=35&&!quiz" @click="openQuiz(null)">📚 市政單字</button><button @click="city.paused=!city.paused">{{city.paused?'▶ 繼續':'Ⅱ 暫停'}}</button><button @click="saveRecord" :disabled="loading||savingRecord">儲存成績</button><button @click="newCity">新城市</button></div></div>
        <div class="city-map-wrap"><svg class="city-map" viewBox="0 0 1000 600" role="img" aria-label="城市地圖，點選地塊建設">
          <defs><linearGradient id="city-bg" x2="0" y2="1"><stop stop-color="#172e49"/><stop offset="1" stop-color="#244c61"/></linearGradient><filter id="tile-shadow"><feDropShadow dx="0" dy="3" stdDeviation="2" flood-color="#071a29" flood-opacity=".45"/></filter></defs>
          <rect width="1000" height="600" fill="url(#city-bg)"/><path d="M0 470 Q130 410 290 480 T610 470 T1000 480 V600 H0Z" fill="#254c56" opacity=".55"/>
          <g v-for="tile in tiles" :key="tile.id" class="map-tile" :class="{picked:selectedTile===tile.id}" @click="chooseTile(tile.id)">
            <title>{{tile.x+1}} 列 {{tile.y+1}} 行：{{tile.kind?nameByKind[tile.kind]:tile.terrain==='water'?'水域':tile.terrain==='forest'?'林地':'空地'}}{{tile.level?`，等級 ${tile.level}`:''}}</title>
            <path :d="`M${tile.cx} ${tile.cy-11} l22 11 -22 11 -22 -11 Z`" :fill="tile.kind?colorByKind[tile.kind]:tile.terrain==='water'?'#3d829b':tile.terrain==='forest'?'#4b8a72':'#8baf80'" :stroke="selectedTile===tile.id?'#ffdd8c':'#193d50'" :stroke-width="selectedTile===tile.id?3:1.2" filter="url(#tile-shadow)"/>
            <text v-if="tile.kind" :x="tile.cx" :y="tile.cy+5" class="tile-icon" :class="{high:tile.level>1}">{{iconByKind[tile.kind]}}</text>
            <text v-else-if="tile.terrain==='forest'" :x="tile.cx" :y="tile.cy+4" class="tile-scenery">♠</text>
            <text v-else-if="tile.terrain==='water'&&tile.id%3===0" :x="tile.cx" :y="tile.cy+3" class="tile-water">﹏</text>
            <text v-if="tile.level>1" :x="tile.cx+11" :y="tile.cy-5" class="level-tag">{{tile.level}}</text>
          </g>
          <text x="34" y="45" class="map-caption">{{lesson.version}} · {{lesson.volume}} · {{lesson.unit}}</text>
          <text x="34" y="565" class="map-tip">點選工具與地塊建設 · 地圖縮放由螢幕寬度自動調整</text>
        </svg></div>
        <div class="city-notice" role="status">{{notice}}</div>
        <div class="city-metrics"><span>💰 預算 <b :class="{negative:city.money<0}">${{city.money}}</b></span><span>👥 人口 <b>{{city.population}}</b></span><span>☺ 滿意度 <b>{{metrics.happiness}}%</b></span><span>📚 單字 <b>{{city.correct.length}} 對／{{city.wrong.length}} 錯</b></span><span>🏆 分數 <b>{{score}}</b></span></div>
      </section>
      <aside class="city-sidebar">
        <div class="side-tabs"><button v-for="tab in [{id:'build',label:'建設'},{id:'report',label:'市政'},{id:'guide',label:'說明'}]" :key="tab.id" :class="{active:screen===tab.id}" @click="screen=tab.id">{{tab.label}}</button></div>
        <div v-if="screen==='build'" class="side-body"><p class="side-intro">選工具後點地圖。一般操作約每 35 秒答一道單字題；大型建設每次答題。</p><div v-for="group in groupedTools" :key="group.group" class="tool-group"><h2>{{group.group}}</h2><div class="tool-grid"><button v-for="tool in group.tools" :key="tool.id" :class="{active:selectedTool===tool.id}" @click="selectedTool=tool.id"><span>{{tool.icon}}</span><strong>{{tool.name}}</strong><small>${{tool.cost}}</small></button></div></div><div class="selection"><h2>選中地塊</h2><p v-if="selected">{{selected.x+1}} 列 {{selected.y+1}} 行 · {{selected.kind?nameByKind[selected.kind]:selected.terrain==='water'?'水域':selected.terrain==='forest'?'林地':'空地'}} <span v-if="selected.level">· 等級 {{selected.level}}</span></p><p v-else>點選地圖查看位置。</p></div></div>
        <div v-else-if="screen==='report'" class="side-body"><h2>市府財務</h2><div class="report-row"><span>本月預估稅收</span><b>${{metrics.monthlyIncome}}</b></div><div class="report-row"><span>設施維護支出</span><b>${{metrics.monthlyExpense}}</b></div><div class="report-row"><span>上月結餘</span><b>{{city.lastReport?`$${city.lastReport.balance}`:'尚無'}}</b></div><label class="tax">稅率 {{city.taxRate}}%<input type="range" min="0" max="20" :value="city.taxRate" @change="setTax($event.target.value)"></label><button v-if="city.money<200&&!city.reliefUsed" class="relief-button" @click="requestRelief">市政紓困 $700 · 答題申請一次</button><h2>城市供需</h2><div class="report-row"><span>道路可達分區</span><b>{{metrics.activeZones}}／{{metrics.zones}}</b></div><div class="report-row"><span>電力容量／需求</span><b :class="{negative:!metrics.powered}">{{metrics.electricity}}／{{metrics.demand}}</b></div><div class="report-row"><span>供水容量／需求</span><b :class="{negative:!metrics.watered}">{{metrics.water}}／{{metrics.demand}}</b></div><div class="report-row"><span>住宅容量／工作機會</span><b>{{metrics.housing}}／{{metrics.jobs}}</b></div><div class="report-row"><span>污染指數</span><b>{{metrics.pollution}}</b></div><h2>市民消息</h2><ul class="city-news"><li v-for="(event,i) in city.events" :key="i">{{event}}</li></ul></div>
        <div v-else class="side-body"><h2>如何經營城市</h2><p>住宅、商業與工業分區沿道路配置；住宅提供人口，另外兩區提供工作。需要足夠電力與水，分區才會逐月發展。</p><p>每 45 秒有效遊玩時間推進一個月；切換分頁或暫停不計時。每月收稅並支付維護費。提高稅率能增加收入，也可能降低滿意度。</p><p>公園、學校、醫院、消防局和警察局改善服務；工業會增加污染。答對單字才能完成重要建設。城市與答題自動保存在此裝置，按「儲存成績」將分數送至學生紀錄。</p><p>這是原創的單字建城遊戲，不使用《模擬城市》的地圖、圖像或程式。</p></div>
        <p v-if="saveNotice" class="city-save">{{saveNotice}}</p>
      </aside>
    </div>
    <div v-if="quiz" class="quiz-backdrop"><section class="quiz-card" role="dialog" aria-modal="true" aria-label="單字題"><span class="eyebrow">CITY WORD CHALLENGE</span><h2>{{quiz.word.zh_tw}}</h2><p>選出正確英文 {{pending?'才能完成這次建設':'即可獲得市政獎勵'}}。</p><div class="quiz-choices"><button v-for="(choice,i) in quiz.choices" :key="i" @click="answer(choice.en_us)">{{choice.en_us}}</button></div><button class="quiz-cancel" @click="cancelQuiz">取消</button></section></div>
  </main>
</template>

<style scoped>
.city-page{min-height:100vh;background:radial-gradient(circle at 50% -20%,#304f63,#101f33 60%,#0d1929);color:#edf3ee;font-family:system-ui,-apple-system,'Noto Sans TC',sans-serif;padding:16px clamp(12px,2.5vw,40px);box-sizing:border-box}.city-header{max-width:1650px;margin:auto auto 14px;display:flex;align-items:end;justify-content:space-between;gap:20px}.eyebrow{font-size:11px;letter-spacing:.23em;color:#e9c88e;font-weight:800}.city-header h1{font:700 clamp(30px,3vw,46px) Georgia,'Noto Serif TC',serif;margin:3px 0}.city-header p{color:#c8d7d8;margin:0}.city-header nav{display:flex;gap:8px;flex-wrap:wrap}.city-header a,.city-bar button{border:1px solid #739497;background:#ffffff12;color:#f6eedc;text-decoration:none;border-radius:10px;padding:9px 12px;cursor:pointer;font:inherit}.city-shell{max-width:1650px;margin:auto;display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,350px);gap:14px;height:calc(100vh - 125px);min-height:600px}.city-main,.city-sidebar{background:#20384bdf;border:1px solid #84a39a66;border-radius:18px;box-shadow:0 20px 45px #0005;min-height:0}.city-main{display:flex;flex-direction:column;padding:12px}.city-bar{display:flex;align-items:center;justify-content:space-between;gap:10px}.city-bar>div:first-child{display:flex;align-items:baseline;gap:9px;flex-wrap:wrap}.city-seal{color:#f4d08b}.city-bar strong{font-size:22px}.city-bar small{color:#b9d0d5}.city-bar-actions{display:flex;gap:5px;flex-wrap:wrap}.city-bar button{padding:7px 10px;font-size:13px}.city-bar button:disabled{opacity:.5}.city-map-wrap{flex:1;min-height:0;margin:10px 0;border:1px solid #5b8791;border-radius:14px;overflow:hidden;background:#183345}.city-map{width:100%;height:100%;min-height:400px;display:block}.map-tile{cursor:pointer}.map-tile:hover path{stroke:#f9e5b0;stroke-width:2.7}.tile-icon,.tile-scenery,.tile-water,.level-tag{text-anchor:middle;pointer-events:none;font-weight:900}.tile-icon{font-size:19px;fill:#fcf6da;paint-order:stroke;stroke:#254251;stroke-width:2px}.tile-icon.high{font-size:22px}.tile-scenery{font-size:15px;fill:#245d48}.tile-water{font-size:18px;fill:#b9e3ee}.level-tag{font-size:10px;fill:#fff}.map-caption,.map-tip{font-size:18px;fill:#f6e6bd;font-weight:700}.map-tip{font-size:14px;fill:#d1e5e2}.city-notice{background:#31566a;border-left:4px solid #e8c785;padding:9px 12px;border-radius:5px;min-height:24px}.city-metrics{display:flex;gap:7px;flex-wrap:wrap;padding-top:10px}.city-metrics span{background:#ffffff10;border:1px solid #ffffff12;border-radius:8px;padding:7px 10px;font-size:13px}.city-metrics b{color:#ffe1a0}.negative{color:#ff9b96!important}.city-sidebar{display:flex;flex-direction:column;overflow:hidden}.side-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:10px 10px 0}.side-tabs button{background:transparent;color:#c4d6d8;border:0;border-bottom:2px solid #718f96;padding:9px;cursor:pointer;font-size:15px}.side-tabs button.active{color:#ffdc9a;border-color:#e7b96e;font-weight:800}.side-body{overflow:auto;padding:10px 16px;flex:1}.side-body h2{font-size:15px;color:#f5d593;letter-spacing:.04em;margin:15px 0 8px}.side-body p{line-height:1.55;color:#d5e1df;margin:8px 0;font-size:14px}.side-intro{font-size:13px!important}.tool-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.tool-grid button{min-height:67px;border:1px solid #789ba3;background:#284b5a;color:#f5efe1;border-radius:9px;cursor:pointer;display:grid;grid-template-columns:24px 1fr;grid-template-rows:1fr 1fr;align-items:center;text-align:left;padding:6px;gap:1px 3px}.tool-grid button.active{background:#d7aa67;color:#162e3c;border-color:#ffe1a1}.tool-grid span{grid-row:span 2;font-size:21px;text-align:center}.tool-grid strong{font-size:12px}.tool-grid small{font-size:11px}.selection{border-top:1px solid #ffffff26;margin-top:12px}.report-row{display:flex;justify-content:space-between;border-bottom:1px solid #ffffff1a;padding:7px 0;font-size:14px}.report-row b{color:#f6dfa9}.tax{display:block;margin-top:12px;font-weight:700}.tax input{width:100%;accent-color:#e6bd79}.city-news{padding-left:20px;line-height:1.5;font-size:13px;color:#d8e3df}.city-news li{margin:5px 0}.city-save{margin:0;padding:9px 15px;background:#345766;font-size:12px}.quiz-backdrop{position:fixed;inset:0;background:#091724d9;display:grid;place-items:center;padding:15px;z-index:10}.quiz-card{background:#f5ecda;color:#223844;border:5px solid #d3a96d;border-radius:22px;padding:27px;width:min(95vw,490px);box-shadow:0 25px 80px #0009}.quiz-card h2{font-size:36px;margin:10px 0}.quiz-card p{line-height:1.5}.quiz-choices{display:grid;grid-template-columns:repeat(2,1fr);gap:9px}.quiz-choices button{border:1px solid #b8aa91;background:#fffaf0;color:#223844;border-radius:9px;padding:14px;font-size:16px;font-weight:750;cursor:pointer}.quiz-choices button:hover{background:#e7cd94}.quiz-cancel{background:transparent;border:0;color:#607075;margin-top:12px;cursor:pointer}@media(max-width:950px){.city-shell{height:auto;grid-template-columns:1fr}.city-main{min-height:630px}.city-sidebar{max-height:520px}.city-header{align-items:start;flex-direction:column}}@media(max-width:600px){.city-page{padding:10px 6px}.city-header{gap:8px}.city-header p{font-size:13px}.city-shell{gap:8px}.city-main{min-height:480px;padding:7px}.city-map{min-height:320px}.city-bar{align-items:start;flex-direction:column}.city-map-wrap{margin:6px 0}.city-sidebar{max-height:530px}.tool-grid{grid-template-columns:repeat(3,1fr)}.city-metrics span{font-size:12px;padding:5px}.quiz-card{padding:17px}}
.relief-button{width:100%;margin:12px 0 2px;padding:10px;border:1px solid #ebc788;border-radius:9px;background:#c29a60;color:#172c3c;font-weight:800;cursor:pointer}
</style>
