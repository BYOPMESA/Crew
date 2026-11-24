from common import *
P='../assets/photos/'
# A4
page('a04-dashboard.html','crew.com - Home',f'''
<div class="rowbet"><div><div class="eyebrow">Welcome back</div><h2 style="margin-top:3px">Hi, Chris</h2></div><div class="step-av">C</div></div>
<div class="card tintsun" style="display:flex;gap:12px;align-items:center;padding:12px 14px">
  <div class="ico-sq">{ic('<path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',20)}</div>
  <div style="flex:1"><b style="font-size:13px">Where are you right now?</b><div class="small" style="font-size:10.5px;margin-top:2px;line-height:1.35">Kochi, Kerala - flights &amp; transport options start from here</div></div>
  <span class="pill-btn">Change</span></div>
<div class="btnrow"><a href="a05-preferences.html" class="cta">New plan</a><a class="cta2">Join a plan</a></div>
<div class="sec-h"><span class="eyebrow">Recent trips</span></div>
<div class="card tripcard"><div class="strip" style="background-image:url({P}munnar.jpg)"><span class="badge planning">Planning</span></div>
 <div class="bd"><div><div class="t">Munnar Weekend</div><div class="s">Nov 27-30 · 4 crew · ₹6,100/person</div></div>
 <div class="avatars"><div class="av t">C</div><div class="av g">S</div><div class="av y">M</div><div class="av more">+1</div></div></div></div>
<div class="card" style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px"><div><div style="font-weight:700;font-size:13px">Hampi Heritage Ride</div><div class="small" style="font-size:10.5px;margin-top:3px">Oct 2026 · Completed · ₹5,200/person</div></div><span class="pill-btn grey">View</span></div>
<div class="sec-h"><span class="eyebrow">Suggested for your crew</span><a class="link" style="font-size:11px">See all</a></div>
<div class="sugg">
 <div class="photo scrim" style="background-image:url({P}manali.jpg)"><div class="on"><b>Manali</b><span>Snow season · ₹8-12k</span></div></div>
 <div class="photo scrim" style="background-image:url({P}coorg.jpg)"><div class="on"><b>Coorg</b><span>Coffee estates · ₹5-8k</span></div></div></div>
<div class="grow"></div>{nav('home')}''')

# A5
chips=lambda items,on:''.join(f'<span class="chip{" sel" if i in on else ""}">{i}</span>' for i in items)
page('a05-preferences.html','crew.com - Your preferences',f'''
{step_head('C','Step 1 of 3 · Your preferences','What do you want, <em>Chris?</em>')}
<div class="sec"><div class="rowbet"><span class="eyebrow">Your budget</span><b style="color:var(--teal);font-size:16px;font-weight:800">₹8,000</b></div>
 <div class="card" style="padding:14px 16px"><div class="slider"><div class="track"></div><div class="fill"></div><div class="knob"></div></div><div class="scale"><span>₹2k</span><span>₹25k</span></div>
 <div class="small" style="font-size:9.5px;margin-top:8px">Stays private · only the AI uses it to shape the plan</div></div></div>
<div class="sec"><span class="eyebrow">Into what?</span><div class="card"><div class="chips">{chips(['Beaches','Nightlife','Water sports','Cafes','Treks','Seafood','Shopping','History'],['Beaches','Nightlife','Seafood'])}</div></div></div>
<div class="sec"><span class="eyebrow">Trip vibe</span><div class="vibes"><div class="vibe"><b>Chill</b><span>slow mornings</span></div><div class="vibe sel"><b>Balanced</b><span>bit of both</span></div><div class="vibe"><b>Packed</b><span>see everything</span></div></div></div>
<div class="sec"><span class="eyebrow">Stay style</span><div class="chips">{chips(['Hostel','3-star hotel','Villa','Resort'],['3-star hotel'])}</div></div>
<div class="sec"><span class="eyebrow">A place you don't want to miss (optional)</span><div class="field"><span>Dudhsagar Falls</span></div><div><span class="mini-sun">{SPARK.replace('#00B8A9','#8A6400')} AI builds the plan around it</span></div></div>
<div class="grow"></div><a href="a06-trip-details.html" class="cta">Save &amp; continue</a>''')

# A6
page('a06-trip-details.html','crew.com - Trip details',f'''
{step_head('C','Step 2 of 3 · Trip details','The <em>basics.</em>')}
<div class="sec"><span class="eyebrow">Trip name</span><div class="card rowbet" style="padding:13px 14px"><b style="font-size:14px">Our trip</b>{ic('<path d="M4 20l4-1 11-11-3-3L5 16z"/>',16,'#6E847F')}</div></div>
<div class="sec"><span class="eyebrow">Dates</span><div class="card" style="display:flex;gap:12px;align-items:center;padding:12px 14px"><div class="ico-sq">{ic('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',20)}</div><div style="flex:1"><b style="font-size:14px">Dec 20 → Dec 23</b><div class="small" style="margin-top:2px;font-size:10.5px">Sun to Wed</div></div><span class="chip sel filter">3 nights</span></div></div>
<div class="sec"><span class="eyebrow">Crew size</span><div class="card rowbet" style="padding:12px 14px"><div class="stepper"><div class="rnd">−</div><div><b style="font-size:26px;font-family:var(--serif)">5</b><div class="small" style="font-size:10.5px">people</div></div><div class="rnd p">+</div></div><span class="small" style="font-size:10.5px;text-align:right">invite link<br>comes later</span></div></div>
<div class="sec"><span class="eyebrow">Notes for the crew (optional)</span><div class="card" style="font-style:italic;color:var(--mut);font-size:12px;line-height:1.5">College friends, first trip together. Keep it budget-friendly.</div></div>
<div class="dashed"><div class="ico-sq">{ic('<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',20)}</div><div><b style="font-size:12.5px">Have an itinerary already?</b><div class="small" style="font-size:10.5px;margin-top:2px;line-height:1.35">Feed it in - AI prices it and fills the gaps around your bookings.</div></div></div>
<div class="ai-card">{SPARK}<span>No destination yet - next step picks where, then the trip is created.</span></div>
<div class="grow"></div><a href="a07-where-to.html" class="cta">Continue {ARROW}</a>''')
