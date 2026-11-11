#!/usr/bin/env python3
"""Record a real production MCP command session as an asciicast (no mock results)."""
import datetime,json,subprocess,time
from pathlib import Path

root=Path(__file__).resolve().parents[1]
out=root/'evidence';out.mkdir(exist_ok=True)
stream=(out/'protocol-live-api.cast').open('w')
stream.write(json.dumps({'version':2,'width':108,'height':31,'timestamp':int(time.time()),'title':'Protocol live production MCP API walkthrough','env':{'TERM':'xterm-256color','SHELL':'/bin/zsh'}})+'\n')
start=time.monotonic()
def write(text):
 text=text.replace('\n','\r\n')
 print(text,end='',flush=True)
 stream.write(json.dumps([round(time.monotonic()-start,3),'o',text])+'\n');stream.flush()
def page(title):
 write('\x1b[2J\x1b[HProtocol | Live production MCP API walkthrough | 1.0.0\n')
 write('https://plugins.protocoltext.com/mcp | Public data | No sign-in\n')
 write('='*100+'\n'+title+'\n\n')
cases=[
 ('1 / 8 | Public business website review','review_business_website',{'url':'https://protocoltext.com'}),
 ('2 / 8 | Another public business website','review_business_website',{'url':'https://ahxelabs.com'}),
 ('3 / 8 | Public crawl-file signals','check_website_crawl_signals',{'url':'https://protocoltext.com'}),
 ('4 / 8 | Compare two public websites','compare_business_websites',{'urls':['https://protocoltext.com','https://ahxelabs.com']}),
 ('5 / 8 | Unavailable page: truthful failure','review_business_website',{'url':'https://protocoltext.com/protocol-directory-missing-page-test'}),
 ('6 / 8 | Private destination must be rejected','review_business_website',{'url':'https://127.0.0.1'}),
 ('7 / 8 | Token/query URLs must be rejected','review_business_website',{'url':'https://protocoltext.com/?token=example-not-a-real-secret'}),
 ('8 / 8 | Publishing is not an available capability','publish_content',{'message':'example'})
]
results=[]
for number,(title,name,args) in enumerate(cases,1):
 page(title)
 write('> tools/call '+name+'\n'+json.dumps(args,indent=2)+'\n\n')
 time.sleep(1.8)
 request={'jsonrpc':'2.0','id':number,'method':'tools/call','params':{'name':name,'arguments':args}}
 process=subprocess.run(['curl','--silent','--show-error','--fail-with-body','--max-time','85','--resolve','plugins.protocoltext.com:443:104.21.36.59','https://plugins.protocoltext.com/mcp','-H','Content-Type: application/json','-H','Accept: application/json, text/event-stream','--data-binary',json.dumps(request)],capture_output=True,text=True)
 if process.returncode:write('NETWORK ERROR: '+process.stderr[:300]+'\n');raise SystemExit(1)
 messages=[json.loads(line[6:]) for line in process.stdout.splitlines() if line.startswith('data: ')]
 response=messages[-1] if messages else json.loads(process.stdout)
 result=response.get('result',{})
 data=result.get('structuredContent')
 summary={}
 if data and 'page' in data:
  summary={key:data[key] for key in ['evidenceType','finalUrl','fetchedAt','httpStatus']}
  summary['title']=data['page']['title'];summary['h1']=data['page']['h1'][:1]
  summary['canonical']=data['page']['canonical'];summary['findingsCount']=len(data['findings'])
 elif data and 'robots' in data:
  summary={'origin':data['origin'],'robots':data['robots'],'defaultSitemap':data['defaultSitemap']}
 elif data and 'results' in data:
  summary={'results':[{'url':item['url'],'status':item['status'],'title':item.get('review',{}).get('page',{}).get('title')} for item in data['results']]}
 else:
  summary={'isError':result.get('isError',bool(response.get('error'))),'message':result.get('content',[{}])[0].get('text',response.get('error',{}).get('message',''))}
 if number<=4 and (not data or result.get('isError')):write('EXPECTED SUCCESS FAILED\n');raise SystemExit(1)
 if number>=5 and not (result.get('isError') or response.get('error')):write('EXPECTED REJECTION FAILED\n');raise SystemExit(1)
 write('Actual production response (selected fields):\n'+json.dumps(summary,indent=2,ensure_ascii=False)+'\n')
 write('\nPASS | '+('Observed public evidence returned.' if number<=4 else 'No successful assessment or write was claimed.')+'\n')
 results.append({'case':title,'request':request,'response':response})
 time.sleep(5.5)
page('All eight production scenarios passed')
write('3 read-only tools | 5 positive scenarios | 3 negative scenarios\n\n')
write('Sources and timestamps are returned with website observations.\n')
write('No private accounts, publishing, website edits or messaging.\n')
write('These checks do not measure rankings, AI citations, traffic, leads or revenue.\n\n')
write('This is a silent recording of actual production API requests and responses.\n')
write('It is not a simulated ChatGPT or Claude interface.\n\n')
write('Documentation: https://plugins.protocoltext.com\n')
write('Support: https://plugins.protocoltext.com/support\n')
time.sleep(4)
stream.write(json.dumps([round(time.monotonic()-start,3),'o','\r\nEnd of walkthrough.'])+'\n');stream.close()
(out/'recorded-api-responses.json').write_text(json.dumps({'recordedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'cases':results},indent=2))
