export const ZOO_WIDTH = 20;
export const ZOO_HEIGHT = 13;

export const ZOO_ANIMALS = [
  { id: 'giraffe', name: '長頸鹿', en: 'Giraffe', icon: '🦒', biome: 'savanna', cost: 360, appeal: 24, food: 15, wiki: 'Giraffe', fact: '長頸鹿以長頸取食高處樹葉，喜歡開闊的草原。' },
  { id: 'zebra', name: '斑馬', en: 'Zebra', icon: '🦓', biome: 'savanna', cost: 220, appeal: 17, food: 10, wiki: 'Zebra', fact: '斑馬身上的條紋各不相同，常群居於非洲草原。' },
  { id: 'lion', name: '獅子', en: 'Lion', icon: '🦁', biome: 'savanna', cost: 480, appeal: 33, food: 20, wiki: 'Lion', fact: '獅子是群居的貓科動物，需要充足的空間與妥善照護。' },
  { id: 'elephant', name: '非洲象', en: 'African elephant', icon: '🐘', biome: 'savanna', cost: 650, appeal: 37, food: 28, wiki: 'African_elephant', fact: '非洲象有複雜的社群關係，也需要水源與寬廣的活動空間。' },
  { id: 'tiger', name: '老虎', en: 'Tiger', icon: '🐅', biome: 'forest', cost: 510, appeal: 34, food: 21, wiki: 'Tiger', fact: '老虎通常獨自活動，林地棲地應提供躲藏處。' },
  { id: 'panda', name: '大貓熊', en: 'Giant panda', icon: '🐼', biome: 'forest', cost: 620, appeal: 38, food: 25, wiki: 'Giant_panda', fact: '大貓熊主要食用竹子，保育工作也關注其棲地。' },
  { id: 'redpanda', name: '小貓熊', en: 'Red panda', icon: '🐾', biome: 'forest', cost: 340, appeal: 23, food: 13, wiki: 'Red_panda', fact: '小貓熊善於攀爬，適合有樹木與高處的平台。' },
  { id: 'orangutan', name: '紅毛猩猩', en: 'Orangutan', icon: '🦧', biome: 'forest', cost: 450, appeal: 29, food: 18, wiki: 'Orangutan', fact: '紅毛猩猩大部分時間在樹上活動，需要攀爬設施。' },
  { id: 'hippo', name: '河馬', en: 'Hippopotamus', icon: '🦛', biome: 'wetland', cost: 480, appeal: 30, food: 23, wiki: 'Hippopotamus', fact: '河馬白天常在水裡休息，棲地需要足夠水域。' },
  { id: 'flamingo', name: '紅鶴', en: 'Flamingo', icon: '🦩', biome: 'wetland', cost: 190, appeal: 17, food: 8, wiki: 'Flamingo', fact: '紅鶴會在淺水中覓食，群體活動十分醒目。' },
  { id: 'capybara', name: '水豚', en: 'Capybara', icon: '🦫', biome: 'wetland', cost: 200, appeal: 19, food: 9, wiki: 'Capybara', fact: '水豚是擅長游泳的大型齧齒類，喜歡靠近水邊。' },
  { id: 'penguin', name: '洪堡企鵝', en: 'Humboldt penguin', icon: '🐧', biome: 'coast', cost: 300, appeal: 25, food: 12, wiki: 'Humboldt_penguin', fact: '洪堡企鵝生活於南美洲沿岸，棲地需要水池與陰涼區。' },
  { id: 'seal', name: '海豹', en: 'Seal', icon: '🦭', biome: 'coast', cost: 390, appeal: 27, food: 16, wiki: 'Pinniped', fact: '海豹在水中靈活，也需要能上岸休息的地方。' },
  { id: 'meerkat', name: '狐獴', en: 'Meerkat', icon: '🐾', biome: 'savanna', cost: 180, appeal: 20, food: 8, wiki: 'Meerkat', fact: '狐獴會合作警戒，牠們喜歡能挖掘與躲藏的環境。' },
  { id: 'koala', name: '無尾熊', en: 'Koala', icon: '🐨', biome: 'forest', cost: 350, appeal: 26, food: 13, wiki: 'Koala', fact: '無尾熊主要吃尤加利葉，長時間在樹上休息。' },
  { id: 'snowleopard', name: '雪豹', en: 'Snow leopard', icon: '🐆', biome: 'mountain', cost: 530, appeal: 35, food: 20, wiki: 'Snow_leopard', fact: '雪豹適應寒冷高山，能在岩石間跳躍。' }
];

export const ZOO_BIOMES = [
  { id: 'savanna', name: '草原', icon: '🌾', cost: 150, color: '#c7a866' },
  { id: 'forest', name: '森林', icon: '🌳', cost: 170, color: '#648b68' },
  { id: 'wetland', name: '濕地', icon: '💧', cost: 180, color: '#5b9ba1' },
  { id: 'coast', name: '海岸', icon: '🌊', cost: 190, color: '#6faabd' },
  { id: 'mountain', name: '高山', icon: '⛰️', cost: 210, color: '#869097' }
];

export const ZOO_TOOLS = [
  { id: 'inspect', name: '查看／照護', icon: '🔎', cost: 0 },
  { id: 'path', name: '步道', icon: '🟨', cost: 25 },
  ...ZOO_BIOMES.map(biome => ({ id: `habitat:${biome.id}`, name: `${biome.name}棲地`, icon: biome.icon, cost: biome.cost, important: true })),
  { id: 'shop', name: '餐飲攤', icon: '🥤', cost: 230, important: true },
  { id: 'toilet', name: '洗手間', icon: '🚻', cost: 170, important: true },
  { id: 'education', name: '解說牌', icon: '📖', cost: 100 },
  { id: 'tree', name: '景觀樹', icon: '🌴', cost: 35 },
  { id: 'remove', name: '拆除', icon: '🧹', cost: 20, important: true }
];

export const zooAnimal = id => ZOO_ANIMALS.find(animal => animal.id === id);
export const zooBiome = id => ZOO_BIOMES.find(biome => biome.id === id);
export const zooTool = id => ZOO_TOOLS.find(tool => tool.id === id);
const indexOf = (x, y) => y * ZOO_WIDTH + x;
const neighbours = tile => [[tile.x - 1, tile.y], [tile.x + 1, tile.y], [tile.x, tile.y - 1], [tile.x, tile.y + 1]]
  .filter(([x, y]) => x >= 0 && x < ZOO_WIDTH && y >= 0 && y < ZOO_HEIGHT).map(([x, y]) => indexOf(x, y));

export function createZoo() {
  const tiles = Array.from({ length: ZOO_WIDTH * ZOO_HEIGHT }, (_, id) => ({ id, x: id % ZOO_WIDTH, y: Math.floor(id / ZOO_WIDTH), kind: null, biome: null, animalId: null, hunger: 100, clean: 100 }));
  for (let x = 0; x <= 3; x++) tiles[indexOf(x, 4)].kind = 'path';
  tiles[indexOf(3, 3)].kind = 'habitat'; tiles[indexOf(3, 3)].biome = 'savanna';
  return { tiles, name: '晨光動物園', money: 2500, day: 1, tickets: 12, keepers: 0, vets: 0, visitors: 0, reputation: 50, totalVisitors: 0, conservation: 0, correct: [], wrong: [], events: ['園區開幕！先在草原棲地領養動物。'], paused: false, lastReport: null, recordId: null, startedAt: null, attemptNumber: 0 };
}

// Expand existing 14 × 9 local saves in place; the player's animals and finances stay intact.
export function upgradeZooMap(saved) {
  if (!saved || !Array.isArray(saved.tiles)) return null;
  if (saved.tiles.length === ZOO_WIDTH * ZOO_HEIGHT) return saved;
  if (saved.tiles.length !== 14 * 9) return null;
  const expanded = createZoo();
  expanded.tiles = expanded.tiles.map(tile => {
    if (tile.x >= 14 || tile.y >= 9) return tile;
    const previous = saved.tiles[tile.y * 14 + tile.x];
    return previous ? { ...tile, ...previous, id: tile.id, x: tile.x, y: tile.y } : tile;
  });
  return { ...expanded, ...saved, tiles: expanded.tiles };
}

export function zooReachable(zoo) {
  const seen = new Set([indexOf(0, 4)]), queue = [indexOf(0, 4)];
  for (let p = 0; p < queue.length; p++) {
    for (const id of neighbours(zoo.tiles[queue[p]])) if (!seen.has(id) && zoo.tiles[id].kind === 'path') { seen.add(id); queue.push(id); }
  }
  return seen;
}

export function zooMetrics(zoo) {
  const paths = zooReachable(zoo);
  const reachable = tile => neighbours(tile).some(id => paths.has(id));
  const exhibits = zoo.tiles.filter(tile => tile.kind === 'habitat' && tile.animalId);
  const active = exhibits.filter(reachable);
  const shops = zoo.tiles.filter(tile => tile.kind === 'shop' && reachable(tile)).length;
  const toilets = zoo.tiles.filter(tile => tile.kind === 'toilet' && reachable(tile)).length;
  const education = zoo.tiles.filter(tile => tile.kind === 'education' && reachable(tile)).length;
  const welfare = exhibits.length ? Math.round(exhibits.reduce((sum, tile) => sum + (tile.hunger + tile.clean) / 2, 0) / exhibits.length) : 0;
  const diversity = new Set(active.map(tile => tile.animalId)).size;
  const appeal = active.reduce((sum, tile) => sum + (zooAnimal(tile.animalId)?.appeal || 0) * (tile.hunger + tile.clean) / 200, 0);
  return { paths, exhibits, active, shops, toilets, education, welfare, diversity, appeal, disconnected: exhibits.length - active.length };
}

export function zooBuild(zoo, id, toolId) {
  const tile = zoo.tiles[id], tool = zooTool(toolId);
  if (!tile || !tool) return { error: '無效的地塊或工具。' };
  if (toolId === 'inspect') return { error: '請先選擇一項建設工具。' };
  if (toolId === 'remove') {
    if (!tile.kind || (tile.x === 0 && tile.y === 4)) return { error: '這塊地不能拆除。' };
    if (zoo.money < tool.cost) return { error: '資金不足。' };
    zoo.money -= tool.cost;
    Object.assign(tile, { kind: null, biome: null, animalId: null, hunger: 100, clean: 100 });
    return { message: '已拆除地塊，動物送交保育中心。' };
  }
  if (tile.kind) return { error: '這塊地已有設施，請選擇空地。' };
  if (zoo.money < tool.cost) return { error: `需要 $${tool.cost}，目前資金不足。` };
  zoo.money -= tool.cost;
  tile.kind = toolId.startsWith('habitat:') ? 'habitat' : toolId;
  tile.biome = toolId.startsWith('habitat:') ? toolId.split(':')[1] : null;
  return { message: `完成${tool.name}，支出 $${tool.cost}。${tile.kind !== 'path' ? '請用步道連接入口。' : ''}` };
}

export function zooAdopt(zoo, id, animalId) {
  const tile = zoo.tiles[id], animal = zooAnimal(animalId);
  if (!animal || tile?.kind !== 'habitat' || tile.animalId) return { error: '請選擇空的棲地。' };
  if (tile.biome !== animal.biome) return { error: `${animal.name}需要${zooBiome(animal.biome).name}棲地。` };
  if (zoo.money < animal.cost) return { error: `領養${animal.name}需要 $${animal.cost}。` };
  zoo.money -= animal.cost; tile.animalId = animal.id; tile.hunger = 90; tile.clean = 90;
  return { message: `迎來${animal.name}！記得供應食物、清潔棲地。` };
}

export function zooCare(zoo, id, kind) {
  const tile = zoo.tiles[id], animal = zooAnimal(tile?.animalId);
  if (!animal) return { error: '請選擇有動物的棲地。' };
  const cost = kind === 'feed' ? animal.food : kind === 'clean' ? 12 : 35;
  if (zoo.money < cost) return { error: `照護需要 $${cost}。` };
  zoo.money -= cost;
  if (kind === 'feed') tile.hunger = Math.min(100, tile.hunger + 45);
  else if (kind === 'clean') tile.clean = Math.min(100, tile.clean + 50);
  else { tile.hunger = Math.min(100, tile.hunger + 25); tile.clean = Math.min(100, tile.clean + 25); }
  return { message: `${animal.name}${kind === 'feed' ? '已餵食' : kind === 'clean' ? '的棲地已清潔' : '已接受獸醫檢查'}，支出 $${cost}。` };
}

export function advanceZooDay(zoo) {
  const metrics = zooMetrics(zoo);
  const careCapacity = zoo.keepers * 3;
  [...metrics.exhibits].sort((a, b) => a.hunger + a.clean - b.hunger - b.clean).slice(0, careCapacity).forEach(tile => {
    tile.hunger = Math.min(100, tile.hunger + 35); tile.clean = Math.min(100, tile.clean + 30);
  });
  for (const tile of metrics.exhibits) { tile.hunger = Math.max(0, tile.hunger - 12); tile.clean = Math.max(0, tile.clean - 10); }
  [...metrics.exhibits].sort((a, b) => a.hunger + a.clean - b.hunger - b.clean).slice(0, zoo.vets * 2).forEach(tile => {
    tile.hunger = Math.min(100, tile.hunger + 12); tile.clean = Math.min(100, tile.clean + 12);
  });
  const current = zooMetrics(zoo);
  const visitors = current.active.length ? Math.max(0, Math.round((current.appeal * .9 + current.diversity * 6 + current.education * 3 + zoo.reputation / 8) * (zoo.tickets > 20 ? .7 : zoo.tickets < 8 ? 1.15 : 1) * (current.toilets ? 1 : .78))) : 0;
  const income = visitors * zoo.tickets + Math.round(visitors * current.shops * 2.5);
  const expense = current.exhibits.reduce((sum, tile) => sum + Math.ceil((zooAnimal(tile.animalId)?.food || 0) / 2), 0) + zoo.keepers * 65 + zoo.vets * 90 + zoo.tiles.filter(tile => ['shop', 'toilet'].includes(tile.kind)).length * 12;
  zoo.money += income - expense; zoo.visitors = visitors; zoo.totalVisitors += visitors;
  zoo.reputation = Math.max(0, Math.min(100, Math.round(zoo.reputation + (current.welfare - 65) / 16 + (current.education ? 1 : 0) - (current.disconnected ? 2 : 0))));
  zoo.conservation += Math.max(0, Math.floor(current.welfare / 25) + current.education);
  zoo.day += 1;
  zoo.lastReport = { income, expense, visitors, welfare: current.welfare };
  const event = `第 ${zoo.day - 1} 天：遊客 ${visitors} 人、收入 $${income}、支出 $${expense}，動物福祉 ${current.welfare}%。`;
  zoo.events.unshift(event); zoo.events = zoo.events.slice(0, 8);
  return zoo.lastReport;
}
