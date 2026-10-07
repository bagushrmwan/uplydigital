function text(v,max=500){ return String(v??'').trim().slice(0,max); }
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function bool(v,def=true){if(v===undefined||v===null||String(v).trim()==='')return def;return String(v).toLowerCase()==='true';}

function sender(){
  const explicit=text(process.env.EMAIL_FROM_ADDRESS,240);
  const raw=text(process.env.EMAIL_FROM,300);
  const configuredName=text(process.env.EMAIL_FROM_NAME,120)||'Uply Digital';
  if(explicit) return {email:explicit,name:configuredName,formatted:`${configuredName} <${explicit}>`};
  const m=raw.match(/^\s*(.*?)\s*<([^<>\s]+@[^<>\s]+)>\s*$/);
  if(m){const name=text(m[1],120)||configuredName;return {email:m[2],name,formatted:`${name} <${m[2]}>`};}
  if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) return {email:raw,name:configuredName,formatted:`${configuredName} <${raw}>`};
  return {email:'',name:configuredName,formatted:''};
}

function windowsBackend(){
  const url=text(process.env.BELIBAYAR_BACKEND_URL,500).replace(/\/+$/,'');
  const key=text(process.env.BELIBAYAR_BACKEND_KEY,500);
  return {url,key,configured:/^https:\/\//i.test(url)&&key.length>=16};
}

function providerConfig(){
  const enabled=bool(process.env.EMAIL_ENABLED,true);
  const desired=text(process.env.EMAIL_PROVIDER,30).toLowerCase()||'windows';
  const windows=windowsBackend();
  const s=sender();
  const brevo=!!text(process.env.BREVO_API_KEY,300)&&!!s.email;
  const resend=!!text(process.env.RESEND_API_KEY,300)&&!!s.email;

  // V32.1: jika Windows backend tersedia, email selalu melewati Windows static IP.
  // Direct provider hanya fallback untuk instalasi yang belum memakai Windows backend.
  let provider='';
  if(enabled&&windows.configured) provider='windows';
  else if(enabled&&desired==='brevo'&&brevo) provider='brevo';
  else if(enabled&&desired==='resend'&&resend) provider='resend';
  else if(enabled&&desired==='auto') provider=brevo?'brevo':(resend?'resend':'');

  return {provider,sender:s,configured:enabled&&!!provider,desired,brevo,resend,windows};
}

export function emailHealth(){
  const c=providerConfig();
  return {
    configured:c.configured,
    provider:c.provider||c.desired||'none',
    transport:c.provider==='windows'?'windows-static-ip':'direct',
    windowsBackendConfigured:c.windows.configured,
    senderConfigured:c.provider==='windows'?undefined:!!c.sender.email,
    orderConfirmation:true,
    paymentConfirmation:true,
    completionNotification:true
  };
}

export async function probeEmailBackend(){
  const c=providerConfig();
  if(c.provider!=='windows') return {ok:c.configured,status:c.configured?200:0,provider:c.provider||'none',transport:'direct'};
  try{
    const r=await fetch(`${c.windows.url}/api/email/diagnostic`,{
      method:'GET',
      headers:{'X-Uply-Backend-Key':c.windows.key,'Accept':'application/json'},
      signal:AbortSignal.timeout(10000)
    });
    const data=await r.json().catch(()=>({}));
    return {
      ok:r.ok&&data?.configured===true,
      status:r.status,
      provider:data?.provider||'brevo',
      transport:'windows-static-ip',
      configured:data?.configured===true,
      staticEgress:data?.staticEgress===true,
      message:text(data?.message||'',240)
    };
  }catch(e){
    return {ok:false,status:0,provider:'brevo',transport:'windows-static-ip',configured:false,staticEgress:true,message:text(e?.message||e,240)};
  }
}

export function emailTemplate({title='',eyebrow='UPLY DIGITAL',body='',ctaLabel='',ctaUrl='',note=''}){
  const safeUrl=/^https:\/\//i.test(String(ctaUrl||''))?String(ctaUrl):'';
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"></head><body style="margin:0;background:#eef4ff;font-family:Arial,Helvetica,sans-serif;color:#0b1736">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(title)} · Uply Digital</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#eef4ff;margin:0;padding:0"><tr><td align="center" style="padding:24px 12px">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:620px;background:#ffffff;border:1px solid #dfe8f8;border-radius:24px;overflow:hidden;box-shadow:0 14px 40px rgba(19,67,160,.08)">
      <tr><td style="padding:28px 30px;background:#1261ff;background-image:linear-gradient(135deg,#0757ef 0%,#2878ff 100%);color:#ffffff">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
          <td width="48" valign="middle"><div style="width:40px;height:40px;border-radius:12px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.24);text-align:center;line-height:40px;font-size:21px;font-weight:900;color:#ffffff">U</div></td>
          <td valign="middle" style="font-size:18px;font-weight:900;letter-spacing:-.02em;color:#ffffff">Uply Digital</td>
        </tr></table>
        <div style="margin-top:25px;font-size:11px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:#dfeaff">${esc(eyebrow)}</div>
        <div style="font-size:28px;line-height:1.2;font-weight:900;margin-top:8px;letter-spacing:-.03em;color:#ffffff">${esc(title)}</div>
      </td></tr>
      <tr><td style="padding:30px;font-size:15px;line-height:1.7;color:#465673">${body}
        ${safeUrl&&ctaLabel?`<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:26px"><tr><td style="border-radius:13px;background:#1261ff"><a href="${esc(safeUrl)}" style="display:inline-block;color:#ffffff;text-decoration:none;padding:14px 21px;font-weight:800;font-size:15px">${esc(ctaLabel)} &nbsp;→</a></td></tr></table>`:''}
        ${note?`<div style="margin-top:24px;padding:14px 16px;background:#f6f9ff;border:1px solid #e0e9fa;border-radius:14px;color:#63728d;font-size:13px;line-height:1.6">${esc(note)}</div>`:''}
      </td></tr>
      <tr><td style="padding:20px 30px;border-top:1px solid #edf2fa;background:#fbfdff;color:#8995a9;font-size:12px;line-height:1.6">
        <strong style="color:#41506b">Uply Digital</strong><br>Notifikasi transaksi otomatis. Jika kamu tidak merasa membuat pesanan ini, abaikan email ini.
      </td></tr>
    </table>
  </td></tr></table></body></html>`;
}

export async function sendEmail(to,subject,html){
  const recipient=text(to,240);
  const c=providerConfig();
  if(!recipient||!c.configured) return {sent:false,reason:'not_configured',provider:c.provider||''};
  try{
    if(c.provider==='windows'){
      const r=await fetch(`${c.windows.url}/api/email/send`,{
        method:'POST',
        headers:{
          'X-Uply-Backend-Key':c.windows.key,
          'Accept':'application/json',
          'Content-Type':'application/json'
        },
        body:JSON.stringify({to:recipient,subject:text(subject,240),html:String(html||'')}),
        signal:AbortSignal.timeout(20000)
      });
      const data=await r.json().catch(()=>({}));
      return {
        sent:r.ok&&data?.sent===true,
        status:r.status,
        provider:'windows-brevo',
        messageId:text(data?.messageId||'',200),
        error:r.ok?'':text(data?.message||data?.error||'Windows email relay error',300)
      };
    }
    if(c.provider==='brevo'){
      const body={sender:{name:c.sender.name,email:c.sender.email},to:[{email:recipient}],subject:text(subject,240),htmlContent:String(html||'')};
      const reply=text(process.env.EMAIL_REPLY_TO,240); if(reply) body.replyTo={email:reply,name:c.sender.name};
      const r=await fetch('https://api.brevo.com/v3/smtp/email',{method:'POST',headers:{'api-key':text(process.env.BREVO_API_KEY,300),'accept':'application/json','Content-Type':'application/json'},body:JSON.stringify(body)});
      const data=await r.json().catch(()=>({}));
      return {sent:r.ok,status:r.status,provider:'brevo',messageId:data.messageId||'',error:r.ok?'':text(data.message||data.code||'Brevo error',300)};
    }
    const body={from:c.sender.formatted,to:[recipient],subject:text(subject,240),html:String(html||'')};
    const reply=text(process.env.EMAIL_REPLY_TO,240); if(reply) body.reply_to=reply;
    const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Authorization':`Bearer ${text(process.env.RESEND_API_KEY,300)}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
    const data=await r.json().catch(()=>({}));
    return {sent:r.ok,status:r.status,provider:'resend',messageId:data.id||'',error:r.ok?'':text(data.message||data.name||'Resend error',300)};
  }catch(e){return {sent:false,reason:'network',provider:c.provider,error:text(e?.message||e,300)};}
}
