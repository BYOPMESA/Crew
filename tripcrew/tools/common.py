import os
SCREENS=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','screens')
SB='''<div class="statusbar"><span>9:41</span><span class="glyphs"><svg width="17" height="11" viewBox="0 0 17 11" fill="#0F2E33"><rect x="0" y="7" width="3" height="4" rx="1"/><rect x="4.5" y="5" width="3" height="6" rx="1"/><rect x="9" y="2.5" width="3" height="8.5" rx="1"/><rect x="13.5" y="0" width="3" height="11" rx="1"/></svg><svg width="15" height="11" viewBox="0 0 15 11" fill="none" stroke="#0F2E33" stroke-width="1.6" stroke-linecap="round"><path d="M1 4a9 9 0 0 1 13 0M3.5 6.6a5.6 5.6 0 0 1 8 0"/><circle cx="7.5" cy="9" r="1" fill="#0F2E33" stroke="none"/></svg><svg width="25" height="12" viewBox="0 0 25 12" fill="none"><rect x=".5" y=".5" width="21" height="11" rx="3.5" stroke="#0F2E33" opacity=".4"/><rect x="2" y="2" width="18" height="8" rx="2" fill="#0F2E33"/><rect x="23" y="4" width="1.6" height="4" rx=".8" fill="#0F2E33" opacity=".4"/></svg></span></div>'''
HOME='<div class="home-ind"></div>'
ARROW='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>'
SPARK='<svg width="12" height="12" viewBox="0 0 24 24" fill="#00B8A9"><path d="M12 1l2.6 8.4L23 12l-8.4 2.6L12 23l-2.6-8.4L1 12l8.4-2.6z"/></svg>'
def ic(d,s=22,c='currentColor',w=2): return f'<svg width="{s}" height="{s}" viewBox="0 0 24 24" fill="none" stroke="{c}" stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round">{d}</svg>'
I_HOME='<path d="M3 11l9-8 9 8M5 10v10h14V10"/>'
I_SEARCH='<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>'
I_TRIPS='<rect x="3" y="7" width="18" height="13" rx="3"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>'
I_USER='<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>'
def nav(active):
    items=[('home',I_HOME),('search',I_SEARCH),('trips',I_TRIPS),('user',I_USER)]
    return '<div class="nav">'+''.join(f'<a class="{"on" if k==active else ""}">{ic(d)}</a>' for k,d in items)+'</div>'
I_BACK='<path d="M15 5l-7 7 7 7"/>'
def back(href): return '<a href="%s" class="back">%s</a>'%(href,ic(I_BACK,18,"#0F2E33",2.4))
def step_head(initial,eyebrow,h1):
    return f'<div class="step-head"><div class="top"><div class="step-av">{initial}</div><div class="eyebrow active">{eyebrow}</div></div><h1>{h1}</h1></div>'
def ai_note(text): return f'<div class="ai-note">{SPARK}<span>{text}</span></div>'
def page(name,title,body,pad_bottom=False):
    html=f'<!doctype html>\n<html><head><meta charset="utf-8"><meta name="viewport" content="width=390"><title>{title}</title><link rel="stylesheet" href="../style.css"></head><body><div class="screen">{SB}{body}{HOME}</div></body></html>\n'
    open(os.path.join(SCREENS,name),'w').write(html)
