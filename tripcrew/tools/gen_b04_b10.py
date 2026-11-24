import os,re
from common import *
P='../assets/photos/'
CH=lambda items,on:''.join(f'<span class="chip{" sel" if i in on else ""}">{i}</span>' for i in items)
def rd(n): return open(os.path.join(SCREENS,n)).read()
def wr(n,s): open(os.path.join(SCREENS,n),'w').write(s)
def rowc(av,cls,nm,sub,b,bc): return f'<div class="crewrow"><div class="av {cls}">{av}</div><div><b>{nm}</b><div class="s">{sub}</div></div><span class="badge {bc}">{b}</span></div>'
CHECK_W=ic('<path d="M5 12l5 5 9-10"/>',42,'#fff',3.2)

# B4
page('b04-joined.html',"crew.com - You're in",f'''
<div class="grow"></div>
<div style="display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center">
<div style="width:84px;height:84px;border-radius:50%;background:var(--grad);display:grid;place-items:center;box-shadow:var(--sh-cta)">{CHECK_W}</div>
<h1 style="margin-top:8px">You're in, <em>Saqeeb!</em></h1><p>Goa · Dec 20-23</p></div>
<div class="card" style="padding:2px 14px;margin-top:6px">
{rowc('C','t','Chris','Organiser','In','yes')}{rowc('S','g','Saqeeb','You','In','yes')}{rowc('M','y','Manas','invite sent','Pending','planning')}{rowc('R','t','Rahul','invite sent','Pending','planning')}{rowc('A','g','Aisha','invite sent','Pending','planning')}</div>
{ai_note("Set your preferences next - no budget needed from you.")}
<div class="grow"></div><a href="b05-preferences.html" class="cta">Set my preferences</a>''')

# B5
page('b05-preferences.html','crew.com - Your preferences',f'''
{step_head('S','Your preferences','What are you into, <em>Saqeeb?</em>')}
<div class="sec"><span class="eyebrow">Into what?</span><div class="card"><div class="chips">{CH(['Treks','Cafes','Seafood','Beaches','Nightlife','History','Shopping','Water sports'],['Treks','Cafes','Beaches'])}</div></div></div>
<div class="sec"><span class="eyebrow">Trip vibe</span><div class="vibes"><div class="vibe sel"><b>Chill</b><span>slow mornings</span></div><div class="vibe"><b>Balanced</b><span>bit of both</span></div><div class="vibe"><b>Packed</b><span>see everything</span></div></div></div>
<div class="sec"><span class="eyebrow">Stay style</span><div class="chips">{CH(['Hostel','3-star hotel','Villa','Resort'],['Hostel'])}</div></div>
<div class="sec"><span class="eyebrow">Must-visit place (optional)</span><div class="field"><span>Chapora Fort</span></div><div><span class="mini-sun">{SPARK.replace('#00B8A9','#8A6400')} AI adds it to the plan</span></div></div>
<div class="small" style="font-size:10.5px;line-height:1.45">Budgets stay private - the organiser's range guides the plan.</div>
<div class="grow"></div><a href="b06-waiting.html" class="cta">Save preferences</a>''')

# B6
BELL=ic('<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 21h4"/>',17,'#00B8A9',2)
page('b06-waiting.html','crew.com - Waiting on the crew',f'''
<meta http-equiv="refresh" content="9;url=b07-flexible-plan.html">
<div class="grow"></div>
<div style="display:flex;flex-direction:column;align-items:center;gap:12px;text-align:center">
<div class="gen"><div class="circ">{ic('<path d="M12 2l2.6 8.4L23 13l-8.4 2.6L12 24l-2.6-8.4L1 13l8.4-2.6z" transform="scale(.92) translate(1 -1)"/>',34,'#00B8A9',1.8)}</div></div>
<h1 style="margin-top:4px">Nice - <em>you're set.</em></h1><p>The AI plan unlocks when the crew finishes preferences.</p></div>
<div class="card" style="padding:2px 14px;margin-top:8px">
{rowc('C','t','Chris','','Done','yes')}{rowc('S','g','Saqeeb','You','Done','yes')}{rowc('M','y','Manas','','2 of 4 sections','planning')}{rowc('R','t','Rahul','','Not started','planning')}{rowc('A','g','Aisha','','Not started','planning')}</div>
<div class="sec" style="gap:6px"><div class="prog"><i style="width:45%"></i></div><div class="small center" style="font-size:10.5px">2 of 5 done</div></div>
<a class="cta2">{BELL} Nudge the crew</a>
<div class="grow"></div><div class="grow"></div>''')

# B7 (patch of A11)
s=rd('a11-flexible-plan.html')
s=s.replace('Goa · Dec 20-23</div>',"The crew's plan</div>",1).replace('Send to vote','Cast your vote').replace('a17-vote.html','b08-vote.html').replace('a10-generating.html','b06-waiting.html')
s=s.replace('Dudhsagar Falls is slotted on Day 2 morning.','Chapora Fort and Dudhsagar Falls are both slotted on Day 2.')
s=s.replace('The crew picks what they feel like.','The crew picks what they feel like. Voting asks for one yes/no on the whole plan.')
s=s.replace('<title>crew.com - Flexible plan</title>','<title>crew.com - The crew\'s plan</title>')
wr('b07-flexible-plan.html',s)

# B8
page('b08-vote.html','crew.com - Your vote',f'''
<div class="hdr">{back('b07-flexible-plan.html')}<div class="eyebrow active">Goa plan</div></div>
<h1>Your <em>vote.</em></h1>
<div class="card"><div style="font-size:12px;color:var(--ink2);line-height:1.4">Day 1-3 flexible blocks · Casa Palolem · scooters</div><div style="margin-top:6px"><b style="color:var(--teal);font-size:18px;font-weight:800">₹7,850</b> <span class="small" style="font-size:11px">per person</span></div></div>
<div class="card" style="display:flex;flex-direction:column;gap:10px"><div class="ai-note" style="font-size:11.5px;color:var(--ink2);font-weight:600">{SPARK}<span>Why the AI thinks you'll like it</span></div>
<div style="display:flex;flex-wrap:wrap;gap:6px"><span class="rchip">Your treks + cafes picks</span><span class="rchip">Chill vibe matched</span><span class="rchip">Chapora Fort added Day 2</span></div></div>
<div class="grow"></div>
<a href="b09-expenses.html" class="cta" style="height:58px;font-size:15px">Yes - I'm in</a>
<a class="cta2" style="height:58px;font-size:15px">No - suggest a change</a>
<div class="small center" style="font-size:10.5px">Voting closes in 18h 24m · 3 of 5 in</div>''')

# B9 (patch of A18)
s=rd('a18-expenses.html')
s=s.replace('<div class="k">Trip total</div><b>₹39,250</b>','<div class="k">Your share</div><b>₹7,850</b>')
s=s.replace('<div class="k">Your share</div><b style="color:var(--teal)">₹7,850</b>','<div class="k">You owe</div><b style="color:var(--teal)">₹250</b>')
s=s.replace('a19-settle-up.html','b10-settle-up.html')
# the first replace also created two "Your share"; make second distinct
wr('b09-expenses.html',s)

# B10
def owe(av,cls,t,s,btns): return f'<div class="owe"><div class="av {cls}">{av}</div><div><b>{t}</b><div class="s">{s}</div></div><div class="btns">{btns}</div></div>'
page('b10-settle-up.html','crew.com - Settle up',f'''
<div class="hdr">{back('b09-expenses.html')}<div class="eyebrow active">Goa</div></div>
<h1>Settle <em>up.</em></h1>
<div class="card" style="padding:18px 18px"><div class="small" style="font-size:11.5px">You owe</div><div style="color:var(--teal);font-size:40px;font-weight:800;letter-spacing:-1px;margin-top:2px">₹250</div></div>
<div class="sec"><span class="eyebrow">Who owes who</span>
{owe('A','g','Aisha','you owe <b style="display:inline;color:var(--ink)">₹250</b>','<span class="mini">Pay UPI</span>')}
{owe('M','y','Manas','owes you <b style="display:inline;color:var(--ink)">₹600</b>','<span class="mini">UPI</span><span class="mini w">Mark paid</span>')}</div>
{ai_note("UPI opens your payment app; mark-as-paid is for cash.")}
<div class="grow"></div>{nav('trips')}''')
