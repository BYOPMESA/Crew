from common import *
P='../assets/photos/'
STAR='<svg width="12" height="12" viewBox="0 0 24 24" fill="#FFC845"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>'
LINK=ic('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',16,'#fff',2.2)
CHK=ic('<path d="M5 12l5 5 9-10"/>',14,'#0E9F6E',3)
CH=lambda items,on:''.join(f'<span class="chip{" sel" if i==on else ""}">{i}</span>' for i in items)

# A16
page('a16-stay-detail.html','crew.com - Stay detail',f'''
<div class="fullhero" style="background-image:url({P}shack.jpg)">{back('a15-stays.html')}<span class="badge best">Best match</span><div class="tx"><h1>Casa Palolem</h1><div style="font-size:12px;opacity:.85">Palolem beach · 3-star</div></div></div>
<div class="sheetcard">
<div><div style="display:flex;align-items:center;gap:5px;font-size:12.5px;font-weight:600">{STAR}<b>4.6</b> · 1,120 reviews</div><div class="small" style="font-size:11.5px;margin-top:4px">Palolem Beach Rd, Canacona, South Goa</div></div>
<div class="sec" style="gap:4px"><span class="eyebrow">Price breakdown</span>
 <div class="brow"><span>₹2,000 x 3 nights</span><b>₹6,000</b></div>
 <div class="brow"><span style="color:var(--mut)">split 5 ways</span><span style="color:var(--mut)">shared rooms</span></div>
 <div style="height:1px;background:var(--line);margin:2px 0"></div>
 <div class="brow"><b>Total</b><b style="color:var(--teal);font-size:16px;font-weight:800">₹2,400 per person</b></div></div>
<div class="note-g">{CHK} Free cancellation till Dec 13</div>
<div class="grow"></div>
<a class="cta">{LINK} Open website</a><a href="a15-stays.html" class="cta2">+ Compare</a>
</div>''')

# A17
def voter(av,cls,nm,sub,yes): return f'<div class="voter"><div class="av {cls}">{av}</div><div><b>{nm}</b>{sub}</div><span class="badge {"yes" if yes else "planning"}">{"Yes" if yes else "Pending"}</span></div>'
page('a17-vote.html','crew.com - Group vote',f'''
<div class="hdr">{back('a11-flexible-plan.html')}<div class="eyebrow active">Goa plan</div></div>
<h1>Crew <em>vote.</em></h1>
<div class="cd"><b style="font-size:14px">Voting closes in 18h 24m</b><div class="small" style="font-size:11px;margin-top:3px">3 of 5 voted</div></div>
<div class="card"><div style="font-size:12px;color:var(--ink2);line-height:1.4">Day 1-3 flexible blocks · Casa Palolem · scooters</div><div style="margin-top:6px"><b style="color:var(--teal);font-size:18px;font-weight:800">₹7,850</b> <span class="small" style="font-size:11px">per person</span></div></div>
<div class="card" style="padding:4px 14px">
{voter('C','t','Chris',' <span class="small">You</span>',True)}{voter('S','g','Saqeeb','',True)}{voter('M','y','Manas','',False)}{voter('R','t','Rahul','',True)}{voter('A','g','Aisha','',False)}</div>
<div class="sec" style="gap:6px"><div class="rowbet"><span class="eyebrow">Live tally</span><b style="font-size:12px;color:var(--teal)">3 / 5</b></div><div class="tally"><i></i></div></div>
<div class="grow"></div>
<a class="cta">Vote yes</a><a class="cta2">Suggest a change</a>
{ai_note("Majority locks the plan; the organiser can still edit after.")}''')

# A18
def er(icon,t,amt,by='Saqeeb'): return f'<div class="erow"><div class="ico-sq">{icon}</div><div><b>{t}</b><div class="s">paid by {by} · split 5 ways</div></div><span class="amt">{amt}</span></div>'
def bar(n,p): return f'<div class="bar"><span>{n}</span><div class="tr"><i style="width:{p}%"></i></div><span>{p}%</span></div>'
PLUS='<span style="font-size:15px;line-height:1">+</span>'
A18=f'''
<div class="rowbet"><div><div class="eyebrow active">Goa · Dec 20-23</div><h1 style="margin-top:6px"><em>Expenses.</em></h1></div><a class="add-btn">{PLUS} Add expense</a></div>
<div class="sumrow"><div class="card"><div class="k">Trip total</div><b>₹39,250</b></div><div class="card"><div class="k">Your share</div><b style="color:var(--teal)">₹7,850</b></div></div>
<div class="chips" style="flex-wrap:nowrap">{CH(['All','Stay','Food','Travel','Activities'],'All')}</div>
<div class="sec"><span class="eyebrow">Where it went</span><div class="card bars" style="padding:12px 14px">{bar('Stay',38)}{bar('Food',26)}{bar('Travel',21)}{bar('Activities',15)}</div></div>
{er(ic(I_HOME,17),'Casa Palolem advance','₹6,000')}
{er(ic('<path d="M7 3v8M11 3v8M7 7h4M9 11v10M17 3c-2 2-2 6 0 8v10"/>',17),'Dinner at Thalassa','₹4,400','Manas')}
{er(ic('<circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M9 17h6l-3-8h4"/>',17),'Scooter deposit','₹2,000','Rahul')}
{er(ic('<path d="M3 17c3 0 3 2 6 2s3-2 6-2 3 2 6 2M5 14l7-8 7 8z"/>',17),'Sunset cruise tickets','₹4,500','Aisha')}
<a href="a19-settle-up.html" class="rowbet" style="font-size:13px;font-weight:700;color:var(--teal);padding:0 4px;flex:none"><span>Settle up →</span></a>
<div class="grow"></div>{nav('trips')}'''
page('a18-expenses.html','crew.com - Expenses',A18)
# A18b sheet
def make(name,body,extra):
    import os
    page(name,'crew.com - Add expense',body)
    p=os.path.join(SCREENS,name); s=open(p).read()
    s=s.replace('</div></body>',extra+'</div></body>'); open(p,'w').write(s)
make('a18b-add-expense.html',A18,f'''<div class="dim"></div><div class="sheet"><div class="grab"></div><h3 style="font-size:20px">Add <em>expense.</em></h3>
<div class="fgroup"><div class="lbl">Amount</div><div class="field focus"><span style="font-weight:700;color:var(--teal)">₹</span><span style="font-weight:700;font-size:16px">1,800</span></div></div>
<div class="fgroup"><div class="lbl">Title</div><div class="field"><span>Beach shack lunch</span></div></div>
<div class="fgroup"><div class="lbl">Paid by</div><div class="chips">{CH(['Chris','Saqeeb','Manas','Rahul','Aisha'],'Chris')}</div></div>
<div class="fgroup"><div class="lbl">Split</div><div class="chips">{CH(['Everyone','Select people'],'Everyone')}</div></div>
<a href="a18-expenses.html" class="cta" style="margin-top:4px">Add</a></div>''')

# A19
def owe(av,cls,t,s,btns): return f'<div class="owe"><div class="av {cls}">{av}</div><div><b>{t}</b><div class="s">{s}</div></div><div class="btns">{btns}</div></div>'
page('a19-settle-up.html','crew.com - Settle up',f'''
<div class="hdr">{back('a18-expenses.html')}<div class="eyebrow active">Goa</div></div>
<h1>Settle <em>up.</em></h1>
<div class="card" style="padding:18px 18px"><div class="small" style="font-size:11.5px">You are owed</div><div style="color:var(--teal);font-size:40px;font-weight:800;letter-spacing:-1px;margin-top:2px">₹1,250</div></div>
<div class="sec"><span class="eyebrow">Who owes who</span>
{owe('M','y','Manas','owes you <b style="display:inline;color:var(--ink)">₹850</b>','<span class="mini">UPI</span><span class="mini w">Mark paid</span>')}
{owe('R','t','Rahul','owes you <b style="display:inline;color:var(--ink)">₹400</b>','<span class="mini">UPI</span><span class="mini w">Mark paid</span>')}
{owe('A','g','Aisha','you owe <b style="display:inline;color:var(--ink)">₹250</b>','<span class="mini">Pay UPI</span>')}</div>
{ai_note("UPI opens your payment app; mark-as-paid is for cash.")}
<div class="grow"></div>{nav('trips')}''')

# B1
page('b01-invite.html',"crew.com - You're invited",f'''
<div class="fullhero" style="background-image:url({P}beach.jpg);height:230px"><div class="tx" style="bottom:46px"><h1 style="font-size:32px">You're <em style="color:#fff">invited!</em></h1><div style="font-size:12.5px;opacity:.88;margin-top:3px">Chris invited you to</div></div></div>
<div class="card" style="margin-top:-36px;position:relative;z-index:3;padding:16px"><h2 style="font-size:24px">Goa</h2><div class="small" style="font-size:12px;margin:4px 0 10px">Dec 20-23 · 4 friends in · ~₹7,850/person</div><div class="avatars"><div class="av t">C</div><div class="av g">M</div><div class="av y">R</div><div class="av t">A</div></div></div>
{ai_note("You'll set your own preferences - the plan shapes around everyone.")}
<div class="grow"></div><a href="b02-signup.html" class="cta">Join the trip {ARROW}</a>
<div class="center" style="font-size:12.5px"><a class="link">Log in instead</a></div>''')

# B2
page('b02-signup.html','crew.com - Join the crew',f'''
<div class="logo"><div class="logo-mark"><svg viewBox="0 0 220 220" width="38" height="38" aria-hidden="true"><rect width="220" height="220" rx="50" fill="#1F8A87"/><path d="M143.4 70.2 A52 52 0 1 0 143.4 149.8" fill="none" stroke="#FAF6EE" stroke-width="28" stroke-linecap="round"/><circle cx="160" cy="110" r="18" fill="#F5B800"/></svg></div><span class="logo-word">crew.com</span></div>
<div class="collage"><div class="photo wide" style="background-image:url({P}beach.jpg)"></div><div class="stack"><div class="photo" style="background-image:url({P}cabin.jpg)"></div><div class="photo" style="background-image:url({P}hills.jpg)"></div></div></div>
<div><h1>Join the <em>crew.</em></h1><p style="margin-top:6px">Quick sign up to see the Goa plan.</p></div>
<div class="fgroup"><div class="lbl">Full name</div><div class="field"><span>Saqeeb</span></div></div>
<div class="fgroup"><div class="lbl">Phone number</div><div class="field focus"><span class="prefix">+91</span><span>98765 43210</span></div></div>
<div class="fgroup"><div class="lbl">Email (optional)</div><div class="field"><span class="ph">you@example.com</span></div></div>
<div class="grow"></div><a href="b03-otp.html" class="cta">Continue {ARROW}</a>
<div class="small center">By continuing you agree to our Terms &amp; Privacy Policy</div>''')

# B3
LOCK='<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00B8A9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="3"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>'
page('b03-otp.html','crew.com - OTP verification',f'''
{back('b02-signup.html')}
<div style="margin-top:14px"><div class="eyebrow active">Verification</div><h1 style="margin-top:8px">Enter the <em>OTP code.</em></h1><p style="margin-top:8px">We sent a 6-digit code to +91 98765 43210 <a class="link">Edit</a></p></div>
<div class="otp" style="margin-top:14px"><div>4</div><div>2</div><div>8</div><div>1</div><div class="focus"><span class="caret"></span></div><div></div></div>
<a href="b04-joined.html" class="cta" style="margin-top:10px">Verify &amp; continue</a>
<div class="center small" style="font-size:11.5px">Didn't get the code? Resend in 00:24</div>
<div class="grow"></div>
<div class="card" style="display:flex;gap:10px;align-items:center;padding:12px 14px">{LOCK}<span style="font-size:11.5px;color:var(--ink2);line-height:1.4">Never share your OTP. crew.com will never call to ask for it.</span></div>''')
