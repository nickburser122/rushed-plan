import json,sys,time
from playwright.sync_api import sync_playwright

URL=sys.argv[1] if len(sys.argv)>1 else 'http://localhost:8765/index.html?debug=1'
FX=open('tests/fixtures/user-backup-2026-10-24.json').read()
AR='٠١٢٣٤٥٦٧٨٩'
def ar(n):
    return ''.join(AR[int(c)] for c in str(n))

def tab(pg,name):
    pg.click('[data-act="tab"]:has-text("%s")'%name)
    pg.wait_for_timeout(250)

def total_texts(pg):
    return pg.evaluate("[...document.querySelectorAll('#vtotal,#btotal')].map(e=>e.textContent.trim())")

def wait_total(pg,n,limit_ms=100):
    t0=time.time()
    while (time.time()-t0)*1000<limit_ms:
        v=total_texts(pg)
        if v and all(x==ar(n) for x in v):
            return
        pg.wait_for_timeout(5)
    raise AssertionError('total not %s within %dms: %s'%(n,limit_ms,total_texts(pg)))

def wait_plan(pg,timeout=20000):
    pg.wait_for_function("state.plans.length>0&&!state.running",timeout=timeout)

def fresh(b,viewport,seed_fixture=False):
    ctx=b.new_context(viewport=viewport)
    if seed_fixture:
        ctx.add_init_script("if(!localStorage.getItem('visitplan.v2'))localStorage.setItem('visitplan.v2',%s);"%json.dumps(FX))
    pg=ctx.new_page()
    errs=[]
    pg.on('console',lambda m: errs.append(m.text) if m.type in('error',) and 'ERR_NAME_NOT_RESOLVED' not in m.text else None)
    pg.on('pageerror',lambda e: errs.append('pageerror: '+str(e)))
    pg.goto(URL)
    pg.wait_for_timeout(900)
    return ctx,pg,errs

def clear_locations(pg):
    tab(pg,'المواقع')
    while pg.locator('[data-act="ldel"]').count():
        pg.locator('[data-act="ldel"]').first.dispatch_event('click')
        pg.wait_for_timeout(120)
        ok=pg.locator('[data-act="dlgok"]')
        if ok.first.is_visible():ok.first.click();pg.wait_for_timeout(120)

def run(viewport,label):
    res={}
    with sync_playwright() as p:
        b=p.chromium.launch()
        ctx,pg,errs=fresh(b,viewport)
        clear_locations(pg)
        wait_total(pg,0,500)
        pg.click('#baddBtn')
        wait_total(pg,4,100)
        res['U1_total_after_add']=total_texts(pg)
        tab(pg,'الخطة')
        pg.click('#genbtn')
        wait_plan(pg)
        rows=pg.evaluate("state.plans[0].rows.map(r=>r.loc.name)")
        assert len(rows)==4 and len(set(rows))==4,('U1 rows',rows)
        res['U1_rows']=len(rows)

        tab(pg,'المواقع')
        pg.locator('[data-act="lvisits"][data-v="1"]').first.click()
        wait_total(pg,5,100)
        assert pg.locator('[data-act="lrep"]').count()>=1,'U2 repeat controls missing'
        tab(pg,'الخطة')
        pg.click('#genbtn')
        wait_plan(pg)
        info=pg.evaluate("(()=>{const r=state.plans[0].rows;const id=state.locations.find(l=>l.visits===2).id;const mine=r.filter(x=>x.loc.id===id);return{n:mine.length,days:new Set(mine.map(x=>x.day)).size,people:mine.flatMap(x=>x.team).length===new Set(mine.flatMap(x=>x.team)).size}})()")
        assert info['n']==2 and info['days']==2 and info['people'],('U2',info)
        res['U2']=info

        tab(pg,'المواقع')
        mains=pg.evaluate("state.locations.filter(l=>l.type==='main').length")
        cons=pg.evaluate("state.locations.filter(l=>l.type==='contracted').length")
        pg.locator('[data-act="bvis"][data-k="main"][data-v="1"]').first.click()
        pg.wait_for_timeout(30)
        pg.evaluate("1")
        want=pg.evaluate("state.locations.reduce((a,l)=>a+l.visits,0)")
        mainvis=pg.evaluate("[...new Set(state.locations.filter(l=>l.type==='main').map(l=>l.visits))]")
        assert mainvis==[3],('U3 mains', mainvis)
        wait_total(pg,want,100)
        pg.locator('[data-act="bvis"][data-k="main"][data-v="-1"]').first.click()
        pg.wait_for_timeout(30)
        mainvis=pg.evaluate("[...new Set(state.locations.filter(l=>l.type==='main').map(l=>l.visits))]")
        assert mainvis==[2],('U3 mains back', mainvis)
        wait_total(pg,2*mains+cons,100)
        res['U3']=[mains,cons,2*mains+cons]

        before=pg.evaluate("state.locations.reduce((a,l)=>a+l.visits,0)")
        v0=pg.evaluate("state.locations[0].visits")
        pg.locator('[data-act="ldel"]').first.dispatch_event('click')
        pg.wait_for_timeout(150)
        ok=pg.locator('[data-act="dlgok"]')
        if ok.first.is_visible():ok.first.click();pg.wait_for_timeout(150)
        wait_total(pg,before-v0,100)
        pg.click('[data-act="undo"],#undoBtn,.toast button')
        pg.wait_for_timeout(200)
        wait_total(pg,before,300)
        res['U4']=[before,v0]

        res['no_hscroll']=pg.evaluate('document.documentElement.scrollWidth<=window.innerWidth+1')
        assert res['no_hscroll'],'horizontal overflow at '+str(viewport)
        res['U7_old_controls']=pg.evaluate("['الحد الأسبوعي','سياسة التكرار'].filter(t=>document.body.innerText.includes(t)).concat(document.querySelector('#ratioseg')?['ratioseg']:[])")
        assert res['U7_old_controls']==[],res['U7_old_controls']
        tab(pg,'الإعدادات')
        res['U7_settings']=pg.evaluate("['سياسة التكرار','ratioseg'].filter(t=>document.body.innerText.includes(t)||document.querySelector('#'+t)).length")
        assert res['U7_settings']==0
        ctx.close()

        ctx,pg,errs2=fresh(b,viewport,seed_fixture=True)
        pg.click('#genbtn')
        wait_plan(pg)
        pg.wait_for_selector('.unplaced .fixbtn',timeout=15000)
        res['U5_card']=pg.inner_text('.unplaced')[:160].replace('\n',' | ')
        pg.locator('.unplaced .fixbtn').first.click()
        pg.wait_for_function("state.solve&&(state.solve.status==='optimal'||state.solve.status==='feasible')&&!state.running",timeout=20000)
        res['U5_after']=pg.evaluate("[state.solve.status,state.solve.achieved,state.solve.requested]")
        errs.extend(errs2)
        ctx.close()
        b.close()
    desync=[e for e in errs if 'TOTAL_DESYNC' in e]
    assert not desync,desync
    assert not errs,errs
    res['U6_errors']=0
    res['viewport']=label
    return res

if __name__=='__main__':
    for vp,label in [({'width':1100,'height':900},'desktop'),({'width':390,'height':844},'390px')]:
        print(json.dumps(run(vp,label),ensure_ascii=False))
