import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInAnonymously, onAuthStateChanged, signOut } from "firebase/auth";
import { getFirestore, collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc, writeBatch, onSnapshot, query, where, serverTimestamp } from "firebase/firestore";
import { firebaseConfig, ADMIN_UIDS } from "./firebase-config.js";

const $ = id => document.getElementById(id);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
let currentUser = null, admin = false, events = [], members = [], orders = [], draftItems = [], unsubscribers = [];
let familyOrderSummaries = [];
const safe = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const say = (message, type="") => { const el=$("globalMessage"); el.textContent=message; el.className="notice"+(type?" "+type:""); };
const sayFamily = (message, type="") => { const el=$("familyMessage"); el.textContent=message; el.className="notice"+(type?" "+type:""); };
const isOpen = e => e && e.status === "open" && (!e.deadline || typeof e.deadline === "string" && !e.deadline || (e.deadline?.toDate ? e.deadline.toDate().getTime() : new Date(e.deadline).getTime()) > Date.now());
const selectedEvent = () => events.find(e=>e.id===$("familyEvent").value);
const selectedAdminEvent = () => events.find(e=>e.id===$("adminEvent").value);
const activeMembers = () => members.filter(m=>m.active !== false);
function cleanup(){unsubscribers.forEach(fn=>fn());unsubscribers=[];}

async function syncOrderSummaries(orderList) {
  const summaryRef = collection(db, "lunchOrderSummaries");
  const snapshot = await getDocs(summaryRef);
  const batch = writeBatch(db);

  const currentIds = new Set(orderList.map(order => order.id));

  // 移除已不存在的訂單摘要
  snapshot.docs.forEach(summaryDoc => {
    if (!currentIds.has(summaryDoc.id)) {
      batch.delete(summaryDoc.ref);
    }
  });

  // 只寫入團員需要查看的資料
  orderList.forEach(order => {
    const items = (order.items || [])
      .filter(item => Number(item.qty || 0) > 0)
      .map(item => ({
        name: String(item.name || ""),
        price: Number(item.price || 0),
        qty: Number(item.qty || 0)
      }));

    const totalAmount = items.reduce(
      (sum, item) => sum + item.price * item.qty,
      0
    );

    batch.set(doc(db, "lunchOrderSummaries", order.id), {
      eventId: String(order.eventId || ""),
      eventName: String(order.eventName || ""),
      eventDate: String(order.eventDate || ""),
      memberName: String(order.memberName || ""),
      items,
      totalAmount,
      updatedAt: serverTimestamp()
    });
  });

  if (snapshot.size > 0 || orderList.length > 0) {
    await batch.commit();
  }
}
function renderFamilyOrderOverview() {
  const box = $("familyOrderOverview");
  if (!box) return;

  const event = selectedEvent();

  if (!event) {
    box.innerHTML = '<p class="helper">請先選擇訂餐場次。</p>';
    return;
  }

  const list = familyOrderSummaries
    .filter(order => order.eventId === event.id)
    .sort((a, b) =>
      (a.memberName || "").localeCompare(b.memberName || "", "zh-Hant")
    );

  if (list.length === 0) {
    box.innerHTML = '<p class="helper">目前還沒有團員提交訂單。</p>';
    return;
  }

  box.innerHTML = list.map(order => {
    const items = (order.items || [])
      .filter(item => Number(item.qty || 0) > 0);

    const itemText = items.length
      ? items.map(item =>
          `<div>${safe(item.name)} × ${Number(item.qty)} 份</div>`
        ).join("")
      : '<div class="helper">尚未選擇餐點</div>';

    return `
      <div class="menu-item">
        <div>
          <div class="menu-name">${safe(order.memberName || "未命名團員")}</div>
          <div class="helper">${itemText}</div>
        </div>
        <div>
          <div class="menu-price">
            NT$${Number(order.totalAmount || 0).toLocaleString("zh-TW")}
          </div>
        </div>
      </div>
    `;
  }).join("");
}
function subscribeCollection(name, callback, queryRef=collection(db,name)) {
  const unsub=onSnapshot(queryRef, snap=>callback(snap.docs.map(d=>({id:d.id,...d.data()}))), err=>say(`讀取 ${name} 失敗：${err.message}`,"error"));
  unsubscribers.push(unsub);
}

function startListeners(){
  cleanup();

  subscribeCollection("lunchEvents", data=>{
    events=data.sort((a,b)=>(a.date||"").localeCompare(b.date||""));
    renderEventOptions();
    renderFamilyForm();
    renderSummary();
    renderFamilyOrderOverview();
  });

  subscribeCollection("lunchMembers", data=>{
    members=data.sort((a,b)=>(a.name||"").localeCompare(b.name||"","zh-Hant"));
    renderMemberOptions();
    renderMembersTable();
  });

  if(admin) {
    subscribeCollection("lunchOrders", data=>{
      orders=data;
      renderSummary();
      syncOrderSummaries(data).catch(err=>{
        say("同步團員訂單總覽失敗："+err.message,"error");
      });
    });
  } else if(currentUser) {
    subscribeCollection(
      "lunchOrders",
      data=>{
        orders=data;
        renderFamilyForm();
      },
      query(collection(db,"lunchOrders"),where("ownerUid","==",currentUser.uid))
    );
  }

  if(currentUser) {
    subscribeCollection("lunchOrderSummaries", data=>{
      familyOrderSummaries=data;
      renderFamilyOrderOverview();
    });
  }
}

function renderEventOptions(){
  const open=events.filter(isOpen), prev=$("familyEvent").value;
  $("familyEvent").innerHTML=open.length?open.map(e=>`<option value="${safe(e.id)}">${safe(e.date)}｜${safe(e.name)}｜${safe(e.restaurant||"餐廳未填")}</option>`).join(""):'<option value="">目前沒有開放訂餐的場次</option>';
  if(open.some(e=>e.id===prev))$("familyEvent").value=prev;
  const old=$("adminEvent").value;
  $("adminEvent").innerHTML=events.length?events.map(e=>`<option value="${safe(e.id)}">${safe(e.date)}｜${safe(e.name)}${e.status!=="open"?"（已關閉）":""}</option>`).join(""):'<option value="">尚無場次</option>';
  if(events.some(e=>e.id===old))$("adminEvent").value=old;
}



function renderMemberOptions() {
  const old = $("familyMember").value;

  const sortedMembers = [...activeMembers()].sort((a, b) =>
    a.name.localeCompare(b.name, "zh-Hant-TW", {
      usage: "sort"
    })
  );

  $("familyMember").innerHTML =
    '<option value="">請選擇團員</option>' +
    sortedMembers
      .map(m => `<option value="${safe(m.id)}">${safe(m.name)}</option>`)
      .join("");

  if (sortedMembers.some(m => m.id === old)) {
    $("familyMember").value = old;
  }

  renderFamilyForm();
}
function ownOrder(eventId,memberId){return orders.find(o=>o.eventId===eventId&&o.memberId===memberId&&o.ownerUid===currentUser?.uid);}
function renderFamilyForm(){
 const e=selectedEvent(), memberId=$("familyMember").value;
 renderFamilyOrderOverview();
 $("eventInfo").textContent=e?`${e.restaurant||"餐廳未設定"}｜${e.date||""}｜${isOpen(e)?"開放訂餐":"已截止或關閉"}`:"";
 const box=$("familyMenu");
 if(!e){box.innerHTML='<p class="empty">目前沒有開放訂餐的場次。</p>';$("submitOrder").disabled=true;return;}
 if(!e.items?.length){box.innerHTML='<p class="empty">管理者尚未建立菜單。</p>';$("submitOrder").disabled=true;return;}
 const existing=ownOrder(e.id,memberId);
 box.innerHTML=e.items.map(it=>{const prev=existing?.items?.find(x=>x.itemId===it.id);return `<div class="menu-item"><div><div class="menu-name">${safe(it.name)}</div><div class="menu-price">每份 NT$${Number(it.price||0)}</div></div><div><label class="small-muted" for="qty-${safe(it.id)}">份數</label><select id="qty-${safe(it.id)}" data-qty="${safe(it.id)}" ${!isOpen(e)?"disabled":""}>${Array.from({length:11},(_,n)=>`<option value="${n}" ${Number(prev?.qty||0)===n?"selected":""}>${n} 份</option>`).join("")}</select></div></div>`}).join("");
 $("familyNote").value=existing?.note||"";$("submitOrder").disabled=!isOpen(e);$("submitOrder").textContent=existing?"更新我的訂單":"送出訂單";
}

function renderFamilyOrderOverview() {
  const box = document.getElementById("familyOrderOverview");
  if (!box) return;

  const event = selectedEvent();

  if (!event) {
    box.innerHTML = '<p class="helper">請先選擇訂餐場次。</p>';
    return;
  }

  const summaries = familyOrderSummaries
    .filter(order => order.eventId === event.id)
    .sort((a, b) =>
      (a.memberName || "").localeCompare(b.memberName || "", "zh-Hant")
    );

  if (!summaries.length) {
    box.innerHTML = '<p class="helper">目前尚無此場次的訂單，或總覽尚未同步。</p>';
    return;
  }

  box.innerHTML = `
    <div class="family-overview-list">
      ${summaries.map(order => {
        const items = (order.items || [])
          .filter(item => Number(item.qty || 0) > 0);

        const itemText = items.length
          ? items.map(item =>
              `${safe(item.name)} × ${Number(item.qty)} 份`
            ).join("、")
          : "尚未選擇餐點";

        const total = Number(order.totalAmount || 0);

        return `
          <div class="menu-item family-overview-item">
            <div>
              <div class="menu-name">${safe(order.memberName || "未提供姓名")}</div>
              <div class="small-muted">${itemText}</div>
            </div>
            <div class="menu-price">NT$${total.toLocaleString("zh-TW")}</div>
          </div>
        `;
      }).join("")}
    </div>
    <p class="helper">共 ${summaries.length} 筆訂單</p>
  `;
}
function renderMembersTable(){if(!admin)return;$("membersTable").innerHTML=`<p class="helper">啟用團員 ${activeMembers().length} 位。停用只會隱藏於家長選單，不會刪除歷史訂單。</p><div class="table-wrap"><table><thead><tr><th>姓名</th><th>班別</th><th>狀態</th><th>操作</th></tr></thead><tbody>${members.map(m=>`<tr><td>${safe(m.name)}</td><td>${safe(m.className||"")}</td><td>${m.active===false?"已停用":"啟用"}</td><td><button class="button secondary" data-toggle-member="${safe(m.id)}">${m.active===false?"重新啟用":"停用"}</button></td></tr>`).join("")}</tbody></table></div>`;document.querySelectorAll("[data-toggle-member]").forEach(b=>b.onclick=async()=>{const m=members.find(x=>x.id===b.dataset.toggleMember);if(!m)return;try{await updateDoc(doc(db,"lunchMembers",m.id),{active:m.active===false,updatedAt:serverTimestamp()});}catch(e){alert("更新失敗："+e.message);}});}
function renderSummary(){if(!admin)return;const e=selectedAdminEvent();if(!e){$("summary").innerHTML='<p class="helper">請先建立場次。</p>';return;}const rows=orders.filter(o=>o.eventId===e.id);const totals={};for(const o of rows)for(const i of o.items||[])if(Number(i.qty)>0){if(!totals[i.name])totals[i.name]={price:Number(i.price||0),qty:0};totals[i.name].qty+=Number(i.qty)}const qty=Object.values(totals).reduce((s,x)=>s+x.qty,0),amount=Object.values(totals).reduce((s,x)=>s+x.qty*x.price,0);const submitted=new Set(rows.filter(o=>(o.items||[]).some(i=>Number(i.qty)>0)).map(o=>o.memberId));const missing=activeMembers().filter(m=>!submitted.has(m.id));
 $("summary").innerHTML=`<div class="stats"><div class="stat"><span>已提交訂單</span><strong>${rows.length}</strong></div><div class="stat"><span>餐點總份數</span><strong>${qty}</strong></div><div class="stat"><span>預估總金額</span><strong>NT$${amount}</strong></div></div><h4>依餐點統計</h4><div class="table-wrap"><table id="summaryItems"><thead><tr><th>餐點</th><th>單價</th><th>份數</th><th>小計</th></tr></thead><tbody>${Object.entries(totals).map(([n,v])=>`<tr><td>${safe(n)}</td><td>$${v.price}</td><td>${v.qty}</td><td>$${v.qty*v.price}</td></tr>`).join("")||'<tr><td colspan="4">尚無訂單</td></tr>'}</tbody></table></div><h4>團員訂單明細</h4><div class="table-wrap"><table id="summaryOrders"><thead><tr><th>團員</th><th>餐點</th><th>份數</th><th>備註</th><th>金額</th></tr></thead><tbody>${rows.map(o=>`<tr><td>${safe(o.memberName)}</td><td>${safe((o.items||[]).filter(i=>i.qty>0).map(i=>i.name).join("、")||"未選餐")}</td><td>${(o.items||[]).reduce((s,i)=>s+Number(i.qty||0),0)}</td><td>${safe(o.note||"")}</td><td>$${(o.items||[]).reduce((s,i)=>s+Number(i.qty||0)*Number(i.price||0),0)}</td></tr>`).join("")||'<tr><td colspan="5">尚無訂單</td></tr>'}</tbody></table></div><h4>尚未訂餐／未提交</h4><p>${missing.length?missing.map(m=>safe(m.name)).join("、"):"全員皆已提交（仍請核對是否有人自備午餐）"}</p>`;
}
function renderItemEditor(){ $("menuEditor").innerHTML=draftItems.map((it,i)=>`<div class="editor-row"><div><label>餐點名稱</label><input data-item-name="${i}" value="${safe(it.name)}" placeholder="餐點名稱"></div><div><label>價格（元）</label><input data-item-price="${i}" type="number" min="0" value="${Number(it.price||0)}"></div><button class="button danger" data-item-remove="${i}">刪除</button></div>`).join("");document.querySelectorAll("[data-item-name]").forEach(el=>el.onchange=()=>draftItems[Number(el.dataset.itemName)].name=el.value.trim());document.querySelectorAll("[data-item-price]").forEach(el=>el.onchange=()=>draftItems[Number(el.dataset.itemPrice)].price=Math.max(0,Number(el.value||0)));document.querySelectorAll("[data-item-remove]").forEach(el=>el.onclick=()=>{draftItems.splice(Number(el.dataset.itemRemove),1);renderItemEditor();});}

function parseMenuText(text) {
  const found = [];
  const lines = text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  for ( i = 0; i < lines.length; i++) {
    const line = lines[i]
      .replace(/[•●▪■◆◇]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // 價格格式：80、80元、NT$80、$80
    const priceMatch = line.match(
      /(?:NT\s*\$?|＄|\$)?\s*(\d{1,4})\s*元?\s*$/i
    );

    if (!priceMatch) continue;

    const price = Number(priceMatch[1]);

    // 排除明顯不合理的價格
    if (price < 1 || price > 9999) continue;

    let name = line
      .slice(0, priceMatch.index)
      .replace(/[\s:：$＄\-–—]+$/g, "")
      .trim();

    // 若這一行只有價格，嘗試使用上一行作為餐名
    if (!name && i > 0) {
      const previous = lines[i - 1].trim();

      // 上一行不能本身也是價格
      if (!/(?:NT\s*\$?|＄|\$)?\s*\d{1,4}\s*元?\s*$/i.test(previous)) {
        name = previous;
      }
    }

    // 過濾沒有餐名、純數字及過短的文字
    if (!name || /^\d+$/.test(name)) continue;

    // 避免重複匯入完全相同的餐名與價格
    const duplicate = found.some(
      item => item.name === name && item.price === price
    );

    if (!duplicate) {
      found.push({
        id: crypto.randomUUID(),
        name,
        price
      });
    }
  }

  return found;
}
async function submitOrder(){const e=selectedEvent(),memberId=$("familyMember").value,m=activeMembers().find(x=>x.id===memberId);if(!e||!m)return alert("請選擇場次與團員。");if(!isOpen(e))return alert("此場次已截止或關閉。");const chosen=[...document.querySelectorAll("[data-qty]")].map(el=>{const it=e.items.find(x=>x.id===el.dataset.qty);return it?{itemId:it.id,name:it.name,price:Number(it.price||0),qty:Number(el.value)}:null}).filter(Boolean);if(!chosen.some(i=>i.qty>0))return alert("請至少選擇一份餐點。");if(!auth.currentUser)await signInAnonymously(auth);const id=`${e.id}_${m.id}`,existing=orders.find(o=>o.id===id);const payload={eventId:e.id,eventName:e.name,eventDate:e.date,memberId:m.id,memberName:m.name,items:chosen,note:$("familyNote").value.trim(),ownerUid:existing?.ownerUid||auth.currentUser.uid,updatedAt:serverTimestamp()};try{if(existing&&existing.ownerUid!==auth.currentUser.uid)throw new Error("此團員訂單已由另一個瀏覽器建立。請聯絡管理者協助修改，避免重複訂餐。");if(existing)await updateDoc(doc(db,"lunchOrders",id),payload);else await setDoc(doc(db,"lunchOrders",id),{...payload,createdAt:serverTimestamp()});sayFamily("訂單已儲存！請確認餐點與備註正確。","ok");}catch(e){sayFamily("儲存失敗："+e.message,"error");}}
function resetEventForm(){["editingEventId","eventName","eventDate","eventDeadline","restaurantName","menuText"].forEach(id=>$(id).value="");$("eventDate").value=new Date().toLocaleDateString("en-CA");draftItems=[];renderItemEditor();$("saveEventButton").textContent="儲存場次與菜單";}
async function saveEvent(){const name=$("eventName").value.trim(),date=$("eventDate").value,deadlineText=$("eventDeadline").value,restaurant=$("restaurantName").value.trim();if(!name||!date)return alert("請填寫場次名稱與日期。");const items=draftItems.map(i=>({id:i.id||crypto.randomUUID(),name:String(i.name||"").trim(),price:Math.max(0,Number(i.price||0))})).filter(i=>i.name);if(!items.length)return alert("請至少新增一個餐點。");const deadline=deadlineText?new Date(deadlineText):"";const payload={name,date,deadline,restaurant,items,status:"open",updatedAt:serverTimestamp(),updatedBy:currentUser.uid};try{const id=$("editingEventId").value;if(id){await updateDoc(doc(db,"lunchEvents",id),payload);alert("場次已更新。");}else{await addDoc(collection(db,"lunchEvents"),{...payload,createdAt:serverTimestamp(),createdBy:currentUser.uid});alert("場次已建立。");}resetEventForm();}catch(e){alert("儲存失敗："+e.message);}}
async function loadEventForEdit(){const e=selectedAdminEvent();if(!e)return alert("請先選擇場次。");$("editingEventId").value=e.id;$("eventName").value=e.name||"";$("eventDate").value=e.date||"";$("eventDeadline").value=e.deadline?.toDate?new Date(e.deadline.toDate().getTime()-e.deadline.toDate().getTimezoneOffset()*60000).toISOString().slice(0,16):e.deadline?new Date(e.deadline).toISOString().slice(0,16):"";$("restaurantName").value=e.restaurant||"";draftItems=(e.items||[]).map(i=>({...i}));$("menuText").value=draftItems.map(i=>`${i.name} ${i.price}`).join("\n");renderItemEditor();$("saveEventButton").textContent="儲存場次與菜單";window.scrollTo({top:$("adminView").offsetTop,behavior:"smooth"});}


async function addMember(name) {
  name = name.trim();

  if (!name) return false;

  if (members.some(m => m.name === name)) {
    return false;
  }

  await addDoc(collection(db, "lunchMembers"), {
    name,
    active: true,
    createdAt: serverTimestamp(),
    createdBy: currentUser.uid
  });

  return true;
}

async function exportExcel(){const e=selectedAdminEvent();if(!e)return alert("請選擇場次。");const XLSX=await import("https://cdn.jsdelivr.net/npm/xlsx@0.18.5/+esm");const rows=orders.filter(o=>o.eventId===e.id);const detail=[["日期",e.date],["場次",e.name],["餐廳",e.restaurant||""],[],["團員姓名","餐點","單價","份數","小計","備註"]];for(const o of rows)for(const i of o.items||[])if(i.qty>0)detail.push([o.memberName,i.name,i.price,i.qty,i.price*i.qty,o.note||""]);const totals={};for(const o of rows)for(const i of o.items||[])if(i.qty>0){if(!totals[i.name])totals[i.name]={price:i.price,qty:0};totals[i.name].qty+=Number(i.qty);}const summary=[["餐點","單價","總份數","小計"],...Object.entries(totals).map(([n,v])=>[n,v.price,v.qty,v.price*v.qty])];const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(detail),"訂單明細");XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(summary),"餐點統計");XLSX.writeFile(wb,`弦樂團訂餐_${e.date||"日期"}.xlsx`);}
async function closeEvent(){const e=selectedAdminEvent();if(!e)return;if(!confirm(`確定關閉「${e.name}」的訂餐嗎？家長將無法再提交或更新。`))return;try{await updateDoc(doc(db,"lunchEvents",e.id),{status:"closed",closedAt:serverTimestamp(),closedBy:currentUser.uid});alert("已關閉訂餐。");}catch(err){alert("關閉失敗："+err.message);}}
function switchView(id){document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.view===id));document.querySelectorAll(".view").forEach(v=>v.classList.toggle("hidden",v.id!==id));}
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>switchView(b.dataset.view)));
$("familyEvent").addEventListener("change",renderFamilyForm);$("familyMember").addEventListener("change",renderFamilyForm);$("submitOrder").addEventListener("click",submitOrder);
$("googleLogin").addEventListener("click",async()=>{try{await signInWithPopup(auth,new GoogleAuthProvider());}catch(e){alert("Google 登入失敗："+e.message);}});$("googleLogout").addEventListener("click",()=>signOut(auth));
$("newItemButton").addEventListener("click",()=>{draftItems.push({id:crypto.randomUUID(),name:"",price:0});renderItemEditor();});
$("parseTextButton").addEventListener("click",()=>{const found=parseMenuText($("menuText").value);if(!found.length)return alert("未解析到餐點。請使用「餐點名稱 價格」格式，或手動新增。");draftItems=found;renderItemEditor();alert(`解析到 ${found.length} 個餐點，請逐項校正。`);});
$("saveEventButton").addEventListener("click",saveEvent);$("resetEventButton").addEventListener("click",resetEventForm);$("loadEditButton").addEventListener("click",loadEventForEdit);
$("adminEvent").addEventListener("change",renderSummary);$("printButton").addEventListener("click",()=>window.print());$("excelButton").addEventListener("click",exportExcel);$("closeEventButton").addEventListener("click",closeEvent);


$("bulkImportButton").addEventListener("click", async () => {
  const names = $("bulkMembers").value
    .split(/[\r\n,，、；;]+/)
    .map(name => name.trim())
    .filter(Boolean);

  const uniqueNames = [...new Set(names)];

  if (uniqueNames.length === 0) {
    alert("請先輸入團員姓名。");
    return;
  }

  const button = $("bulkImportButton");
  button.disabled = true;

  let added = 0;
  let skipped = 0;
  const failed = [];

  try {
    for (const name of uniqueNames) {
      button.textContent = `匯入中：${name}`;

      try {
        const result = await Promise.race([
          addMember(name),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error("等待新增資料逾時，請檢查 Firebase 連線")),
              15000
            )
          )
        ]);

        if (result) {
          added++;
        } else {
          skipped++;
        }
      } catch (e) {
        failed.push(`${name}：${e.message}`);
        console.error("團員新增失敗：", name, e);
      }
    }

    alert(
      `批次匯入完成！\n` +
      `成功新增：${added} 位\n` +
      `重複姓名：${skipped} 位\n` +
      `新增失敗：${failed.length} 位` +
      (failed.length ? `\n\n${failed.join("\n")}` : "")
    );

    if (added > 0) {
      $("bulkMembers").value = "";
    }

  } finally {
    button.disabled = false;
    button.textContent = "匯入名單";
  }
});

onAuthStateChanged(auth,async user=>{
  currentUser=user;
  // 管理權限必須是 config 白名單中的 Google UID；匿名登入只用於家長訂單識別。
  admin=!!user&&!user.isAnonymous&&ADMIN_UIDS.includes(user.uid)&&!ADMIN_UIDS.some(x=>x.startsWith("請替換"));
  $("googleLogin").classList.toggle("hidden",!!user&&!user.isAnonymous);$("googleLogout").classList.toggle("hidden",!user||user.isAnonymous);
  $("adminTools").classList.toggle("hidden",!admin);$("adminBadge").textContent=admin?"管理者已授權":user&&!user.isAnonymous?"尚未授權":"尚未登入";
  if(user&&!user.isAnonymous&&!admin){$("uidNotice").classList.remove("hidden");$("uidNotice").textContent=`目前 Google 帳號 UID：${user.uid}。請將此 UID 加入 firebase-config.js 與 firestore.rules 的管理者清單，再重新部署。`;}
  else $("uidNotice").classList.add("hidden");
  if(!user){try{await signInAnonymously(auth);}catch(e){say("匿名登入失敗。請確認 Firebase Authentication 已啟用 Anonymous，並已設定授權網域。錯誤："+e.message,"error");}}
  if(user){startListeners();say(admin?"已連線，管理者權限已啟用。":"已連線。家長可使用共用連結填單。","ok");}
});
$("eventDate").value=new Date().toLocaleDateString("en-CA");
