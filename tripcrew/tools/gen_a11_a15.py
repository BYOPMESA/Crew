from common import *
P='../assets/photos/'
exec(open('gen_a07_a10.py').read().split("# A7")[0].split("from common import *")[-1]) if False else None
STAR=ic('<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',11,'#FFC845',0)
STAR=STAR.replace('fill="none"','fill="#FFC845"')
CHEV=ic('<path d="M9 5l7 7-7 7"/>',16,'#A3B8B2',2.4)
TICK=ic('<path d="M5 12l5 5 9-10"/>',12,'#fff',3)
def rating(r,n): return f'{STAR}<span>{r} · {n} reviews</span>'

# ---- A11 (with footer)
def opt(img,nm,pr):
    free=pr=='Free'
    return f'<div class="opt"><div class="th" style="background-image:url({P}{img})"></div><div><b>{nm}</b><span class="{"free" if free else ""}">{pr}</span></div><div class="rd"></div></div>'
def tb(icon,name,time,opts): return f'<div class="tb"><div class="h">{icon}<span class="eyebrow">{name}</span><span class="t">{time}</span></div>{"".join(opts)}</div>'
SUN=ic('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',16,'#FFC845')
SUN2=ic('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2"/>',16,'#E0A800')
MOON=ic('<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',16,'#3E5A57')
PEN=ic('<path d="M4 20l4-1 11-11-3-3L5 16z"/>',15,'#00B8A9',2)
page('a11-flexible-plan.html','crew.com - Flexible plan',f'''
<div class="hdr" style="margin-top:-4px">{back('a10-generating.html')}<div class="eyebrow active">Goa · Dec 20-23</div></div>
<h1>Your flexible <em>plan.</em></h1>
{ai_note("Not a fixed schedule - each time block has options. The crew picks what they feel like.")}
<div class="dtabs"><span class="on">Day 1</span><span>Day 2</span><span>Day 3</span></div>
{tb(SUN,'Morning','9 AM - 12 PM',[opt('cafe.jpg','Breakfast at Cafe Alchemy','₹250'),opt('flea.jpg','Anjuna flea market walk','Free')])}
{tb(SUN2,'Afternoon','12 - 5 PM',[opt('baga.jpg','Baga beach + water sports','₹1,200'),opt('fort.jpg','Chapora Fort + lunch at Thalassa','₹600'),opt('cabin.jpg','Siesta at the stay','Free')])}
{tb(MOON,'Evening','5 PM - late',[opt('river.jpg','Sunset cruise on the Mandovi','₹900'),opt('night.jpg','Silent disco, Palolem','₹700')])}
<div class="grow"></div>
<div class="foot"><div class="t"><span>Day 1 total per person</span><b>≈ ₹2,150</b></div><div style="margin-top:6px">{ai_note("<b style='color:var(--ink2)'>Why this fits:</b> Beaches + seafood picks, inside budget, Dudhsagar Falls is slotted on Day 2 morning.")}</div></div>
<div class="btn2"><a class="cta2">{PEN} Edit plan</a><a href="a17-vote.html" class="cta">Send to vote</a></div>''')

# ---- A12
def xc(img,nm,r,n,m): return f'<div class="xc"><div class="ph" style="background-image:url({P}{img})"></div><div class="b"><b>{nm}</b><div class="r">{rating(r,n)}</div><div class="m">{m}</div><a class="add">+ Add to plan</a></div></div>'
def nxt(icon,text,href='#'): return f'<a href="{href}" class="next"><div class="ico-sq">{icon}</div><span>{text}</span><span class="chev">{CHEV}</span></a>'
page('a12-trip-home.html','crew.com - Trip home',f'''
<div class="hero" style="background-image:url({P}beach.jpg)"><span class="badge best" style="background:#FFC845">Voting open</span><div class="tx"><div class="eyebrow" style="color:rgba(255,255,255,.85)">Our trip</div><h1>Goa</h1><div style="font-size:12px;opacity:.95;margin-top:2px">Dec 20-23 · 5 crew</div></div></div>
<div class="stats"><div class="m"><b>₹7,850</b><span>per person</span></div><div class="m"><b>3</b><span>nights</span></div><div class="m"><div class="avatars" style="justify-content:center;height:20px;margin-bottom:2px"><div class="av t">C</div><div class="av g">S</div><div class="av y">M</div><div class="av t">R</div><div class="av g">A</div></div><span>5 crew</span></div></div>
<div class="sec" style="gap:7px"><span class="eyebrow">Up next</span>
{nxt(ic('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',16),'Vote closes in 18h - nudge the crew','a17-vote.html')}
{nxt(ic(I_HOME,16),'Book the stay - Casa Palolem leads','a15-stays.html')}
{nxt(ic('<rect x="3" y="4" width="18" height="14" rx="3"/><path d="M8 20h8"/>',16),'Poll: rent scooters?','a13-travel.html')}</div>
<div class="sec" style="gap:5px"><span class="eyebrow">Explore Goa</span>{ai_note("AI-checked Google reviews of local restaurants and spots")}</div>
<div class="hscroll">{xc('fort.jpg','Thalassa','4.6','2,140','Greek, Vagator')}{xc('cafe.jpg','Cafe Alchemy','4.5','1,320','Cafe, Anjuna')}{xc('dudhsagar.jpg','Dudhsagar Falls','4.7','5,800','Day trip')}</div>
<div class="weather">{ic('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',24,'#FFC845')}<div><b style="font-size:13px">31°C sunny all week</b><div class="small" style="font-size:10.5px">pack light</div></div></div>
<div class="grow"></div>{nav('home')}''')

# ---- A13
def route():
    return '<svg width="100%" height="26" viewBox="0 0 320 26" preserveAspectRatio="none"><path d="M0 18 C40 4 70 24 120 12 S210 2 250 14 300 10 320 8" stroke="#fff" stroke-width="5" fill="none"/><path d="M0 18 C40 4 70 24 120 12 S210 2 250 14 300 10 320 8" stroke="#00B8A9" stroke-width="1.6" stroke-dasharray="4 3" fill="none"/><circle cx="14" cy="16" r="3.5" fill="#00B8A9"/><circle cx="306" cy="9" r="3.5" fill="#0E9F6E"/></svg>'
def tcard(icon,nm,sub,pr,hl=False,addcls='chip'):
    return f'<div class="opt-card{" hl" if hl else ""}"><div class="row"><div class="ico-sq" style="width:40px;height:40px">{icon}</div><div><b class="n">{nm}</b><div class="s">{sub}</div></div><div class="rt"><b>{pr}</b><span class="{addcls}" style="padding:5px 12px">{"Added" if hl else "Add"}</span></div></div><div class="mapstrip">{route()}</div></div>'
page('a13-travel.html','crew.com - Travel options',f'''
<div class="hdr">{back('a12-trip-home.html')}<div class="eyebrow active">Goa</div></div>
<h1>Getting <em>around.</em></h1>
{ai_note("Live-style estimates - add any option to the plan.")}
{tcard(ic('<circle cx="6" cy="17" r="3"/><circle cx="18" cy="17" r="3"/><path d="M9 17h6l-3-8h4M6 14l3-5"/>',22),'Scooters','2 helmets included · fuel extra','₹400/day',True,'chip sel')}
{tcard(ic('<path d="M4 16V11l2-5h12l2 5v5M3 16h18M7 19v-3M17 19v-3"/>',22),'Private cab','sedan, driver included','₹14/km')}
{tcard(ic('<rect x="4" y="4" width="16" height="13" rx="3"/><path d="M4 11h16M8 20v-3M16 20v-3"/>',22),'Local bus','cheapest, runs till 9 PM','₹40/hop')}
{tcard(ic('<path d="M3 17l18-6-5-5-3 2-7-1-1 2 5 2-4 3z"/>',22),'Airport transfer','GOI to Palolem, ~1h 20m','₹1,500/cab')}
<div class="grow"></div><a href="a12-trip-home.html" class="cta">Add scooters to plan</a>''')

# ---- A14
def exp(img,nm,r,n,m,pr,on): 
    return f'<div class="exp"><div class="ph" style="background-image:url({P}{img})"></div><div><div class="nm">{nm}</div><div class="r">{rating(r,n)}</div><div class="m">{m}</div></div><div class="pr"><b>{pr}</b><span>per person</span></div><div class="tick{" on" if on else ""}">{TICK if on else ""}</div></div>'
CH=lambda items,on:''.join(f'<span class="chip filter{" sel" if i==on else ""}">{i}</span>' for i in items)
page('a14-experiences.html','crew.com - Experiences',f'''
<div class="hdr">{back('a12-trip-home.html')}<div class="eyebrow active">Goa</div></div>
<h1><em>Experiences.</em></h1>
<div class="chips" style="flex-wrap:nowrap">{CH(['All','Water','Culture','Food','Night'],'All')}</div>
{ai_note("Real-time prices · tick any two to compare.")}
{exp('baga.jpg','Water sports at Baga','4.7','890','2 hrs · Baga','₹1,200',True)}
{exp('river.jpg','Sunset cruise, Mandovi','4.8','1.2k','1.5 hrs · Panaji','₹900',True)}
{exp('spice.jpg','Spice farm tour, Ponda','4.5','640','3 hrs · Ponda','₹650',False)}
{exp('night.jpg','Silent disco, Palolem','4.6','480','4 hrs · Palolem','₹700',False)}
<div class="grow"></div>
<a href="a14b-compare.html" class="cmp"><span><b>2 selected</b> - <b>Compare</b></span></a>
<a href="a12-trip-home.html" class="cta">Add to plan</a>''')

# A14b compare sheet
def col(img,nm,pr,rows,hl):
    r=''.join(f'<div style="display:flex;justify-content:space-between;font-size:11px;padding:7px 0;border-top:1px solid var(--line)"><span style="color:var(--mut)">{k}</span><b>{v}</b></div>' for k,v in rows)
    return f'<div class="card" style="flex:1;padding:8px"><div style="height:96px;border-radius:12px;background-size:cover;background-position:center;background-image:url({P}{img})"></div><div style="font-weight:700;font-size:13px;margin:8px 2px 2px;line-height:1.25">{nm}</div><div style="color:var(--teal);font-weight:800;font-size:17px;margin:0 2px 6px">{pr}<small style="font-size:9.5px;color:var(--mut);font-weight:500"> /person</small></div>{r}</div>'
page('a14b-compare.html','crew.com - Compare experiences',f'''
<div class="hdr">{back('a14-experiences.html')}<div class="eyebrow active">Goa · Compare</div></div>
<h1>Side by <em>side.</em></h1>
{ai_note("Real-time prices for the two you ticked.")}
<div class="row2" style="align-items:flex-start;gap:10px">
{col('baga.jpg','Water sports at Baga','₹1,200',[('Rating','4.7 ★'),('Reviews','890'),('Duration','2 hrs'),('Area','Baga'),('Fits budget','Yes')],1)}
{col('river.jpg','Sunset cruise, Mandovi','₹900',[('Rating','4.8 ★'),('Reviews','1.2k'),('Duration','1.5 hrs'),('Area','Panaji'),('Fits budget','Yes')],0)}</div>
<div class="grow"></div><a href="a12-trip-home.html" class="cta">Add both to plan</a>''')

# ---- A15
def stay(img,typ,nm,r,n,loc,pr,fit,pct,dom,on):
    over=fit=='over'
    label='over budget' if over else 'fits'
    return f'''<div class="stay"><div class="ph" style="background-image:url({P}{img})"><span class="chip">{typ}</span><div class="tick{" on" if on else ""}">{TICK if on else ""}</div></div><div class="bd">
<div class="l1"><b>{nm}</b><span class="p">₹{pr} <small>· 3 nights</small></span></div>
<div class="l2">{STAR}<span class="st">{r}</span> · {n} reviews · {loc}</div>
<div class="fit{" over" if over else ""}"><div class="tr"><i style="width:{pct}%"></i></div><span>{label}</span></div>
<div class="web">{ic('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',13,'#6E847F',2)}<span>{dom}</span><span class="o">Open</span></div></div></div>'''
STAYS=[stay('shack.jpg','3-star','Casa Palolem','4.6','1.1k','Palolem','2,400','fits',60,'casapalolem.in',True),
 stay('villa.jpg','Hotel','Palm Grove Hostel','4.4','2.3k','Agonda','1,350','fits',34,'palmgrovehostel.com',False),
 stay('hostel.jpg','Hostel','Zostel Goa','4.5','3.1k','Vagator','1,500','fits',38,'zostel.com/goa',True),
 stay('hotel.jpg','Resort','The Leela Court','4.8','900','Candolim','4,900','over',100,'theleelacourt.com',False)]
def a15(name,offset,title):
    page(name,title,f'''
<div class="hdr">{back('a12-trip-home.html')}<div class="eyebrow active">Goa · Dec 20-23</div></div>
<h1>Compare <em>stays.</em></h1>
{ai_note("Matched from your crew's stay-style picks and ₹8,000 budget.")}
<div class="chips" style="flex-wrap:nowrap">{CH(['All','Hostel','Hotel','Resort','Villa'],'All')}</div>
<div class="scrollbox"><div class="in" style="transform:translateY(-{offset}px)">{''.join(STAYS)}</div></div>
<a class="cmp"><span><b>2 selected</b> - <b>Compare</b></span></a>
<a href="a16-stay-detail.html" class="cta">Shortlist for the vote</a>''')
a15('a15-stays.html',0,'crew.com - Compare stays')
a15('a15b-stays-scrolled.html',356,'crew.com - Compare stays (scrolled)')
