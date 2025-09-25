
(function(){
    const $ = (s,r=document)=>r.querySelector(s);
    const lStatus=$('#lStatus'), lCount=$('#lCount');
    const tbody=$('#usersTbl tbody');
    const show = (id)=>{ $('#hub').style.display='none'; $(id).hidden=false; };
    const back = ()=>{ 
        $('#hub').style.display='grid'; 
        $('#hasherView').hidden=true; 
        $('#addUserView').hidden=true; 
        $('#editUserView').hidden=true; 
        $('#resetPwdView').hidden=true;
        $('#userListView').hidden=true;
    };

    // Hub navigation
    $('#openHasher').addEventListener('click', ()=> show('#hasherView'));
    $('#openAddUser').addEventListener('click', ()=> show('#addUserView'));
    $('#openEditUser').addEventListener('click', ()=> show('#editUserView'));
    $('#openResetPwd').addEventListener('click', ()=> show('#resetPwdView'));
    $('#openUserList').addEventListener('click', ()=> { show('#userListView'); loadUsers(); });
    $('#backFromHasher').addEventListener('click', back);
    $('#backFromUser').addEventListener('click', back);
    $('#backFromEdit').addEventListener('click', back);
    $('#backFromReset').addEventListener('click', back);
    $('#backFromList').addEventListener('click', back);

    // Hasher
    const pwd = $('#pwd'), hashOut = $('#hashOut'), outCard = $('#outCard'), msg = $('#msg'), algo = $('#algo'), hStatus = $('#hStatus');
    $('#toggle').addEventListener('click', (e)=>{ const sh = pwd.type==='password'; pwd.type=sh?'text':'password'; e.currentTarget.textContent=sh?'Hide':'Show'; if (sh) requestAnimationFrame(()=>pwd.blur()); });
    $('#hashBtn').addEventListener('click', async (ev)=>{
      const btn = ev.currentTarget;
      const v = (pwd.value||'').toString();
      if (!v) { msg.textContent='Enter a password.'; return; }

      btn.disabled = true;
      hStatus.textContent='Hashing…';
      msg.textContent='Hashing…';

      try{
          const r = await fetch('/evotechmail/api/admin/hash',{
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ password: v })
          });
          const j = await r.json();
          if (!r.ok || !j.ok) throw new Error(j.error || ('HTTP '+r.status));

          hashOut.value = j.hash || '';
          outCard.hidden = false;
          hashOut.classList.add('fade-ok');
          setTimeout(()=>hashOut.classList.remove('fade-ok'), 1400);
          algo.textContent = (j.hash||'').startsWith('$argon2') ? 'argon2' : '';
          msg.textContent='Done.';
      } catch(e){
          msg.textContent = 'Failed: ' + (e.message||'Error');
      } finally {
          btn.disabled = false;
          hStatus.textContent='';
      }
    });

    $('#clearBtn').addEventListener('click', ()=>{ pwd.value=''; hashOut.value=''; outCard.hidden=true; msg.textContent=''; });
    $('#copyBtn').addEventListener('click', async ()=>{ try{ await navigator.clipboard.writeText(hashOut.value||''); msg.textContent='Copied'; setTimeout(()=>msg.textContent='',1200);}catch{ msg.textContent='Copy failed'; setTimeout(()=>msg.textContent='',1200);} });

    // Add User
    const uEmail=$('#uEmail'), uName=$('#uName'), uRole=$('#uRole'), uActive=$('#uActive'), uPwd=$('#uPwd'), uPwd2=$('#uPwd2'), uStatus=$('#uStatus');
    $('#uCreate').addEventListener('click', async (ev)=>{
      ev.preventDefault();
      const btn = ev.currentTarget;

      const email=(uEmail.value||'').trim().toLowerCase();
      const password=(uPwd.value||'');
      const password2=(uPwd2.value||'');

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ uStatus.textContent='Enter a valid email'; setTimeout(()=>uStatus.textContent='',1500); return; }
      if (!password){ uStatus.textContent='Password required'; setTimeout(()=>uStatus.textContent='',1500); return; }
      if (password!==password2){ uStatus.textContent='Passwords do not match'; setTimeout(()=>uStatus.textContent='',1500); return; }

      const payload={ email, password, display_name:(uName.value||'').trim(), role_cd:uRole.value, is_active:uActive.checked };

      btn.disabled = true;
      uStatus.textContent='Saving…';

      try{
          const r = await fetch('/evotechmail/api/admin/users',{
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify(payload)
          });
          const j = await r.json();
          if (!r.ok || !j.ok) throw new Error(j.error || ('HTTP '+r.status));

          uStatus.textContent='✔ User created (id '+j.user.user_id+')';
          uStatus.classList.add('fade-ok');
          setTimeout(()=>{ uStatus.textContent=''; uStatus.classList.remove('fade-ok'); },1400);
          $('#uClear').click();
      } catch(e){
          uStatus.textContent='Failed: ' + (e.message||'Error');
          setTimeout(()=>uStatus.textContent='',1800);
      } finally {
          btn.disabled = false;
      }
    });

    $('#uClear').addEventListener('click', ()=>{ uEmail.value=''; uName.value=''; uRole.value='admin'; uActive.checked=true; uPwd.value=''; uPwd2.value=''; });

    // Edit User
    const eEmail=$('#eEmail'), eDisp=$('#eDisp'), eRole=$('#eRole'), eActive=$('#eActive'), eStatus=$('#eStatus'), eForm=$('#eForm'), eMeta=$('#eUserMeta');
    let eUserId = null, eUserEmail = null;

    $('#eLoad').addEventListener('click', async ()=>{
      const email=(eEmail.value||'').trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ eStatus.textContent='Enter a valid email'; setTimeout(()=>eStatus.textContent='',1500); return; }
      eStatus.textContent='Loading…';
      eForm.hidden = true;
      eUserId = null;
      try{
        const r = await fetch('/evotechmail/api/admin/users/by-email?email='+encodeURIComponent(email));
        const j = await r.json();
        if (!r.ok || !j.ok) throw new Error(j.error || ('HTTP '+r.status));
        const u = j.user;
        eUserId = u.user_id;
        eUserEmail = u.email;
        eDisp.value = u.display_name || '';
        eRole.value = u.role_cd || 'staff';
        eActive.checked = !!u.is_active;
        eMeta.textContent = 'User ID: '+u.user_id+'  •  Email: '+u.email;
        eForm.hidden = false;
        eStatus.textContent='';
      }catch(err){
        eStatus.textContent='Load failed: '+(err.message||'Error');
        setTimeout(()=>eStatus.textContent='',2000);
      }
    });

    $('#eSave').addEventListener('click', async ()=>{
      if (!eUserId){ eStatus.textContent='Load a user first'; setTimeout(()=>eStatus.textContent='',1500); return; }
      eStatus.textContent='Saving…';
      try{
        const r = await fetch('/evotechmail/api/admin/users/'+encodeURIComponent(eUserId),{
          method:'PUT',
          headers:{'Content-Type':'application/json'},
          body: JSON.stringify({
            display_name: (eDisp.value||'').trim() || null,
            role_cd: eRole.value,
            is_active: eActive.checked
          })
        });
        const j = await r.json();
        if (!r.ok || !j.ok) throw new Error(j.error || ('HTTP '+r.status));
        eStatus.textContent='✔ Saved';
        eStatus.classList.add('fade-ok');
        setTimeout(()=>{ eStatus.textContent=''; eStatus.classList.remove('fade-ok'); },1200);
        // refresh meta with updated timestamp if present
        if (j.user) {
          eMeta.textContent = 'User ID: '+j.user.user_id+'  •  Email: '+(j.user.email||eUserEmail);
        }
      }catch(err){
        eStatus.textContent='Save failed: '+(err.message||'Error');
        setTimeout(()=>eStatus.textContent='',2000);
      }
    });

    $('#eClear').addEventListener('click', ()=>{
      eEmail.value=''; eDisp.value=''; eRole.value='staff'; eActive.checked=false; eForm.hidden=true; eMeta.textContent=''; eUserId=null; eUserEmail=null;
    });

    // Reset password
    let rUserId=null;
    let rStatus;
    $('#rLoad').addEventListener('click', async ()=>{
        const email=$('#rEmail').value.trim().toLowerCase();
        rStatus=$('#rStatus');
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ rStatus.textContent='Enter a valid email'; setTimeout(()=>rStatus.textContent='',1500); return; }
        const r= await fetch('/evotechmail/api/admin/users/by-email?email='+encodeURIComponent(email));
        const j=await r.json();
        if(j.ok){ rUserId=j.user.user_id; $('#rMeta').textContent=`User: ${j.user.email}`; $('#rForm').hidden=false; }
    });
    $('#rSave').addEventListener('click', async ()=>{
        if(!rUserId) return;
        const p1=$('#rPwd').value, p2=$('#rPwd2').value;
        if(p1!==p2){ $('#rStatus').textContent='Mismatch'; return; }
        const r=await fetch(`/evotechmail/api/admin/users/${rUserId}/password`,{
        method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:p1})
        });
        const j=await r.json();
        $('#rStatus').textContent=j.ok?'✔ Updated':'Error';
    });
    $('#rClear').addEventListener('click',()=>{ $('#rEmail').value=''; $('#rPwd').value=''; $('#rPwd2').value=''; $('#rForm').hidden=true; });

    // Users list
    async function loadUsers(){
        lStatus.textContent='Loading…';
        lCount.textContent=''; tbody.innerHTML='';
        try{
        // no limit/offset → get everything
        const r = await fetch('/evotechmail/api/admin/users');
        const j = await r.json();
        if (!r.ok || !j.ok) throw new Error(j.error || ('HTTP '+r.status));

        const rows = j.users || [];
        lCount.textContent = `${rows.length} user(s)`;

        const frag = document.createDocumentFragment();
        for (const u of rows){
            const tr = document.createElement('tr');
            tr.innerHTML = `
            <td>${esc(u.email)}</td>
            <td>${esc(u.display_name || '')}</td>
            <td>${esc(u.role_cd || '')}</td>
            <td>${u.is_active ? 'Yes' : 'No'}</td>
            <td>${esc(u.last_login_ts ?? '')}</td>
            <td>${esc(u.create_ts ?? '')}</td>
            `;
            frag.appendChild(tr);
        }
        tbody.appendChild(frag);
        lStatus.textContent='';
        } catch(err){
        lStatus.textContent = 'Load failed: ' + (err.message||'Error');
        setTimeout(()=> lStatus.textContent='', 2200);
        }
    }

    function esc(s){ return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

    // default: show hub only
    back();
  })();