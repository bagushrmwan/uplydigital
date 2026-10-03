export async function sendEmail(to, subject, html){
  const key=process.env.RESEND_API_KEY; const from=process.env.EMAIL_FROM;
  if(!key||!from||!to) return {sent:false,reason:'not_configured'};
  try{
    const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Authorization':`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({from,to:[to],subject,html})});
    return {sent:r.ok,status:r.status};
  }catch(e){return {sent:false,reason:'network'};}
}
