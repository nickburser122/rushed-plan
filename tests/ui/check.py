import json,sys
from playwright.sync_api import sync_playwright

URL=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8765/index.html'
FX=open('tests/fixtures/user-backup-2026-10-24.json').read()

INIT="""
if(!localStorage.getItem('visitplan.v2'))localStorage.setItem('visitplan.v2',%s);
window.__workers=0;
const _W=window.Worker;
window.Worker=function(...a){window.__workers++;return new _W(...a);};
window.__long=[];
try{new PerformanceObserver(l=>{for(const e of l.getEntries())window.__long.push(Math.round(e.duration));}).observe({entryTypes:['longtask']});}catch(e){}
"""%json.dumps(FX)

def run(viewport,label):
    out={'viewport':label}
    with sync_playwright() as p:
        b=p.chromium.launch()
        ctx=b.new_context(viewport=viewport)
        ctx.add_init_script(INIT)
        pg=ctx.new_page()
        errs=[]
        pg.on('console',lambda m: errs.append(m.text) if m.type=='error' and 'ERR_NAME_NOT_RESOLVED' not in m.text else None)
        pg.on('pageerror',lambda e: errs.append('pageerror: '+str(e)))
        pg.goto(URL)
        pg.wait_for_timeout(500)
        pg.click('[data-act="vstep"][data-v="1"]')
        pg.wait_for_selector('#vbanner:not([hidden]) .fixbtn',timeout=8000)
        out['banner']=pg.inner_text('#vbanner').replace('\n',' | ')
        out['fixes']=pg.eval_on_selector_all('#vbanner .fixbtn','els=>els.map(e=>e.textContent)')
        pg.click('#genbtn')
        pg.wait_for_function("state.plans.length>0&&!state.running",timeout=15000)
        out['rows_at_6']=pg.evaluate("state.plans[0].rows.length")
        out['unplaced']=pg.evaluate("state.solve.unplaced.map(u=>u.loc.name)")
        out['unplaced_card']=pg.evaluate("!!document.querySelector('.unplaced')")
        out['budget']=pg.evaluate("(document.querySelector('.seatbudget')||{}).textContent||''")
        pg.click('#vbanner .fixbtn')
        pg.wait_for_function("state.dup.people==='any'",timeout=4000)
        out['banner_after_fix_hidden']=pg.evaluate("document.querySelector('#vbanner').hidden||document.querySelector('#vbanner').innerHTML===''")
        pg.wait_for_function("state.plans.length>0&&!state.running&&state.plans[0].rows.length===6",timeout=15000)
        out['rows_after_fix']=pg.evaluate("state.plans[0].rows.length")
        out['hard_after_fix']=pg.evaluate("state.plans.map(p=>p.eval.hardCount)")
        out['undo_button']=pg.evaluate("!!document.querySelector('.toast-undo')")
        out['workers']=pg.evaluate("window.__workers")
        out['longtasks_ms']=pg.evaluate("window.__long")
        out['overflow_x']=pg.evaluate("document.documentElement.scrollWidth>document.documentElement.clientWidth")
        out['errors']=errs
        b.close()
    return out

res=[run({'width':1100,'height':900},'desktop'),run({'width':390,'height':800},'mobile390')]
print(json.dumps(res,ensure_ascii=False,indent=1))

def elig(viewport,label):
    out={'viewport':label}
    with sync_playwright() as p:
        b=p.chromium.launch()
        ctx=b.new_context(viewport=viewport)
        ctx.add_init_script(INIT)
        pg=ctx.new_page()
        errs=[]
        pg.on('console',lambda m: errs.append(m.text) if m.type=='error' and 'ERR_NAME_NOT_RESOLVED' not in m.text else None)
        pg.on('pageerror',lambda e: errs.append('pageerror: '+str(e)))
        pg.goto(URL)
        pg.wait_for_timeout(2600)
        pg.evaluate("setTab('locations')")
        pg.wait_for_timeout(300)
        pg.evaluate("window.__gens=0;const _s=window.startGen;window.startGen=function(...a){window.__gens++;return _s.apply(this,a);};null;")
        card='[data-lcard="121"]'
        taps=0
        pg.click(card+' [data-act="lelmode"][data-v="only"]');taps+=1
        for mid in (106,104,111):
            pg.click(card+' [data-act="lonly"][data-m="%d"]'%mid);taps+=1
        pg.click(card+' [data-act="lban"][data-m="102"]');taps+=1
        out['taps']=taps
        out['gens_during_taps']=pg.evaluate("window.__gens")
        out['state']=pg.evaluate("(()=>{const l=locById(121);return{only:l.only,ban:l.ban};})()")
        out['counter']=pg.inner_text(card+' [data-elig-count]')
        pg.wait_for_timeout(2600)
        out['gens_after_settle']=pg.evaluate("window.__gens")
        out['touch_action']=pg.evaluate("getComputedStyle(document.querySelector('.pill')).touchAction")
        out['overflow_x']=pg.evaluate("document.documentElement.scrollWidth>document.documentElement.clientWidth")
        out['errors']=errs
        b.close()
    return out

print(json.dumps([elig({'width':1100,'height':900},'desktop'),elig({'width':390,'height':800},'mobile390')],ensure_ascii=False,indent=1))
