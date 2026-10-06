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

function providerConfig(){
  const desired=text(process.env.EMAIL_PROVIDER,30).toLowerCase()||'auto';
  const s=sender();
  const brevo=!!text(process.env.BREVO_API_KEY,300)&&!!s.email;
  const resend=!!text(process.env.RESEND_API_KEY,300)&&!!s.email;
  let provider='';
  if(desired==='brevo'&&brevo) provider='brevo';
  else if(desired==='resend'&&resend) provider='resend';
  else if(desired==='auto') provider=brevo?'brevo':(resend?'resend':'');
  return {provider,sender:s,configured:bool(process.env.EMAIL_ENABLED,true)&&!!provider,desired,brevo,resend};
}

export function emailHealth(){
  const c=providerConfig();
  return {
    configured:c.configured,
    provider:c.provider||c.desired||'none',
    senderConfigured:!!c.sender.email,
    orderConfirmation:true,
    paymentConfirmation:true,
    completionNotification:true
  };
}

export function emailTemplate({title='',eyebrow='UPLY DIGITAL',body='',ctaLabel='',ctaUrl='',note=''}){
  const safeUrl=/^https:\/\//i.test(String(ctaUrl||''))?String(ctaUrl):'';
  return `<!doctype html><html><body style="margin:0;background:#f4f7fc;font-family:Arial,Helvetica,sans-serif;color:#0f1d3a">
  <div style="display:none;max-height:0;overflow:hidden">${esc(title)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7fc;padding:28px 14px"><tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#fff;border-radius:22px;overflow:hidden;border:1px solid #e5ebf6;box-shadow:0 16px 50px rgba(12,49,111,.08)">
      <tr><td style="padding:26px 30px;background:linear-gradient(135deg,#0b5cff,#2878ff);color:#fff">
        <div style="font-size:11px;font-weight:800;letter-spacing:.16em;opacity:.78">${esc(eyebrow)}</div>
        <div style="font-size:26px;line-height:1.18;font-weight:900;margin-top:7px">${esc(title)}</div>
      </td></tr>
      <tr><td style="padding:28px 30px;font-size:15px;line-height:1.7;color:#43516b">${body}
        ${safeUrl&&ctaLabel?`<div style="margin-top:24px"><a href="${esc(safeUrl)}" style="display:inline-block;background:#0b5cff;color:#fff;text-decoration:none;padding:13px 19px;border-radius:12px;font-weight:800">${esc(ctaLabel)}</a></div>`:''}
        ${note?`<div style="margin-top:24px;padding:13px 15px;background:#f6f9ff;border:1px solid #e1eaff;border-radius:12px;color:#66758f;font-size:13px">${esc(note)}</div>`:''}
      </td></tr>
      <tr><td style="padding:18px 30px;border-top:1px solid #edf1f7;color:#8a96aa;font-size:12px">Uply Digital · Email transaksi otomatis. Abaikan jika kamu tidak merasa membuat pesanan ini.</td></tr>
    </table>
  </td></tr></table></body></html>`;
}

export async function sendEmail(to,subject,html){
  const recipient=text(to,240);
  const c=providerConfig();
  if(!recipient||!c.configured) return {sent:false,reason:'not_configured',provider:c.provider||''};
  try{
    if(c.provider==='brevo'){
      const body={
        sender:{name:c.sender.name,email:c.sender.email},
        to:[{email:recipient}],
        subject:text(subject,240),
        htmlContent:String(html||'')
      };
      const reply=text(process.env.EMAIL_REPLY_TO,240);
      if(reply) body.replyTo={email:reply,name:c.sender.name};
      const r=await fetch('https://api.brevo.com/v3/smtp/email',{
        method:'POST',
        headers:{'api-key':text(process.env.BREVO_API_KEY,300),'accept':'application/json','Content-Type':'application/json'},
        body:JSON.stringify(body)
      });
      const data=await r.json().catch(()=>({}));
      return {sent:r.ok,status:r.status,provider:'brevo',messageId:data.messageId||'',error:r.ok?'':text(data.message||data.code||'Brevo error',300)};
    }
    const body={from:c.sender.formatted,to:[recipient],subject:text(subject,240),html:String(html||'')};
    const reply=text(process.env.EMAIL_REPLY_TO,240); if(reply) body.reply_to=reply;
    const r=await fetch('https://api.resend.com/emails',{
      method:'POST',headers:{'Authorization':`Bearer ${text(process.env.RESEND_API_KEY,300)}`,'Content-Type':'application/json'},body:JSON.stringify(body)
    });
    const data=await r.json().catch(()=>({}));
    return {sent:r.ok,status:r.status,provider:'resend',messageId:data.id||'',error:r.ok?'':text(data.message||data.name||'Resend error',300)};
  }catch(e){return {sent:false,reason:'network',provider:c.provider,error:text(e?.message||e,300)};}
}
