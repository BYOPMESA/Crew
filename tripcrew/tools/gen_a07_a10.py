from common import *
P='../assets/photos/'
CHK=ic('<path d="M5 12l5 5 9-10"/>',12,'#0E9F6E',3)
# A7
def dest(img,nm,tg,pr,hl=False):
    return f'<div class="dest{" hl" if hl else ""}"><div class="ph" style="background-image:url({P}{img})"></div><div><div class="nm">{nm}</div><div class="tg">{tg}</div></div><div class="pr"><b>{pr}</b><span>per person</span></div></div>'
page('a07-where-to.html','crew.com - Where to',f'''
<div class="hdr">{back('a06-trip-details.html')}<div class="eyebrow active">Step 3 of 3 · Our trip</div></div>
<h1>Where <em>to?</em></h1>
<div class="field">{ic(I_SEARCH,18,'#6E847F')}<span class="ph">Search a destination</span></div>
<div class="banner">{SPARK}<div style="flex:1"><b>Not sure? Ask AI</b><div class="s">Ranks destinations from your crew's preferences and ₹8,000 budget.</div></div><a href="a08-ai-picks.html" class="txtbtn">Get AI picks</a></div>
{dest('beach.jpg','Goa','Beaches · Nightlife · Seafood','₹7.8k',True)}
{dest('manali.jpg','Manali','Snow · Treks · Cafes','₹9.2k')}
{dest('pondicherry.jpg','Pondicherry','Beaches · Cafes · French town','₹6.4k')}
{dest('coorg.jpg','Coorg','Coffee estates · Treks','₹5.8k')}
<div class="grow"></div><a href="a09-invite.html" class="cta">Create trip with Goa</a>''')

# A8
page('a08-ai-picks.html','crew.com - AI picks',f'''
<div class="hdr">{back('a07-where-to.html')}<div class="eyebrow active">Our trip</div></div>
<div><h1>AI picks for <em>your crew.</em></h1><div style="margin-top:8px">{ai_note("Ranked from 5 preference sets and your ₹8,000 budget.")}</div></div>
<div class="rank"><div class="big" style="background-image:url({P}beach.jpg)"><span class="badge best">★ Best match 96%</span><span class="nm">Goa</span><span class="pp">₹7.8k <small style="font-weight:500;font-size:10px">/person</small></span></div>
 <div class="bd"><span class="rchip">Beaches + Nightlife picks</span><span class="rchip">Inside ₹8,000 budget</span><span class="rchip">4 direct flights from Kochi</span></div></div>
<div class="rank sm"><div class="ph" style="background-image:url({P}pondicherry.jpg)"></div><div style="flex:1"><div class="nm">Pondicherry</div><div style="margin:5px 0"><span class="badge completed">88% match</span></div><span class="rchip">Cafes + Beaches</span></div><div style="text-align:right;padding-right:6px"><b style="color:var(--teal);font-size:15px;font-weight:800;display:block">₹6.4k</b><span class="small" style="font-size:9.5px">per person</span></div></div>
<div class="rank sm"><div class="ph" style="background-image:url({P}gokarna.jpg)"></div><div style="flex:1"><div class="nm">Gokarna</div><div style="margin:5px 0"><span class="badge completed">81% match</span></div><span class="rchip">Quiet beaches + Treks</span></div><div style="text-align:right;padding-right:6px"><b style="color:var(--teal);font-size:15px;font-weight:800;display:block">₹5.9k</b><span class="small" style="font-size:9.5px">per person</span></div></div>
<div class="grow"></div><a href="a09-invite.html" class="cta">Lock Goa - invite the crew</a>''')

# A9
def crew(av,cls,nm,sub,badge): return f'<div class="crewrow"><div class="av {cls}">{av}</div><div><b>{nm}</b><div class="s">{sub}</div></div><span class="badge {badge[0]}">{badge[1]}</span></div>'
SHARE=ic('<path d="M12 16V4M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',17,'#fff',2.3)
page('a09-invite.html','crew.com - Invite the crew',f'''
<div class="hdr">{back('a07-where-to.html')}<div class="eyebrow active">Goa · Dec 20-23</div></div>
<h1>Invite the <em>crew.</em></h1>
<div class="card" style="padding:12px 14px"><b style="font-size:13px">Share this link</b><div class="linkrow"><span>crew.com/join/GOA-X7K2</span><span class="chip sel">Copy</span></div></div>
<div class="sharecard" style="background-image:url({P}beach.jpg)"><span class="code">GOA-X7K2</span><div class="tx"><b>Goa · Dec 20-23 · ₹7,850/person</b><span>You're invited to plan this trip with Chris</span></div></div>
<a href="a10-generating.html" class="cta">{SHARE} Share invite</a>
<div class="sec" style="gap:2px"><span class="eyebrow">Crew</span><div class="card" style="padding:2px 14px">
{crew('C','t','Chris','You · Organiser',('joined','Joined'))}{crew('S','g','Saqeeb','invite sent',('planning','Pending'))}{crew('M','y','Manas','invite sent',('planning','Pending'))}{crew('R','t','Rahul','invite sent',('planning','Pending'))}{crew('A','g','Aisha','invite sent',('planning','Pending'))}</div></div>
{ai_note("Friends set their own preferences after joining - no budget questions.")}''')

# A10
page('a10-generating.html','crew.com - Building your plan',f'''
<meta http-equiv="refresh" content="9;url=a11-flexible-plan.html">
<div class="grow"></div>
<div class="gen" style="display:flex;flex-direction:column;gap:14px;align-items:center">
<div class="circ">{ic('<path d="M12 2l2.6 8.4L23 13l-8.4 2.6L12 24l-2.6-8.4L1 13l8.4-2.6z" transform="scale(.92) translate(1 -1)"/>',34,'#00B8A9',1.8)}</div>
<h2 style="font-size:25px">Building your <em>Goa plan...</em></h2><p>One plan from everyone's preferences.</p></div>
<div class="chk" style="margin-top:12px">
<div class="r done"><span class="dot d">{CHK}</span>Read 5 preference sets</div>
<div class="r done"><span class="dot d">{CHK}</span>Compared 23 stays</div>
<div class="r done"><span class="dot d">{CHK}</span>Checked Google reviews of 40+ local restaurants</div>
<div class="r act"><span class="dot spin"></span>Balancing budgets - aiming under ₹8,000/person</div>
<div class="r pend"><span class="dot p"></span>Locking the flexible plan</div>
<div class="r pend"><span class="dot p"></span>Preparing the vote</div></div>
<div class="prog" style="margin-top:8px"><i></i></div>
<div class="grow"></div><div class="grow"></div>''')

