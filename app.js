// ====== Lumo — стабильная версия без «узких мест» ======
window.addEventListener('DOMContentLoaded', function () {
 // ---------- Утилиты ----------
 function $(s){ return document.querySelector(s); }
 function $all(s){ return Array.prototype.slice.call(document.querySelectorAll(s)); }
 var mem = {};
 function save(k,v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){ mem[k]=JSON.stringify(v); } }
 function load(k,f){
   try{ var s = localStorage.getItem(k); if(s!==null) return JSON.parse(s); }
   catch(e){ if(mem[k]) return JSON.parse(mem[k]); }
   return f;
 }
 function todayStr(){ return new Date().toISOString().slice(0,10); }
 function clamp01(x){ return Math.max(0, Math.min(1, x)); }

// Простая «тост»-функция (fallback к консоли вне Telegram)
function toast(msg){
  try{
    if (tg && tg.showPopup){ tg.showPopup({ title:'', message:String(msg), buttons:[{ type:'ok' }] }); }
    else { console.log('[Toast]', msg); }
  }catch(e){ console.log(String(msg)); }
}


 // ---------- Telegram (не ломаемся, если не в Телеге) ----------
 var tg = null;
 try {
   tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;
   if (tg) {
     tg.ready(); tg.expand();
     tg.MainButton.setParams({ text:'Сохранить прогресс', is_active:true, is_visible:true, color:'#EA9CAF' });
     tg.onEvent('mainButtonClicked', function(){ tg.sendData(buildReportText()); });
   } else {
     var dev = $('#dev-badge'); if (dev) dev.hidden = false;
   }
 } catch(e){ console.warn('TMA init:', e); }
 
 // ---------- База данных (SQLite в браузере через sql.js) ----------
 var db = null; var SQL = null; var dbReady=false;
 (function initSqlJs(){
   try{
     if (!window.initSqlJs){ console.warn('sql.js не загружен'); return; }
     window.initSqlJs({ locateFile: function(file){ return (window.SQLJS_CDN||'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/') + file; } })
       .then(function(sql){ SQL=sql; openOrCreateDb(); })
       .catch(function(e){ console.warn('sql.js init error', e); });
   }catch(e){ console.warn('sql.js load error', e); }
 })();
 function openOrCreateDb(){
   try{
     var bin = null; var raw = localStorage.getItem('lumo.sqlite');
     if (raw){ var u8 = new Uint8Array(raw.split(',').map(function(x){ return +x; })); bin = u8; }
     db = new SQL.Database(bin);
     ensureSchema(); dbReady=true;
     persistDb();
   }catch(e){ console.warn('DB open/create error', e); }
 }
 function persistDb(){ try{ if(!db) return; var data=db.export(); localStorage.setItem('lumo.sqlite', Array.from(data).join(',')); }catch(e){ console.warn('DB persist error', e); } }
 function exec(sql, params){ try{ var stmt=db.prepare(sql); stmt.bind(params||{}); var rows=[]; while(stmt.step()) rows.push(stmt.getAsObject()); stmt.free(); return rows; }catch(e){ console.warn('DB exec error', e, sql); return []; } }
 function run(sql, params){ try{ var stmt=db.prepare(sql); stmt.bind(params||{}); while(stmt.step()){} stmt.free(); persistDb(); return true; }catch(e){ console.warn('DB run error', e, sql); return false; } }
 
 function ensureSchema(){
   run('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, name TEXT, sex TEXT, age INTEGER, height REAL, weight REAL, activity REAL, goal TEXT, stepsGoal INTEGER, step INTEGER, lang TEXT)');
   run('CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, name_ru TEXT, name_en TEXT, cat TEXT, kcal100 REAL, p100 REAL, f100 REAL, c100 REAL)');
   run('CREATE TABLE IF NOT EXISTS product_presets (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id TEXT, grams INTEGER)');
   run('CREATE TABLE IF NOT EXISTS favorites (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id TEXT)');
   run('CREATE TABLE IF NOT EXISTS recents (id INTEGER PRIMARY KEY AUTOINCREMENT, product_id TEXT, ts INTEGER)');
   run('CREATE TABLE IF NOT EXISTS articles (id TEXT PRIMARY KEY, title TEXT, body TEXT, cat TEXT)');
   seedIfEmpty();
 }
 function tableEmpty(name){ var rows=exec('SELECT COUNT(1) as n FROM '+name); return !rows[0] || !rows[0].n; }
 function seedIfEmpty(){
   if (tableEmpty('products')){
     var ps = [
       {id:'oat_flakes', ru:'Овсяные хлопья', en:'Oats', cat:'cereals', k:366,p:13,f:7,c:62, presets:[30,50,80]},
       {id:'egg', ru:'Яйцо куриное', en:'Egg', cat:'dairy', k:157,p:13,f:11,c:1, presets:[50,100]},
       {id:'chicken_breast', ru:'Куриная грудка', en:'Chicken breast', cat:'meat', k:165,p:31,f:3.6,c:0, presets:[100,150,200]}
     ];
     ps.forEach(function(p){ run('INSERT OR REPLACE INTO products (id,name_ru,name_en,cat,kcal100,p100,f100,c100) VALUES (:id,:ru,:en,:cat,:k,:p,:f,:c)', p); (p.presets||[]).forEach(function(g){ run('INSERT INTO product_presets (product_id,grams) VALUES (:id,:g)', {':id':p.id, ':g':g}); }); });
   }
   if (tableEmpty('articles')){
     run('INSERT OR REPLACE INTO articles (id,title,body,cat) VALUES ("water_basics","Вода — основа здоровья","Правильный питьевой режим помогает...","water")');
     run('INSERT OR REPLACE INTO articles (id,title,body,cat) VALUES ("protein_basics","Белки — строительный материал","Белки нужны для всего...","protein")');
   }
 }
 
 function dbFetchProducts(query, cat, mode){
   if(!dbReady) return null;
   if (mode==='favs'){
     return exec('SELECT p.* FROM favorites f JOIN products p ON p.id=f.product_id');
   }
   if (mode==='recent'){
     return exec('SELECT p.* FROM recents r JOIN products p ON p.id=r.product_id ORDER BY r.ts DESC');
   }
   var q = (query||'').trim(); var args={}; var sql='SELECT * FROM products WHERE 1=1';
   if (cat && cat!=='all'){ sql+=' AND cat=:cat'; args[':cat']=cat; }
   if (q){ sql+=' AND (LOWER(REPLACE(name_ru, "ё","е")) LIKE :q OR LOWER(name_en) LIKE :q)'; args[':q']='%'+q.toLowerCase().replace(/ё/g,'е')+'%'; }
   sql+=' LIMIT 300';
   return exec(sql, args);
 }
 function dbFetchPresets(prodId){ if(!dbReady) return []; return exec('SELECT grams FROM product_presets WHERE product_id=:id', {':id':prodId}).map(function(r){ return r.grams|0; }); }
 function dbToggleFav(prodId){ if(!dbReady) return; var r=exec('SELECT 1 FROM favorites WHERE product_id=:id LIMIT 1', {':id':prodId}); if(r.length){ run('DELETE FROM favorites WHERE product_id=:id', {':id':prodId}); } else { run('INSERT INTO favorites (product_id) VALUES (:id)', {':id':prodId}); } }
 function dbIsFav(prodId){ if(!dbReady) return false; var r=exec('SELECT 1 FROM favorites WHERE product_id=:id LIMIT 1', {':id':prodId}); return r.length>0; }
 function dbPushRecent(prodId){ if(!dbReady) return; run('INSERT INTO recents (product_id, ts) VALUES (:id, :ts)', {':id':prodId, ':ts':Date.now()}); }
 
 // ---------- Состояние ----------
 var state = {
   profile: load('lumo.profile', {
     name:'', sex:'female', age:30, height:170, weight:65,
     activity:1.55, goal:'balance',
     stepsGoal:7000, step:250, lang:'ru'
   }),
   water: load('lumo.water', { date:todayStr(), ml:0 }),
   steps: load('lumo.steps', { date:todayStr(), steps:0 }),
   sleep: load('lumo.sleep', { date:todayStr(), hours:0 }),
   meals: load('lumo.meals', {
     date:todayStr(),
     breakfast:false, lunch:false, dinner:false, snack:false,
     m:{ breakfast:{p:0,f:0,c:0}, lunch:{p:0,f:0,c:0}, dinner:{p:0,f:0,c:0}, snack:{p:0,f:0,c:0} }
   }),
   tab: load('lumo.tab', 'dashboard'),
   tips:[
     'Начни утро со стакана воды — это помогает контролировать аппетит.',
     'Цельнозерновые и фрукты дают клетчатку и энергию.',
     'Если есть отёки — проверь количество соли в рационе.'
   ],
   lastMood:{ water:'', cal:'', steps:'' }
 };

// Трекер привычек — состояние
var habitsState = load('lumo.habits', {
  ym: (function(){ var d=new Date(); return d.getFullYear()*100 + (d.getMonth()+1); })(),
  items: [ { id:1, title:'', days:{} }, { id:2, title:'', days:{} }, { id:3, title:'', days:{} } ]
});
var habitsSeq = load('lumo.habits.seq', 3);

 // Ежедневный сброс
 (function ensureToday(){
   var d = todayStr();
   if(state.water.date!==d){ state.water={date:d, ml:0}; save('lumo.water',state.water); }
   if(state.steps.date!==d){ state.steps={date:d, steps:0}; save('lumo.steps',state.steps); }
   if(state.sleep.date!==d){ state.sleep={date:d, hours:0}; save('lumo.sleep',state.sleep); }
   if(state.meals.date!==d){
     state.meals={ date:d, breakfast:false, lunch:false, dinner:false, snack:false,
       m:{ breakfast:{p:0,f:0,c:0}, lunch:{p:0,f:0,c:0}, dinner:{p:0,f:0,c:0}, snack:{p:0,f:0,c:0} } };
     save('lumo.meals',state.meals);
   }
 })();


 // ---------- Формулы ----------
 var goalFactorMap = { loss:-0.15, balance:0, gain:0.10 };
 function bmr(profile){
   var s = profile.sex === 'male' ? 5 : -161;
   return 10*(+profile.weight||0) + 6.25*(+profile.height||0) - 5*(+profile.age||0) + s;
 }
 function calorieTarget(profile){
   var w=+profile.weight||0, h=+profile.height||0, a=+profile.age||0;
   if (!w||!h||!a) return 0;
   var BMR  = bmr(profile);
   var TDEE = BMR * (+profile.activity || 1.55);
   var gf   = (goalFactorMap[profile.goal]!==undefined) ? goalFactorMap[profile.goal] : 0;
   return Math.max(0, Math.round(TDEE * (1 + gf)));
 }
 function proteinPerKgAuto(profile){
   var w=+profile.weight||0, h=+profile.height||0; if(!w||!h) return 1.7;
   var bmi = w / Math.pow(h/100,2);
   var base = profile.goal==='loss'?1.8 : (profile.goal==='gain'?1.9:1.7);
   if (bmi < 18.5) base += 0.1; else if (bmi >= 25 && bmi < 30) base -= 0.1; else if (bmi >= 30) base -= 0.2;
   base = Math.max(1.5, Math.min(2.0, Math.round(base*10)/10));
   return base;
 }
 function macroGoals(profile){
   var cal = calorieTarget(profile);
   var ppk = proteinPerKgAuto(profile);
   var P = Math.round((+profile.weight||0) * ppk);
   var F = Math.round((+profile.weight||0) * 1.0);
   var C = Math.max(0, Math.round((cal - P*4 - F*9)/4));
   return { cal:cal, P:P, F:F, C:C, pPerKg:ppk };
 }
 function mealsTotals(){
   var m = state.meals.m;
   var P = (m.breakfast.p + m.lunch.p + m.dinner.p + m.snack.p) | 0;
   var F = (m.breakfast.f + m.lunch.f + m.dinner.f + m.snack.f) | 0;
   var C = (m.breakfast.c + m.lunch.c + m.dinner.c + m.snack.c) | 0;
   var K = P*4 + F*9 + C*4;
   return {P:P,F:F,C:C,K:K};
 }
 function waterGoal(profile){
   var act = +profile.activity || 1.55;
   var mult = 1.2;
   if (act <= 1.2) mult=1.0; else if (act <= 1.375) mult=1.1; else if (act <= 1.55) mult=1.2; else if (act <= 1.725) mult=1.3; else mult=1.4;
   return Math.round((+profile.weight||0) * 35 * mult);
 }


 // ---------- DOM ----------
 // Профиль
 var nameInput=$('#nameInput'), sexSelect=$('#sexSelect'), ageInput=$('#ageInput');
 var heightInput=$('#heightInput'), weightInput=$('#weightInput');
 var activitySelect=$('#activitySelect'), goalSelect=$('#goalSelect');
 var stepsGoalInput=$('#stepsGoalInput'), stepInput=$('#stepInput'), langSelect=$('#langSelect');
 var autoCal=$('#autoCal'), autoP=$('#autoP'), autoF=$('#autoF'), autoC=$('#autoC');
 // Заполняем
 if(nameInput) nameInput.value = state.profile.name||'';
 if(sexSelect) sexSelect.value = state.profile.sex||'female';
 if(ageInput) ageInput.value = state.profile.age||30;
 if(heightInput) heightInput.value = state.profile.height||170;
 if(weightInput) weightInput.value = state.profile.weight||65;
 if(activitySelect) activitySelect.value = String(state.profile.activity||1.55);
 if(goalSelect) goalSelect.value = state.profile.goal||'balance';
 if(stepsGoalInput) stepsGoalInput.value = state.profile.stepsGoal||7000;
 if(stepInput) stepInput.value = state.profile.step||250;
 if(langSelect) langSelect.value = state.profile.lang||'ru';


 // Дашборд
 var waterCard=$('#waterCard'), waterRing=$('#waterRing'), waterText=$('#waterText'), waterSub=$('#waterSub'), waterMood=$('#waterMood');
 var calCard=$('#calCard'), calRing=$('#calRing'), calText=$('#calText'), calSub=$('#calSub'), calMood=$('#calMood');
 var stepsCard=$('#stepsCard'), stepsRing=$('#stepsRing'), stepsText=$('#stepsText'), stepsSub=$('#stepsSub'), stepsMood=$('#stepsMood');
 var addGlassBtn=$('#addGlassBtn'), stepMl=$('#stepMl');
 var stepsInput=$('#stepsInput'), saveStepsBtn=$('#saveStepsBtn');
 var sleepInput=$('#sleepInput'), saveSleepBtn=$('#saveSleepBtn');
 var bunny=$('#bunny'), tipText=$('#tipText');

// Habits — DOM
var habMonthTitle=$('#habMonthTitle'), habPrev=$('#habPrev'), habNext=$('#habNext');
var habitsList=$('#habitsList');
var addHabitBtn=$('#addHabitBtn');
var confettiLayer=$('#confettiLayer');

// Продукты — DOM
var prodQuery=$('#prodQuery'), prodClear=$('#prodClear');
var prodCats=$('#prodCats');
var prodList=$('#prodList');
var prodCard=$('#prodCard');


 // Питание
 var bunnyMeals=$('#bunnyMeals');
 var mealButtons=[ {id:'btnBreakfast',key:'breakfast'}, {id:'btnLunch',key:'lunch'}, {id:'btnDinner',key:'dinner'}, {id:'btnSnack',key:'snack'} ];
 mealButtons.forEach(function(x){ var el=document.getElementById(x.id); if(el){ el.dataset.label=el.dataset.label||el.textContent.trim(); }});
 mealButtons.forEach(function(x){
   var el=document.getElementById(x.id); if(!el) return;
   el.addEventListener('click', function(){
     state.meals[x.key] = !state.meals[x.key];
     save('lumo.meals', state.meals);
     renderMeals(x.key); renderDashboard();
   });
 });
 var macroFields = {
   breakfast:{ p:$('#bfP'), f:$('#bfF'), c:$('#bfC'), k:$('#bfK') },
   lunch:{     p:$('#luP'), f:$('#luF'), c:$('#luC'), k:$('#luK') },
   dinner:{    p:$('#diP'), f:$('#diF'), c:$('#diC'), k:$('#diK') },
   snack:{     p:$('#snP'), f:$('#snF'), c:$('#snC'), k:$('#snK') }
 };


 // Слушатели — вода/шаги/сон
 var customWaterInput=$('#customWaterInput'), addCustomWaterBtn=$('#addCustomWaterBtn');
 if(addGlassBtn) addGlassBtn.addEventListener('click', function(){ addWater(state.profile.step||250); });
 if(addCustomWaterBtn) addCustomWaterBtn.addEventListener('click', function(){ 
   var ml = Math.max(0, +customWaterInput.value || 0);
   if(ml > 0) {
     addWater(ml);
     customWaterInput.value = '';
   }
 });
 if(customWaterInput) customWaterInput.addEventListener('keypress', function(e){
   if(e.key === 'Enter') {
     var ml = Math.max(0, +customWaterInput.value || 0);
     if(ml > 0) {
       addWater(ml);
       customWaterInput.value = '';
     }
   }
 });
 if(saveStepsBtn) saveStepsBtn.addEventListener('click', function(){ addSteps(+stepsInput.value||0); if(stepsInput) stepsInput.value=''; });
 if(stepsInput) stepsInput.addEventListener('change', function(){ addSteps(+stepsInput.value||0); stepsInput.value=''; });
 if(saveSleepBtn) saveSleepBtn.addEventListener('click', function(){ saveSleep(+sleepInput.value||0); });
 if(sleepInput) sleepInput.addEventListener('change', function(){ saveSleep(+sleepInput.value||0); });

// Слушатели — привычки
if(habPrev) habPrev.addEventListener('click', function(){ shiftHabMonth(-1); });
if(habNext) habNext.addEventListener('click', function(){ shiftHabMonth(1); });
if(addHabitBtn) addHabitBtn.addEventListener('click', function(){ addHabit(); });

 // Слушатели — КБЖУ
 Object.keys(macroFields).forEach(function(meal){
   ['p','f','c'].forEach(function(f){
     var el = macroFields[meal][f]; if(!el) return;
     el.addEventListener('input', function(){
       var val = Math.max(0, +el.value || 0);
       state.meals.m[meal][f] = val;
       var m = state.meals.m[meal];
       if ((m.p+m.f+m.c) > 0) state.meals[meal] = true; // авто-отметка
       save('lumo.meals', state.meals);
       updateMealKcal(meal); renderTotals(); renderDashboard();
     });
   });
 });
 $all('.meal-block [data-clear]').forEach(function(btn){
   btn.addEventListener('click', function(){
     var meal = btn.getAttribute('data-clear');
     if(!meal || !state.meals.m[meal]) return;
     state.meals.m[meal] = {p:0,f:0,c:0}; state.meals[meal]=false;
     save('lumo.meals', state.meals);
     var ul=document.getElementById('list-'+meal); if(ul){ ul.innerHTML=''; }
     fillMacroInputs(); renderTotals(); renderDashboard();
   });
 });


 // Профиль — live-preview + save
 function previewProfile(){
   var tmp = {
     sex: (sexSelect && sexSelect.value) || 'female',
     weight: +(weightInput && weightInput.value) || 0,
     height: +(heightInput && heightInput.value) || 0,
     age: +(ageInput && ageInput.value) || 0,
     activity: +(activitySelect && activitySelect.value) || 1.55,
     goal: (goalSelect && goalSelect.value) || 'balance'
   };
   var g = macroGoals(tmp);
   if(autoCal) autoCal.value = g.cal ? (g.cal + ' ккал/день') : '—';
   if(autoP)   autoP.value   = g.P + ' г (≈ ' + (g.P*4) + ' ккал)';
   if(autoF)   autoF.value   = g.F + ' г (≈ ' + (g.F*9) + ' ккал)';
   if(autoC)   autoC.value   = g.C + ' г (≈ ' + (g.C*4) + ' ккал)';
   if(stepMl)  stepMl.textContent = state.profile.step||250;
 }
 var saveProfileBtn=$('#saveProfileBtn');
 if(saveProfileBtn) saveProfileBtn.addEventListener('click', function(){
   state.profile.name     = (nameInput && nameInput.value ? nameInput.value.trim() : '');
   state.profile.sex      = (sexSelect && sexSelect.value) || 'female';
   state.profile.age      = +(ageInput && ageInput.value) || 30;
   state.profile.height   = +(heightInput && heightInput.value) || 170;
   state.profile.weight   = +(weightInput && weightInput.value) || 65;
   state.profile.activity = +(activitySelect && activitySelect.value) || 1.55;
   state.profile.goal     = (goalSelect && goalSelect.value) || 'balance';
   state.profile.stepsGoal= Math.max(1000, +(stepsGoalInput && stepsGoalInput.value) || 7000);
   state.profile.step     = Math.max(50, +(stepInput && stepInput.value) || 250);
   state.profile.lang     = (langSelect && langSelect.value) || 'ru';
   save('lumo.profile', state.profile);
   toast('Профиль сохранён');
   renderAll();
 });
 [sexSelect,ageInput,heightInput,weightInput,activitySelect,goalSelect].forEach(function(el){
   if (!el) return;
   el.addEventListener('input', function(){ previewProfile(); renderAll(); });
   el.addEventListener('change', function(){ previewProfile(); renderAll(); });
 });


 // ---------- Рендеры ----------
 function strokeProgress(circleEl, value){
   if (!circleEl) return;
   var r=70, c=2*Math.PI*r; var v=clamp01(value);
   circleEl.setAttribute('stroke-dasharray', (v*c) + ' ' + (c - v*c));
 }
 function moodEmoji(kind, value, goal){
   if (kind==='cal'){
     if (goal<=0) return '🙂';
     var low = goal*0.9, high = goal*1.1;
     if (value > high) return '🥺';
     if (value >= low && value <= high) return '🤩';
     return '🙂';
   } else {
     if (goal<=0) return '🙂';
     var p = value/goal;
     if (p>=1) return '🤩';
     if (p>=0.6) return '🙂';
     return '🥺';
   }
 }
 function pulseIfHappy(cardEl, prevMood, newMood){
   if (!cardEl) return;
   if (prevMood!=='🤩' && newMood==='🤩'){
     cardEl.classList.add('pulse');
     setTimeout(function(){ cardEl.classList.remove('pulse'); }, 650);
   }
 }
 function setBunny(el, mood){
   if (!el) return;
   var faces={ smile:'🐰', shine:'✨🐰✨', run:'🏃‍♀️🐰', trophy:'🏆🐰', chef:'🍳🐰', soup:'🍲🐰', tea:'🫖🐰' };
   el.textContent = faces[mood] || '🐰';
 }


 function renderDashboard(){
   var g = macroGoals(state.profile);
   var t = mealsTotals();
   var wGoal = waterGoal(state.profile);
   var sGoal = state.profile.stepsGoal || 7000;


   if(stepMl) stepMl.textContent = state.profile.step||250;


   // Вода
   var wProg = wGoal ? state.water.ml / wGoal : 0;
   strokeProgress(waterRing, Math.min(1,wProg));
   if (waterText) waterText.textContent = (wGoal ? Math.round((state.water.ml/wGoal)*100) : 0) + '%';
   if (waterSub)  waterSub.textContent  = state.water.ml + ' / ' + wGoal + ' мл';
   var wMood = moodEmoji('water', state.water.ml, wGoal);
   if (waterMood) waterMood.textContent = wMood; pulseIfHappy(waterCard, state.lastMood.water, wMood); state.lastMood.water=wMood;


   // Калории
   var cProg = g.cal ? t.K / g.cal : 0;
   strokeProgress(calRing, Math.min(1,cProg));
   if (calText) calText.textContent = (g.cal ? Math.round((t.K/g.cal)*100) : 0) + '%';
   if (calSub)  calSub.textContent  = t.K + ' / ' + g.cal + ' ккал';
   var cMood = moodEmoji('cal', t.K, g.cal);
   if (calMood) calMood.textContent = cMood; pulseIfHappy(calCard, state.lastMood.cal, cMood); state.lastMood.cal=cMood;


   // Шаги
   var sProg = sGoal ? state.steps.steps / sGoal : 0;
   strokeProgress(stepsRing, Math.min(1,sProg));
   if (stepsText) stepsText.textContent = (sGoal ? Math.round((state.steps.steps/sGoal)*100) : 0) + '%';
   if (stepsSub)  stepsSub.textContent  = state.steps.steps + ' / ' + sGoal + ' шагов';
   // не заполняем поле ввода шагов автоматически, оно служит для добавления инкремента
   var sMood = moodEmoji('steps', state.steps.steps, sGoal);
   if (stepsMood) stepsMood.textContent = sMood; pulseIfHappy(stepsCard, state.lastMood.steps, sMood); state.lastMood.steps=sMood;


   // Кролик
   if (wProg>=1 && sProg>=1 && cMood==='🤩') setBunny(bunny, 'trophy');
   else if (wProg>=1) setBunny(bunny, 'shine');
   else if (sProg>=1) setBunny(bunny, 'run');
   else setBunny(bunny, 'smile');


   // Сон и совет
   if (sleepInput) sleepInput.value = state.sleep.hours || '';
   if (tipText){
     var idx=(new Date().getFullYear()*1000 + new Date().getMonth()*50 + new Date().getDate()) % state.tips.length;
     tipText.textContent = state.tips[idx];
   }


   if (tg) tg.MainButton.setParams({ text:'Сохранить прогресс', is_active:true, is_visible:true, color:'#EA9CAF' });


   snapshotToday();
 }


 function renderMeals(lastChanged){
   mealButtons.forEach(function(x){
     var el=document.getElementById(x.id); if(!el) return;
     var base = el.dataset.label || el.textContent.trim();
     el.textContent = base + (state.meals[x.key] ? ' ✅' : '');
   });
   if (lastChanged){
     var map={ breakfast:'chef', lunch:'soup', dinner:'tea', snack:'smile' };
     setBunny(bunnyMeals, map[lastChanged] || 'smile');
     setTimeout(function(){ setBunny(bunnyMeals,'smile'); },1200);
   }
   fillMacroInputs(); renderTotals();
 }


 function fillMacroInputs(){
   Object.keys(macroFields).forEach(function(meal){
     var refs = macroFields[meal], m = state.meals.m[meal];
     if (refs.p) refs.p.value = m.p || 0;
     if (refs.f) refs.f.value = m.f || 0;
     if (refs.c) refs.c.value = m.c || 0;
     updateMealKcal(meal);
   });
 }
 function updateMealKcal(meal){
   var m = state.meals.m[meal];
   var kcal = Math.round(m.p*4 + m.f*9 + m.c*4);
   var refs = macroFields[meal];
   if (refs.k) refs.k.value = kcal;
 }
 function renderTotals(){
   var t = mealsTotals();
   var g = macroGoals(state.profile);
   var totalsLine = $('#totalsLine');
   if (totalsLine) totalsLine.textContent = t.K + ' ккал · Б ' + t.P + ' / Ж ' + t.F + ' / У ' + t.C;


   function setBar(fillSel, subSel, val, goal, unit){
     var fill=$(fillSel), sub=$(subSel);
     if (fill) fill.style.width = (clamp01(val / (goal||1))*100) + '%';
     if (sub)  sub.textContent = val + ' / ' + goal + ' ' + unit;
   }
   setBar('#barCal','#barCalSub',t.K,g.cal,'ккал');
   setBar('#barP','#barPSub',t.P,g.P,'г');
   setBar('#barF','#barFSub',t.F,g.F,'г');
   setBar('#barC','#barCSub',t.C,g.C,'г');
 }


 function renderHabits(){
   if(!habitsList || !habMonthTitle) return;
   var y = Math.floor(habitsState.ym/100), m=(habitsState.ym%100)-1;
   var first=new Date(y,m,1), lastDay=new Date(y,m+1,0).getDate();
   habMonthTitle.textContent = first.toLocaleString('ru-RU', {month:'long', year:'numeric'});
   habitsList.innerHTML='';
   (habitsState.items||[]).forEach(function(habit){
     var row=document.createElement('div'); row.className='habit-row'; row.setAttribute('data-id', habit.id);
     var titleWrap=document.createElement('div'); titleWrap.className='habit-title';
     var input=document.createElement('input'); input.placeholder='Например: Пить 2 л воды'; input.value=habit.title||'';
     input.addEventListener('input', function(){ habit.title=input.value; save('lumo.habits', habitsState); });
     titleWrap.appendChild(input);
 
     var days=document.createElement('div'); days.className='habit-days';
     var dayMap = ensureHabitMonth(habit);
     var doneCount=0, skipCount=0;
     for(var d=1; d<=lastDay; d++){
       (function(day){
         var btn=document.createElement('div'); btn.className='day-dot day-empty'; btn.title=String(day);
         var st = dayMap[day] || 0; // 0 empty, 1 done, -1 skip
         applyDayClass(btn, st); btn.textContent=String(day);
         btn.addEventListener('click', function(){
           var cur=dayMap[day]||0; var next = (cur===0?1:(cur===1?-1:0));
           dayMap[day]=next; save('lumo.habits', habitsState);
           applyDayClass(btn, next);
           if (next===1){ triggerConfetti(); if (computeStreak(dayMap) >= 7) triggerBigStreak(); }
         });
         days.appendChild(btn);
         if (st===1) doneCount++; else if (st===-1) skipCount++;
       })(d);
     }
 
     var del=document.createElement('div'); del.className='habit-delete';
     var delBtn=document.createElement('button'); delBtn.className='btn'; delBtn.textContent='🗑';
     delBtn.addEventListener('click', function(){ deleteHabit(habit.id); });
     del.appendChild(delBtn);
 
     row.appendChild(titleWrap); row.appendChild(days); row.appendChild(del);
     // Extra: progress + stats mini graph
     var extra=document.createElement('div'); extra.className='habit-extra';
     var prog=document.createElement('div'); prog.className='habit-progress';
     var bar=document.createElement('div'); bar.className='hbar'; var fill=document.createElement('div'); fill.className='hbar-fill';
     var percent = lastDay ? Math.round((doneCount/lastDay)*100) : 0; var label=document.createElement('div');
     label.className='muted small'; label.textContent = doneCount+'/'+lastDay+' выполнено ('+percent+'%)';
     fill.style.width = percent+'%'; bar.appendChild(fill); prog.appendChild(bar); prog.appendChild(label);
 
     var stats=document.createElement('div'); stats.className='habit-stats';
     for(var d2=1; d2<=lastDay; d2++){
       var st2 = dayMap[d2] || 0; var sb=document.createElement('div'); sb.className='stat-bar ' + (st2===1?'stat-ok':(st2===-1?'stat-skip':'stat-empty')); stats.appendChild(sb);
     }
     extra.appendChild(prog); extra.appendChild(stats);
     extra.style.gridColumn='1 / -1';
     row.appendChild(extra);
     habitsList.appendChild(row);
   });
 }
 
 function ensureHabitMonth(habit){
   var ym = habitsState.ym;
   if(!habit.days || typeof habit.days!=='object') habit.days={};
   var keys=Object.keys(habit.days||{});
   // Миграция: если в days лежат дни 1..31 (наследие), оборачиваем в текущий ym
   if(keys.length && keys.every(function(k){ return /^\d+$/.test(k) && +k>=1 && +k<=31; })){
     var legacy = habit.days; habit.days = {}; habit.days[ym] = legacy;
     save('lumo.habits', habitsState);
   }
   if(!habit.days[ym]) habit.days[ym] = {};
   return habit.days[ym];
 }

 function applyDayClass(el, st){
   el.classList.remove('day-empty','day-done','day-skip');
   if (st===1) el.classList.add('day-done'); else if (st===-1) el.classList.add('day-skip'); else el.classList.add('day-empty');
 }

 function computeStreak(dayMap){
   // текущая серия завершений подряд до сегодняшнего дня месяца
   var d = new Date(); var today = d.getDate(); var streak=0;
   for(var i=today; i>=1; i--){ if((dayMap[i]||0)===1) streak++; else break; }
   return streak;
 }

 function triggerBigStreak(){
   if(!confettiLayer) return;
   var count=40; var w=window.innerWidth, h=window.innerHeight;
   for(var i=0;i<count;i++){
     (function(){
       var span=document.createElement('div'); span.style.position='absolute'; span.style.left=(Math.random()*w)+'px';
       span.style.top='-20px'; span.style.fontSize=(18+Math.random()*12)+'px'; span.textContent = Math.random()<0.5?'🎉':'🐰';
       confettiLayer.appendChild(span);
       var dur=1200+Math.random()*1000; var start=performance.now();
       function step(t){
         var p=(t-start)/dur; if(p>=1){ confettiLayer.removeChild(span); return; }
         span.style.transform='translateY('+(p*(h+60))+'px) rotate('+(p*720)+'deg)';
         requestAnimationFrame(step);
       }
       requestAnimationFrame(step);
     })();
   }
 }

 function shiftHabMonth(delta){
   var y = Math.floor(habitsState.ym/100), m=(habitsState.ym%100)-1; m += delta;
   if (m<0){ m=11; y--; } else if (m>11){ m=0; y++; }
   habitsState.ym = y*100 + (m+1);
   save('lumo.habits', habitsState);
   renderHabits();
 }

 function addHabit(){
   habitsSeq = (habitsSeq||0) + 1; save('lumo.habits.seq', habitsSeq);
   habitsState.items.push({ id:habitsSeq, title:'', days:{} });
   save('lumo.habits', habitsState);
   renderHabits();
 }
 function deleteHabit(id){
   habitsState.items = (habitsState.items||[]).filter(function(h){ return h.id!==id; });
   save('lumo.habits', habitsState);
   renderHabits();
 }

 function triggerConfetti(){
   if(!confettiLayer) return;
   var count=20; var w=window.innerWidth, h=window.innerHeight;
   for(var i=0;i<count;i++){
     (function(){
       var span=document.createElement('div'); span.style.position='absolute'; span.style.left=(Math.random()*w)+'px';
       span.style.top='-20px'; span.style.fontSize=(14+Math.random()*10)+'px'; span.textContent='🐰';
       confettiLayer.appendChild(span);
       var dur=1200+Math.random()*800; var start=performance.now();
       function step(t){
         var p=(t-start)/dur; if(p>=1){ confettiLayer.removeChild(span); return; }
         var x=parseFloat(span.style.left)||0; span.style.transform='translateY('+(p*(h+40))+'px) rotate('+(p*720)+'deg)';
         requestAnimationFrame(step);
       }
       requestAnimationFrame(step);
     })();
   }
 }

 // ---------- Календарь ----------
 function snapshotToday(){
   var diary = load('lumo.diary', {});
   var d = todayStr();
   var g = macroGoals(state.profile);
   var t = mealsTotals();
   var prev = diary[d] || {};
   diary[d] = {
     waterMl: state.water.ml,
     waterGoal: waterGoal(state.profile),
     steps: state.steps.steps,
     stepsGoal: state.profile.stepsGoal || 7000,
     sleep: state.sleep.hours,
     kcal: t.K,
     kcalGoal: g.cal,
     P: t.P, F: t.F, C: t.C,
     note: prev.note || '',
     hasAny: (state.water.ml>0) || (state.steps.steps>0) || (state.sleep.hours>0) || (t.K>0)
   };
   save('lumo.diary', diary);
 }
 function dayStatus(dayObj){
   if (!dayObj || !dayObj.hasAny) return 'bad';
   var waterOk = dayObj.waterMl >= dayObj.waterGoal;
   var stepsOk = dayObj.steps   >= dayObj.stepsGoal;
   var sleepOk = dayObj.sleep   >= 8;
   var goals = (waterOk?1:0) + (stepsOk?1:0) + (sleepOk?1:0);
   return goals >= 2 ? 'ok' : 'mid';
 }
 function countStreaks(){
   var diary=load('lumo.diary', {}), d=new Date(), diaryStreak=0, goalStreak=0;
   for(;;){
     var key=d.toISOString().slice(0,10), obj=diary[key];
     if (obj && obj.hasAny) diaryStreak++; else break;
     var st=dayStatus(obj); if (st==='ok') goalStreak++; else break;
     d.setDate(d.getDate()-1);
   }
   return { diaryStreak:diaryStreak, goalStreak:goalStreak };
 }
 function renderCalendar(){
   var grid=$('#calendarGrid'), title=$('#monthTitle'); if(!grid||!title) return;
   var now=new Date(), y=now.getFullYear(), m=now.getMonth();
   var first=new Date(y,m,1), lastDay=new Date(y,m+1,0).getDate(), firstWeekday=(first.getDay()+6)%7;
   title.textContent = first.toLocaleString('ru-RU', {month:'long', year:'numeric'});
   grid.innerHTML='';
   ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].forEach(function(w){
     var h=document.createElement('div'); h.className='cal-cell'; h.style.background='#f7f7f7'; h.style.fontWeight='700'; h.textContent=w; grid.appendChild(h);
   });
   for(var i=0;i<firstWeekday;i++){ var c=document.createElement('div'); c.className='cal-cell'; c.style.visibility='hidden'; grid.appendChild(c); }
   var diary=load('lumo.diary', {});
   for(var d=1; d<=lastDay; d++){
     var key=y+'-'+String(m+1).padStart(2,'0')+'-'+String(d).padStart(2,'0');
     var obj=diary[key]; var st=dayStatus(obj);
     var cell=document.createElement('div'); cell.className='cal-cell '+st;
     var mark = st==='ok'?'✓' : (st==='mid'?'•':'✗');
     cell.innerHTML='<div class="d">'+d+'</div><div style="font-size:22px">'+mark+'</div>';
     grid.appendChild(cell);
   }
   var s=countStreaks();
   var sd=$('#streakDiary'), sg=$('#streakGoals');
   if(sd) sd.textContent = s.diaryStreak;
   if(sg) sg.textContent = s.goalStreak;
 }


 // ---------- Действия ----------
 function addWater(ml){ state.water.ml += ml; save('lumo.water', state.water); renderDashboard(); }
 function saveSteps(val){ state.steps.steps = Math.max(0, Math.round(val||0)); save('lumo.steps', state.steps); renderDashboard(); }
 function addSteps(delta){ delta=Math.round(delta||0); if(delta<=0) return; state.steps.steps = Math.max(0, (state.steps.steps||0) + delta); save('lumo.steps', state.steps); renderDashboard(); }
 function saveSleep(val){ state.sleep.hours = Math.max(0, +val||0); save('lumo.sleep', state.sleep); renderDashboard(); }
 function buildReportText(){
   var g=macroGoals(state.profile), t=mealsTotals();
   return [
     '🐰 Lumo — отчёт за сегодня',
     'Вода: '+state.water.ml+' / '+waterGoal(state.profile)+' мл',
     'Шаги: '+state.steps.steps+' / '+(state.profile.stepsGoal||7000),
     'Сон: '+state.sleep.hours+' ч (цель 8 ч)',
     'Калории: '+t.K+' / '+g.cal+' ккал',
     'Б: '+t.P+'/'+g.P+' г · Ж: '+t.F+'/'+g.F+' г · У: '+t.C+'/'+g.C+' г'
   ].join('\n');
 }


 // ---------- Табы ----------
 function switchTab(tab){
   $all('.screen').forEach(function(x){ x.classList.remove('active'); });
   $all('.tab').forEach(function(x){ x.classList.remove('active'); });
   var scr = document.getElementById('screen-'+tab);
   var btn = document.querySelector('.tab[data-tab="'+tab+'"]');
   if (scr) scr.classList.add('active');
   if (btn) btn.classList.add('active');
   state.tab = tab; save('lumo.tab', tab);
   if (tab==='calendar') renderCalendar();
   if (tab==='products') renderProducts();
   if (tab==='habits') renderHabits();
   if (tab==='history'){
     historySelectedDate = todayStr();
     renderHistory();
     openHistoryDetail(historySelectedDate);
   }
 }
 $all('.tab').forEach(function(btn){ btn.addEventListener('click', function(){ switchTab(btn.dataset.tab); }); });
 
 
 // ---------- Инициализация ----------
 function fillMacroInputs(){
   Object.keys(macroFields).forEach(function(meal){
     var refs = macroFields[meal], m = state.meals.m[meal];
     if (refs.p) refs.p.value = m.p || 0;
     if (refs.f) refs.f.value = m.f || 0;
     if (refs.c) refs.c.value = m.c || 0;
     updateMealKcal(meal);
   });
 }
 
// ---------- Продукты ----------
var PRODUCT_DB = load('lumo.productDb', null) || (function(){
  // Минимальный стартовый набор; расширим отдельным файлом позже
  var arr = [
    {id:'oat_flakes', name_ru:'Овсяные хлопья', name_en:'Oats', cat:'cereals', kcal100:366, p100:13, f100:7, c100:62, presets:[30,50,80]},
    {id:'egg', name_ru:'Яйцо куриное', name_en:'Egg', cat:'dairy', kcal100:157, p100:13, f100:11, c100:1, presets:[50,100]},
    {id:'chicken_breast', name_ru:'Куриная грудка', name_en:'Chicken breast', cat:'meat', kcal100:165, p100:31, f100:3.6, c100:0, presets:[100,150,200]},
    {id:'beef', name_ru:'Говядина постная', name_en:'Beef', cat:'meat', kcal100:250, p100:26, f100:17, c100:0, presets:[100,150,200]},
    {id:'rice_dry', name_ru:'Рис (сухой)', name_en:'Rice (dry)', cat:'cereals', kcal100:344, p100:7, f100:0.6, c100:77, presets:[50,70,100]},
    {id:'buckwheat_dry', name_ru:'Гречка (сухая)', name_en:'Buckwheat (dry)', cat:'cereals', kcal100:329, p100:12.6, f100:3.3, c100:62, presets:[50,70,100]},
    {id:'apple', name_ru:'Яблоко', name_en:'Apple', cat:'fruits', kcal100:52, p100:0.3, f100:0.2, c100:14, presets:[100,150,200]},
    {id:'banana', name_ru:'Банан', name_en:'Banana', cat:'fruits', kcal100:89, p100:1.1, f100:0.3, c100:23, presets:[100,120,150]},
    {id:'cottage_cheese5', name_ru:'Творог 5%', name_en:'Cottage cheese 5%', cat:'dairy', kcal100:121, p100:17, f100:5, c100:2, presets:[100,150,200]},
    {id:'bread_rz', name_ru:'Хлеб ржаной', name_en:'Rye bread', cat:'bread', kcal100:259, p100:9, f100:3, c100:48, presets:[25,40,60]},
    {id:'salmon', name_ru:'Лосось', name_en:'Salmon', cat:'fish', kcal100:208, p100:20, f100:13, c100:0, presets:[100,150,200]},
    {id:'almonds', name_ru:'Миндаль', name_en:'Almonds', cat:'nuts', kcal100:579, p100:21, f100:50, c100:22, presets:[15,25,30]}
  ];
  return arr;
})();

// Кураторский список продуктов (расширение)
function curatedProducts(){
  return [
    // 🐟 Рыба
    {id:'salmon', name_ru:'Лосось', name_en:'Salmon', cat:'fish', kcal100:208, p100:20, f100:13, c100:0, presets:[100,150,200]},
    {id:'tuna', name_ru:'Тунец', name_en:'Tuna', cat:'fish', kcal100:132, p100:28, f100:1, c100:0, presets:[100,150,200]},
    {id:'cod', name_ru:'Треска', name_en:'Cod', cat:'fish', kcal100:82, p100:18, f100:0.7, c100:0, presets:[100,150,200]},
    {id:'mackerel', name_ru:'Скумбрия', name_en:'Mackerel', cat:'fish', kcal100:205, p100:19, f100:14, c100:0, presets:[100,150,200]},
    {id:'trout', name_ru:'Форель', name_en:'Trout', cat:'fish', kcal100:190, p100:20, f100:13, c100:0, presets:[100,150,200]},
    // 🥛 Молочка
    {id:'milk_25', name_ru:'Молоко 2,5%', name_en:'Milk 2.5%', cat:'dairy', kcal100:52, p100:3, f100:2.5, c100:5, presets:[200,250,300]},
    {id:'cottage_cheese', name_ru:'Творог 5%', name_en:'Cottage cheese', cat:'dairy', kcal100:121, p100:17, f100:5, c100:2, presets:[100,150,200]},
    {id:'yogurt_plain', name_ru:'Йогурт натуральный', name_en:'Yogurt plain', cat:'dairy', kcal100:59, p100:10, f100:0.4, c100:3.6, presets:[150,200,250]},
    {id:'hard_cheese', name_ru:'Сыр твёрдый', name_en:'Hard cheese', cat:'dairy', kcal100:350, p100:25, f100:27, c100:0, presets:[30,40,50]},
    {id:'regular_cheese', name_ru:'Сыр обычный (Российский)', name_en:'Regular cheese', cat:'dairy', kcal100:330, p100:24, f100:26, c100:0, presets:[30,40,50]},
    {id:'kefir_25', name_ru:'Кефир 2,5%', name_en:'Kefir', cat:'dairy', kcal100:52, p100:3, f100:2.5, c100:4, presets:[200,250,300]},
    {id:'butter', name_ru:'Сливочное масло', name_en:'Butter', cat:'dairy', kcal100:717, p100:0.8, f100:81, c100:0.6, presets:[10,15,20]},
    // 🌾 Крупы
    {id:'oats', name_ru:'Овсяные хлопья', name_en:'Oats', cat:'cereals', kcal100:366, p100:13, f100:7, c100:62, presets:[30,50,80]},
    {id:'white_rice', name_ru:'Рис белый', name_en:'White rice', cat:'cereals', kcal100:344, p100:7, f100:0.6, c100:79, presets:[50,70,100]},
    {id:'buckwheat', name_ru:'Гречка', name_en:'Buckwheat', cat:'cereals', kcal100:343, p100:13, f100:3, c100:71, presets:[50,70,100]},
    {id:'quinoa', name_ru:'Киноа', name_en:'Quinoa', cat:'cereals', kcal100:368, p100:14, f100:6, c100:64, presets:[50,70,100]},
    {id:'pasta_durum', name_ru:'Макароны из тв. сортов', name_en:'Pasta (durum wheat)', cat:'cereals', kcal100:337, p100:12, f100:1.5, c100:70, presets:[60,80,100]},
    // 🥕 Овощи
    {id:'potato', name_ru:'Картофель', name_en:'Potato', cat:'vegetables', kcal100:77, p100:2, f100:0.1, c100:17, presets:[100,150,200]},
    {id:'carrot', name_ru:'Морковь', name_en:'Carrot', cat:'vegetables', kcal100:41, p100:1, f100:0.2, c100:10, presets:[100,150,200]},
    {id:'broccoli', name_ru:'Брокколи', name_en:'Broccoli', cat:'vegetables', kcal100:34, p100:3, f100:0.4, c100:7, presets:[100,150,200]},
    {id:'cucumber', name_ru:'Огурец', name_en:'Cucumber', cat:'vegetables', kcal100:15, p100:0.7, f100:0.1, c100:3, presets:[100,150,200]},
    {id:'tomato', name_ru:'Помидор', name_en:'Tomato', cat:'vegetables', kcal100:18, p100:0.9, f100:0.2, c100:3.9, presets:[100,150,200]},
    // 🍎 Фрукты
    {id:'apple', name_ru:'Яблоко', name_en:'Apple', cat:'fruits', kcal100:52, p100:0.3, f100:0.2, c100:14, presets:[100,150,200]},
    {id:'banana', name_ru:'Банан', name_en:'Banana', cat:'fruits', kcal100:89, p100:1.1, f100:0.3, c100:23, presets:[100,120,150]},
    {id:'orange', name_ru:'Апельсин', name_en:'Orange', cat:'fruits', kcal100:47, p100:0.9, f100:0.1, c100:12, presets:[100,150,200]},
    {id:'grapes', name_ru:'Виноград', name_en:'Grapes', cat:'fruits', kcal100:69, p100:0.7, f100:0.2, c100:18, presets:[100,150,200]},
    {id:'strawberry', name_ru:'Клубника', name_en:'Strawberry', cat:'fruits', kcal100:32, p100:0.7, f100:0.3, c100:7.7, presets:[100,150,200]},
    {id:'blueberry', name_ru:'Голубика', name_en:'Blueberry', cat:'fruits', kcal100:57, p100:0.7, f100:0.3, c100:14, presets:[100,150,200]},
    // 🍫 Сладкое
    {id:'dark_chocolate', name_ru:'Шоколад тёмный', name_en:'Dark chocolate', cat:'sweets', kcal100:546, p100:5, f100:35, c100:46, presets:[20,30,40]},
    {id:'honey', name_ru:'Мёд', name_en:'Honey', cat:'sweets', kcal100:304, p100:0.3, f100:0, c100:82, presets:[10,20,30]},
    {id:'oat_cookies', name_ru:'Печенье овсяное', name_en:'Oat cookies', cat:'sweets', kcal100:437, p100:7, f100:15, c100:68, presets:[40,60,80]},
    {id:'marmalade', name_ru:'Мармелад', name_en:'Marmalade', cat:'sweets', kcal100:321, p100:0.2, f100:0.1, c100:80, presets:[40,60,80]},
    {id:'milk_chocolate', name_ru:'Шоколад молочный', name_en:'Milk chocolate', cat:'sweets', kcal100:535, p100:7, f100:30, c100:57, presets:[20,30,40]},
    // 🥩 Мясо
    {id:'chicken_breast', name_ru:'Куриная грудка', name_en:'Chicken breast', cat:'meat', kcal100:165, p100:31, f100:3, c100:0, presets:[100,150,200]},
    {id:'lean_beef', name_ru:'Говядина постная', name_en:'Lean beef', cat:'meat', kcal100:187, p100:27, f100:9, c100:0, presets:[100,150,200]},
    {id:'pork_loin', name_ru:'Свинина (корейка)', name_en:'Pork loin', cat:'meat', kcal100:242, p100:27, f100:14, c100:0, presets:[100,150,200]},
    {id:'turkey_fillet', name_ru:'Индейка (филе)', name_en:'Turkey fillet', cat:'meat', kcal100:150, p100:22, f100:7, c100:0, presets:[100,150,200]},
    // 🌰 Орехи
    {id:'almonds', name_ru:'Миндаль', name_en:'Almonds', cat:'nuts', kcal100:579, p100:21, f100:50, c100:22, presets:[15,25,30]},
    {id:'walnuts', name_ru:'Грецкий орех', name_en:'Walnuts', cat:'nuts', kcal100:654, p100:15, f100:65, c100:14, presets:[15,25,30]},
    {id:'hazelnuts', name_ru:'Фундук', name_en:'Hazelnuts', cat:'nuts', kcal100:628, p100:15, f100:61, c100:17, presets:[15,25,30]},
    {id:'peanuts', name_ru:'Арахис', name_en:'Peanuts', cat:'nuts', kcal100:567, p100:26, f100:49, c100:16, presets:[15,25,30]},
    // 🍞 Хлеб
    {id:'white_bread', name_ru:'Хлеб белый', name_en:'White bread', cat:'bread', kcal100:265, p100:9, f100:3, c100:49, presets:[25,40,60]},
    {id:'bread_rz', name_ru:'Хлеб ржаной', name_en:'Rye bread', cat:'bread', kcal100:259, p100:9, f100:3, c100:48, presets:[25,40,60]},
    {id:'lavash', name_ru:'Лаваш', name_en:'Lavash', cat:'bread', kcal100:277, p100:8, f100:1, c100:55, presets:[30,50,70]},
    {id:'sweet_bun', name_ru:'Булочка сдобная', name_en:'Sweet bun', cat:'bread', kcal100:340, p100:8, f100:10, c100:55, presets:[40,60,80]}
  ];
}

function ensureCuratedInMemory(){
  try{
    var cur = curatedProducts();
    var have = {}; (PRODUCT_DB||[]).forEach(function(p){ have[p.id]=true; });
    cur.forEach(function(p){ if(!have[p.id]) PRODUCT_DB.push(p); });
  }catch(e){ console.warn('ensureCuratedInMemory error', e); }
}

ensureCuratedInMemory();
 save('lumo.productDb', PRODUCT_DB);
 // Если БД уже готова — сразу синк и перерисовка
if (typeof dbReady!=='undefined' && dbReady){ try{ syncInMemoryProductsToDb(); renderProducts(); }catch(e){} }
 
 var prodFavs = load('lumo.prodFavs', []);
 var prodRecent = load('lumo.prodRecent', []);
 var currentProdCat = 'all';
 var currentProdMode = 'results'; // results | recent | favs
 var currentProd = null;
 
 // Если есть БД — синхронизируем встроенную базу продуктов в SQLite
function syncInMemoryProductsToDb(){
  try{
    if(!dbReady || !Array.isArray(PRODUCT_DB)) return;
    PRODUCT_DB.forEach(function(p){
      run('INSERT OR REPLACE INTO products (id,name_ru,name_en,cat,kcal100,p100,f100,c100) VALUES (:id,:ru,:en,:cat,:k,:p,:f,:c)',
        {':id':p.id, ':ru':p.name_ru, ':en':p.name_en, ':cat':p.cat, ':k':p.kcal100, ':p':p.p100, ':f':p.f100, ':c':p.c100});
      // Пересоздаём пресеты
      run('DELETE FROM product_presets WHERE product_id=:id', {':id':p.id});
      (p.presets||[]).forEach(function(g){ run('INSERT INTO product_presets (product_id,grams) VALUES (:id,:g)', {':id':p.id, ':g':g}); });
    });
  }catch(e){ console.warn('sync products error', e); }
}
// Попытка синка после инициализации продукта и позже (если БД ещё не готова)
(function trySyncLoop(){
  var tries=0; var timer=setInterval(function(){
    tries++; if (dbReady){ clearInterval(timer); syncInMemoryProductsToDb(); renderProducts(); }
    if (tries>20) clearInterval(timer);
  }, 200);
})();

function normalize(s){
  return String(s||'')
    .toLowerCase()
    .replace(/ё/g,'е')
    .replace(/[^a-zа-я0-9\s]/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}
function matchProduct(p, q){
  if(!q) return true;
  var nru=normalize(p.name_ru), nen=normalize(p.name_en), qq=normalize(q);
  return nru.startsWith(qq) || nen.startsWith(qq) || nru.indexOf(qq)>=0 || nen.indexOf(qq)>=0;
}
function filterByCat(p){ return (currentProdCat==='all') || (p.cat===currentProdCat); }
function isFav(id){ return prodFavs.indexOf(id)>=0 || (!!db && dbIsFav(id)); }
function toggleFav(id){
  if (dbReady){ dbToggleFav(id); }
  else {
    var i=prodFavs.indexOf(id);
    if(i>=0) prodFavs.splice(i,1); else prodFavs.unshift(id);
    save('lumo.prodFavs', prodFavs);
  }
  renderProducts();
}
function pushRecent(id){
  if (dbReady){ dbPushRecent(id); }
  else {
    var i=prodRecent.indexOf(id); if(i>=0) prodRecent.splice(i,1);
    prodRecent.unshift(id);
    if (prodRecent.length>30) prodRecent.length=30;
    save('lumo.prodRecent', prodRecent);
  }
}

function productKcalFor(p, grams){ return Math.round((+p.kcal100||0) * (grams||0) / 100); }
function productMacroFor(p, grams){
  return {
    p: Math.round((+p.p100||0) * (grams||0) / 100),
    f: Math.round((+p.f100||0) * (grams||0) / 100),
    c: Math.round((+p.c100||0) * (grams||0) / 100)
  };
}
function safeStr(s){ return (s===null || s===undefined) ? '' : String(s); }
function safeNum(x){ var n=+x; return isFinite(n) ? n : 0; }

function renderProducts(){
  if(!prodList) return;
  var mode=currentProdMode;
  var items=[];
  if (dbReady){
    var q = (prodQuery && prodQuery.value) || '';
    items = dbFetchProducts(q, currentProdCat, mode) || [];
  } else {
    if(mode==='favs'){
      items = prodFavs.map(function(id){ return PRODUCT_DB.find(function(x){ return x.id===id; }); }).filter(Boolean);
    } else if(mode==='recent'){
      items = prodRecent.map(function(id){ return PRODUCT_DB.find(function(x){ return x.id===id; }); }).filter(Boolean);
    } else {
      var q2 = (prodQuery && prodQuery.value) || '';
      items = PRODUCT_DB.filter(function(p){ return filterByCat(p) && matchProduct(p, q2); });
    }
  }

  // Отсечём записи без названия
  items = items.filter(function(p){ return safeStr(p.name_ru) || safeStr(p.name_en); });

  prodList.innerHTML = '';
  if(items.length===0){ prodList.innerHTML = '<div class="muted">Ничего не найдено</div>'; }
  items.slice(0,300).forEach(function(p){
    var nameRu = safeStr(p.name_ru);
    var nameEn = safeStr(p.name_en);
    var kcal = safeNum(p.kcal100), pr=safeNum(p.p100), fr=safeNum(p.f100), cr=safeNum(p.c100);
    var row=document.createElement('div'); row.className='prod-row'; row.setAttribute('data-id', p.id);
    var sub = kcal+' ккал · Б '+pr+' / Ж '+fr+' / У '+cr+' (на 100 г)';
    row.innerHTML = '<div><div class="name">'+nameRu+(nameEn ? '<span class="muted"> · '+nameEn+'</span>' : '')+'</div><div class="sub">'+sub+'</div></div>'+
      '<div class="fav" title="В избранное">'+(isFav(p.id)?'⭐':'☆')+'</div>';
    row.addEventListener('click', function(e){
      if(e.target && e.target.classList.contains('fav')){ toggleFav(p.id); e.stopPropagation(); return; }
      openProductCard(p);
    });
    prodList.appendChild(row);
  });
  if(prodCard) prodCard.hidden = !currentProd;
}

function openProductCard(p){
  currentProd = p; pushRecent(p.id);
  if(!prodCard) return;
  var presets = dbReady ? dbFetchPresets(p.id) : (p.presets||[]);
  var g0 = presets[0] || 100;
  var presetsHtml = presets.map(function(g){ return '<button class="preset" data-g="'+g+'">'+g+' г</button>'; }).join('');
  var nameRu = safeStr(p.name_ru);
  var nameEn = safeStr(p.name_en);
  var kcal = safeNum(p.kcal100), pr=safeNum(p.p100), fr=safeNum(p.f100), cr=safeNum(p.c100);
  prodCard.hidden=false;
  prodCard.innerHTML = ''+
    '<div class="row" style="justify-content:space-between; align-items:center">'
    +  '<div style="font-weight:800">'+nameRu+(nameEn ? ' <span class="muted">· '+nameEn+'</span>' : '')+'</div>'
    +  '<button type="button" class="btn small" id="closeProd">Закрыть</button>'
    +'</div>'
    +'<div class="grid">'
    +  '<div class="card-soft">Калории<br><b>'+kcal+'</b> на 100 г</div>'
    +  '<div class="card-soft">Белки<br><b>'+pr+' г</b> на 100 г</div>'
    +  '<div class="card-soft">Жиры<br><b>'+fr+' г</b> на 100 г</div>'
    +  '<div class="card-soft">Углеводы<br><b>'+cr+' г</b> на 100 г</div>'
    +'</div>'
    +'<div class="presets">'+presetsHtml+'</div>'
    +'<div class="inline-inputs"><input id="gramsInput" type="number" min="0" step="5" placeholder="граммы" value="'+g0+'" />'
    +'<select id="mealSelect"><option value="breakfast">Завтрак</option><option value="lunch">Обед</option><option value="dinner">Ужин</option><option value="snack">Перекус</option></select>'
    +'<button id="addToMealBtn" class="btn green" type="button">Добавить</button></div>'
    +'<div class="muted small">КБЖУ усреднены; бренды и готовность могут отличаться.</div>';

  var closeBtn = document.getElementById('closeProd'); if(closeBtn) closeBtn.addEventListener('click', function(){ currentProd=null; if(prodCard) prodCard.hidden=true; });
  $all('#prodCard .preset').forEach(function(btn){ btn.addEventListener('click', function(){ var g=+btn.getAttribute('data-g')||0; var gi=$('#gramsInput'); if(gi){ gi.value=String(g); } }); });
  var addBtn=$('#addToMealBtn'); if(addBtn) addBtn.addEventListener('click', function(){ addProductToMeal(); });
}

function addProductToMeal(){
  if(!currentProd) return;
  var grams = Math.max(0, +($('#gramsInput') && $('#gramsInput').value) || 0);
  if(!grams) return;
  var meal = ($('#mealSelect') && $('#mealSelect').value) || 'lunch';
  var m = productMacroFor(currentProd, grams);
  // Прибавляем к существующим полям, не затирая ручные
  state.meals.m[meal].p = Math.max(0, (state.meals.m[meal].p||0) + m.p);
  state.meals.m[meal].f = Math.max(0, (state.meals.m[meal].f||0) + m.f);
  state.meals.m[meal].c = Math.max(0, (state.meals.m[meal].c||0) + m.c);
  state.meals[meal] = true;
  save('lumo.meals', state.meals);
  // Вставим строку в список приёма
  var listId = '#list-'+meal; var ul=$(listId);
  if(ul){
    var li=document.createElement('li'); li.className='meal-item';
    var kcal=productKcalFor(currentProd, grams);
    li.innerHTML='<div><div class="mi-title">'+currentProd.name_ru+' · '+grams+' г</div><div class="mi-sub">'+kcal+' ккал · Б '+m.p+' / Ж '+m.f+' / У '+m.c+'</div></div>'+
      '<div class="mi-actions"><button class="mi-x" title="Удалить">×</button></div>';
    li.querySelector('.mi-x').addEventListener('click', function(){
      // При удалении вычтем обратно
      state.meals.m[meal].p = Math.max(0, (state.meals.m[meal].p||0) - m.p);
      state.meals.m[meal].f = Math.max(0, (state.meals.m[meal].f||0) - m.f);
      state.meals.m[meal].c = Math.max(0, (state.meals.m[meal].c||0) - m.c);
      save('lumo.meals', state.meals);
      ul.removeChild(li);
      renderTotals(); renderDashboard();
    });
    ul.appendChild(li);
  }
  renderMeals(meal); renderDashboard();
  toast('+ '+productKcalFor(currentProd, grams)+' ккал (Б '+m.p+' / Ж '+m.f+' / У '+m.c+') добавлено в '+labelForMeal(meal));
}

function labelForMeal(meal){
  return {breakfast:'Завтрак', lunch:'Обед', dinner:'Ужин', snack:'Перекус'}[meal]||'приём';
}

function debounce(fn, ms){ var t=null; return function(){ var args=arguments, ctx=this; clearTimeout(t); t=setTimeout(function(){ fn.apply(ctx,args); }, ms); }; }

// Слушатели — Продукты (инициализируем после функций)
if(prodClear) prodClear.addEventListener('click', function(){ if(prodQuery) prodQuery.value=''; currentProdMode='results'; renderProducts(); });
if(prodQuery) prodQuery.addEventListener('input', debounce(function(){ currentProdMode='results'; renderProducts(); }, 120));
if(prodCats) prodCats.addEventListener('click', function(e){
  var btn=e.target.closest('.chip'); if(!btn) return;
  $all('#prodCats .chip').forEach(function(x){ x.classList.remove('active'); });
  btn.classList.add('active'); currentProdCat = btn.getAttribute('data-cat')||'all'; renderProducts();
});
document.querySelectorAll('#screen-products .inline-tabs .btn').forEach(function(b){
  b.addEventListener('click', function(){
    document.querySelectorAll('#screen-products .inline-tabs .btn').forEach(function(x){ x.classList.remove('active'); });
    b.classList.add('active'); currentProdMode = b.getAttribute('data-mode')||'results'; renderProducts();
  });
});

// Стартовый рендер
fillMacroInputs();
previewProfile();
renderDashboard();
renderMeals();
renderProducts();
renderHabits();
switchTab(state.tab);

// History — DOM
var historyList=$('#historyList'), historyDetail=$('#historyDetail');
var histDateTitle=$('#histDateTitle'), histSummary=$('#histSummary');
var kcalWeek=$('#kcalWeek');
 var histNoteInput=$('#histNoteInput'), saveHistNoteBtn=$('#saveHistNoteBtn');
 var historySelectedDate=null;
 var histPrev=$('#histPrev'), histNext=$('#histNext');
var histDateInput=$('#histDateInput'), histGoBtn=$('#histGoBtn');
var sendToBotBtn=$('#sendToBotBtn');

// Слушатели — история
if(saveHistNoteBtn) saveHistNoteBtn.addEventListener('click', function(){ saveHistoryNote(); });
document.querySelectorAll('#screen-history .chips .chip').forEach(function(ch){ ch.addEventListener('click', function(){ document.querySelectorAll('#screen-history .chips .chip').forEach(function(x){ x.classList.remove('active'); }); ch.classList.add('active'); renderHistory(); }); });
 if(histPrev) histPrev.addEventListener('click', function(){ shiftHistoryDate(-1); });
 if(histNext) histNext.addEventListener('click', function(){ shiftHistoryDate(1); });
if(histGoBtn) histGoBtn.addEventListener('click', function(){ if(histDateInput && histDateInput.value){ openHistoryDetail(histDateInput.value); renderHistory(); } });
if(histDateInput) histDateInput.addEventListener('change', function(){ if(histDateInput.value){ openHistoryDetail(histDateInput.value); renderHistory(); } });
if(sendToBotBtn) sendToBotBtn.addEventListener('click', sendDataToBot);

// Слушатели — КБЖУ
// ... existing code ...

// ---------- Рендеры ----------
// ... existing code ...

function getDiaryForDate(dateStr){
  // Собираем сводку из текущего состояния и сохранённого "diary"
  var diary=load('lumo.diary', {});
  var obj=diary[dateStr]||{};
  // Привычки: считаем % выполненных на дату
  var ym = +dateStr.slice(0,4)*100 + (+dateStr.slice(5,7));
  var day = +dateStr.slice(8,10);
  var items = (habitsState.items||[]);
  var totalH=items.length, doneH=0;
  items.forEach(function(h){
    var dm = (h.days && h.days[ym]) || {};
    if (dm[day]===1) doneH++;
  });
  obj.habitsDone = doneH; obj.habitsTotal = totalH;
  obj.habitsPct = totalH ? Math.round((doneH/totalH)*100) : 0;
  obj.note = obj.note || '';
  return obj;
}

function renderHistory(){
  if(!historyList) return;
  // Диапазон по кнопке
  var rangeBtn=document.querySelector('#screen-history .chips .chip.active');
  var range = rangeBtn ? rangeBtn.getAttribute('data-range') : '30';
  var today=new Date();
  var days = range==='7'?7 : (range==='all'? 120 : 30);
  historyList.innerHTML='';
  if(!historySelectedDate) historySelectedDate = today.toISOString().slice(0,10);
  for(var i=0;i<days;i++){
    var d=new Date(); d.setDate(today.getDate()-i);
    var key=d.toISOString().slice(0,10);
    var human=d.toLocaleDateString('ru-RU', { day:'numeric', month:'long' });
    var rec=getDiaryForDate(key);
    var div=document.createElement('div'); div.className='hist-entry'; div.setAttribute('data-date', key);
    if (historySelectedDate===key) div.setAttribute('data-opened','1');
    var t = document.createElement('div'); t.style.fontWeight='700'; t.textContent = human;
    var row1=document.createElement('div'); row1.className='hist-row';
    var kcal=rec.kcal||0; var P=rec.P||0, F=rec.F||0, C=rec.C||0; // P/F/C могут быть не сохранены явно
    row1.textContent = '🍽 '+kcal+' ккал · Б '+P+' / Ж '+F+' / У '+C;
    var row2=document.createElement('div'); row2.className='hist-row';
    var wLiters = rec.waterMl ? Math.round(rec.waterMl/100)/10 : 0; // 1800 -> 1.8 л
    row2.textContent = '💧 Вода: '+wLiters+' л   👟 Шаги: '+(rec.steps||0)+'   💤 Сон: '+(rec.sleep||0)+' ч';
    var row3=document.createElement('div'); row3.className='hist-row'; row3.textContent = '✅ Привычки: '+(rec.habitsDone||0)+'/'+(rec.habitsTotal||0)+' выполнено';
    div.appendChild(t); div.appendChild(row1); div.appendChild(row2); div.appendChild(row3);
    div.addEventListener('click', function(){
      $all('#historyList .hist-entry').forEach(function(x){ x.removeAttribute('data-opened'); });
      this.setAttribute('data-opened','1');
      openHistoryDetail(this.getAttribute('data-date'));
    });
    historyList.appendChild(div);
  }
}

function openHistoryDetail(dateStr){
  if(!historyDetail) return;
  historySelectedDate = dateStr;
  var d=new Date(dateStr);
  if(histDateTitle) histDateTitle.textContent = d.toLocaleDateString('ru-RU', { day:'numeric', month:'long', year:'numeric' });
  if(histDateInput) histDateInput.value = dateStr;
  var rec=getDiaryForDate(dateStr);
  if(histSummary) histSummary.textContent = '🍽 '+(rec.kcal||0)+' ккал · Б '+(rec.P||0)+' / Ж '+(rec.F||0)+' / У '+(rec.C||0)
    +' · 💧 '+(rec.waterMl||0)+' мл · 👟 '+(rec.steps||0)+' · 💤 '+(rec.sleep||0)+' ч · ✅ '+(rec.habitsDone||0)+'/'+(rec.habitsTotal||0);
  if(histNoteInput) histNoteInput.value = rec.note||''; historyDetail.hidden=false;
  renderKcalWeek(dateStr);
}

function renderKcalWeek(dateStr){
  if(!kcalWeek) return;
  kcalWeek.innerHTML='';
  var d = new Date(dateStr);
  for(var i=6;i>=0;i--){
    var dd=new Date(d); dd.setDate(d.getDate()-i);
    var key=dd.toISOString().slice(0,10);
    var rec=getDiaryForDate(key);
    var g=macroGoals(state.profile).cal||2000; var val=rec.kcal||0;
    var h=Math.max(6, Math.min(76, Math.round((val/g)*76)));
    var bar=document.createElement('div'); bar.className='kbar';
    bar.style.height=h+'px';
    bar.classList.add(val<=g? 'ok' : 'bad');
    kcalWeek.appendChild(bar);
  }
}

function saveHistoryNote(){
  if(histDateInput && histDateInput.value) historySelectedDate = histDateInput.value;
  if(!historySelectedDate || !histNoteInput) return;
  var diary=load('lumo.diary', {});
  var obj=diary[historySelectedDate] || {};
  obj.note = histNoteInput.value||'';
  diary[historySelectedDate] = obj;
  save('lumo.diary', diary);
  openHistoryDetail(historySelectedDate);
}

function shiftHistoryDate(delta){
  if(!historySelectedDate) return;
  var d=new Date(historySelectedDate); d.setDate(d.getDate()+delta);
  var key=d.toISOString().slice(0,10);
  openHistoryDetail(key);
  renderHistory();
}

// Функция для отправки данных в Telegram бот
function sendDataToBot() {
  if (typeof Telegram !== 'undefined' && Telegram.WebApp) {
    const today = todayStr();
    const diary = load('lumo.diary', {});
    const todayData = diary[today] || {};
    
    // Получаем данные привычек
    const habitsData = habitsState[today] || {};
    let habitsDone = 0;
    let habitsTotal = 0;
    
    Object.values(habitsData).forEach(dayMap => {
      if (dayMap) {
        Object.values(dayMap).forEach(status => {
          if (status === 'done') habitsDone++;
          habitsTotal++;
        });
      }
    });
    
    const data = {
      date: today,
      kcal: todayData.kcal || 0,
      protein: todayData.P || 0,
      fat: todayData.F || 0,
      carbs: todayData.C || 0,
      water_ml: todayData.waterMl || 0,
      steps: todayData.steps || 0,
      sleep_hours: todayData.sleep || 0,
      habits_done: habitsDone,
      habits_total: habitsTotal,
      note: todayData.note || ''
    };
    
    try {
      Telegram.WebApp.sendData(JSON.stringify(data));
      toast('✅ Данные отправлены в бот!');
    } catch (error) {
      console.error('Error sending data to bot:', error);
      toast('❌ Ошибка отправки данных');
    }
  } else {
    toast('❌ Telegram WebApp не доступен');
  }
}

// Функция для отправки данных в Telegram бот
function sendDataToBot() {
  if (typeof Telegram !== 'undefined' && Telegram.WebApp) {
    const today = todayStr();
    const diary = load('lumo.diary', {});
    const todayData = diary[today] || {};
    
    // Получаем данные привычек
    const habitsData = habitsState[today] || {};
    let habitsDone = 0;
    let habitsTotal = 0;
    
    Object.values(habitsData).forEach(dayMap => {
      if (dayMap) {
        Object.values(dayMap).forEach(status => {
          if (status === 'done') habitsDone++;
          habitsTotal++;
        });
      }
    });
    
    const data = {
      date: today,
      kcal: todayData.kcal || 0,
      protein: todayData.P || 0,
      fat: todayData.F || 0,
      carbs: todayData.C || 0,
      water_ml: todayData.waterMl || 0,
      steps: todayData.steps || 0,
      sleep_hours: todayData.sleep || 0,
      habits_done: habitsDone,
      habits_total: habitsTotal,
      note: todayData.note || ''
    };
    
    try {
      Telegram.WebApp.sendData(JSON.stringify(data));
      toast('✅ Данные отправлены в бот!');
    } catch (error) {
      console.error('Error sending data to bot:', error);
      toast('❌ Ошибка отправки данных');
    }
  } else {
    toast('❌ Telegram WebApp не доступен');
  }
}
});
