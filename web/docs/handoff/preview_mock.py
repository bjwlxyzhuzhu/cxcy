import json, asyncio
from playwright.async_api import async_playwright
M={"id":"m1","title":"虚实对局","scenario":"路演答辩演练","status":"running","round_no":2,"rounds":3,"round_minutes":12,"round_ends_at":"2099-01-01T00:00:00Z","join_code":"K7M2Q","created_at":"2026-11-16T02:00:00Z"}
teams=[{"id":"t%d"%i,"team_code":"T%d"%i,"name":n,"venture":v,"members":5,"score":s} for i,(n,v,s) in enumerate([("钛智检","给钛材小厂做AI质检，按件收费",23),("青铜文创","把青铜纹样做成可定制文创",18),("麦田直连","帮合作社把猕猴桃直卖给社区团长",15),("银龄陪练","给社区老人做AI康复陪练",11)])]
hyps=[{"id":"h1","text":"小厂老板愿意为每件0.3元的质检付费","status":"pending","persona_id":None,"round_no":1,"reason":"","revision":"","evidence":"","evidence_url":"","review_note":""},
{"id":"h2","text":"质检员会主动使用我们的App","status":"falsified","persona_id":None,"round_no":1,"reason":"访谈中3位质检员都说怕被替代","revision":"改为给班组长用，质检员只需拍照","evidence":"","evidence_url":"","review_note":""},
{"id":"h3","text":"漏检率是老板最在意的指标","status":"verified","persona_id":None,"round_no":1,"reason":"","revision":"","evidence":"回访2家工厂，老板都把退货率排第一","evidence_url":"","review_note":"证据扎实"}]
card={"identity":"宝鸡一家30人钛材加工厂的老板","context":"订单不稳，质检靠两位老师傅","pains":["漏检被客户退货","老师傅要退休"],"budget":"一年设备投入不超过5万","decision_logic":"先看同行有没有用，再试一个月","objections":["怕数据外泄"],"quotes":["退一次货，半个月白干","我不懂AI，我只看退货率"],"source":{"method":"实地访谈","date":"2026-11","n":3}}
personas=[{"id":"p1","kind":"role","role_type":"investor","label":"天使投资人","team_code":"","card":{"focus":"市场规模与单位经济"}},{"id":"p2","kind":"role","role_type":"judge","label":"大赛评委","team_code":"","card":{}},{"id":"p3","kind":"twin","role_type":"customer","label":"钛材小厂老板","team_code":"T0","card":card},{"id":"p4","kind":"twin","role_type":"competitor","label":"传统质检设备商","team_code":"T1","card":card},{"id":"p5","kind":"role","role_type":"mentor","label":"创业导师","team_code":"","card":{}},{"id":"p6","kind":"role","role_type":"legal","label":"法务顾问","team_code":"","card":{}}]
def row(t,i):
    return {**t,"members":[{"seat":k,"points":[6,4,3,2,1][k],"active":k==1} for k in range(5)],"turns":14-i*2,"evidence":8-i,"twinHits":i%2,"vs":personas[i]["label"],"vsRole":personas[i]["role_type"],"hyp":{"pending":2,"falsified":1+i%2,"verifying":1,"verified":1,"total":5},"dims":[{"dim":d,"score":s,"max":100} for d,s in zip(["交锋","证据","检验","验证","调研"],[70-i*8,57,40,25,25*(i%2)+25])]}
board={"match":M,"owner":True,"board":[row(t,i) for i,t in enumerate(teams)],"now":"","feed":[{"id":1,"team":"钛智检","kind":"falsify","label":"证伪并修正","points":3,"payload":{"text":"质检员会主动使用我们的App"},"at":"2026-11-16T02:10:00Z"},{"id":2,"team":"青铜文创","kind":"evidence_reply","label":"拿出证据回应","points":1,"payload":{},"at":"2026-11-16T02:09:00Z"}],
"totals":{"turns":44,"evidence":26,"pending":8,"falsified":5,"verifying":2,"verified":4,"members":20},
"verifying":[{"id":"h9","team":"麦田直连","text":"团长愿意每周固定开一次团","evidence":"问了6位团长，4位愿意","evidence_url":""}],
"focus":{"team":{"id":"t0","name":"钛智检","venture":teams[0]["venture"]},"persona":{"label":"天使投资人","role_type":"investor","kind":"role"},"seat":1,"round":2,"turns":[{"id":1,"speaker":"student","content":"我们按件收费，每件0.3元。","cites":False,"demands":False},{"id":2,"speaker":"agent","content":"0.3元这个价格是怎么来的？有老板亲口答应过吗？","cites":False,"demands":True},{"id":3,"speaker":"student","content":"我们访谈了3家工厂，其中2位老板说退一次货损失上万，愿意试用一个月再谈价格。","cites":True,"demands":False}]},
"loops":{"l1":{"turns":44,"demand":31,"cite":26},"l2":{"pre":38,"post":64,"round":2},"l3":{"pending":8,"falsified":5,"verifying":2,"verified":4,"iterations":9},"l4":{"personas":19,"skills":12}}}
state={"teacher":False,"matches":[M],"match":M,"teams":teams,"myTeam":{"id":"t0","team_code":"T0","name":"钛智检","venture":teams[0]["venture"]},"mySeat":1,"hypotheses":hyps}
async def main():
    async with async_playwright() as pw:
        b=await pw.chromium.launch(executable_path="/usr/bin/google-chrome",args=["--no-sandbox"])
        async def go(name,url,w,h,teacher=False,act=None):
            pg=await b.new_page(viewport={"width":w,"height":h})
            async def h_(route):
                u=route.request.url; meth=route.request.method
                if "/api/arena/board" in u: body=board
                elif "/api/arena/turn" in u: body={"reply":"访谈了3家，有2位愿意试用——那第三位为什么不愿意？试用之后愿意付多少，你们问过吗？","tags":{"unknown":True,"hypothesis":"试用一个月后，老板愿意按每件0.3元续费"},"points":1,"cited":True,"remaining":7,"snippets":[]}
                elif "/api/persona" in u: body={"personas":personas,"teacher":teacher,"mine":personas[2:4],"all":personas}
                elif "/api/arena" in u: body={**state,"teacher":teacher} if not teacher else {"teacher":True,"matches":[M]}
                else: body={}
                await route.fulfill(status=200,content_type="application/json",body=json.dumps(body))
            await pg.route("**/api/**",h_)
            errs=[]
            pg.on("pageerror",lambda e:errs.append(str(e)))
            await pg.goto("http://localhost:3311"+url); await pg.wait_for_timeout(2500)
            if act: await act(pg)
            await pg.screenshot(path=f"/tmp/shots/{name}.png"); print(name,errs[:3]); await pg.close()
        async def fight(pg):
            await pg.get_by_text("天使投资人").first.click(); await pg.wait_for_timeout(600)
            await pg.fill("#mv","我们访谈了3家工厂，其中2位老板愿意试用一个月。"); await pg.keyboard.press("Enter"); await pg.wait_for_timeout(2200)
        async def tabf(pg): await pg.get_by_text("焦点对战",exact=True).click(); await pg.wait_for_timeout(2500)
        async def tabl(pg): await pg.get_by_text("四层闭环",exact=True).click(); await pg.wait_for_timeout(800)
        await go("student","/apply/arena",1440,900,act=fight)
        await go("phone","/apply/arena",390,844,act=fight)
        await go("twin","/apply/twin",1440,900)
        await go("board","/arena/screen?id=m1",1920,1080,teacher=True)
        await go("focus","/arena/screen?id=m1",1920,1080,teacher=True,act=tabf)
        await go("loops","/arena/screen?id=m1",1920,1080,teacher=True,act=tabl)
        await b.close()
asyncio.run(main())
