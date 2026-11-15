
"use strict";
/* ============================================================
   LE PLATEAU (version site web installable)
   index.html = appli eleves ; page prof separee.
   Les jeux sont dans jeux.json, a deposer sur le site.
   ============================================================ */
const MODE=window.PLATEAU_MODE||'eleve';
const MOTEURS={
  bref:{nom:'Bref',desc:'QCM avec une petite scène avant chaque question'},
  famille:{nom:'Une classe en or',desc:'Tableaux de réponses à retrouver, 3 croix, puis finale chronométrée'},
  maries:{nom:'Mariés au premier rayon',desc:'Tests des experts (associer), mairie (oui / non), puis questions'}
};
const AVATARS=['👩‍💼','👨‍🔬','👩‍🏫','🧑‍💼','👨‍🏫','👩‍🔬'];
const TEMPLATES={
bref:`N: Lundi. Je suis en cours. Le prof parle de prix. Je regarde par la fenêtre.
Q: Le prix psychologique, c'est :
- Le prix le plus bas du marché
+ Le prix que la majorité des clients est prête à payer
- Le prix fixé par le fabricant
E: Explication affichée après la réponse.
---
Q: Deuxième question (la ligne N: est facultative)
+ Bonne réponse
- Mauvaise réponse
- Mauvaise réponse`,
famille:`T: Titre du premier tableau (ce qu'il faut retrouver)
+ Bonne réponse 1 | 40
+ Bonne réponse 2 | 30
+ Bonne réponse 3 | 20
+ Bonne réponse 4 | 10
- Piège 1
- Piège 2
- Piège 3
---
Q: Question de la finale (15 secondes, 40 points)
+ Bonne réponse
- Mauvaise réponse
- Mauvaise réponse`,
maries:`EXPERT: Prénom | expert en ... | Titre du test
INTRO: Phrase de l'expert avant son test.
= Notion 1 | Sa définition
= Notion 2 | Sa définition
= Notion 3 | Sa définition
---
OUI: Une affirmation juste (le maire attend « oui »).
E: Explication.
---
NON: Une affirmation fausse (le maire attend « non »).
E: Explication.
---
D: Petit cas ou contexte affiché au-dessus de la question (facultatif).
Q: Une question de cas
+ Bonne réponse
- Mauvaise réponse
E: Explication.`
};

/* ---------------- outils ---------------- */
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const shuffle=a=>{a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]]}return a};
const uid=()=>Math.random().toString(36).slice(2,8)+Date.now().toString(36).slice(-4);
function hash(s){let h=2166136261;for(const c of s){h^=c.charCodeAt(0);h=Math.imul(h,16777619)}return (h>>>0).toString(16).padStart(8,'0')}
const b64e=s=>btoa(unescape(encodeURIComponent(s))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const b64d=s=>decodeURIComponent(escape(atob(s.replace(/-/g,'+').replace(/_/g,'/'))));
const fdate=t=>{const d=new Date(t);return d.toLocaleDateString('fr-FR',{day:'2-digit',month:'2-digit'})+' '+d.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})};
const sur20=(s,m)=>m?Math.round(s/m*200)/10:0;
const fr1=x=>String(x).replace('.',',');
function lsGet(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}}
function lsSet(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}

/* ---------------- catalogue ---------------- */
let CAT_SITE={jeux:[]},cat={jeux:[]};
const clone=o=>JSON.parse(JSON.stringify(o));
const catModifie=()=>JSON.stringify(cat)!==JSON.stringify(CAT_SITE);
async function chargerCatalogue(){
  let c=null;
  try{const r=await fetch('jeux.json?v='+Date.now(),{cache:'no-store'});if(r.ok){c=await r.json();lsSet('plateau_cat_cache',c)}}catch(e){}
  if(!c)c=lsGet('plateau_cat_cache',null);
  if(!c||!Array.isArray(c.jeux))c={jeux:[]};
  CAT_SITE=c;
  const br=MODE==='prof'?lsGet('plateau_brouillon',null):null;
  cat=br&&Array.isArray(br.jeux)?br:clone(c);
}
function sauverBrouillon(){if(catModifie())lsSet('plateau_brouillon',cat);else{try{localStorage.removeItem('plateau_brouillon')}catch(e){}}}

/* ---------------- parseur ---------------- */
function parse(moteur,texte){
  const errs=[],m={qcm:[],tabs:[],tests:[],mairie:[],items:[]};
  const blocs=String(texte||'').replace(/\r/g,'').split(/\n\s*-{3,}\s*(?=\n|$)/);
  blocs.forEach((bloc,bi)=>{
    const L=bloc.split('\n').map(l=>l.trim()).filter(l=>l&&!l.startsWith('//'));
    if(!L.length)return;
    const num=bi+1, pre=l=>{const i=l.indexOf(':');return i>0?l.slice(0,i).trim().toUpperCase():''}, val=l=>l.slice(l.indexOf(':')+1).trim();
    const has=p=>L.some(l=>pre(l)===p);
    if(has('EXPERT')){
      const t={nom:'',role:'',titre:'',intro:'',paires:[]};
      L.forEach(l=>{const p=pre(l);
        if(p==='EXPERT'){const x=val(l).split('|').map(s=>s.trim());t.nom=x[0]||'Expert';t.role=x[1]||'';t.titre=x[2]||x[1]||'Test'}
        else if(p==='INTRO')t.intro=val(l);
        else if(l.startsWith('=')){const x=l.slice(1).split('|');if(x.length<2)errs.push(`Bloc ${num} : la ligne « ${l} » doit contenir une barre | entre la notion et sa définition.`);else t.paires.push([x[0].trim(),x.slice(1).join('|').trim()])}
        else errs.push(`Bloc ${num} : ligne non reconnue « ${l} ».`)});
      if(t.paires.length<2)errs.push(`Bloc ${num} (test de ${t.nom}) : il faut au moins 2 lignes « = notion | définition ».`);
      t.av=AVATARS[m.tests.length%AVATARS.length];m.tests.push(t);return;
    }
    if(has('OUI')||has('NON')){
      const x={t:'',v:true,e:''};
      L.forEach(l=>{const p=pre(l);if(p==='OUI'){x.t=val(l);x.v=true}else if(p==='NON'){x.t=val(l);x.v=false}else if(p==='E')x.e=val(l);else errs.push(`Bloc ${num} : ligne non reconnue « ${l} ».`)});
      if(!x.t)errs.push(`Bloc ${num} : affirmation vide.`);
      m.mairie.push(x);return;
    }
    if(has('T')){
      const t={q:'',rep:[],pieges:[]};
      L.forEach(l=>{const p=pre(l);
        if(p==='T')t.q=val(l);
        else if(l.startsWith('+')){const s=l.slice(1),k=s.lastIndexOf('|');let txt=s.trim(),pts=10;if(k>=0){txt=s.slice(0,k).trim();pts=parseInt(s.slice(k+1))||0}if(pts<=0)errs.push(`Bloc ${num} : points manquants ou nuls pour « ${txt} ».`);t.rep.push([txt,pts])}
        else if(l.startsWith('-'))t.pieges.push(l.slice(1).trim());
        else errs.push(`Bloc ${num} : ligne non reconnue « ${l} ».`)});
      if(t.rep.length<2)errs.push(`Bloc ${num} (tableau « ${t.q} ») : il faut au moins 2 bonnes réponses (lignes +).`);
      if(t.rep.length>8)errs.push(`Bloc ${num} : 8 bonnes réponses maximum par tableau.`);
      m.tabs.push(t);return;
    }
    if(has('Q')){
      const q={n:'',d:'',q:'',o:[],r:-1,e:''};
      L.forEach(l=>{const p=pre(l);
        if(['N','D','Q','E'].includes(p))q[p.toLowerCase()]=val(l);
        else if(l.startsWith('+')){if(q.r>=0)errs.push(`Bloc ${num} : une seule bonne réponse (+) par question.`);q.r=q.o.length;q.o.push(l.slice(1).trim())}
        else if(l.startsWith('-'))q.o.push(l.slice(1).trim());
        else errs.push(`Bloc ${num} : ligne non reconnue « ${l} ».`)});
      if(!q.q)errs.push(`Bloc ${num} : question vide (ligne Q:).`);
      if(q.o.length<2)errs.push(`Bloc ${num} : il faut au moins 2 réponses.`);
      if(q.o.length>6)errs.push(`Bloc ${num} : 6 réponses maximum.`);
      if(q.r<0)errs.push(`Bloc ${num} : il manque la bonne réponse (ligne qui commence par +).`);
      m.qcm.push(q);return;
    }
    errs.push(`Bloc ${num} : type non reconnu. Un bloc commence par Q:, T:, EXPERT:, OUI: ou NON:.`);
  });
  if(moteur==='bref'){if(m.tabs.length||m.tests.length||m.mairie.length)errs.push('Le moteur Bref n\'accepte que des questions (Q:).');if(!m.qcm.length)errs.push('Aucune question.');}
  if(moteur==='famille'){if(m.tests.length||m.mairie.length)errs.push('Le moteur Une classe en or accepte des tableaux (T:) et des questions de finale (Q:).');if(!m.tabs.length)errs.push('Il faut au moins un tableau (T:).');}
  if(moteur==='maries'){if(m.tabs.length)errs.push('Le moteur Mariés n\'accepte pas de tableaux (T:).');if(!m.tests.length&&!m.mairie.length&&!m.qcm.length)errs.push('Aucun contenu.');}
  // ordre des items (pour le score et les stats)
  const push=(kind,ref,label)=>{ref.k=m.items.length;m.items.push({kind,ref,label})};
  if(moteur==='famille'){m.tabs.forEach(t=>push('tab',t,'Tableau : '+t.q));m.qcm.forEach(q=>push('qcm',q,'Finale : '+q.q))}
  else if(moteur==='maries'){
    m.tests.forEach(t=>{t.ks=t.paires.map((p,j)=>{const o={t,j};push('pair',o,t.titre+' : '+p[0]);return o.k})});
    m.mairie.forEach(x=>push('mairie',x,'Mairie : '+x.t));m.qcm.forEach(q=>push('qcm',q,q.q));
  } else m.qcm.forEach(q=>push('qcm',q,q.q));
  m.errs=errs;return m;
}
function nbItems(j){try{return parse(j.moteur,j.texte).items.length}catch(e){return 0}}

/* ---------------- coque ---------------- */
$('root').outerHTML=`<div class="phone" id="phone" data-th="hub"><div class="appbar"><button class="back" id="backb" style="display:none" aria-label="Retour">‹</button><div class="ttl" id="ttl"></div><div class="chip" id="chip" style="display:none"></div></div><div class="bar" id="barw" style="display:none"><div id="bar"></div></div><div class="screen" id="screen"></div><div class="bottom" id="bottom"></div><div class="bigx" id="bigx">✕</div></div>`;
const S=$('screen'),B=$('bottom');
function theme(th,wide){$('phone').dataset.th=th;$('phone').classList.toggle('wide',!!wide)}
function appbar(titre,back,chip){$('ttl').innerHTML=titre;const b=$('backb');b.style.display=back?'block':'none';b.onclick=back||null;const c=$('chip');if(chip==null)c.style.display='none';else{c.style.display='block';c.innerHTML=chip}}
function chip(h){const c=$('chip');c.style.display='block';c.innerHTML=h}
function bar(p){$('barw').style.display=p==null?'none':'block';if(p!=null)$('bar').style.width=p+'%'}
function bouton(t,fn,dis){B.innerHTML=`<button class="btn" id="bb" ${dis?'disabled':''}>${t}</button>`;$('bb').onclick=fn;return $('bb')}
function toTop(){S.scrollTop=0}
let quitConfirm=0;

/* ============================================================
   APPLI ELEVES
   ============================================================ */
let ident=lsGet('plateau_ident',{nom:'',classe:''});
function hub(){
  theme('hub');bar(null);B.innerHTML='';
  appbar('Le <em>Plateau</em>',null,null);
  const jeux=cat.jeux.filter(j=>j.visible);
  const last=lsGet('plateau_last',{});
  if(!ident.nom){identite();return}
  S.innerHTML=`
  <div class="hello"><h1>Salut ${esc(ident.nom.split(' ')[0])} 👋</h1><p>${esc(ident.classe||'')}${ident.classe?' · ':''}${jeux.length} jeu${jeux.length>1?'x':''} pour réviser</p><button id="chg">Ce n'est pas moi</button></div>
  <div id="gcards"></div>${jeux.length?jeux.map(j=>{const n=nbItems(j),l=last[j.id];return `<button class="gcard" data-id="${esc(j.id)}">${thumb(j.moteur)}<div class="info"><b>${esc(j.titre)}</b><span>${esc(j.sous||'')}${j.sous?' · ':''}${n} question${n>1?'s':''}</span>${l?`<div class="last">Dernier score : ${fr1(sur20(l.s,l.m))}/20</div>`:''}</div></button>`}).join(''):'<div class="empty">Pas encore de jeu. Reviens bientôt.</div>'}`;
  $('chg').onclick=()=>{ident={nom:'',classe:''};lsSet('plateau_ident',ident);identite()};
  S.querySelectorAll('.gcard').forEach(b=>b.onclick=()=>{const j=cat.jeux.find(x=>x.id===b.dataset.id);if(j)jouer(j,{})});
  boutonInstaller();
  toTop();
}
let promptInstall=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();promptInstall=e;if(MODE==='eleve'&&$('gcards'))boutonInstaller()});
const estInstallee=()=>window.matchMedia&&matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
function boutonInstaller(){
  if(estInstallee()||S.querySelector('#inst'))return;
  const ios=/iphone|ipad|ipod/i.test(navigator.userAgent);
  if(!promptInstall&&!ios)return;
  S.insertAdjacentHTML('beforeend',`<div class="card" id="inst" style="margin-top:14px"><b>📲 Installe l'appli sur ton téléphone</b><p class="small muted" style="margin:6px 0 10px">${ios?'Touche le bouton Partager de Safari, puis « Sur l\'écran d\'accueil ».':'Elle apparaîtra avec une icône, comme les autres applis.'}</p>${ios?'':'<button class="btn sm" id="instb">Installer</button>'}</div>`);
  const b=$('instb');if(b)b.onclick=async()=>{if(!promptInstall)return;promptInstall.prompt();try{await promptInstall.userChoice}catch(e){}promptInstall=null;const c=$('inst');if(c)c.remove()};
}
function thumb(m){return m==='bref'?'<div class="thumb bref">Bref.</div>':m==='famille'?'<div class="thumb famille">Classe<br>en or</div>':m==='maries'?'<div class="thumb maries">💍</div>':'<div class="thumb">🎮</div>'}
function identite(){
  theme('hub');appbar('Le <em>Plateau</em>',null,null);
  S.innerHTML=`<div class="hello"><h1>Le Plateau</h1><p>Des jeux pour réviser tes cours. Commence par te présenter.</p></div>
  <label class="l">Prénom et nom</label><input id="inom" autocomplete="off" value="${esc(ident.nom)}">
  <label class="l">Classe</label><input id="icl" autocomplete="off" placeholder="ex. 1MCV, BTS1…" value="${esc(ident.classe)}">`;
  bouton('C\'est moi',()=>{const n=$('inom').value.trim();if(!n){$('inom').style.borderColor='var(--ko)';return}
    ident={nom:n.slice(0,60),classe:$('icl').value.trim().slice(0,30)};lsSet('plateau_ident',ident);hub()});
}

/* ---------------- lancement d'un jeu ---------------- */
function jouer(jeu,opt){
  const m=parse(jeu.moteur,jeu.texte);
  if(m.errs.length&&!m.items.length){alertBox('Ce jeu contient des erreurs.');return}
  const det=new Array(m.items.length).fill(0),ans=new Array(m.items.length).fill(null);
  const ctx={jeu,m,det,ans,test:!!opt.test,quit:opt.back||hub};
  theme(jeu.moteur);B.innerHTML='';
  const quitter=()=>{if(quitConfirm&&Date.now()-quitConfirm<2500){quitConfirm=0;ctx.quit()}else{quitConfirm=Date.now();chip('Retour ? Touche encore ‹')}};
  appbar(esc(jeu.titre),quitter,'');
  const fin=(score,max)=>resultat(ctx,score,max);
  if(jeu.moteur==='bref')moteurBref(ctx,fin);
  else if(jeu.moteur==='famille')moteurFamille(ctx,fin);
  else moteurMaries(ctx,fin);
}
function alertBox(t){S.insertAdjacentHTML('afterbegin',`<div class="err">${esc(t)}</div>`)}

/* ---------------- voix ---------------- */
const PREF_VOIX=[/thomas/i,/paul/i,/henri/i,/google fran/i,/denise/i,/audrey/i,/am[ée]lie/i,/marie/i,/daniel/i];
function voixFr(){
  let v=[];try{v=(speechSynthesis.getVoices()||[]).filter(x=>/^fr/i.test(x.lang))}catch(e){}
  const rang=x=>{const p=PREF_VOIX.findIndex(r=>r.test(x.name));return (/fr[-_]FR/i.test(x.lang)?0:100)+(p<0?50:p)};
  return v.sort((a,b)=>rang(a)-rang(b));
}
const voixPretes=new Promise(r=>{try{if(!('speechSynthesis' in window))return r();if(speechSynthesis.getVoices().length)return r();speechSynthesis.onvoiceschanged=()=>r();setTimeout(r,2000)}catch(e){r()}});
const VOIX={
  choix(){return lsGet('plateau_voixnom','')},
  dispo(){return voixFr().length>0},
  stop(){try{if(window.speechSynthesis)speechSynthesis.cancel()}catch(e){}},
  async lire(lignes,onLine){
    await voixPretes;const fr=voixFr();if(!fr.length)return false;
    const c=this.choix(),voix=fr.find(v=>v.name===c)||fr[0];
    for(let i=0;i<lignes.length;i++){
      const ok=await new Promise(res=>{let fait=false;const fin=v=>{if(!fait){fait=true;res(v)}};
        const u=new SpeechSynthesisUtterance(lignes[i].text);u.lang=voix.lang||'fr-FR';try{u.voice=voix}catch(e){}u.rate=lignes[i].rate||1.1;
        u.onstart=()=>onLine(i);u.onend=()=>fin(true);u.onerror=()=>fin(false);try{speechSynthesis.speak(u)}catch(e){fin(false)}
        setTimeout(()=>fin(true),Math.max(4000,lignes[i].text.length*130))});
      if(!ok)return i>0;
    }
    return true;
  }
};

/* ---------------- moteur BREF ---------------- */
function moteurBref(ctx,fin){
  const Q=ctx.m.qcm;let score=0,voix=lsGet('plateau_voix',true),stopTout=false;
  const intro=async()=>{bar(0);B.innerHTML='';await voixPretes;
    const ok=VOIX.dispo();if(!ok)voix=false;
    S.innerHTML=`<div class="brefbig" style="margin-top:24px">Bref.</div><p class="center" style="font-family:var(--tfont);font-size:20px">${esc(ctx.jeu.titre.replace(/^Bref\.\s*/,''))}</p><p class="center muted">${Q.length} questions. Une seule réponse à chaque fois. Ça va vite.</p>
    <p class="center" style="font-weight:700;margin:18px 0 10px">Tu joues comment ?</p>
    <div class="modes"><button class="mode ${voix?'on':''}" id="mv" ${ok?'':'disabled'}><span>🔊</span><b>Avec voix</b><small>${ok?'Une voix lit les scènes et les questions':'Pas de voix française sur cet appareil'}</small></button>
    <button class="mode ${voix?'':'on'}" id="ms"><span>🔇</span><b>Sans voix</b><small>Tu lis à ton rythme</small></button></div>
    <div id="vbox" class="card" style="margin-top:12px;display:${voix?'block':'none'}"><div style="display:flex;gap:8px;align-items:center"><select id="vsel" style="margin:0;flex:1;font-size:14px;padding:10px"></select><button class="btn sm sec" id="vtest">▶ Écouter</button></div><p class="small muted" style="margin:8px 0 0">Monte le son. Touche l'écran pour passer une scène. Le bouton 🔊 en haut coupe ou remet la voix pendant le jeu.</p></div>`;toTop();
    const choisir=v=>{voix=v;$('mv').classList.toggle('on',v);$('ms').classList.toggle('on',!v);$('vbox').style.display=v?'block':'none';if(!v)VOIX.stop()};
    $('mv').onclick=()=>choisir(true);$('ms').onclick=()=>choisir(false);
    const vs=$('vsel'),fr=voixFr(),c=VOIX.choix();
    vs.innerHTML=fr.map(v=>`<option value="${esc(v.name)}" ${v.name===c?'selected':''}>${esc(v.name.replace(/\s*\(.*\)\s*$/,''))}${/fr[-_]FR/i.test(v.lang)?'':' ('+esc(v.lang)+')'}</option>`).join('');
    vs.onchange=()=>lsSet('plateau_voixnom',vs.value);
    $('vtest').onclick=()=>{lsSet('plateau_voixnom',vs.value);VOIX.stop();VOIX.lire([{text:"Bref. J'ai révisé l'offre.",rate:1.1}],()=>{})};
    bouton('Action.',()=>{lsSet('plateau_voix',voix);lsSet('plateau_voixnom',vs.value);VOIX.stop();go(0)})};
  const basculer=()=>{voix=!voix;lsSet('plateau_voix',voix);if(!voix)VOIX.stop();const t=$('vtog');if(t)t.textContent=voix?'🔊':'🔇'};
  const quitOrig=ctx.quit;ctx.quit=()=>{stopTout=true;VOIX.stop();quitOrig()};
  const go=async i=>{
    if(stopTout)return;
    if(i>=Q.length){VOIX.stop();return fin(score,Q.length)}
    const q=Q[i];bar(i/Q.length*100);B.innerHTML='';
    const ph=q.n?q.n.split(/(?<=[.!?…])\s+/).filter(Boolean):[];
    S.innerHTML=`<div class="qnum" style="display:flex;justify-content:space-between;align-items:center"><span>Question ${i+1} / ${Q.length}</span>${VOIX.dispo()?`<button id="vtog" class="back" style="width:34px;height:34px;font-size:15px" title="Voix">${voix?'🔊':'🔇'}</button>`:''}</div><div class="narr">${ph.map(p=>`<div>${esc(p)}</div>`).join('')}<div class="brefline">Bref.</div></div><div class="qbox" id="qb">${q.d?`<div class="dossier">${esc(q.d)}</div>`:''}<div class="qtxt">${esc(q.q)}</div><div id="opts"></div><div id="fb"></div></div>`;toTop();
    const lignesEl=[...S.querySelectorAll('.narr div')];
    const montrer=n=>{for(let x=0;x<=Math.min(n,lignesEl.length-1);x++)lignesEl[x].classList.add('on');if(n>=lignesEl.length){const qb=$('qb');if(qb)qb.classList.add('on')}};
    let skip=false;S.onclick=e=>{if(e.target&&e.target.id==='vtog')return;if(!skip){skip=true;VOIX.stop();montrer(99)}};
    if($('vtog'))$('vtog').onclick=e=>{e.stopPropagation();basculer()};
    let lu=false;
    if(voix&&VOIX.dispo()){
      const L=[...ph.map(t=>({text:t,rate:1.2})),{text:'Bref.',rate:0.95},{text:q.q,rate:1.05}];
      lu=await VOIX.lire(L,n=>{if(!skip)montrer(n)});
      if(stopTout)return;
    }
    if(!lu&&!skip){for(let x=0;x<lignesEl.length;x++){if(skip||stopTout)break;montrer(x);await sleep(x===lignesEl.length-1?750:600)}}
    S.onclick=null;if(stopTout||!$('qb'))return;montrer(99);
    qcmOptions(q,$('opts'),(j,ok)=>{VOIX.stop();ctx.ans[q.k]=j;if(ok){ctx.det[q.k]=1;score++}chip(`${score} / ${Q.length}`);
      $('fb').innerHTML=`<div class="fb"><b class="${ok?'ok-t':'ko-t'}">${ok?'Bien joué.':'Raté.'}</b> ${esc(q.e||('Bonne réponse : '+q.o[q.r]))}</div>`;
      bouton(i<Q.length-1?'Question suivante':'Le verdict',()=>go(i+1));scrollFb()});
  };
  chip(`0 / ${Q.length}`);intro();
}
function qcmOptions(q,box,cb){
  q.o.forEach((t,j)=>{const b=document.createElement('button');b.className='opt';b.textContent=t;box.appendChild(b);
    b.onclick=()=>{const all=box.querySelectorAll('.opt');all.forEach(x=>x.disabled=true);all[q.r].classList.add('ok');if(j!==q.r)b.classList.add('ko');cb(j,j===q.r)}});
}
function scrollFb(){setTimeout(()=>{const f=$('fb');if(f)f.scrollIntoView({behavior:'smooth',block:'nearest'})},60)}

/* ---------------- moteur FAMILLE ---------------- */
function moteurFamille(ctx,fin){
  const T=ctx.m.tabs,F=ctx.m.qcm;let score=0;
  const max=T.reduce((a,t)=>a+t.rep.reduce((x,r)=>x+r[1],0),0)+F.length*40;
  const maj=()=>chip('⭐ '+score+' pts');maj();
  const tableau=i=>{
    if(i>=T.length)return F.length?introFinale():fin(score,max);
    const t=T[i],tot=t.rep.reduce((x,r)=>x+r[1],0);let x=0,trouve=0,pts=0,fini=false,clos=false;
    bar(i/(T.length+(F.length?1:0))*100);B.innerHTML='';
    const props=shuffle([...t.rep.map(r=>({t:r[0],ok:true})),...t.pieges.map(p=>({t:p,ok:false}))]);
    S.innerHTML=`<div class="fq"><small>Tableau ${i+1}/${T.length} · ${tot} points en jeu</small>${esc(t.q)}</div>
    <div class="board">${t.rep.map((r,k)=>`<div class="slot" id="s${k}"><div class="in"><div class="face front"><i>${k+1}</i></div><div class="face backf"><span>${esc(r[0])}</span><b>${r[1]}</b></div></div></div>`).join('')}</div>
    <div class="strikes"><span>✕</span><span>✕</span><span>✕</span></div><div class="props" id="props"></div><div id="fb"></div>`;toTop();
    const box=$('props');
    const clore=g=>{if(clos)return;clos=true;fini=true;box.querySelectorAll('.prop').forEach(b=>b.disabled=true);
      t.rep.forEach((r,k)=>{const s=$('s'+k);if(!s.classList.contains('open'))s.classList.add('open','missed')});
      ctx.det[t.k]=tot?pts/tot:0;
      $('fb').innerHTML=`<div class="fb center"><b>${g?'Tableau complet !':'Trois croix, le tableau se ferme.'}</b> +${pts} points.${g?'':' Les cases grises montrent ce qui manquait.'}</div>`;
      bouton(i<T.length-1?'Tableau suivant':(F.length?'Place à la finale':'Le résultat'),()=>tableau(i+1));scrollFb()};
    props.forEach(p=>{const b=document.createElement('button');b.className='prop';b.textContent=p.t;box.appendChild(b);
      b.onclick=()=>{if(fini)return;b.disabled=true;
        if(p.ok){const k=t.rep.findIndex(r=>r[0]===p.t);$('s'+k).classList.add('open');b.classList.add('ok');pts+=t.rep[k][1];score+=t.rep[k][1];trouve++;maj();if(trouve===t.rep.length)clore(true)}
        else{b.classList.add('ko');S.querySelectorAll('.strikes span')[x].classList.add('on');x++;const bx=$('bigx');bx.classList.remove('show');void bx.offsetWidth;bx.classList.add('show');
          if(x>=3){fini=true;box.querySelectorAll('.prop').forEach(z=>z.disabled=true);setTimeout(()=>clore(false),500)}}}});
  };
  const introFinale=()=>{bar(T.length/(T.length+1)*100);
    S.innerHTML=`<h1 class="center" style="text-transform:uppercase">La finale<br><span style="color:var(--acc)">en or</span></h1><p class="center">Tu as <b style="color:var(--acc)">${score} points</b>.</p><div class="card">⏱️ ${F.length} question${F.length>1?'s':''}, <b>15 secondes</b> chacune. Temps écoulé = 0 point.</div><div class="card">⭐ <b>40 points</b> par bonne réponse.</div>`;toTop();
    bouton('Lancer le chrono',()=>finale(0))};
  let chrono=null;
  const finale=k=>{
    if(k>=F.length)return fin(score,max);
    const q=F[k];let t=15,rep=false;B.innerHTML='';
    S.innerHTML=`<div class="qnum center">Finale · ${k+1}/${F.length}</div><div class="timer" id="tm"><b id="tv">15</b></div><div class="fq">${esc(q.q)}</div><div id="opts"></div><div id="fb"></div>`;toTop();
    const box=$('opts');
    const stop=(j)=>{if(rep)return;rep=true;clearInterval(chrono);const all=box.querySelectorAll('.opt');all.forEach(b=>b.disabled=true);all[q.r].classList.add('ok');
      const ok=j===q.r;if(j!=null&&!ok)all[j].classList.add('ko');ctx.ans[q.k]=j;if(ok){ctx.det[q.k]=1;score+=40;maj()}
      $('fb').innerHTML=`<div class="fb center"><b class="${ok?'ok-t':'ko-t'}">${ok?'Bonne réponse ! +40':(j==null?'Temps écoulé.':'Raté.')}</b>${ok?'':' Réponse : '+esc(q.o[q.r])}</div>`;
      bouton(k<F.length-1?'Question suivante':'Le résultat',()=>finale(k+1))};
    q.o.forEach((o,j)=>{const b=document.createElement('button');b.className='opt';b.textContent=o;b.onclick=()=>stop(j);box.appendChild(b)});
    clearInterval(chrono);chrono=setInterval(()=>{const tm=$('tm');if(!tm){clearInterval(chrono);return}t--;$('tv').textContent=t;tm.style.setProperty('--p',(t/15*100)+'%');if(t<=5)tm.classList.add('low');if(t<=0)stop(null)},1000);
  };
  tableau(0);
}

/* ---------------- moteur MARIES ---------------- */
function moteurMaries(ctx,fin){
  const m=ctx.m,tot=m.items.length;let score=0,fait=0;
  const maj=()=>chip('💍 '+score+' / '+tot);maj();
  const prog=()=>bar(fait/tot*100);
  const etapes=[];
  if(m.tests.length)etapes.push(introTests);
  m.tests.forEach((t,ti)=>{const ordre=shuffle(t.paires.map((_,j)=>j));ordre.forEach((j,n)=>etapes.push(()=>testQ(t,ti,j,n)))});
  if(m.mairie.length){etapes.push(()=>introSimple('🎩','Monsieur le maire','Je vais lire des affirmations. Si elle est juste, tu dis oui. Sinon, tu refuses.','Épisode · Le passage à la mairie'));shuffle(m.mairie).forEach((x,n)=>etapes.push(()=>mairieQ(x,n)))}
  if(m.qcm.length){etapes.push(()=>introSimple('🏡','La vie commune','Maintenant, place aux situations concrètes. Lis bien chaque cas.','Épisode · La vie commune'));m.qcm.forEach((q,n)=>etapes.push(()=>qcmQ(q,n)))}
  let e=0;const next=()=>{if(e>=etapes.length)return fin(score,tot);etapes[e++]()};
  function introTests(){prog();B.innerHTML='';
    S.innerHTML=`<div class="tag">Épisode · Les tests avec les experts</div><h2>Les tests avec les experts</h2><p class="muted">Chaque expert te présente une notion, tu choisis la bonne réponse. Une seule tentative.</p>${m.tests.map(t=>`<div class="expert"><div class="avatar">${t.av}</div><div class="bubble"><b>${esc(t.nom)}${t.role?', '+esc(t.role):''}</b>Mon test : ${esc(t.titre)}.</div></div>`).join('')}`;toTop();
    bouton('Commencer',next)}
  function introSimple(av,nom,txt,tag){prog();B.innerHTML='';
    S.innerHTML=`<div class="tag">${tag}</div><div class="expert" style="margin-top:20px"><div class="avatar">${av}</div><div class="bubble"><b>${nom}</b>${txt}</div></div>`;toTop();bouton('C\'est parti',next)}
  function testQ(t,ti,j,n){prog();B.innerHTML='';
    const p=t.paires[j],opts=shuffle(t.paires.map((x,i)=>({txt:x[1],i})));const k=t.ks[j];
    S.innerHTML=`<div class="tag">Test ${ti+1}/${m.tests.length} · ${n+1}/${t.paires.length}</div><div class="expert"><div class="avatar">${t.av}</div><div class="bubble" id="bub"><b>${esc(t.nom)}</b>${n===0&&t.intro?esc(t.intro):'Suivante. Concentre-toi.'}</div></div><div class="notion"><small>${esc(t.titre)}</small><div>${esc(p[0])}</div></div><div id="opts"></div>`;toTop();
    const box=$('opts');
    opts.forEach(o=>{const b=document.createElement('button');b.className='opt';b.textContent=o.txt;box.appendChild(b);
      b.onclick=()=>{const all=box.querySelectorAll('.opt');all.forEach(x=>x.disabled=true);all[opts.findIndex(x=>x.i===j)].classList.add('ok');
        ctx.ans[k]=o.i;fait++;const bub=$('bub');
        if(o.i===j){ctx.det[k]=1;score++;maj();bub.className='bubble ok';bub.innerHTML=`<b>${esc(t.nom)}</b>Parfait, c'est un match.`}
        else{b.classList.add('ko');bub.className='bubble ko';bub.innerHTML=`<b>${esc(t.nom)}</b>Non. ${esc(p[0])} : ${esc(p[1])}.`}
        bouton('Suivant',next)}})}
  function mairieQ(x,n){prog();B.innerHTML='';
    S.innerHTML=`<div class="tag">La mairie · ${n+1}/${m.mairie.length}</div><div class="statement">« ${esc(x.t)} »</div><div class="yn"><button class="oui" id="oui">💍 Oui, je le veux</button><button class="non" id="non">✋ Non, je refuse</button></div><div id="fb"></div>`;toTop();
    const rep=v=>{$('oui').disabled=$('non').disabled=true;const ok=v===x.v;ctx.ans[x.k]=v?1:0;fait++;if(ok){ctx.det[x.k]=1;score++;maj()}
      $('fb').innerHTML=`<div class="fb"><b class="${ok?'ok-t':'ko-t'}">${ok?'Bien vu.':'Raté.'}</b> ${x.v?'Oui.':'Non.'} ${esc(x.e)}</div>`;bouton('Suivant',next);scrollFb()};
    $('oui').onclick=()=>rep(true);$('non').onclick=()=>rep(false)}
  function qcmQ(q,n){prog();B.innerHTML='';
    S.innerHTML=`<div class="tag">Question ${n+1}/${m.qcm.length}</div>${q.d?`<div class="dossier">${esc(q.d)}</div>`:''}<div class="qtxt">${esc(q.q)}</div><div id="opts"></div><div id="fb"></div>`;toTop();
    qcmOptions(q,$('opts'),(j,ok)=>{ctx.ans[q.k]=j;fait++;if(ok){ctx.det[q.k]=1;score++;maj()}
      $('fb').innerHTML=`<div class="fb"><b class="${ok?'ok-t':'ko-t'}">${ok?'Bien joué.':'Raté.'}</b> ${esc(q.e||('Bonne réponse : '+q.o[q.r]))}</div>`;bouton('Suivant',next);scrollFb()})}
  next();
}

/* ---------------- resultat ---------------- */
function codeDe(r){const p=b64e(JSON.stringify(r));return 'RES-'+p+'-'+hash('plateau'+p).slice(0,5)}
function lireCodes(txt){
  const out=[],re=/RES-([A-Za-z0-9_-]+)-([0-9a-f]{5})/g;let mm;
  while((mm=re.exec(txt))){
    if(hash('plateau'+mm[1]).slice(0,5)!==mm[2]){out.push({err:true});continue}
    try{const o=JSON.parse(b64d(mm[1]));if(!o.g||typeof o.d!=='string')throw 0;
      out.push({id:hash(mm[0]),g:String(o.g),n:String(o.n||'?').slice(0,60),c:String(o.c||'').slice(0,30),d:o.d,a:typeof o.a==='string'?o.a:'',s:Number(o.s)||0,m:Number(o.m)||1,t:Number(o.t)||Date.now()})}
    catch(e){out.push({err:true})}
  }
  return out;
}
const encDet=det=>det.map(x=>Math.round(Math.max(0,Math.min(1,x))*9)).join('');
const encAns=ans=>ans.map(a=>a==null?'.':String(Math.min(9,Math.max(0,Number(a))))).join('');
async function resultat(ctx,score,max){
  const {jeu,m}=ctx;bar(100);const n20=sur20(score,max),pct=max?score/max:0;
  let titre,txt;
  if(jeu.moteur==='bref'){titre='Bref.';txt=pct>=.8?"J'ai tout révisé. Je suis prêt.":pct>=.5?"J'ai les bases. Il me reste deux ou trois trucs à relire. Ce soir. Ou demain.":"J'ai ouvert le cours. Je l'ai refermé. Il va falloir le rouvrir."}
  else if(jeu.moteur==='famille'){titre=pct>=.75?'🏆 Une classe en or':pct>=.5?'🥈 Pas loin du jackpot':'📚 Retour aux révisions';txt=pct>=.75?'Jackpot. Le chapitre est maîtrisé.':pct>=.5?'De bonnes bases. Relis les réponses ratées.':'Reprends le cours, puis retente ta chance.'}
  else{titre=pct>=.75?'💒 Ils restent mariés':pct>=.5?'💞 On se laisse une chance':'💔 Divorce prononcé';txt=pct>=.75?'Les experts sont fiers de toi.':pct>=.5?'Les bases sont là. Relis les notions ratées.':'Le mariage n\'a pas tenu. Reprends le cours, puis rejoue.'}
  const date=Date.now();
  const rec={g:jeu.id,n:ident.nom,c:ident.classe,d:encDet(ctx.det),a:encAns(ctx.ans),s:score,m:max,t:date};
  const code=codeDe(rec);
  const rates=m.items.filter(it=>ctx.det[it.ref.k]<1);
  B.innerHTML='';
  S.innerHTML=`
  ${jeu.moteur==='bref'?`<div class="brefbig">Bref.</div><p class="center" style="font-family:var(--tfont);font-size:20px;margin:6px 0">J'ai eu</p>`:`<h2 class="center" style="margin-top:8px">${titre}</h2>`}
  <div class="big">${jeu.moteur==='famille'?score+' pts':fr1(n20)+'/20'}</div>
  ${jeu.moteur==='famille'?`<p class="center muted">sur ${max} points · soit ${fr1(n20)}/20</p>`:''}
  <p class="center">${esc(txt)}</p>
  <p class="center muted small">${esc(ident.nom||'')}${ident.classe?' · '+esc(ident.classe):''} · ${fdate(date)}</p>
  ${ctx.test?'<div class="okmsg">Mode test : ce résultat n\'est pas enregistré.</div>':`
  <div class="card"><b>📨 Envoie ce code à ton prof</b><div class="small muted">C'est comme ça qu'il voit ton résultat. Copie-le et colle-le dans un message (ENT, Pronote, mail).</div>
    <div class="codebox" id="code">${code}</div><button class="btn sm" id="copy">Copier le code</button> ${navigator.share?'<button class="btn sm sec" id="share">Partager</button>':''} <span id="copied" class="small muted"></span></div>`}
  <div class="card"><b>À revoir</b>${rates.length?rates.map(it=>`<div class="dline">${esc(it.label)}<br><span class="ok-t">${esc(bonneRep(it))}</span></div>`).join(''):'<div class="dline">Rien. Tout est bon.</div>'}</div>`;
  toTop();
  B.innerHTML=`<button class="btn sec" id="rj">Rejouer</button><button class="btn" id="hb">${ctx.test?'Retour':'Les jeux'}</button>`;
  $('rj').onclick=()=>jouer(jeu,{test:ctx.test,back:ctx.quit});$('hb').onclick=ctx.quit;
  appbar(esc(jeu.titre),ctx.quit,null);
  if(ctx.test)return;
  const last=lsGet('plateau_last',{});last[jeu.id]={s:score,m:max,t:date};lsSet('plateau_last',last);
  $('copy').onclick=async()=>{try{await navigator.clipboard.writeText(code);$('copied').textContent='Copié.'}catch(e){const r=document.createRange();r.selectNodeContents($('code'));const s=getSelection();s.removeAllRanges();s.addRange(r);$('copied').textContent='Code sélectionné : copie-le.'}};
  const sh=$('share');if(sh)sh.onclick=async()=>{try{await navigator.share({title:'Le Plateau : '+jeu.titre,text:code})}catch(e){}};
}
function bonneRep(it){
  const r=it.ref;
  if(it.kind==='qcm')return 'Bonne réponse : '+r.o[r.r];
  if(it.kind==='pair')return r.t.paires[r.j][1];
  if(it.kind==='mairie')return (r.v?'Oui. ':'Non. ')+(r.e||'');
  if(it.kind==='tab')return 'Réponses : '+r.rep.map(x=>x[0]).join(', ');
  return '';
}
function repDonnee(it,a){
  if(a==null||a==='.'||a==='')return null;const r=it.ref,v=Number(a);
  if(it.kind==='qcm')return r.o[v]??null;
  if(it.kind==='pair')return r.t.paires[v]?r.t.paires[v][1]:null;
  if(it.kind==='mairie')return v?'Oui':'Non';
  return null;
}

/* ============================================================
   APPLI PROF (page separee, resultats gardes sur l'ordinateur du prof)
   ============================================================ */
let P={onglet:'res',jeu:null,classe:'',codes:lsGet('plateau_codes',[]),msg:''};
function telecharger(nom,contenu,type){
  const b=new Blob([contenu],{type:type||'application/octet-stream'}),a=document.createElement('a');
  a.href=URL.createObjectURL(b);a.download=nom;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500);
}
const sauverCodes=()=>lsSet('plateau_codes',P.codes);
function prof(){rendreProf()}
function lignesJeu(gid){
  return P.codes.filter(r=>r.g===gid).map(r=>({n:r.n,c:r.c,d:r.d,a:r.a||'',s:r.s,m:r.m,t:r.t,id:r.id})).sort((a,b)=>b.t-a.t);
}
function rendreProf(){
  theme('prof',true);B.innerHTML='';appbar('Le <em>Plateau</em> · espace prof',null,null);
  const nmod=catModifie();
  let h=`${nmod?`<div class="pubbar"><span><b>Tes changements de jeux ne sont pas encore en ligne.</b><br>Pour que les élèves les voient : télécharge <b>jeux.json</b>, puis remplace l'ancien fichier sur ton site.</span><button class="btn sm" id="dljson">Télécharger jeux.json</button><button class="btn sm sec" id="annul">Annuler mes changements</button></div>`:''}
  ${P.msg?`<div class="okmsg">${P.msg}</div>`:''}
  <div class="tabs"><button data-o="res" class="${P.onglet==='res'?'on':''}">📊 Résultats</button><button data-o="jeux" class="${P.onglet==='jeux'?'on':''}">🎮 Jeux</button><button data-o="codes" class="${P.onglet==='codes'?'on':''}">🔑 Ajouter des codes</button><button data-o="sauv" class="${P.onglet==='sauv'?'on':''}">💾 Sauvegarde</button><a class="tabs-a" href="index.html" target="_blank" rel="noopener">👀 Voir l'appli élèves</a></div>`;
  if(P.onglet==='res')h+=vueResultats();
  else if(P.onglet==='jeux')h+=vueJeux();
  else if(P.onglet==='codes')h+=vueCodes();
  else h+=vueSauv();
  S.innerHTML=h;P.msg='';
  S.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{P.onglet=b.dataset.o;rendreProf();toTop()});
  if($('dljson'))$('dljson').onclick=()=>{telecharger('jeux.json',JSON.stringify(cat,null,1),'application/json');P.msg='jeux.json téléchargé. Dépose-le sur ton site à la place de l\'ancien : les élèves verront les changements à leur prochaine ouverture. Quand c\'est fait, recharge cette page.';rendreProf()};
  if($('annul'))$('annul').onclick=()=>{const b=$('annul');if(!b.dataset.arm){b.dataset.arm=1;b.textContent='Confirmer ?';return}cat=clone(CAT_SITE);sauverBrouillon();rendreProf()};
  brancher();
}
/* --- resultats --- */
function vueResultats(){
  const tous=cat.jeux;if(!tous.length)return '<p class="muted">Aucun jeu pour l\'instant.</p>';
  if(!P.jeu||!tous.find(j=>j.id===P.jeu))P.jeu=tous[0].id;
  const jeu=tous.find(j=>j.id===P.jeu),m=parse(jeu.moteur,jeu.texte);
  const all=lignesJeu(jeu.id),classes=[...new Set(all.map(r=>r.c).filter(Boolean))].sort();
  const L=all.filter(r=>!P.classe||r.c===P.classe);
  const notes=L.map(r=>sur20(r.s,r.m)),moy=notes.length?notes.reduce((a,b)=>a+b,0)/notes.length:0;
  P._L=L;P._m=m;P._jeu=jeu;
  return `<div class="grid2"><div><label class="l">Jeu</label><select id="selj">${tous.map(j=>`<option value="${esc(j.id)}" ${j.id===P.jeu?'selected':''}>${esc(j.titre)}${j.visible?'':' (masqué)'}</option>`).join('')}</select></div>
  <div><label class="l">Classe</label><select id="selc"><option value="">Toutes</option>${classes.map(c=>`<option ${c===P.classe?'selected':''}>${esc(c)}</option>`).join('')}</select></div></div>
  <div class="kpis"><div class="kpi"><b>${L.length}</b><span>résultat${L.length>1?'s':''}</span></div><div class="kpi"><b>${L.length?fr1(moy.toFixed(1)):'–'}</b><span>moyenne /20</span></div><div class="kpi"><b>${L.length?Math.round(notes.filter(x=>x>=10).length/L.length*100)+' %':'–'}</b><span>≥ 10/20</span></div></div>
  <div class="cols"><div class="card"><h3 style="margin-top:0">Élèves</h3>${L.length?L.map((r,i)=>{const n=sur20(r.s,r.m);return `<div class="row" data-i="${i}"><div><div class="n">${esc(r.n)}</div><div class="s">${esc(r.c||'sans classe')} · ${fdate(r.t)}</div></div><div class="sc" style="color:${n>=10?'var(--ok)':'var(--ko)'}">${fr1(n)}/20</div></div>`}).join('')+`<div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap"><button class="btn sm sec" id="csvdl">Télécharger pour Excel</button><button class="btn sm sec" id="csv">Copier le tableau</button> <span id="csvok" class="small muted"></span></div>`:'<p class="muted small">Pas encore de résultat pour ce jeu. Colle les codes envoyés par les élèves dans l\'onglet « Ajouter des codes ».</p>'}</div>
  <div class="card"><h3 style="margin-top:0">Réussite par question</h3>${L.length?m.items.map((it,k)=>{
      const vals=L.map(r=>Number(r.d[k]||0)/9),p=Math.round(vals.reduce((a,b)=>a+b,0)/L.length*100),col=p>=50?'var(--ok)':'var(--ko)';
      const faux={};L.forEach(r=>{if(Number(r.d[k]||0)<9){const t=repDonnee(it,r.a[k]);if(t)faux[t]=(faux[t]||0)+1}});const pire=Object.entries(faux).sort((a,b)=>b[1]-a[1])[0];
      return `<div class="qstat"><div class="t"><span>${k+1}. ${esc(it.label)}</span><b style="color:${col}">${p} %</b></div><div class="track"><div style="width:${p}%;background:${col}"></div></div>${pire?`<div class="small muted" style="margin-top:4px">Erreur la plus fréquente : « ${esc(pire[0])} » (${pire[1]})</div>`:''}</div>`}).join(''):'<p class="muted small">Pas encore de données.</p>'}</div></div>`;
}
/* --- jeux --- */
function vueJeux(){
  return `<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px"><p class="muted small" style="margin:0;flex:1;min-width:220px">Coche un jeu pour qu'il apparaisse dans l'appli élèves, décoche-le pour le masquer. Ensuite, mets en ligne le nouveau jeux.json (bandeau jaune).</p><button class="btn sm" id="nouv">+ Nouveau jeu</button></div>
  ${cat.jeux.length?cat.jeux.map((j,i)=>{const m=parse(j.moteur,j.texte);return `<div class="gitem"><label class="vis ${j.visible?'on':''}"><input type="checkbox" data-v="${i}" ${j.visible?'checked':''}><span>${j.visible?'Visible':'Masqué'}</span></label>${thumb(j.moteur)}<div class="info"><b>${esc(j.titre)}</b><span>${esc(MOTEURS[j.moteur]?MOTEURS[j.moteur].nom:j.moteur)} · ${m.items.length} question${m.items.length>1?'s':''}${j.sous?' · '+esc(j.sous):''}</span>${m.errs.length?`<div class="small ko-t">⚠ ${m.errs.length} erreur${m.errs.length>1?'s':''}</div>`:''}</div>
  <div class="acts"><button class="btn sm sec" data-a="up" data-i="${i}" ${i===0?'disabled':''}>▲</button><button class="btn sm sec" data-a="down" data-i="${i}" ${i===cat.jeux.length-1?'disabled':''}>▼</button><button class="btn sm sec" data-a="edit" data-i="${i}">Modifier</button><button class="btn sm sec" data-a="test" data-i="${i}">Tester</button><button class="btn sm sec" data-a="cor" data-i="${i}">Corrigé</button><button class="btn sm sec" data-a="dup" data-i="${i}">Dupliquer</button><button class="btn sm danger" data-a="del" data-i="${i}">Supprimer</button></div></div>`}).join(''):'<p class="muted">Aucun jeu. Crée le premier.</p>'}`;
}
/* --- codes --- */
function vueCodes(){
  return `<div class="card"><p class="small muted">Colle ici les codes reçus (un ou plusieurs, même au milieu de messages copiés en vrac). Chaque code commence par <b>RES-</b>. Les doublons sont ignorés.</p>
  <textarea id="ta" style="min-height:180px" placeholder="RES-…"></textarea><button class="btn" id="addc" style="width:auto;padding:12px 20px">Ajouter les résultats</button><div id="addmsg" class="small" style="margin-top:8px"></div></div>`;
}
/* --- sauvegarde --- */
function vueSauv(){
  return `<div class="card"><h3 style="margin-top:0">Où sont les résultats ?</h3><p class="small">Ils sont enregistrés dans ce navigateur, sur cet ordinateur. Aucun serveur ne les reçoit. ${P.codes.length} résultat${P.codes.length>1?'s':''} enregistré${P.codes.length>1?'s':''} pour l'instant.</p>
  <p class="small muted">Pense à faire une sauvegarde de temps en temps (par exemple dans ton Google Drive). Elle sert aussi à retrouver tes résultats sur un autre ordinateur.</p>
  <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" id="exp">Télécharger une sauvegarde</button><label class="btn sm sec" style="cursor:pointer">Importer une sauvegarde<input type="file" id="imp" accept=".json,application/json" style="display:none"></label></div><div id="sauvmsg" class="small" style="margin-top:8px"></div></div>
  <div class="card"><h3 style="margin-top:0">Lien et QR code pour les élèves</h3><p class="small"><b id="lienel"></b></p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm sec" id="cplien">Copier le lien</button><button class="btn sm" id="qrb">Afficher le QR code</button></div><div id="qrz" style="margin-top:12px"></div></div>
  <div class="card"><h3 style="margin-top:0">Fichier des jeux</h3><p class="small muted">Le fichier jeux.json contient tous tes jeux. C'est lui qu'il faut remettre sur le site après chaque changement.</p><button class="btn sm sec" id="dl2">Télécharger jeux.json</button></div>`;
}
function brancher(){
  const sj=$('selj');if(sj)sj.onchange=()=>{P.jeu=sj.value;rendreProf()};
  const sc=$('selc');if(sc)sc.onchange=()=>{P.classe=sc.value;rendreProf()};
  S.querySelectorAll('.row').forEach(r=>r.onclick=()=>fiche(P._L[Number(r.dataset.i)]));
  const csvTxt=()=>{const m=P._m,L=P._L;return [['Nom','Classe','Note /20','Score','Max','Date',...m.items.map((_,k)=>'Q'+(k+1))].join(';'),...L.map(r=>[r.n,r.c,fr1(sur20(r.s,r.m)),r.s,r.m,fdate(r.t),...m.items.map((_,k)=>fr1(Math.round(Number(r.d[k]||0)/9*100)/100))].map(v=>String(v??'').replace(/[;\n]/g,',')).join(';'))].join('\n')};
  const csv=$('csv');if(csv)csv.onclick=async()=>{try{await navigator.clipboard.writeText(csvTxt());$('csvok').textContent='Copié. Colle-le dans un tableur.'}catch(e){$('csvok').textContent='Copie refusée par le navigateur.'}};
  const csvdl=$('csvdl');if(csvdl)csvdl.onclick=()=>telecharger('resultats-'+(P._jeu.titre||'jeu').replace(/[^\wÀ-ſ-]+/g,'_').slice(0,40)+'.csv','﻿'+csvTxt(),'text/csv;charset=utf-8');
  const nv=$('nouv');if(nv)nv.onclick=()=>editeur({id:uid(),titre:'',sous:'',moteur:'bref',visible:false,texte:'',neuf:true});
  const modif=msg=>{sauverBrouillon();P.msg=msg;rendreProf()};
  S.querySelectorAll('[data-v]').forEach(c=>c.onchange=()=>{const j=cat.jeux[Number(c.dataset.v)];j.visible=c.checked;modif(c.checked?'« '+esc(j.titre)+' » sera visible pour les élèves.':'« '+esc(j.titre)+' » sera masqué pour les élèves.')});
  S.querySelectorAll('[data-a]').forEach(b=>b.onclick=()=>{
    const i=Number(b.dataset.i),j=cat.jeux[i],a=b.dataset.a;
    if(a==='up'&&i>0){[cat.jeux[i-1],cat.jeux[i]]=[cat.jeux[i],cat.jeux[i-1]];modif('')}
    else if(a==='down'&&i<cat.jeux.length-1){[cat.jeux[i+1],cat.jeux[i]]=[cat.jeux[i],cat.jeux[i+1]];modif('')}
    else if(a==='edit')editeur({...j});
    else if(a==='test')jouer(j,{test:true,back:()=>{rendreProf()}});
    else if(a==='cor')corrige(j);
    else if(a==='dup'){cat.jeux.splice(i+1,0,{...j,id:uid(),titre:j.titre+' (copie)',visible:false});modif('Jeu dupliqué (masqué).')}
    else if(a==='del'){if(b.dataset.arm){cat.jeux.splice(i,1);modif('Jeu supprimé.')}else{b.dataset.arm=1;b.textContent='Confirmer ?'}}
  });
  const ad=$('addc');if(ad)ad.onclick=()=>{
    const res=lireCodes($('ta').value),bons=res.filter(r=>!r.err),bad=res.length-bons.length,msg=$('addmsg');
    if(!res.length){msg.textContent='Aucun code trouvé.';return}
    const deja=new Set(P.codes.map(c=>c.id));let ok=0,dbl=0;
    bons.forEach(r=>{if(deja.has(r.id)){dbl++;return}P.codes.push(r);deja.add(r.id);ok++});
    sauverCodes();$('ta').value='';
    const inconnus=bons.filter(r=>!cat.jeux.find(j=>j.id===r.g)).length;
    msg.innerHTML=`<span class="ok-t">${ok} résultat${ok>1?'s':''} ajouté${ok>1?'s':''}.</span>${dbl?` ${dbl} déjà présent${dbl>1?'s':''}.`:''}${bad?` <span class="ko-t">${bad} code${bad>1?'s':''} invalide${bad>1?'s':''}.</span>`:''}${inconnus?` <span class="ko-t">${inconnus} code${inconnus>1?'s':''} d'un jeu supprimé.</span>`:''}`;
  };
  const ex=$('exp');if(ex)ex.onclick=()=>telecharger('plateau-sauvegarde-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify({type:'plateau-sauvegarde',codes:P.codes,brouillon:catModifie()?cat:null},null,1),'application/json');
  const dl2=$('dl2');if(dl2)dl2.onclick=()=>telecharger('jeux.json',JSON.stringify(cat,null,1),'application/json');
  const le=$('lienel');if(le){const u=new URL('index.html',location.href).href;le.textContent=u;
    $('cplien').onclick=async()=>{try{await navigator.clipboard.writeText(u);$('cplien').textContent='Copié'}catch(e){}};
    $('qrb').onclick=async()=>{const z=$('qrz');z.innerHTML='<span class="small muted">Création du QR code…</span>';
      try{if(!window.qrcode)await new Promise((ok,ko)=>{const sc=document.createElement('script');sc.src='https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';sc.onload=ok;sc.onerror=ko;document.head.appendChild(sc)});
        const q=qrcode(0,'M');q.addData(u);q.make();const src=q.createDataURL(10,4);
        z.innerHTML=`<img src="${src}" alt="QR code" style="width:240px;height:240px;border:1px solid var(--line);border-radius:12px"><div style="margin-top:8px"><a class="btn sm sec" href="${src}" download="qr-le-plateau.gif">Télécharger le QR code</a></div>`}
      catch(e){z.innerHTML='<span class="small ko-t">Impossible de créer le QR code (pas de connexion ?).</span>'}};}
  const im=$('imp');if(im)im.onchange=async()=>{
    const f=im.files&&im.files[0],m=$('sauvmsg');if(!f)return;
    try{const o=JSON.parse(await f.text());if(o.type!=='plateau-sauvegarde'||!Array.isArray(o.codes))throw 0;
      const deja=new Set(P.codes.map(c=>c.id));let n=0;o.codes.forEach(r=>{if(r&&r.id&&!deja.has(r.id)){P.codes.push(r);deja.add(r.id);n++}});sauverCodes();
      if(o.brouillon&&Array.isArray(o.brouillon.jeux)){cat=o.brouillon;sauverBrouillon()}
      P.msg=`Sauvegarde importée : ${n} nouveau${n>1?'x':''} résultat${n>1?'s':''}.`;rendreProf()}
    catch(e){m.innerHTML='<span class="ko-t">Ce fichier n\'est pas une sauvegarde du Plateau.</span>'}
  };
}
function fiche(r){
  const m=P._m,sh=document.createElement('div');sh.className='sheet';
  sh.innerHTML=`<div class="in"><h2 style="margin-bottom:4px">${esc(r.n)}</h2><p class="muted small">${esc(r.c||'sans classe')} · ${fdate(r.t)} · <b>${fr1(sur20(r.s,r.m))}/20</b> (${r.s} / ${r.m})</p>
  ${m.items.map((it,k)=>{const v=Number(r.d[k]||0)/9,ok=v>=1;const donnee=repDonnee(it,r.a[k]);return `<div class="dline"><span class="${ok?'ok-t':'ko-t'}">${ok?'✓':(it.kind==='tab'?Math.round(v*100)+' %':'✗')}</span> ${k+1}. ${esc(it.label)}${ok?'':`${donnee?`<br><span class="ko-t">Sa réponse : ${esc(donnee)}</span>`:''}<br><span class="ok-t">${esc(bonneRep(it))}</span>`}</div>`}).join('')}
  <div style="display:flex;gap:8px;margin-top:14px"><button class="btn" id="cl">Fermer</button><button class="btn danger" id="del">Supprimer ce résultat</button></div></div>`;
  $('phone').appendChild(sh);sh.onclick=e=>{if(e.target===sh)sh.remove()};
  sh.querySelector('#cl').onclick=()=>sh.remove();
  const d=sh.querySelector('#del');d.onclick=()=>{if(!d.dataset.arm){d.dataset.arm=1;d.textContent='Confirmer la suppression';return}
    P.codes=P.codes.filter(c=>c.id!==r.id);sauverCodes();sh.remove();rendreProf()};
}
function corrige(j){
  const m=parse(j.moteur,j.texte),sh=document.createElement('div');sh.className='sheet';
  sh.innerHTML=`<div class="in"><h2>Corrigé : ${esc(j.titre)}</h2>${m.items.map((it,k)=>`<div class="dline"><b>${k+1}.</b> ${esc(it.label)}<br><span class="ok-t">${esc(bonneRep(it))}</span>${it.kind==='qcm'&&it.ref.e?`<br><span class="muted">${esc(it.ref.e)}</span>`:''}${it.kind==='tab'?`<br><span class="muted">Points : ${it.ref.rep.map(x=>x[0]+' '+x[1]).join(' · ')}. Pièges : ${esc(it.ref.pieges.join(', ')||'aucun')}</span>`:''}</div>`).join('')}<button class="btn" id="cl" style="margin-top:14px">Fermer</button></div>`;
  $('phone').appendChild(sh);sh.onclick=e=>{if(e.target===sh)sh.remove()};sh.querySelector('#cl').onclick=()=>sh.remove();
}
/* --- editeur --- */
function editeur(ed){
  theme('prof',true);B.innerHTML='';appbar('Le <em>Plateau</em> · '+(ed.neuf?'nouveau jeu':'modifier'),()=>{rendreProf()},null);
  S.innerHTML=`<div id="editeur"><div class="grid2"><div><label class="l">Titre du jeu</label><input id="et" value="${esc(ed.titre)}" placeholder="ex. Bref. J'ai révisé les prix."></div>
  <div><label class="l">Moteur de jeu</label><select id="em">${Object.entries(MOTEURS).map(([k,v])=>`<option value="${k}" ${k===ed.moteur?'selected':''}>${v.nom}</option>`).join('')}</select></div></div>
  <label class="l">Sous-titre (chapitre, niveau…)</label><input id="es" value="${esc(ed.sous||'')}" placeholder="ex. Chapitre 3 · Bac Pro MCV">
  <details class="aide"><summary>Comment écrire le contenu ?</summary><div id="aide"></div></details>
  <label class="l">Contenu du jeu</label><textarea class="code" id="ex" spellcheck="false">${esc(ed.texte)}</textarea>
  <div id="eres"></div>
  <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm sec" id="emod">Insérer un modèle</button><button class="btn sm sec" id="echk">Vérifier</button><button class="btn sm sec" id="etest">Tester le jeu</button></div></div>`;
  B.innerHTML=`<button class="btn sec" id="eann">Annuler</button><button class="btn" id="eok">Enregistrer</button>`;
  const lire=()=>({...ed,titre:$('et').value.trim(),sous:$('es').value.trim(),moteur:$('em').value,texte:$('ex').value});
  const aide=()=>{const mo=$('em').value;$('aide').innerHTML=`<p style="margin:8px 0 4px"><b>${MOTEURS[mo].nom}</b> : ${MOTEURS[mo].desc}.</p><p style="margin:4px 0">Les blocs sont séparés par une ligne <b>---</b>. Lignes possibles :</p><pre>${mo==='bref'?'N: petite scène avant la question (facultatif)\nD: contexte affiché au-dessus (facultatif)\nQ: la question\n+ la bonne réponse\n- une mauvaise réponse\nE: explication après la réponse (facultatif)':mo==='famille'?'Tableau :\nT: ce qu\'il faut retrouver\n+ bonne réponse | points\n- piège\n\nFinale (facultatif, 15 s, 40 points) :\nQ: question\n+ bonne réponse\n- mauvaise réponse':'Test d\'expert :\nEXPERT: Prénom | rôle | titre du test\nINTRO: phrase d\'intro (facultatif)\n= notion | définition\n\nMairie :\nOUI: affirmation juste   ou   NON: affirmation fausse\nE: explication\n\nQuestion de cas :\nD: contexte (facultatif)\nQ: question\n+ bonne / - mauvaise\nE: explication'}</pre><p style="margin:4px 0">Astuce : demande à Claude « fais-moi le contenu d'un jeu ${MOTEURS[mo].nom} sur tel chapitre au format du Plateau » et colle le résultat ici.</p>`};
  aide();$('em').onchange=aide;
  const verif=()=>{const e=lire(),m=parse(e.moteur,e.texte);
    $('eres').innerHTML=m.errs.length?`<div class="err"><b>${m.errs.length} problème${m.errs.length>1?'s':''} :</b><br>${m.errs.slice(0,12).map(esc).join('<br>')}${m.errs.length>12?'<br>…':''}</div>`:`<div class="okmsg">✓ Contenu valide : ${m.items.length} question${m.items.length>1?'s':''}.</div>`;return {e,m}};
  $('emod').onclick=()=>{const t=$('ex');if(t.value.trim()&&!t.dataset.arm){t.dataset.arm=1;$('emod').textContent='Remplacer le contenu ?';return}t.value=TEMPLATES[$('em').value];delete t.dataset.arm;$('emod').textContent='Insérer un modèle'};
  $('echk').onclick=verif;
  $('etest').onclick=()=>{const {e,m}=verif();if(m.errs.length)return;jouer(e,{test:true,back:()=>editeur(e)})};
  $('eann').onclick=()=>rendreProf();
  $('eok').onclick=()=>{const {e,m}=verif();if(!e.titre){$('et').style.borderColor='var(--ko)';$('et').focus();return}if(m.errs.length)return;
    const rec={id:e.id,titre:e.titre,sous:e.sous,moteur:e.moteur,visible:!!e.visible,texte:e.texte};
    const i=cat.jeux.findIndex(x=>x.id===e.id);if(i>=0)cat.jeux[i]=rec;else cat.jeux.push(rec);
    sauverBrouillon();P.onglet='jeux';P.msg=e.visible?'Jeu enregistré.':'Jeu enregistré. Coche-le pour le rendre visible aux élèves.';rendreProf()};
  toTop();
}

/* ---------------- demarrage ---------------- */
$('screen').innerHTML='<p class="muted center" style="margin-top:40px">Chargement…</p>';
chargerCatalogue().then(()=>{if(MODE==='prof')prof();else hub()});
if('serviceWorker' in navigator&&location.protocol.startsWith('http'))navigator.serviceWorker.register('sw.js').catch(()=>{});
