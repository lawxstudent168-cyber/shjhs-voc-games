<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { ZOO_ANIMALS, ZOO_TOOLS, ZOO_HEIGHT, ZOO_WIDTH, advanceZooDay, createZoo, upgradeZooMap, zooAdopt, zooAnimal, zooBiome, zooBuild, zooCare, zooMetrics, zooTool } from '~/lib/vocabulary-zoo';

const GAME_TYPE = '單字模擬動物園';
const db = useSupabaseClient();
const route = useRoute();
const student = useCookie('currentStudent');
const lesson = { version: typeof route.query.version === 'string' ? route.query.version : '', volume: typeof route.query.volume === 'string' ? route.query.volume : '', unit: typeof route.query.unit === 'string' ? route.query.unit : '' };
const zoo = ref(createZoo());
const words = ref([]);
const loading = ref(true);
const notice = ref('正在載入單字與園區…');
const saveNotice = ref('');
const selectedTool = ref('inspect');
const selectedId = ref(3 + 3 * ZOO_WIDTH);
const selectedAnimal = ref('giraffe');
const mapScale = ref(1);
const panel = ref('build');
const quiz = ref(null);
const pending = ref(null);
const activeSeconds = ref(0);
const lastQuestionAt = ref(0);
const photo = ref('');
const fullPhoto = ref('');
const photoCredit = ref('');
const wikiText = ref('');
const photoError = ref(false);
const photoOpen = ref(false);
const metrics = computed(() => zooMetrics(zoo.value));
const selected = computed(() => zoo.value.tiles[selectedId.value]);
const selectedAnimalData = computed(() => zooAnimal(selected.value?.animalId));
const selectedConnected = computed(() => {
  const tile = selected.value;
  if (!tile) return false;
  if (tile.kind === 'path') return metrics.value.paths.has(tile.id);
  return zoo.value.tiles.some(path => path.kind === 'path' && metrics.value.paths.has(path.id) && Math.abs(path.x - tile.x) + Math.abs(path.y - tile.y) === 1);
});
const selectedDescription = computed(() => {
  const tile = selected.value;
  if (!tile?.kind) return '尚未建設，可選擇建造工具使用這塊地。';
  if (tile.kind === 'habitat') return selectedAnimalData.value?.fact || '這塊棲地尚無動物，可到動物圖鑑領養適合的物種。';
  return {
    path: '步道連結園區入口、棲地與服務設施。',
    shop: '餐飲攤接上步道後，每位遊客可增加約 $2.5 消費；每天另有維護費。',
    toilet: '洗手間接上步道後，可避免因缺少洗手間而減少遊客；每天另有維護費。',
    education: '解說牌接上步道後，可增加來客吸引力與每天的保育點數。',
    tree: '景觀樹讓園區的地圖更有綠意。'
  }[tile.kind] || '園區設施。';
});
const chosenAnimal = computed(() => zooAnimal(selectedAnimal.value));
const score = computed(() => zoo.value.correct.length * 10 + Math.min(500, zoo.value.totalVisitors) + zoo.value.conservation * 2);
const historyLink = computed(() => ({ path: '/history', query: { game: GAME_TYPE } }));
const leaderboardLink = computed(() => ({ path: '/leaderboard', query: { game: GAME_TYPE, ...lesson } }));
const storageKey = computed(() => `shjhs-vocabulary-zoo:v1:${student.value?.id || 'anon'}:${lesson.version}:${lesson.volume}:${lesson.unit}`);
let timer = null, lastTick = 0, accumulated = 0, lastDayAt = 0, saving = false, disposed = false;

function persist() {
  if (!import.meta.client || !student.value?.id) return;
  try { localStorage.setItem(storageKey.value, JSON.stringify(zoo.value)); }
  catch { saveNotice.value = '裝置儲存空間不足，請清理瀏覽器空間。'; }
}
function commit(result) {
  notice.value = result.error || result.message;
  if (!result.error) persist();
}
function tileName(tile) {
  if (!tile?.kind) return '空地';
  if (tile.kind === 'habitat') return `${zooBiome(tile.biome)?.name || ''}棲地${tile.animalId ? ` · ${zooAnimal(tile.animalId)?.name}` : ''}`;
  return zooTool(tile.kind)?.name || tile.kind;
}
function toolIcon(tile) {
  if (tile.kind === 'habitat') return zooAnimal(tile.animalId)?.icon || zooBiome(tile.biome)?.icon;
  return zooTool(tile.kind)?.icon || (tile.id % 11 === 0 ? '🌿' : '');
}
function selectTile(id) {
  selectedId.value = id;
  const tile = zoo.value.tiles[id];
  if (tile.animalId) selectedAnimal.value = tile.animalId;
  if (tile.kind && selectedTool.value !== 'remove') {
    selectedTool.value = 'inspect';
    panel.value = tile.animalId ? 'animals' : 'build';
    return;
  }
  if (selectedTool.value === 'inspect') { panel.value = tile.animalId ? 'animals' : 'build'; return; }
  const tool = zooTool(selectedTool.value);
  if (!tool) return;
  if (selectedTool.value === 'remove' ? (!tile.kind || (tile.x === 0 && tile.y === 4)) : Boolean(tile.kind)) {
    notice.value = selectedTool.value === 'remove' ? '入口或空地不能拆除。' : `${tileName(tile)}已佔用這塊地，請選空地。`;
    return;
  }
  if (zoo.value.money < tool.cost) { notice.value = `需要 $${tool.cost}，資金不足。`; return; }
  requestAction({ type: 'build', id, tool: tool.id }, Boolean(tool.important));
}
function requestAction(action, important = false) {
  if (quiz.value || loading.value || words.value.length < 4) return;
  if (important || activeSeconds.value - lastQuestionAt.value >= 35) openQuiz(action);
  else applyAction(action);
}
function applyAction(action) {
  if (!action) return;
  if (action.type === 'build') commit(zooBuild(zoo.value, action.id, action.tool));
  if (action.type === 'adopt') commit(zooAdopt(zoo.value, action.id, action.animal));
  if (action.type === 'care') commit(zooCare(zoo.value, action.id, action.kind));
  if (action.type === 'staff') {
    const cost = action.kind === 'keeper' ? 180 : 260;
    if (zoo.value.money < cost) { notice.value = `聘任需要 $${cost}。`; return; }
    zoo.value.money -= cost;
    if (action.kind === 'keeper') zoo.value.keepers++;
    else zoo.value.vets++;
    notice.value = `已聘任${action.kind === 'keeper' ? '保育員' : '獸醫'}；每日支付薪資。`;
    persist();
  }
  if (action.type === 'grant') {
    if (zoo.value.money >= 200 || zoo.value.grantUsed) return;
    zoo.value.money += 700; zoo.value.grantUsed = true;
    notice.value = '保育教育補助 $700 已入帳；每座園區限領一次。'; persist();
  }
}
function openQuiz(action) {
  if (quiz.value || words.value.length < 4) return;
  const word = words.value[Math.floor(Math.random() * words.value.length)];
  const distractors = words.value.filter(item => item.en_us.toLowerCase() !== word.en_us.toLowerCase()).sort(() => Math.random() - .5).slice(0, 3);
  quiz.value = { word, choices: [word, ...distractors].sort(() => Math.random() - .5) };
  pending.value = action;
  lastQuestionAt.value = activeSeconds.value;
}
function answer(choice) {
  if (!quiz.value) return;
  const word = quiz.value.word;
  const correct = choice.trim().toLowerCase() === word.en_us.trim().toLowerCase();
  (correct ? zoo.value.correct : zoo.value.wrong).push(word.en_us);
  quiz.value = null;
  if (correct) {
    if (pending.value) applyAction(pending.value);
    else { zoo.value.money += 70; notice.value = `答對 ${word.en_us}！保育基金 +$70。`; }
  } else notice.value = `答錯了：「${word.zh_tw}」是 ${word.en_us}；本次操作沒有執行。`;
  pending.value = null; persist();
}
function cancelQuiz() { quiz.value = null; pending.value = null; notice.value = '已取消這次操作。'; }
function adopt(animal) {
  selectedAnimal.value = animal.id;
  if (!selected.value || selected.value.kind !== 'habitat' || selected.value.animalId) { notice.value = '請先在地圖選擇空的棲地。'; return; }
  if (selected.value.biome !== animal.biome) { notice.value = `${animal.name}需要${zooBiome(animal.biome).name}棲地。`; return; }
  if (zoo.value.money < animal.cost) { notice.value = `領養需要 $${animal.cost}。`; return; }
  requestAction({ type: 'adopt', id: selectedId.value, animal: animal.id }, true);
}
function care(kind) { requestAction({ type: 'care', id: selectedId.value, kind }); }
function staff(kind) { requestAction({ type: 'staff', kind }, true); }
function changeTicket(event) { zoo.value.tickets = Number(event.target.value); persist(); }
function newZoo() {
  if (!confirm('建立新動物園會覆蓋目前的本機園區。確定繼續？')) return;
  const name = prompt('請替動物園命名', '晨光動物園');
  if (name === null) return;
  zoo.value = createZoo(); zoo.value.name = name.trim().slice(0, 20) || '晨光動物園';
  zoo.value.recordId = crypto.randomUUID(); zoo.value.startedAt = Date.now();
  selectedId.value = 3 + 3 * ZOO_WIDTH; selectedTool.value = 'inspect'; activeSeconds.value = 0; lastQuestionAt.value = 0; lastDayAt = 0;
  notice.value = '新園區已開幕。從初始草原棲地領養第一隻動物吧！'; persist();
}
async function saveRecord() {
  if (!student.value?.id || saving) return;
  saving = true;
  try {
    zoo.value.recordId ||= crypto.randomUUID(); zoo.value.startedAt ||= Date.now();
    if (!zoo.value.attemptNumber) {
      const { count, error } = await db.from('game_records').select('id', { count: 'exact', head: true })
        .eq('student_id', String(student.value.id)).eq('game_type', GAME_TYPE).eq('version', lesson.version).eq('volume', lesson.volume).eq('unit_played', lesson.unit);
      if (error) throw error;
      zoo.value.attemptNumber = (count || 0) + 1;
    }
    const { error } = await db.from('game_records').upsert({
      id: zoo.value.recordId, student_id: String(student.value.id), game_type: GAME_TYPE,
      version: lesson.version, volume: lesson.volume, unit_played: lesson.unit,
      score: score.value, mistakes: zoo.value.wrong.length,
      correct_words: zoo.value.correct.join(', '), wrong_words: zoo.value.wrong.join(', '),
      attempt_number: zoo.value.attemptNumber, played_at: new Date(zoo.value.startedAt).toISOString(),
      time_taken_seconds: activeSeconds.value, device_info: navigator.userAgent
    }, { onConflict: 'id' });
    if (error) throw error;
    saveNotice.value = '成績與對錯單字已儲存到學生紀錄。'; persist();
  } catch (error) { saveNotice.value = `成績儲存失敗：${error.message}`; }
  finally { saving = false; }
}
async function loadWiki(animal) {
  photo.value = ''; fullPhoto.value = ''; photoCredit.value = ''; wikiText.value = ''; photoError.value = false; photoOpen.value = false;
  if (!animal || !import.meta.client) return;
  try {
    const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(animal.wiki)}`);
    if (!response.ok) return;
    const data = await response.json();
    if (chosenAnimal.value?.id !== animal.id) return;
    const src = data.thumbnail?.source || '';
    if (src.startsWith('https://thumb.wikimedia.org/wikipedia/commons/') || src.startsWith('https://upload.wikimedia.org/wikipedia/commons/')) {
      photo.value = src;
      const original = data.originalimage?.source || '';
      if (original.startsWith('https://upload.wikimedia.org/wikipedia/commons/')) fullPhoto.value = original;
      const filename = original.split('/').pop()?.split('?')[0];
      if (filename) photoCredit.value = `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(decodeURIComponent(filename))}`;
    }
    wikiText.value = typeof data.extract === 'string' ? data.extract.slice(0, 280) : '';
  } catch { /* Wikipedia may be unavailable; keep local descriptions and icons. */ }
}
watch(() => chosenAnimal.value?.id, () => loadWiki(chosenAnimal.value), { immediate: true });
onMounted(async () => {
  if (!student.value?.id) { await navigateTo('/'); return; }
  if (!lesson.version || !lesson.volume || !lesson.unit) { loading.value = false; notice.value = '請先在首頁選擇課本、冊次與單元。'; return; }
  const { data, error } = await db.from('vocabularies').select('en_us,zh_tw').eq('version', lesson.version).eq('volume', lesson.volume).eq('unit', lesson.unit).limit(1000);
  if (disposed) return;
  loading.value = false;
  if (error) { notice.value = `單字載入失敗：${error.message}`; return; }
  const seen = new Set();
  words.value = (data || []).filter(word => { const key = word.en_us?.trim().toLowerCase(); if (!key || !word.zh_tw?.trim() || seen.has(key)) return false; seen.add(key); return true; });
  if (words.value.length < 4) { notice.value = '本課至少需要四筆不同的單字。'; return; }
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey.value) || 'null');
    const upgraded = upgradeZooMap(saved);
    if (upgraded) zoo.value = upgraded;
  } catch { /* Use new zoo if local save is unreadable. */ }
  zoo.value.recordId ||= crypto.randomUUID(); zoo.value.startedAt ||= Date.now(); zoo.value.correct ||= []; zoo.value.wrong ||= []; zoo.value.events ||= [];
  persist(); notice.value = `歡迎來到 ${zoo.value.name}！請選擇初始棲地，領養動物。`;
  lastTick = Date.now();
  timer = window.setInterval(() => {
    if (document.hidden || zoo.value.paused || quiz.value) { lastTick = Date.now(); return; }
    const now = Date.now(); accumulated += Math.min(2000, Math.max(0, now - lastTick)); lastTick = now;
    if (accumulated < 1000) return;
    activeSeconds.value += Math.floor(accumulated / 1000); accumulated %= 1000;
    if (activeSeconds.value - lastDayAt >= 45) {
      lastDayAt = activeSeconds.value;
      const report = advanceZooDay(zoo.value);
      notice.value = `新的一天：${report.visitors} 位遊客，收入 $${report.income}、支出 $${report.expense}。`;
      persist(); if (zoo.value.day % 3 === 0) saveRecord();
    }
  }, 1000);
});
onBeforeUnmount(() => { disposed = true; if (timer) clearInterval(timer); persist(); });
watch(() => zoo.value.paused, persist);
</script>

<template>
  <main class="zoo-page">
    <header class="zoo-header"><div><span class="eyebrow">VOCABULARY · ZOO BUILDER</span><h1>🦁 單字模擬動物園</h1><p>照顧動物、設計棲地，讓單字成為園區成長的力量</p></div><nav><NuxtLink to="/">← 首頁</NuxtLink><NuxtLink :to="historyLink">學習紀錄</NuxtLink><NuxtLink :to="leaderboardLink">英雄榜</NuxtLink></nav></header>
    <div class="zoo-layout"><section class="zoo-board"><div class="topline"><div><strong>{{zoo.name}}</strong><span>第 {{zoo.day}} 天</span></div><div class="top-actions"><button v-if="!loading&&words.length>=4&&activeSeconds-lastQuestionAt>=35&&!quiz" @click="openQuiz(null)">📚 單字挑戰</button><button @click="zoo.paused=!zoo.paused">{{zoo.paused?'▶ 繼續':'Ⅱ 暫停'}}</button><button @click="saveRecord" :disabled="loading||saving">儲存成績</button><button @click="newZoo">新園區</button></div></div>
      <div class="stats"><span>💰 ${{zoo.money}}</span><span>🎟️ 今日 {{zoo.visitors}} 人</span><span>❤️ 福祉 {{metrics.welfare}}%</span><span>🌿 保育 {{zoo.conservation}}</span><span>⭐ {{score}} 分</span><span>📖 {{zoo.correct.length}} 對／{{zoo.wrong.length}} 錯</span></div>
      <div class="board-note">園區已擴大為 {{ZOO_WIDTH}} × {{ZOO_HEIGHT}} 格。地圖可捲動、縮放；入口在左側，步道要緊鄰棲地與設施。</div>
      <div class="map-controls"><span>{{ZOO_WIDTH}} × {{ZOO_HEIGHT}} 格 · {{Math.round(mapScale*100)}}%</span><button :disabled="mapScale<=.75" @click="mapScale=Math.max(.75,mapScale-.25)">－ 縮小</button><button :disabled="mapScale>=1.5" @click="mapScale=Math.min(1.5,mapScale+.25)">＋ 放大</button><button @click="mapScale=1">原尺寸</button></div>
      <div class="map-frame"><div class="zoo-grid" :style="{'--cols':ZOO_WIDTH,'--tile-size':`${Math.round(80*mapScale)}px`}"><button v-for="tile in zoo.tiles" :key="tile.id" class="zoo-tile" :class="[tile.kind||'empty',{selected:selectedId===tile.id,connected:metrics.paths.has(tile.id),unconnected:tile.kind==='habitat'&&tile.animalId&&!metrics.active.includes(tile)}]" :style="tile.kind==='habitat'?{'--biome-color':zooBiome(tile.biome)?.color}:{}" :title="`${tile.x+1}, ${tile.y+1} · ${tileName(tile)}`" :aria-label="tileName(tile)" @click="selectTile(tile.id)"><span v-if="tile.kind==='habitat'" class="tile-kind">{{zooBiome(tile.biome)?.name}}棲地</span><span v-else-if="tile.kind&&!['path','tree'].includes(tile.kind)" class="tile-kind">{{tileName(tile)}}</span><span v-if="tile.kind!=='path'&&toolIcon(tile)" class="tile-object" :class="{'animal-object':Boolean(tile.animalId),'facility-object':tile.kind&&!['habitat','path','tree'].includes(tile.kind)}"><span class="tile-icon">{{toolIcon(tile)}}</span></span><span v-if="tile.kind==='habitat'" class="tile-label">{{tile.animalId?zooAnimal(tile.animalId)?.name:'待領養'}}</span><span v-if="tile.kind==='habitat'&&tile.animalId" class="tile-health" :style="{width:`${Math.round((tile.hunger+tile.clean)/2)}%`}"></span><span v-if="tile.x===0&&tile.y===4" class="entry-tag">入口</span></button></div></div>
      <div class="notice" role="status">{{notice}}</div><p v-if="saveNotice" class="save-notice">{{saveNotice}}</p>
    </section>
    <aside class="sidebar"><div class="tabs"><button v-for="tab in [{id:'build',name:'建造'},{id:'animals',name:'動物'},{id:'manage',name:'經營'},{id:'guide',name:'說明'}]" :key="tab.id" :class="{active:panel===tab.id}" @click="panel=tab.id">{{tab.name}}</button></div>
      <section v-if="selected" class="tile-details" aria-live="polite">
        <div class="detail-heading"><span class="detail-emoji">{{toolIcon(selected)||'🌱'}}</span><div><small>第 {{selected.x+1}} 列 · 第 {{selected.y+1}} 行</small><h2>{{tileName(selected)}}</h2></div></div>
        <p>{{selectedDescription}}</p>
        <div v-if="selected.kind==='habitat'" class="detail-facts">
          <span>土地：<b>{{zooBiome(selected.biome)?.name}}棲地</b></span>
          <span>動物：<b>{{selectedAnimalData?.name||'尚未領養'}}</b></span>
          <span>步道：<b>{{selectedConnected?'已連通':'未連通'}}</b></span>
          <span v-if="selectedAnimalData">飽足 <b>{{selected.hunger}}%</b> · 清潔 <b>{{selected.clean}}%</b></span>
        </div>
        <div v-else-if="selected.kind" class="detail-facts"><span>設施：<b>{{tileName(selected)}}</b></span><span v-if="selected.kind!=='tree'">步道：<b>{{selectedConnected?'已連通':'未連通'}}</b></span></div>
        <div v-if="selectedAnimalData" class="detail-actions"><button @click="care('feed')">🥬 餵食</button><button @click="care('clean')">🧼 清潔</button><button @click="care('vet')">🩺 檢查</button><button @click="selectedAnimal=selected.animalId;panel='animals'">📖 照片與介紹</button></div>
        <div v-else-if="selected.kind==='habitat'" class="detail-actions"><button @click="panel='animals'">🐾 查看可領養動物</button></div>
      </section>
      <div class="sidebar-body" v-if="panel==='build'"><h2>建造工具</h2><p>選擇工具後點園區空地；按「查看」可選取棲地與照護動物。</p><div class="tool-grid"><button v-for="tool in ZOO_TOOLS" :key="tool.id" :class="{active:selectedTool===tool.id}" @click="selectedTool=tool.id"><span>{{tool.icon}}</span><strong>{{tool.name}}</strong><small>{{tool.cost?`$${tool.cost}`:'選取'}}</small></button></div></div>
      <div class="sidebar-body" v-else-if="panel==='animals'"><h2>動物圖鑑與領養</h2><p>先點選一塊空棲地，再選符合環境的動物。領養需回答英文單字。</p><div class="animal-list"><button v-for="animal in ZOO_ANIMALS" :key="animal.id" :class="{active:chosenAnimal?.id===animal.id}" @click="selectedAnimal=animal.id"><span>{{animal.icon}}</span><strong>{{animal.name}}<small>{{animal.en}}</small></strong><em>${{animal.cost}}</em></button></div><div v-if="chosenAnimal" class="wiki-card"><button v-if="photo&&!photoError" class="photo-preview" :aria-label="`放大檢視${chosenAnimal.name}完整照片`" @click="photoOpen=true"><img :src="photo" :alt="chosenAnimal.name" loading="lazy" @error="photoError=true"><span>點擊查看完整照片 ⤢</span></button><span v-else class="wiki-fallback">{{chosenAnimal.icon}}</span><h3>{{chosenAnimal.name}} · {{chosenAnimal.en}}</h3><p>{{chosenAnimal.fact}}</p><p class="wiki-extract" v-if="wikiText">{{wikiText}}</p><a :href="`https://en.wikipedia.org/wiki/${chosenAnimal.wiki}`" target="_blank" rel="noopener noreferrer">維基百科動物介紹 ↗</a><a v-if="photoCredit" :href="photoCredit" target="_blank" rel="noopener noreferrer">圖片來源與授權 ↗</a><button class="primary" :disabled="!selected||selected.kind!=='habitat'||Boolean(selected.animalId)||selected.biome!==chosenAnimal.biome||zoo.money<chosenAnimal.cost" @click="adopt(chosenAnimal)">領養 {{chosenAnimal.name}} · ${{chosenAnimal.cost}}</button><small>需要 {{zooBiome(chosenAnimal.biome)?.name}}棲地 · 每日飼料約 ${{Math.ceil(chosenAnimal.food/2)}}</small></div></div>
      <div class="sidebar-body" v-else-if="panel==='manage'"><h2>每日經營</h2><div class="report-row"><span>已連通動物／全部</span><b>{{metrics.active.length}}／{{metrics.exhibits.length}}</b></div><div class="report-row"><span>物種數</span><b>{{metrics.diversity}}</b></div><div class="report-row"><span>園區聲望</span><b>{{zoo.reputation}}／100</b></div><div class="report-row"><span>昨日收入</span><b>${{zoo.lastReport?.income||0}}</b></div><div class="report-row"><span>昨日支出</span><b>${{zoo.lastReport?.expense||0}}</b></div><label class="ticket">門票 ${{zoo.tickets}}<input type="range" min="5" max="30" :value="zoo.tickets" @change="changeTicket"></label><p>票價太高會減少遊客；餐飲攤、洗手間與解說牌會改善收益或吸引力。</p><h2>工作人員</h2><div class="report-row"><span>保育員 {{zoo.keepers}} 人</span><b>日薪 $65／人</b></div><div class="report-row"><span>獸醫 {{zoo.vets}} 人</span><b>日薪 $90／人</b></div><div class="hire"><button @click="staff('keeper')" :disabled="zoo.money<180">聘保育員 $180</button><button @click="staff('vet')" :disabled="zoo.money<260">聘獸醫 $260</button></div><p>每位保育員每天自動照顧最多三個棲地；獸醫提供專業照護職位，動物健康過低時可由其處理。</p><button v-if="zoo.money<200&&!zoo.grantUsed" class="primary" @click="requestAction({type:'grant'},true)">申請保育補助 $700</button><h2>園區日誌</h2><ul><li v-for="(entry,i) in zoo.events" :key="i">{{entry}}</li></ul></div>
      <div class="sidebar-body" v-else><h2>遊玩方法</h2><p>初始棲地可直接領養草原動物。新棲地、餐飲攤、洗手間與解說牌要建在空地，並以步道連到入口。地圖上有顏色的棲地是動物的家；未連通的棲地不會帶來遊客。</p><p>每 45 秒有效遊玩時間推進一天；暫停、答題或切換分頁不計時。動物每天需要飼料與清潔，雇保育員可自動照顧。遊客支付門票，設施與員工則有每日成本。</p><p>重要建設、領養和聘人要答對英文題；一般照護約每 35 秒問一次。分數來自答對單字、累積遊客和保育點數。園區保存在本裝置，成績另存入學生紀錄。</p><p>玩法參考《Planet Zoo》與《Zoo Tycoon》的動物福祉、棲地及遊客經營概念；本遊戲的地圖、美術與規則為獨立設計。動物照片及簡介由維基百科即時載入，未載入時改用圖示與本地文字；點圖鑑連結查看原文與圖片授權。</p></div>
    </aside></div>
    <div v-if="photoOpen&&photo&&!photoError" class="photo-overlay" role="dialog" aria-modal="true" :aria-label="`${chosenAnimal?.name}完整照片`" @click.self="photoOpen=false"><div class="photo-dialog"><button class="photo-close" aria-label="關閉照片" @click="photoOpen=false">✕</button><img :src="fullPhoto||photo" :alt="chosenAnimal?.name" @error="fullPhoto=''" ><div><strong>{{chosenAnimal?.name}} · {{chosenAnimal?.en}}</strong><a v-if="photoCredit" :href="photoCredit" target="_blank" rel="noopener noreferrer">查看維基共享資源的攝影者與授權 ↗</a></div></div></div>
    <div v-if="quiz" class="quiz-overlay"><section class="quiz-card" role="dialog" aria-modal="true" aria-label="單字挑戰"><span class="eyebrow">ZOO WORD CHALLENGE</span><h2>{{quiz.word.zh_tw}}</h2><p>選出正確英文，{{pending?'才能完成這次操作':'可獲得保育基金'}}。</p><div class="choices"><button v-for="(choice,i) in quiz.choices" :key="i" @click="answer(choice.en_us)">{{choice.en_us}}</button></div><button class="cancel" @click="cancelQuiz">取消</button></section></div>
  </main>
</template>

<style scoped>
.zoo-page{min-height:100vh;box-sizing:border-box;padding:14px clamp(10px,2vw,30px);background:radial-gradient(circle at 50% 0,#416e65,#173744 55%,#102933);color:#f6f4e7;font-family:system-ui,-apple-system,'Noto Sans TC',sans-serif}.zoo-header{max-width:1700px;margin:0 auto 12px;display:flex;align-items:end;justify-content:space-between;gap:12px}.eyebrow{font-size:11px;letter-spacing:.18em;color:#f5d697;font-weight:800}.zoo-header h1{font:700 clamp(29px,3vw,45px) Georgia,'Noto Serif TC',serif;margin:3px 0}.zoo-header p{margin:0;color:#d3e6dd}.zoo-header nav,.top-actions{display:flex;flex-wrap:wrap;gap:6px}.zoo-header a,.top-actions button{border:1px solid #8db4a3;border-radius:9px;background:#ffffff14;color:#f7f5e8;text-decoration:none;padding:8px 10px;font:inherit;cursor:pointer}.zoo-layout{max-width:1700px;margin:auto;display:grid;grid-template-columns:minmax(0,1fr) minmax(325px,365px);gap:12px;height:calc(100vh - 120px);min-height:615px}.zoo-board,.sidebar{min-height:0;border-radius:18px;border:1px solid #abc9a766;background:#244e48dd;box-shadow:0 18px 50px #001b2380}.zoo-board{padding:12px;display:flex;flex-direction:column}.topline{display:flex;justify-content:space-between;align-items:center;gap:8px}.topline>div:first-child{display:flex;align-items:baseline;gap:10px}.topline strong{font-size:23px}.topline span{color:#f4d995}.top-actions button{padding:6px 9px;font-size:13px}.top-actions button:disabled{opacity:.5}.stats{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0}.stats span{padding:7px 10px;border-radius:8px;background:#0b303666;border:1px solid #ffffff1b;font-size:13px;font-weight:700}.board-note{font-size:13px;color:#dcead8;margin:0 0 8px}.map-frame{flex:1;min-height:0;overflow:auto;border-radius:14px;border:3px solid #b09c6f;background:radial-gradient(circle at 30% 20%,#98bd84,#6a9778 75%);display:grid;place-items:center;padding:10px}.zoo-grid{display:grid;grid-template-columns:repeat(var(--cols),var(--tile-size));grid-auto-rows:var(--tile-size);border:4px solid #356348;border-radius:8px;box-shadow:0 12px 30px #133b2e88}.zoo-tile{position:relative;min-width:0;min-height:0;border:1px solid #acc89988;border-radius:5px;background:linear-gradient(135deg,#a5c584,#83ac75);color:#182f29;cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow:hidden}.zoo-tile.empty:nth-child(11n){background:linear-gradient(135deg,#8bb789,#729e70)}.zoo-tile.path{background:repeating-linear-gradient(45deg,#c4ad80 0 9px,#b9a071 9px 11px);border-color:#e1ca9c}.zoo-tile.path.connected{box-shadow:inset 0 0 0 2px #ebd7a1}.zoo-tile.habitat{background:linear-gradient(145deg,color-mix(in srgb,var(--biome-color),white 20%),var(--biome-color));border:3px solid #ead28c}.zoo-tile.shop,.zoo-tile.toilet,.zoo-tile.education{background:#d6b987}.zoo-tile.tree{background:#6f9c63}.zoo-tile.selected{outline:3px solid #fff7a3;outline-offset:-3px;z-index:1}.zoo-tile.unconnected{filter:grayscale(.55)}.tile-icon{font-size:clamp(17px,2.4vw,38px);line-height:1.1;filter:drop-shadow(1px 2px 2px #152b2d77)}.tile-label{font-size:clamp(9px,.85vw,14px);font-weight:900;background:#f8eecddc;border-radius:5px;padding:0 3px;white-space:nowrap}.tile-health{position:absolute;bottom:0;left:0;height:4px;background:#51d784}.entry-tag{position:absolute;bottom:1px;left:1px;background:#304d42;color:#fff;padding:0 3px;font-size:10px}.notice{margin-top:9px;background:#31695d;border-left:4px solid #f2d18c;padding:9px 11px;border-radius:5px;font-size:14px;min-height:20px}.save-notice{margin:5px 0 0;font-size:12px;color:#f3d792}.sidebar{display:flex;flex-direction:column;overflow:hidden}.tabs{display:grid;grid-template-columns:repeat(4,1fr);gap:2px;padding:9px 8px 0}.tabs button{background:#153e40;color:#d7e5df;border:0;border-bottom:2px solid #74988e;padding:10px 3px;cursor:pointer;font-size:14px}.tabs button.active{background:#ddbd77;color:#1b383b;border-color:#fff0ad;font-weight:900}.sidebar-body{flex:1;overflow:auto;padding:10px 14px 16px}.sidebar-body h2{font-size:17px;color:#f4d592;margin:10px 0}.sidebar-body p{line-height:1.5;font-size:13px;color:#e2ebe1;margin:6px 0 12px}.tool-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.tool-grid button{min-height:65px;display:grid;grid-template-columns:25px 1fr;grid-template-rows:1fr 1fr;align-items:center;gap:0 3px;padding:5px;border-radius:8px;border:1px solid #89a999;background:#38675b;color:#fff7e3;text-align:left;cursor:pointer}.tool-grid button.active{background:#e4bd75;color:#233c37}.tool-grid span{grid-row:span 2;font-size:22px}.tool-grid strong{font-size:12px}.tool-grid small{font-size:11px}.selected-card,.care-card,.wiki-card{border-top:1px solid #ffffff3d;margin-top:12px;padding-top:8px}.animal-list{display:grid;grid-template-columns:repeat(2,1fr);gap:5px}.animal-list button{display:flex;gap:5px;align-items:center;border:1px solid #8ca99b;border-radius:8px;background:#315c54;color:#f5f4e5;padding:5px;text-align:left;cursor:pointer}.animal-list button.active{background:#d2ad70;color:#233b37}.animal-list button>span{font-size:25px}.animal-list strong{font-size:12px}.animal-list small{display:block;font-size:10px;font-weight:400}.animal-list em{margin-left:auto;font-size:11px;font-style:normal}.wiki-card img{max-width:100%;height:auto;object-fit:contain;border-radius:10px}.wiki-fallback{font-size:65px;display:block;text-align:center;background:#416e65;border-radius:10px}.wiki-card h3{margin:6px 0;font-size:16px}.wiki-extract{font-size:11px!important;color:#bad9cb!important}.wiki-card a{display:block;color:#ffdb91;margin:6px 0;font-size:12px}.primary,.care-card button,.hire button{border:1px solid #ffe1a6;border-radius:8px;background:#ddb46e;color:#17383c;padding:9px;font-weight:800;cursor:pointer}.primary{width:100%;margin-top:7px}.primary:disabled,.hire button:disabled{opacity:.45;cursor:not-allowed}.wiki-card>small{display:block;color:#dce9d8;margin:7px 0}.care-card>div,.hire{display:flex;flex-wrap:wrap;gap:6px}.care-card button,.hire button{font-size:12px}.report-row{display:flex;justify-content:space-between;gap:8px;padding:7px 0;border-bottom:1px solid #ffffff25;font-size:13px}.report-row b{color:#ffdf9d}.ticket{display:block;font-weight:800;margin:12px 0}.ticket input{display:block;width:100%;accent-color:#eac474}.sidebar-body ul{padding-left:20px;font-size:12px;line-height:1.5;color:#d5e6da}.sidebar-body li{margin:5px 0}.quiz-overlay{position:fixed;inset:0;background:#071c20de;z-index:20;display:grid;place-items:center;padding:12px}.quiz-card{width:min(95vw,470px);background:#fbf3db;border:5px solid #c8a568;color:#203a37;border-radius:20px;padding:26px;box-shadow:0 25px 60px #0008}.quiz-card h2{font-size:38px;margin:8px 0}.quiz-card p{line-height:1.5}.choices{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.choices button{border:1px solid #bdaf90;border-radius:9px;background:#fffdfa;padding:12px;color:#203a37;font-size:16px;font-weight:800;cursor:pointer}.choices button:hover{background:#e8d39d}.cancel{border:0;background:none;color:#566e6b;margin-top:12px;cursor:pointer}@media(max-width:950px){.zoo-layout{height:auto;grid-template-columns:1fr}.zoo-board{min-height:560px}.sidebar{max-height:580px}.zoo-header{align-items:start;flex-direction:column}}@media(max-width:600px){.zoo-page{padding:8px 5px}.zoo-header h1{font-size:28px}.zoo-header p{font-size:12px}.zoo-board{min-height:450px;padding:7px}.topline{align-items:start;flex-direction:column}.map-frame{place-items:start;min-height:275px}.tile-icon{font-size:20px}.tile-label{font-size:9px}.stats span{font-size:11px;padding:5px}.sidebar{max-height:570px}}

.map-controls{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin:0 0 7px;color:#e6f2e8;font-size:12px}
.map-controls span{margin-right:auto;font-weight:800}
.map-controls button{padding:5px 10px;border:1px solid #a3c4aa;border-radius:7px;background:#225249;color:#fff4d6;cursor:pointer}
.map-controls button:disabled{opacity:.45;cursor:not-allowed}
.map-frame{display:block;scrollbar-color:#deb978 #2d594b}
.zoo-grid{width:max-content;min-width:0;aspect-ratio:auto;grid-template-columns:repeat(var(--cols),var(--tile-size));grid-auto-rows:var(--tile-size);gap:4px;padding:5px;background:repeating-linear-gradient(35deg,#6a9b76 0 70px,#77a47c 70px 140px)}
.zoo-tile{border-radius:8px;border:1px solid #d4ecc14d;box-shadow:inset 0 2px 2px #ffffff70,inset 0 -5px 5px #31573b55,0 4px 3px #1b493970;transition:transform .14s,box-shadow .14s}
.zoo-tile:hover{transform:translateY(-3px);box-shadow:inset 0 2px 2px #ffffff80,0 7px 5px #173b2e9c}
.zoo-tile.empty:nth-child(11n){background:radial-gradient(circle at 35% 25%,#a8cb8d,#75a36e)}
.zoo-tile.habitat{border:3px solid #f3dfa2;box-shadow:inset 0 4px 6px #ffffff5c,inset 0 -8px 5px #304e4a50,0 5px 4px #183d35af}
.zoo-tile.shop,.zoo-tile.toilet,.zoo-tile.education{background:linear-gradient(145deg,#f7dda6,#b98e61);box-shadow:inset 0 3px 2px #fff2cd,0 5px 4px #5a4134a8}
.zoo-tile.tree{background:radial-gradient(circle at 45% 35%,#91bf72,#4f8255)}
.tile-kind{position:absolute;top:2px;left:2px;right:2px;z-index:2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;background:#153d35dd;color:#fff7dc;border:1px solid #ffffff65;border-radius:4px;padding:1px 2px;font-size:10px;line-height:1.2;font-weight:900;text-shadow:0 1px 2px #102b25}
.tile-object{position:relative;display:grid;place-items:center;width:70%;height:62%;border-radius:45% 45% 34% 34%;background:radial-gradient(circle at 32% 23%,#fff7d9,#dfd39c 65%,#a99968);box-shadow:inset 0 2px 3px #ffffffb0,inset 0 -5px 5px #765c3b87,0 6px 2px #28463190;transform:translateY(2px)}
.tile-object:after{content:'';position:absolute;inset:auto 12% -5px;height:7px;border-radius:50%;background:#233d3166;filter:blur(2px);z-index:-1}
.tile-object.animal-object{background:radial-gradient(circle at 32% 23%,#fff9dd,#d3d3a0 60%,#9b9865);animation:zoo-breathe 3.2s ease-in-out infinite}
.tile-object.facility-object{border-radius:9px 9px 4px 4px;background:linear-gradient(130deg,#ffe6b0,#d1925f 65%,#9a5c4d);box-shadow:inset 3px 3px 4px #fff2cd,6px 6px 0 #6f493b,0 9px 3px #263d3799}
.tile-icon{font-size:clamp(23px,2.3vw,38px);line-height:1;filter:drop-shadow(0 2px 1px #6954398c);transform:translateY(-2px)}
.tile-label{position:absolute;left:2px;right:2px;bottom:5px;z-index:2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center;font-size:11px;background:#fff6d9ed;color:#28372d;border:1px solid #755f4380;padding:1px 2px;box-shadow:0 2px 2px #36423270}
.tile-health{z-index:3}
.entry-tag{z-index:3}
@keyframes zoo-breathe{0%,100%{transform:translateY(2px) rotate(-2deg)}50%{transform:translateY(-1px) rotate(2deg)}}
@media(prefers-reduced-motion:reduce){.tile-object.animal-object{animation:none}.zoo-tile{transition:none}}
.photo-preview{display:block;width:100%;padding:8px;border:1px solid #8cae9d;border-radius:11px;background:#183c39;color:#f8e6b9;cursor:zoom-in;text-align:center}
.photo-preview img{display:block;width:auto;max-width:100%;height:auto;max-height:300px;margin:auto;object-fit:contain;border-radius:6px}
.photo-preview span{display:block;margin-top:5px;font-size:12px}
.photo-overlay{position:fixed;inset:0;z-index:30;background:#041a1de8;display:grid;place-items:center;padding:15px}
.photo-dialog{position:relative;max-width:min(96vw,1100px);max-height:94vh;display:flex;flex-direction:column;align-items:center;gap:8px;padding:14px;background:#f7efdd;color:#213937;border-radius:14px;box-shadow:0 22px 70px #0009}
.photo-dialog img{display:block;max-width:100%;max-height:calc(94vh - 105px);width:auto;height:auto;object-fit:contain}
.photo-dialog>div{display:flex;align-items:center;gap:16px;flex-wrap:wrap;font-size:13px}
.photo-dialog a{color:#245d66}
.photo-close{position:absolute;top:8px;right:8px;border:0;border-radius:50%;width:32px;height:32px;background:#244d48;color:#fff;cursor:pointer}

/* Keep the terrain and occupant labels in separate rows; the animal never sits over either label. */
.zoo-tile{display:grid;grid-template-rows:clamp(15px,calc(var(--tile-size)*.2),22px) minmax(0,1fr) clamp(15px,calc(var(--tile-size)*.2),22px);justify-items:center;align-items:center;padding:1px}
.tile-kind{position:static;grid-row:1;align-self:start;box-sizing:border-box;width:100%;min-width:0;margin:0;padding:1px;text-align:center;font-size:clamp(9px,calc(var(--tile-size)*.14),12px);line-height:1.1}
.tile-object{grid-row:2;align-self:center;justify-self:center;margin:0}
.tile-label{position:static;grid-row:3;align-self:end;box-sizing:border-box;width:100%;min-width:0;margin:0 0 2px;padding:1px;text-align:center;font-size:clamp(9px,calc(var(--tile-size)*.15),12px);line-height:1.1}
.tile-object.animal-object{width:100%;height:100%;border-radius:0;background:none;box-shadow:none;animation:none;transform:none}
.tile-object.animal-object:after{display:none}
.animal-object .tile-icon{font-size:clamp(23px,calc(var(--tile-size)*.44),43px);line-height:1;filter:drop-shadow(0 2px 1px #24413655);transform:none}
.tile-object.facility-object{width:68%;height:78%}
.tile-object.facility-object .tile-icon{font-size:clamp(18px,calc(var(--tile-size)*.3),34px)}

.tile-details{flex:none;max-height:min(42vh,330px);overflow:auto;margin:8px 10px 0;padding:10px 12px;border:1px solid #e5d1959e;border-radius:12px;background:linear-gradient(155deg,#356656,#234a45);box-shadow:inset 0 1px 0 #ffffff38,0 5px 12px #102f2d66}
.detail-heading{display:flex;align-items:center;gap:9px}
.detail-emoji{display:grid;place-items:center;width:42px;height:42px;flex:none;border-radius:10px;background:#e8d7a6;font-size:29px;box-shadow:inset 0 1px #fff8d8,0 3px 3px #173c3480}
.detail-heading small{color:#d4e8dc;font-size:11px}
.detail-heading h2{margin:2px 0;color:#ffe3a2;font-size:18px;line-height:1.2}
.tile-details p{margin:7px 0;line-height:1.4;color:#e8f1e7;font-size:12px}
.detail-facts{display:flex;flex-wrap:wrap;gap:4px 10px;margin:7px 0;font-size:12px}
.detail-facts span{white-space:nowrap}
.detail-facts b{color:#ffe5ab}
.detail-actions{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}
.detail-actions button{border:1px solid #f0d49f;border-radius:7px;background:#dfbc7a;color:#1e3e39;padding:5px 8px;font-size:12px;font-weight:800;cursor:pointer}
@media(max-width:950px){.tile-details{max-height:260px}}
</style>
