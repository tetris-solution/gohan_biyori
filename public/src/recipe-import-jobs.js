// Imports continue across in-app navigation while this browser tab stays open.
export function createRecipeImportJobs(ui){
 let jobs=[];
 const region=document.createElement('section');region.className='import-notifications';region.setAttribute('aria-label','レシピ読み取りの通知');region.setAttribute('aria-live','polite');document.body.append(region);
 function render(){region.innerHTML=jobs.filter(j=>j.owner===ui.owner()).map(j=>`<article class="import-notification" data-import-job="${j.id}"><strong>${j.status==='pending'?'レシピを読み取り中…':j.status==='done'?'レシピを登録しました':j.recipeId?'DBへの保存を確認できませんでした':'レシピを読み取れませんでした'}</strong><p>${ui.esc(j.status==='pending'?'別のページを使いながらお待ちください。':j.status==='done'?j.name+' · 材料・分量を確認してください':j.error)}</p>${j.recipeId?'<button class="outline" data-import-review>内容を確認</button>':''}${j.status==='error'?`<button class="outline" data-import-retry>${j.recipeId?'保存を再試行':j.failure?.fallback==='instagram-caption'?'キャプションを貼り付ける':'再入力する'}</button>${!j.recipeId&&j.failure?.fallback==='instagram-caption'?'<button class="outline" data-import-image>スクショから登録</button>':''}`:''}${j.status!=='pending'?'<button class="import-dismiss" aria-label="通知を閉じる" data-import-dismiss>×</button>':''}</article>`).join('');}
 async function persist(job){await ui.persist(job.owner,job.recipeId);if(job.owner!==ui.owner())return;job.status='done';render();ui.refresh();}
 async function start(run,save,retry){
  const owner=ui.owner();if(!owner||!ui.canSave()){ui.toast('先にDBの同期エラーを解消してください');return;}
  if(jobs.filter(j=>j.owner===owner&&j.status==='pending').length>=3){ui.toast('読み取りは同時に3件までです。完了をお待ちください');return;}
  const job={id:crypto.randomUUID(),owner,retry,status:'pending'};jobs=jobs.filter(j=>j.owner===owner);if(jobs.length>=10)jobs.splice(jobs.findIndex(j=>j.status!=='pending'),1);jobs.push(job);ui.close();render();
  try{const draft=await run();if(owner!==ui.owner())return;job.name=draft.name;job.recipeId=save(draft,{background:true});await persist(job);}
  catch(error){if(owner!==ui.owner())return;job.status='error';job.error=error.message;job.failure=error;render();}
 }
 region.onclick=async e=>{const node=e.target.closest('[data-import-job]'),job=jobs.find(j=>j.id===node?.dataset.importJob);if(!job||job.owner!==ui.owner())return;
  if(e.target.closest('[data-import-review]')){ui.close();ui.review(job.recipeId);}
  if(e.target.closest('[data-import-dismiss]')){jobs=jobs.filter(j=>j!==job);render();}
  if(e.target.closest('[data-import-image]')){job.retry?.(job.failure,'image');return;}
  if(e.target.closest('[data-import-retry]')){if(!job.recipeId){if(job.retry)job.retry(job.failure);else ui.reenter();return;}if(!ui.canSave()){ui.toast('設定でDBの同期エラーを確認してください');return;}job.status='pending';render();try{await persist(job);}catch(error){job.status='error';job.error=error.message;job.failure=error;render();}}
 };
 return {start,clear(){jobs=[];render();}};
}
