import { $, state, showView, showToast, cleanup } from './state.js';
import { auth, db } from './firebase.js';
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { applySelected, renderAll, renderAdminViews, renderAdminDetail } from './render.js';
import { bindEvents, setupNovaAtividade, setupColabForm } from './events.js';

function setupAdminSubs(){
  if(state.unsubAllUsers) state.unsubAllUsers();
  state.unsubAllUsers=onSnapshot(collection(db,'users'),snap=>{
    snap.docChanges().forEach(change=>{
      const d=change.doc, data=d.data();
      if(data.disabled||change.type==='removed'){
        delete state.allUsers[d.id];
        if(state.adminSubs[d.id]){ state.adminSubs[d.id](); delete state.adminSubs[d.id]; }
        return;
      }
      if(!state.allUsers[d.id]) state.allUsers[d.id]={nome:data.nome||data.email,email:data.email,role:data.role,blocked:!!data.blocked,obras:[]};
      else{ state.allUsers[d.id].nome=data.nome||data.email; state.allUsers[d.id].email=data.email; state.allUsers[d.id].role=data.role; state.allUsers[d.id].blocked=!!data.blocked; }
      if(data.role!=='admin'&&!state.adminSubs[d.id]){
        state.adminSubs[d.id]=onSnapshot(collection(db,'users',d.id,'obras'),oSnap=>{
          state.allUsers[d.id].obras=oSnap.docs.map(o=>({id:o.id,...o.data()}));
          renderAdminViews();
          if(state.adminSelectedUid===d.id) renderAdminDetail();
        });
      }
    });
    renderAdminViews();
  });
}

function listenUserObras(){
  if(state.unsubUserObras) state.unsubUserObras();
  state.unsubUserObras=onSnapshot(collection(db,'users',state.user.uid,'obras'),snap=>{
    state.obras=snap.docs.map(d=>({id:d.id,...d.data()}));
    if(state.selectedObraId&&!state.obras.find(o=>o.id===state.selectedObraId))
      state.selectedObraId=state.obras.length?state.obras[0].id:null;
    if(!state.selectedObraId&&state.obras.length) state.selectedObraId=state.obras[0].id;
    if(state.selectedObraId){ const o=state.obras.find(x=>x.id===state.selectedObraId); if(o) applySelected(o); }
    renderAll();
  });
}

async function init(){
  bindEvents(); setupNovaAtividade();
  onAuthStateChanged(auth,async user=>{
    state.user=user;
    if(!user){ showView('loginView'); return; }
    const snap=await getDoc(doc(db,'users',user.uid));
    if(!snap.exists()){ cleanup(); await signOut(auth); return; }
    const data=snap.data();
    state.admin=data.role==='admin';
    if(data.disabled===true||data.blocked===true){ cleanup(); await signOut(auth); return; }
    state.userName=data.nome||(user.email?user.email.split('@')[0]:'');
    const nameEl=$('userNameDisplay'); if(nameEl) nameEl.textContent=state.userName.toUpperCase();
    if(state.admin){
      showView('adminView'); setupAdminSubs();
      if(!state.colabFormReady){ state.colabFormReady=true; setupColabForm(); }
    } else {
      showView('appView');
      state.obras=[]; state.selectedObraId=null; state.rows=[];
      listenUserObras();
    }
  });
}
init();
