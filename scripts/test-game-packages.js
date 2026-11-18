// Run after npm run build -w server. Uses an isolated database and removes its fixture.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const gamesRoot = path.join(root, 'server/games/public');
const fixture = fs.mkdtempSync(path.join(gamesRoot, 'package-test-'));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'taskit-package-test-'));
const port = 42000 + Math.floor(Math.random() * 1000);
const secret = 'local-package-test-only';
const databasePath = path.join(temp, 'test.db');
let db;
const uploadedIcons = [];
const child = spawn(process.execPath, ['server/dist/index.js'], {
  cwd: root,
  env: { ...process.env, NODE_ENV: 'development', PORT: String(port), DB_PATH: databasePath, DB_ENCRYPTION_KEY: '', JWT_SECRET: secret },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
child.stdout.on('data', chunk => { logs += chunk; });
child.stderr.on('data', chunk => { logs += chunk; });
let fixtureGameId;

(async () => {
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    try { if ((await fetch(`http://localhost:${port}/readyz`)).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert(ready, logs);
  const Database = require('better-sqlite3-multiple-ciphers');
  db = new Database(databasePath);
  db.prepare('INSERT INTO users (id, username, email, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)').run('test-admin', 'test-admin', 'package@example.com', 'unused', 'admin', Date.now());
  const token = require('jsonwebtoken').sign({ id: 'test-admin', username: 'test-admin', email: 'package@example.com', token_version: 0 }, secret);
  const headers = { Authorization: 'Bearer ' + token };
  async function get(url) { const response = await fetch(`http://localhost:${port}${url}`, { headers }); assert.equal(response.status, 200, url); return response.json(); }
  async function registerGame(gameId, scriptPath, sortOrder) {
    const response = await fetch(`http://localhost:${port}/api/admin/arcade-games`, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ scriptPath, title: gameId, subtitle: 'Admin-selected game', icon: '🎮', sortOrder, enabled: true }),
    });
    const body = await response.json(); assert.equal(response.status, 201, JSON.stringify(body)); return body;
  }
  assert.equal((await get('/api/gamification/arcade/games')).length, 0, 'Files alone must not register games');
  // The bottom Add button creates saved, disabled placeholders even with an empty list.
  const addPage = fs.readFileSync(path.join(root,'public/index.html'),'utf8');
  assert(addPage.indexOf('id="adminAddArcadeGameBtn"')>addPage.indexOf('id="adminArcadeGamesList"'));
  const addSource=addPage.slice(addPage.indexOf('async function adminAddArcadeGame()'),addPage.indexOf('function arcadeGameIconMarkup(icon)'));
  const addButton={disabled:false,textContent:'+ Add'};
  const addContext=vm.createContext({_adminArcadeAdding:false,_adminArcadeGames:[],document:{getElementById:()=>addButton},toast:()=>{},api:async(method,url,body)=>{
    const response=await fetch(`http://localhost:${port}/api${url}`,{method,headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body)});
    const result=await response.json();assert(response.ok,JSON.stringify(result));return result;
  },loadAdminArcadeGames:async()=>{addContext._adminArcadeGames=await get('/api/admin/arcade-games');}});
  vm.runInContext(addSource,addContext);
  await Promise.all([vm.runInContext('adminAddArcadeGame()',addContext),vm.runInContext('adminAddArcadeGame()',addContext)]);
  let placeholders=await get('/api/admin/arcade-games');assert.equal(placeholders.length,1,'Repeated clicks during save create one entry');
  assert.equal(placeholders[0].title,'New game name');assert.equal(placeholders[0].subtitle,'New game description');
  assert.equal(placeholders[0].icon,'🎮');assert.equal(placeholders[0].scriptPath,null);assert.equal(placeholders[0].enabled,0);
  await vm.runInContext('adminAddArcadeGame()',addContext);
  placeholders=await get('/api/admin/arcade-games');assert.equal(placeholders.length,2);assert.equal(placeholders[1].sortOrder,2);
  addContext.api=async()=>{throw Error('Simulated creation failure');};await vm.runInContext('adminAddArcadeGame()',addContext);
  assert.equal(addContext._adminArcadeAdding,false);assert.equal(addButton.disabled,false);assert.equal(addButton.textContent,'+ Add');
  assert.equal((await get('/api/admin/arcade-games')).length,2);
  for(const placeholder of placeholders)await fetch(`http://localhost:${port}/api/admin/arcade-games/${placeholder.id}`,{method:'DELETE',headers});

  const bundled = await get('/api/admin/arcade-game-files');
  assert.equal(bundled.length, 7, 'All seven entries must appear without manifests');
  for (const [index, scriptPath] of bundled.entries()) {
    let definition;
    const window = { TaskItArcade: { register(value) { definition = value; } } };
    vm.runInNewContext(fs.readFileSync(path.join(gamesRoot, scriptPath.slice('/games/'.length)), 'utf8'), { window, document: {}, console, setTimeout, clearTimeout, setInterval, clearInterval });
    assert.equal(typeof definition.mount, 'function'); assert.equal(typeof definition.unmount, 'function');
    await registerGame(definition.gameId, scriptPath, index + 1);
  }
  assert.equal((await get('/api/gamification/arcade/games')).length, 7);
  assert(!addPage.includes('id="arcadeGameForm"'));
  assert(!addPage.includes('arcadeGameAchievementKey'));
  assert(!addPage.includes('adminClearArcadeGameForm'));
  const gameRows=await get('/api/gamification/arcade/games');
  const wrapperSource=fs.readFileSync(path.join(gamesRoot,'js/arcade-wrapper.js'),'utf8');
  const catalogueSource=wrapperSource.slice(wrapperSource.indexOf('function setArcadeCatalogue'),wrapperSource.indexOf('window.TaskItArcade ='));
  const cardSource=addPage.slice(addPage.indexOf('function renderArcadeGameCards('),addPage.indexOf('async function handleGamifToggle'));
  const iconHelpers=addPage.slice(addPage.indexOf('function arcadeGameIconMarkup(icon)'),addPage.indexOf('function renderAdminArcadeGameList()'));
  class CardElement { constructor(){this.children=[];this.dataset={};} replaceChildren(...children){this.children=children;} appendChild(child){this.children.push(child);} append(...children){this.children.push(...children);} }
  const gameContainer=new CardElement();
  const cardContext=vm.createContext({ARCADE_GAME_ORDER:[],ARCADE_GAMES:{},unlockedArcadeKeys:new Set(),escHtml:value=>String(value),document:{getElementById:()=>gameContainer,createElement:()=>new CardElement(),createTextNode:text=>({textContent:text})}});
  vm.runInContext(catalogueSource+cardSource+iconHelpers,cardContext);
  cardContext.games=gameRows.map((game,index)=>({...game,achievementKey:index===0?'task_10':game.achievementKey}));
  vm.runInContext('setArcadeCatalogue(games);renderArcadeGameCards([],false)',cardContext);
  assert.equal(cardContext.unlockedArcadeKeys.size,0);
  vm.runInContext("renderArcadeGameCards([{key:'unrelated_achievement',unlockedAt:1}],false)",cardContext);
  assert.equal(gameContainer.children.length,1);assert.equal(gameContainer.children[0].dataset.arcadeKey,gameRows[0].id);
  vm.runInContext("renderArcadeGameCards([{key:'other',unlockedAt:1},{key:'different',unlockedAt:2}],false)",cardContext);
  assert.deepEqual(gameContainer.children.map(card=>card.dataset.arcadeKey),gameRows.slice(0,2).map(game=>game.id));
  vm.runInContext("renderArcadeGameCards([{key:'task_10',unlockedAt:1},{key:'first_task',unlockedAt:2}],false)",cardContext);
  assert.deepEqual(gameContainer.children.map(card=>card.dataset.arcadeKey),gameRows.slice(0,2).map(game=>game.id),'Achievement identity must not affect unlocked games');
  vm.runInContext('renderArcadeGameCards([],true)',cardContext);assert.equal(gameContainer.children.length,gameRows.length);
  cardContext.games=[{...gameRows[0],enabled:false},...gameRows.slice(1)];
  vm.runInContext("setArcadeCatalogue(games);renderArcadeGameCards([{unlockedAt:1}],false)",cardContext);
  assert.equal(gameContainer.children[0].dataset.arcadeKey,gameRows[1].id,'Disabled games must not consume an unlock');
  assert.equal(vm.runInContext("arcadeGameIconMarkup('🚀')",cardContext),'🎮');


  // Unassigned games are editable and movable through the same Admin API.
  const placeholder = await registerGame('Coming soon', null, 2);
  const beforeMove = await get('/api/admin/arcade-games');
  const originalIndex = beforeMove.findIndex(game => game.id === placeholder.id);
  assert(originalIndex > 0);
  async function move(id, direction, status = 200) {
    const response = await fetch(`http://localhost:${port}/api/admin/arcade-games/${id}/move`, {method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({direction})});
    assert.equal(response.status,status); return response.json();
  }
  const movedUp = await move(placeholder.id, 'up');
  assert.equal(movedUp[originalIndex-1].id, placeholder.id);
  assert.equal(movedUp[originalIndex-1].scriptPath, null);
  assert.deepEqual(movedUp.map(game=>game.sortOrder), movedUp.map((_,index)=>index+1));
  assert.deepEqual((await get('/api/admin/arcade-games')).map(game=>game.id), movedUp.map(game=>game.id));
  assert.deepEqual((await get('/api/gamification/arcade/games')).map(game=>game.id), movedUp.map(game=>game.id));
  const movedDown = await move(placeholder.id, 'down');
  assert.deepEqual(movedDown.map(game=>game.id), beforeMove.map(game=>game.id));
  assert.deepEqual((await move(movedDown[0].id,'up')).map(game=>game.id), movedDown.map(game=>game.id));
  assert.deepEqual((await move(movedDown.at(-1).id,'down')).map(game=>game.id), movedDown.map(game=>game.id));
  await move(placeholder.id,'sideways',400);
  await move('missing','up',404);
  // Render the actual list function to verify numbering and script-independent controls.
  const page = fs.readFileSync(path.join(root,'public/index.html'),'utf8');
  const renderSource = page.slice(page.indexOf('function arcadeGameIconMarkup(icon)'),page.indexOf('async function adminMoveArcadeGame'));
  const list = {innerHTML:'',dataset:{},addEventListener(){}};
  const toggleInput = {checked:false,disabled:false};
  const uiDocument = {body:{},activeElement:toggleInput,getElementById:id=>id==='adminArcadeGamesList'?list:{value:'',focus(){}}};
  const uiContext = vm.createContext({document:uiDocument,_adminArcadeGames:movedUp,_adminArcadeMoving:false,_adminArcadeToggling:new Map(),_adminArcadeDrafts:new Map(),_adminArcadeFiles:bundled,escHtml:value=>String(value),loadGamificationProfile:async()=>{},toast:()=>{},api:async(method,url,body)=>{
    const response=await fetch(`http://localhost:${port}/api${url}`,{method,headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body)});
    assert(response.ok);return response.json();
  }});
  vm.runInContext(renderSource+';renderAdminArcadeGameList();',uiContext);
  assert(!list.innerHTML.includes('Unlock order:'));
  assert(!list.innerHTML.includes('>Test</button>'));
  assert(!list.innerHTML.includes('badge-green'));
  assert(!list.innerHTML.includes('>enabled</span>'));
  assert(!list.innerHTML.includes('>disabled</span>'));
  assert(!list.innerHTML.includes('data-arcade-play="'+placeholder.id+'"'));
  assert(list.innerHTML.includes('data-arcade-play="'+movedUp.find(game=>game.scriptPath).id+'"'));
  assert(!list.innerHTML.includes('>#'));
  assert(list.innerHTML.includes((originalIndex)+'. 🎮 Coming soon'));
  assert(list.innerHTML.includes('data-arcade-move="up" data-game-id="'+placeholder.id+'"'));
  assert(list.innerHTML.includes('data-arcade-move="down" data-game-id="'+placeholder.id+'"'));
  assert(list.innerHTML.includes('class="arcade-game-description">Admin-selected game'));
  assert(list.innerHTML.includes('class="arcade-game-path">No script selected'));
  assert(list.innerHTML.includes('role="switch"'));
  assert.equal((list.innerHTML.match(/data-arcade-toggle /g)||[]).length,movedUp.length);
  uiContext.toggleInput=toggleInput;uiContext.toggleId=placeholder.id;
  await vm.runInContext('adminToggleArcadeGame(toggleId,false,toggleInput)',uiContext);
  assert(!(await get('/api/gamification/arcade/games')).some(game=>game.id===placeholder.id));
  assert.equal((await get('/api/admin/arcade-games')).find(game=>game.id===placeholder.id).enabled,0);
  toggleInput.checked=true;
  await vm.runInContext('adminToggleArcadeGame(toggleId,true,toggleInput)',uiContext);
  assert((await get('/api/gamification/arcade/games')).some(game=>game.id===placeholder.id));
  uiContext.api=async()=>{throw Error('Simulated save failure');};
  toggleInput.checked=false;
  await vm.runInContext('adminToggleArcadeGame(toggleId,false,toggleInput)',uiContext);
  assert.equal(toggleInput.checked,true,'Failed saves must restore the switch');
  assert.equal(uiContext._adminArcadeToggling.size,0);
  assert.equal((await get('/api/admin/arcade-games')).find(game=>game.id===placeholder.id).enabled,1);
  // Row edits are independent from the creation form; Cancel discards drafts, Save persists them.
  uiContext.api=async(method,url,body)=>{
    const response=await fetch(`http://localhost:${port}/api${url}`,{method,headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify(body)});
    const data=await response.json();assert(response.ok,JSON.stringify(data));
    if(url.endsWith('/upload-icon'))uploadedIcons.push(data.icon);
    return data;
  };
  vm.runInContext('adminEditArcadeGame(toggleId)',uiContext);
  assert(list.innerHTML.includes('arcade-game-row is-editing'));
  assert(list.innerHTML.includes('class="arcade-inline-title"'));
  assert(list.innerHTML.includes('class="arcade-inline-description"'));
  assert(list.innerHTML.includes('>None</option>'));
  assert(list.innerHTML.includes('data-arcade-icon-upload'));
  assert.equal(uiContext._adminArcadeDrafts.size,1);
  assert(list.innerHTML.includes('aria-pressed="true"'));
  uiContext._adminArcadeDrafts.get(placeholder.id).title='Discard this unsaved title';
  vm.runInContext('adminEditArcadeGame(toggleId)',uiContext);
  assert.equal(uiContext._adminArcadeDrafts.size,0,'Second pencil click must exit edit mode');
  assert(!list.innerHTML.includes('arcade-game-row is-editing'));
  vm.runInContext('adminEditArcadeGame(toggleId)',uiContext);
  assert.equal(uiContext._adminArcadeDrafts.get(placeholder.id).title,'Coming soon');
  const secondEditorId=movedUp.find(game=>game.id!==placeholder.id).id;uiContext.secondEditorId=secondEditorId;
  vm.runInContext('adminEditArcadeGame(secondEditorId)',uiContext);
  assert.equal(uiContext._adminArcadeDrafts.size,1);assert(uiContext._adminArcadeDrafts.has(secondEditorId));assert(!uiContext._adminArcadeDrafts.has(placeholder.id));
  uiContext._adminArcadeDrafts.get(secondEditorId).saving=true;
  vm.runInContext('adminEditArcadeGame(toggleId)',uiContext);
  assert(uiContext._adminArcadeDrafts.has(secondEditorId),'An in-flight save must complete before switching');
  uiContext._adminArcadeDrafts.get(secondEditorId).saving=false;
  vm.runInContext('adminEditArcadeGame(toggleId)',uiContext);
  assert.equal(uiContext._adminArcadeDrafts.size,1);assert(uiContext._adminArcadeDrafts.has(placeholder.id));
  assert.equal((list.innerHTML.match(/arcade-game-row is-editing/g)||[]).length,1);

  assert(list.innerHTML.includes(bundled[0]));
  // Draft Test opens a new window and does not save row edits, even for a disabled game.
  await uiContext.api('PATCH','/admin/arcade-games/'+placeholder.id,{enabled:false});
  const previewStorage=new Map();let openedUrl=null;let popup=null;let previewOpened=null;
  uiContext.localStorage={setItem:(key,value)=>previewStorage.set(key,value),getItem:key=>previewStorage.get(key)||null,removeItem:key=>previewStorage.delete(key)};
  uiContext.crypto={randomUUID:()=> 'preview-test-request'};uiContext.setTimeout=()=>0;
  uiContext.window={TaskItArcade:{register(){}},open:(url,target,features)=>{openedUrl=url;assert.equal(target,'_blank');assert(features.includes('popup=yes'));popup={opener:{}};return popup;}};
  uiContext.ARCADE_GAMES={};uiContext.unlockedArcadeKeys=new Set();uiContext.openArcade=async key=>{previewOpened=key;};
  vm.runInContext('adminPreviewArcadeGame(toggleId)',uiContext);assert.equal(openedUrl,null,'None must not open a test');
  let previewDraft=uiContext._adminArcadeDrafts.get(placeholder.id);previewDraft.scriptPath=bundled[0];previewDraft.title='Unsaved preview title';previewDraft.subtitle='Unsaved preview description';
  vm.runInContext('renderAdminArcadeGameList();adminPreviewArcadeGame(toggleId)',uiContext);
  assert(list.innerHTML.includes('class="arcade-script-test"'));assert(list.innerHTML.includes('title="Test the current draft in a new window"'));
  assert.equal(openedUrl,'/?arcadePreview=preview-test-request');assert.equal(popup.opener,null);
  const previewRecord=JSON.parse(previewStorage.get('taskitArcadePreview:preview-test-request'));assert.equal(previewRecord.scriptPath,bundled[0]);assert(!('token' in previewRecord));
  uiContext._arcadePreviewRequest='preview-test-request';
  await vm.runInContext('launchAdminArcadePreview()',uiContext);
  assert(previewOpened);assert.equal(uiContext.ARCADE_GAMES[previewOpened].title,'Unsaved preview title');assert.equal(uiContext.ARCADE_GAMES[previewOpened].scriptPath,bundled[0]);assert.equal(uiContext.ARCADE_GAMES[previewOpened].enabled,0);assert.equal(previewStorage.size,0);
  let unchanged=(await get('/api/admin/arcade-games')).find(game=>game.id===placeholder.id);assert.equal(unchanged.title,'Coming soon');assert.equal(unchanged.scriptPath,null);assert.equal(unchanged.enabled,0);
  await uiContext.api('PATCH','/admin/arcade-games/'+placeholder.id,{enabled:true});
  uiContext.window.open=()=>null;vm.runInContext('adminPreviewArcadeGame(toggleId)',uiContext);assert.equal(previewStorage.size,0,'Blocked popups must clear their draft handoff');
  previewOpened=null;previewStorage.set('taskitArcadePreview:preview-test-request',JSON.stringify({...previewRecord,createdAt:Date.now()-360000}));
  await vm.runInContext('launchAdminArcadePreview()',uiContext);assert.equal(previewOpened,null,'Expired previews must not launch');
  // Reproduce popup startup with the REAL wrapper while its overlay is not parsed yet.
  fs.writeFileSync(path.join(fixture,'preview.js'),"window.TaskItArcade.register({mount(frame){frame.textContent='preview mounted';},unmount(){}});");
  const startupScript='/games/'+path.basename(fixture)+'/preview.js';
  const startupStorage=new Map([['taskitArcadePreview:startup-ready-test',JSON.stringify({createdAt:Date.now(),id:placeholder.id,title:'Startup test',scriptPath:startupScript})]]);
  const readyListeners=[];
  class PreviewElement {
    constructor(){this.dataset={};this.children=[];this.classList={contains:name=>name==='hidden'&&!this.visible,remove:()=>{this.visible=true;},add:()=>{}};}
    replaceChildren(...children){this.children=children;}
    appendChild(element){this.children.push(element);return element;}
    addEventListener(){} remove(){} setAttribute(){}
  }
  const overlay=new PreviewElement();const gameFrame=new PreviewElement();const previewBody=new PreviewElement();
  const previewNodes={arcadeOverlay:overlay,arcadeGameFrame:gameFrame,arcadeGameIcon:new PreviewElement(),arcadeTitle:new PreviewElement()};
  const previewDocument={readyState:'loading',body:previewBody,head:new PreviewElement(),currentScript:null,
    getElementById:id=>previewDocument.readyState==='loading'?null:previewNodes[id]||null,
    createElement:tag=>{const element=new PreviewElement();element.tag=tag;return element;},
    addEventListener:(type,listener)=>{if(type==='DOMContentLoaded')readyListeners.push(listener);},
  };
  const startupContext=vm.createContext({window:{location:{origin:`http://localhost:${port}`,href:`http://localhost:${port}/`}},document:previewDocument,URL,Map,console,Date,
    localStorage:{getItem:key=>startupStorage.get(key)||null,setItem:(key,value)=>startupStorage.set(key,value),removeItem:key=>startupStorage.delete(key)},
    _arcadePreviewRequest:'startup-ready-test',ARCADE_GAMES:{},unlockedArcadeKeys:new Set(),currentUser:{role:'admin'},activeArcadeGameInstance:null,arcadeDailyPlayMinutes:5,
    pushArcadeHistory:()=>{},updateArcadeTokenDisplays:()=>{},setInterval:()=>1,clearInterval:()=>{},escHtml:value=>String(value),toast:()=>{},api:uiContext.api,
  });
  function loadPreviewScript(element){
    previewBody.children.push(element);
    if(element.tag!=='script')return element;
    setImmediate(()=>{
      try {
        previewDocument.currentScript=element;
        const url=new URL(element.src,`http://localhost:${port}/`);
        vm.runInContext(fs.readFileSync(path.join(gamesRoot,url.pathname.slice('/games/'.length)),'utf8'),startupContext);
        previewDocument.currentScript=null;element.onload();
      }catch(error){element.onerror(error);}
    });return element;
  }
  previewBody.appendChild=loadPreviewScript;previewDocument.head.appendChild=loadPreviewScript;
  vm.runInContext(wrapperSource+renderSource,startupContext);
  const startupPromise=vm.runInContext('launchAdminArcadePreview()',startupContext);
  assert(startupStorage.has('taskitArcadePreview:startup-ready-test'),'Preview must wait for DOM/wrapper readiness before consuming its draft');
  assert.equal(gameFrame.textContent,undefined);
  previewDocument.readyState='complete';for(const ready of [...readyListeners])ready();
  await startupPromise;
  assert.equal(gameFrame.textContent,'preview mounted','New window must actually mount the selected game');
  assert.equal(overlay.dataset.activeGameId,placeholder.gameId);
  assert.equal(startupStorage.has('taskitArcadePreview:startup-ready-test'),false);
  const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
  uiContext.FileReader=class {readAsDataURL(file){this.result=file.data;this.onload();}};
  uiContext.Image=class {set src(value){this.width=1;this.height=1;this.onload();}};
  uiContext.iconInput={files:[{type:'image/png',name:'icon.png',size:70,data:'data:image/png;base64,'+png}],value:'icon.png'};
  await vm.runInContext('adminChooseArcadeIcon(toggleId,iconInput)',uiContext);
  assert.equal(uploadedIcons.length,0,'Choosing a file must not upload before Save');
  assert(list.innerHTML.includes('data:image/png;base64,'));
  vm.runInContext('adminCancelArcadeEdit(toggleId)',uiContext);
  assert.equal(uiContext._adminArcadeDrafts.size,0);
  assert.equal((await get('/api/admin/arcade-games')).find(game=>game.id===placeholder.id).title,'Coming soon');
  vm.runInContext('adminEditArcadeGame(toggleId)',uiContext);
  let draft=uiContext._adminArcadeDrafts.get(placeholder.id);draft.title='Inline title';draft.subtitle='Inline description';draft.scriptPath=bundled[0];
  await vm.runInContext('adminChooseArcadeIcon(toggleId,iconInput)',uiContext);
  await vm.runInContext('adminSaveArcadeRow(toggleId)',uiContext);
  let edited=(await get('/api/admin/arcade-games')).find(game=>game.id===placeholder.id);
  assert.equal(edited.title,'Inline title');assert.equal(edited.subtitle,'Inline description');assert.equal(edited.scriptPath,bundled[0]);
  assert.match(edited.icon,/^\/games\/icons\/[a-f0-9-]+\.png$/);assert.equal(uiContext._adminArcadeDrafts.size,0);
  assert(list.innerHTML.includes('class="arcade-game-png"'));
  const imageResponse=await fetch(`http://localhost:${port}${edited.icon}`);assert.equal(imageResponse.status,200);assert(imageResponse.headers.get('content-type').includes('image/png'));
  vm.runInContext('adminEditArcadeGame(toggleId)',uiContext);
  draft=uiContext._adminArcadeDrafts.get(placeholder.id);draft.scriptPath='';
  await vm.runInContext('adminSaveArcadeRow(toggleId)',uiContext);
  assert.equal((await get('/api/admin/arcade-games')).find(game=>game.id===placeholder.id).scriptPath,null);
  vm.runInContext('adminEditArcadeGame(toggleId)',uiContext);uiContext._adminArcadeDrafts.get(placeholder.id).title='Unsaved draft';
  const workingApi=uiContext.api;uiContext.api=async()=>{throw Error('Simulated edit failure');};
  await vm.runInContext('adminSaveArcadeRow(toggleId)',uiContext);
  assert.equal(uiContext._adminArcadeDrafts.get(placeholder.id).title,'Unsaved draft');
  assert.equal(uiContext._adminArcadeDrafts.get(placeholder.id).saving,false);
  assert.equal((await get('/api/admin/arcade-games')).find(game=>game.id===placeholder.id).title,'Inline title');
  vm.runInContext('adminCancelArcadeEdit(toggleId)',uiContext);uiContext.api=workingApi;
  for(const base64 of [Buffer.from('not a PNG').toString('base64'),(()=>{const image=Buffer.from(png,'base64');image.writeUInt32BE(40,16);return image.toString('base64');})()]) {
    const invalidPng=await fetch(`http://localhost:${port}/api/admin/arcade-games/upload-icon`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({base64})});assert.equal(invalidPng.status,400);
  }
  const invalidIcon=await fetch(`http://localhost:${port}/api/admin/arcade-games/${placeholder.id}`,{method:'PATCH',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({icon:'/games/icons/missing.png'})});assert.equal(invalidIcon.status,400);
  await fetch(`http://localhost:${port}/api/admin/arcade-games/${placeholder.id}`,{method:'DELETE',headers});

  // Add only game code and runtime dependencies. Registration happens through Admin.
  fs.writeFileSync(path.join(fixture, 'helper.js'), 'window.packageTestHelper = 42;');
  fs.writeFileSync(path.join(fixture, 'main.js'), "window.TaskItArcade.register({dependencies:{scripts:['helper.js'],styles:['style.css']},mount(frame){frame.textContent=String(window.packageTestHelper);},unmount(){}});");
  fs.writeFileSync(path.join(fixture, 'style.css'), '.package-test { color: white; }');
  fs.writeFileSync(path.join(fixture, 'data.json'), '{"level":1}');
  const entryUrl = '/games/' + path.basename(fixture) + '/main.js';
  const files = await get('/api/admin/arcade-game-files'); assert(files.includes(entryUrl));
  assert(!files.some(url => url.endsWith('/helper.js')), 'Dependencies must not appear as entry modules');
  assert.equal((await get('/api/gamification/arcade/games')).length, 7);
  const created = await registerGame('A title with spaces!', entryUrl, 8);
  fixtureGameId = created.gameId;
  assert.match(fixtureGameId, /^g_[a-f0-9]{32}$/);
  const added = (await get('/api/gamification/arcade/games')).find(game => game.gameId === fixtureGameId);
  assert(added); assert.equal(added.achievementKey, 'game_' + fixtureGameId);
  for (const filename of ['main.js', 'helper.js', 'style.css', 'data.json']) assert.equal((await fetch(`http://localhost:${port}/games/${path.basename(fixture)}/${filename}`)).status, 200);

  // Exercise the actual browser loader: dependency execution must precede mount.
  const context = { window: { location: { origin: `http://localhost:${port}`, href: `http://localhost:${port}/` } }, URL, Map, console, document: {} };
  context.window.TaskItArcade = undefined;
  const elements = [];
  context.document.createElement = tag => ({ tag, dataset: {}, remove() { this.removed = true; } });
  const appendChild = element => {
    elements.push(element);
    setImmediate(() => {
      try {
        if (element.tag === 'script') {
          context.document.currentScript = element;
          const file = path.join(gamesRoot, new URL(element.src, context.window.location.href).pathname.slice('/games/'.length));
          vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox);
          context.document.currentScript = null;
        }
        element.onload();
      } catch (error) { element.onerror(error); }
    });
  };
  context.document.head = { appendChild }; context.document.body = { appendChild };
  context.document.addEventListener = () => {};
  const sandbox = vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(gamesRoot, 'js/arcade-wrapper.js'), 'utf8'), sandbox);
  sandbox.testGame = added;
  await vm.runInContext('arcadeEnsureGameScript(testGame)', sandbox);
  const loaded = sandbox.window.TaskItArcade.getByScriptPath(added.scriptPath);
  assert(loaded);
  assert.equal(loaded.gameId, fixtureGameId, 'Modules need no declared gameId');
  const frame = {}; loaded.mount(frame); assert.equal(frame.textContent, '42'); loaded.unmount();
  vm.runInContext('clearArcadeStyles()', sandbox);
  assert(elements.filter(element => element.tag === 'link').every(element => element.removed));
  vm.runInContext('let activeArcadeGameInstance = { getHighScore: () => null };', sandbox);
  assert.equal(vm.runInContext("readArcadeScoreOnExit('package_test')", sandbox), null);

  // Legacy module IDs differ from generated catalogue IDs, but scores still use the selected row.
  db.prepare('UPDATE users SET gamification_enabled = 1, arcade_pseudonym = ? WHERE id = ?').run('Player', 'test-admin');
  sandbox.gamificationEnabled = true; sandbox.arcadePseudonym = 'Player'; sandbox.toast = () => {};
  sandbox.api = async (method, url, body) => {
    const response = await fetch(`http://localhost:${port}/api${url}`, {method, headers: {...headers, 'Content-Type':'application/json'}, body: body ? JSON.stringify(body) : undefined});
    const data = await response.json(); assert(response.ok, JSON.stringify(data)); return data;
  };
  for (const game of (await get('/api/gamification/arcade/games')).filter(game => game.id !== added.id)) {
    sandbox.testGame = game;
    await vm.runInContext('arcadeEnsureGameScript(testGame)', sandbox);
    const definition = sandbox.window.TaskItArcade.getByScriptPath(game.scriptPath);
    assert.equal(definition.gameId, game.gameId);
  }
  const saved = await vm.runInContext("window.TaskItArcade.submitScore('maze', 321)", sandbox);
  const maze = (await get('/api/gamification/arcade/games')).find(game=>game.scriptPath.endsWith('game-labyrinth.js'));
  assert.equal(saved.gameId, maze.gameId);
  const scores = await vm.runInContext("window.TaskItArcade.getHighScores('maze')", sandbox);
  assert(scores.some(score=>score.score===321));
  const renamed = await fetch(`http://localhost:${port}/api/admin/arcade-games/${maze.id}`, {method:'PATCH',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({title:'Renamed maze', gameId:'ignored_client_value'})});
  assert.equal(renamed.status,200); assert.equal((await renamed.json()).gameId,maze.gameId);

  // Changes invalidate dependencies; Admin edits survive ordinary refreshes.
  db.prepare('UPDATE arcade_games SET title = ? WHERE game_id = ?').run('Admin title', fixtureGameId);
  assert.equal((await get('/api/gamification/arcade/games')).find(game => game.gameId === fixtureGameId).title, 'Admin title');
  fs.appendFileSync(path.join(fixture, 'helper.js'), '\n// revision change');
  const updated = (await get('/api/gamification/arcade/games')).find(game => game.gameId === fixtureGameId);
  assert.notEqual(updated.revision, added.revision);
  // Invalid selection is rejected; dependency failures reject loading before mount.
  const invalid = await fetch(`http://localhost:${port}/api/admin/arcade-games/${added.id}`, { method: 'PATCH', headers: {...headers, 'Content-Type':'application/json'}, body: JSON.stringify({scriptPath:'/games/../package.json'}) });
  assert.equal(invalid.status,400);
  fs.writeFileSync(path.join(fixture,'main.js'), "window.TaskItArcade.register({gameId:'package_test',dependencies:{scripts:['missing.js']},mount(){},unmount(){}});");
  sandbox.testGame = (await get('/api/gamification/arcade/games')).find(game=>game.gameId===fixtureGameId);
  await assert.rejects(vm.runInContext('arcadeEnsureGameScript(testGame)', sandbox), /Could not load game dependency/);
  const removed = await fetch(`http://localhost:${port}/api/admin/arcade-games/${added.id}`, {method:'DELETE', headers}); assert.equal(removed.status,204);
  assert(!(await get('/api/gamification/arcade/games')).some(game=>game.gameId===fixtureGameId),'Deleting in Admin must persist while files remain');
  db.close();
  console.log('Passed: all seven games selectable and registered through Admin without manifests; file-only dependency loading and mount; asset revision changes; Admin edit/delete preservation; invalid path and missing-dependency handling; null exit scores; no-ID modules; legacy score mapping and stable identity on rename; scriptless up/down ordering, boundaries, persistence and numbered UI; descriptions, enable switches, immediate saves and failure recovery; Add placeholder defaults; inline edit/save/cancel/failure; PNG upload, display and size validation; old form removal and achievement-count unlocks; unsaved previews in a separate window, popup blocking, expiry and DOM-ready startup with actual wrapper mounting; pencil toggling and single-row editing.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (db?.open) db.close();
  const exited = child.exitCode !== null || child.signalCode !== null ? Promise.resolve() : new Promise(resolve => child.once('exit', resolve));
  child.kill(); await exited;
  // Verify the recursive cleanup is confined to the fixture and explicit temporary directory.
  assert(fixture.startsWith(gamesRoot + path.sep) && path.basename(fixture).startsWith('package-test-'));
  assert(temp.startsWith(os.tmpdir() + path.sep) && path.basename(temp).startsWith('taskit-package-test-'));
  for(const icon of uploadedIcons) {
    const iconFile=path.resolve(gamesRoot,icon.slice('/games/'.length));
    assert(iconFile.startsWith(path.join(gamesRoot,'icons')+path.sep));
    fs.rmSync(iconFile,{force:true});
  }
  fs.rmSync(fixture, { recursive: true, force: true });
  fs.rmSync(temp, { recursive: true, force: true });
});
