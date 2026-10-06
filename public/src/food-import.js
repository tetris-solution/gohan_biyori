import {choiceField,unitField,locationOptions,expiryOptions} from './food-fields.js';
export function foodRegistration(ui){
  ui.open('<h2>食材を登録</h2><p>写真でまとめて、または手入力で登録できます。</p><div class="recipe-import-options"><button class="outline" id="food-photo-start"><strong>写真・レシートから一括登録</strong><span>AIで読み取り → 確認・編集 → 登録</span></button><button class="outline" id="food-manual-start"><strong>手入力で登録</strong><span>食材を1件ずつ入力</span></button></div>');
  document.getElementById('food-photo-start').onclick=()=>photoImport(ui);
  document.getElementById('food-manual-start').onclick=ui.manual;
}
function photoImport(ui){
  ui.open(`<h2>写真から食材を読み取る</h2><p>食材や商品ラベル、レシートの写真を選んでください。解析後に内容を編集できます。</p><form id="food-photo-form"><label for="food-photo-kind">写真の種類</label><select id="food-photo-kind" name="kind"><option value="food">食材の写真</option><option value="receipt">レシート</option></select><label for="food-photo-file">写真を選択</label><input id="food-photo-file" type="file" name="image" accept="image/jpeg,image/png,image/webp" required><p>JPEG・PNG・WebP、5MB以下。画像はアカウントの「写真・レシート」に保存し、AI解析に使います。AI解析・献立提案は合計1日10回まで（失敗も含む）。</p><p id="food-photo-error" role="alert"></p><div class="dialog-actions"><button type="button" class="outline" id="food-photo-back">戻る</button><button class="primary" id="food-photo-submit">AIで解析する</button></div></form>`);
  document.getElementById('food-photo-back').onclick=()=>foodRegistration(ui);
  const form=document.getElementById('food-photo-form');let uploadedFile=null,imageId='';
  const active=()=>form.isConnected&&form.closest('dialog').open;
  form.onsubmit=async e=>{
    e.preventDefault();const button=document.getElementById('food-photo-submit'),error=document.getElementById('food-photo-error');button.disabled=true;button.textContent='写真を読み取り中…';error.textContent='';
    try{
      const f=new FormData(form),file=f.get('image');if(!file.size||file.size>5*1024*1024||!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('JPEG・PNG・WebPの画像を5MB以下で選んでください');
      const fileKey=[file.name,file.size,file.lastModified,f.get('kind')].join(':');
      if(uploadedFile!==fileKey){const response=await fetch('/api/images',{method:'POST',headers:{'Content-Type':file.type,'X-Image-Name':encodeURIComponent(file.name),'X-Image-Kind':f.get('kind')},body:file});const upload=await response.json();if(!response.ok)throw Error(upload.error||'写真を保存できませんでした');imageId=upload.id;uploadedFile=fileKey;}
      if(!active())return;
      const result=await ui.requestApi('foods/import',{method:'POST',body:JSON.stringify({imageId})});if(active())foodPreview(ui,result,imageId);
    }catch(e){if(active()){error.textContent=e.message;button.disabled=false;button.textContent='再度解析する';}}
  };
}
function foodPreview(ui,result,imageId){
  const {esc,quantityField}=ui;let rowId=0;
  function row(f={}){
    const id=++rowId;return `<section class="food-import-row"><div class="ingredient-edit-head"><h3>食材 ${id}</h3><button type="button" data-remove-food-draft aria-label="この食材を削除">×</button></div><label for="food-draft-name-${id}">食材名</label><input id="food-draft-name-${id}" data-draft-name value="${esc(f.name||'')}" maxlength="100" required>${quantityField('food-draft-qty-'+id,'draftQty',f.quantity??'',{min:0.001,max:999999,step:0.001,increment:0.5,label:'数量（0.5単位）'})}${unitField('food-draft-unit-'+id,'draftUnit',f.unit||'','data-draft-unit')}<label for="food-draft-category-${id}">カテゴリ</label><select id="food-draft-category-${id}" data-draft-category>${ui.categories.map(c=>`<option ${f.category===c?'selected':''}>${esc(c)}</option>`).join('')}</select>${choiceField('food-draft-location-'+id,'draftLocation','保存場所','',locationOptions,'data-draft-location')}${choiceField('food-draft-expiry-type-'+id,'draftExpiryType','期限の種類',f.expiryType||'best-before',expiryOptions,'data-draft-expiry-type')}<label for="food-draft-expiry-${id}">期限の日付（任意）</label><input id="food-draft-expiry-${id}" data-draft-expiry type="date" value="${esc(f.expiryDate||'')}" min="1900-01-01" max="9999-12-31"></section>`;
  }
  ui.open(`<h2>読み取り結果を確認</h2><p>名称・数量・単位を確認し、違う項目は編集・削除してください。登録するまで食材リストには追加されません。</p><img class="import-preview-image" src="/api/images/${esc(imageId)}" alt="解析した写真"><p>本日のAI残り${result.remaining}回。${result.foods.length?'':'食材を読み取れませんでした。下のボタンから手入力できます。'}既存の食材は残し、今回の分を追加します。</p><form id="food-batch-form"><div id="food-draft-list">${result.foods.map(row).join('')}</div><button type="button" class="outline" id="food-draft-add">＋ 食材を追加</button><p id="food-batch-error" role="alert"></p><div class="dialog-actions"><button type="button" class="outline" data-close>キャンセル</button><button class="primary" id="food-batch-save">登録する</button></div></form>`);
  const list=document.getElementById('food-draft-list'),button=document.getElementById('food-batch-save');
  const update=()=>{const count=list.children.length;button.textContent=count+'品を一括登録';button.disabled=!count;document.getElementById('food-draft-add').disabled=count>=50;};update();
  document.getElementById('food-draft-add').onclick=()=>{if(list.children.length>=50)return;list.insertAdjacentHTML('beforeend',row({category:'その他'}));update();};
  list.onclick=e=>{const b=e.target.closest('[data-remove-food-draft]');if(b){b.closest('.food-import-row').remove();update();}};
  document.getElementById('food-batch-form').onsubmit=e=>{
    e.preventDefault();const rows=[...list.children].map(r=>({name:r.querySelector('[data-draft-name]').value.trim(),quantity:Number(r.querySelector('[name="draftQty"]').value),unit:r.querySelector('[data-draft-unit]').value.trim(),category:r.querySelector('[data-draft-category]').value,location:r.querySelector('[data-draft-location]').value,expiryType:r.querySelector('[data-draft-expiry-type]').value,expiryDate:r.querySelector('[data-draft-expiry]').value}));
    const error=document.getElementById('food-batch-error');if(!rows.length||rows.length>50||rows.some(f=>!f.name||!Number.isFinite(f.quantity)||f.quantity<=0||f.quantity>999999)){error.textContent='食材名と0より大きい数量を入力してください';return;}
    button.disabled=true;try{ui.onSave(rows,imageId);}catch(e){error.textContent=e.message;button.disabled=false;}
  };
}
