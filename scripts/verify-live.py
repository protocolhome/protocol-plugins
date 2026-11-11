#!/usr/bin/env python3
import datetime,json,subprocess
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'evidence'
OUT.mkdir(exist_ok=True)
BASE='https://plugins.protocoltext.com'
counter=0

def rpc(method,params=None):
 global counter
 counter+=1
 message={'jsonrpc':'2.0','id':counter,'method':method}
 if params is not None:message['params']=params
 result=subprocess.run(['curl','--silent','--show-error','--fail-with-body','--max-time','85','--resolve','plugins.protocoltext.com:443:104.21.36.59',BASE+'/mcp','-H','Content-Type: application/json','-H','Accept: application/json, text/event-stream','--data-binary',json.dumps(message)],capture_output=True,text=True,check=True)
 raw=result.stdout
 lines=[json.loads(line[6:]) for line in raw.splitlines() if line.startswith('data: ')]
 return lines[-1] if lines else json.loads(raw)

def call(name,args):return rpc('tools/call',{'name':name,'arguments':args})
records=[]
def check(name,result,condition):
 assert condition(result),f'{name} failed: {str(result)[:500]}'
 records.append({'case':name,'status':'passed','response':result})
 print(name+': PASS',flush=True)

check('legacy_initialize',rpc('initialize',{'protocolVersion':'2025-11-25','capabilities':{},'clientInfo':{'name':'protocol-directory-check','version':'1.0.0'}}),lambda r:r['result']['serverInfo']['name']=='protocol')
check('discover_three_read_only_tools',rpc('tools/list'),lambda r:len(r['result']['tools'])==3 and all(t['annotations']['readOnlyHint'] is True and t['annotations']['destructiveHint'] is False for t in r['result']['tools']))
check('positive_1_review_protocol',call('review_business_website',{'url':'https://protocoltext.com'}),lambda r:'Protocol' in r.get('result',{}).get('structuredContent',{}).get('page',{}).get('title',''))
check('positive_2_review_ahxe',call('review_business_website',{'url':'https://ahxelabs.com'}),lambda r:bool(r.get('result',{}).get('structuredContent',{}).get('page',{}).get('title')))
check('positive_3_crawl_signals',call('check_website_crawl_signals',{'url':'https://protocoltext.com'}),lambda r:isinstance(r.get('result',{}).get('structuredContent',{}).get('robots',{}).get('httpStatus'),int))
check('positive_4_compare_websites',call('compare_business_websites',{'urls':['https://protocoltext.com','https://ahxelabs.com']}),lambda r:len(r.get('result',{}).get('structuredContent',{}).get('results',[]))==2 and all(x['status']=='reviewed' for x in r['result']['structuredContent']['results']))
check('positive_5_missing_public_page',call('review_business_website',{'url':'https://protocoltext.com/protocol-directory-missing-page-test'}),lambda r:r.get('result',{}).get('isError') is True and not r['result'].get('structuredContent'))
check('negative_1_private_destination',call('review_business_website',{'url':'https://127.0.0.1'}),lambda r:r.get('result',{}).get('isError') is True)
check('negative_2_private_query_token',call('review_business_website',{'url':'https://protocoltext.com/?token=do-not-send'}),lambda r:r.get('result',{}).get('isError') is True)
check('negative_3_unsupported_publishing',call('publish_content',{'message':'test'}),lambda r:bool(r.get('error')) or r.get('result',{}).get('isError') is True)
(OUT/'live-tool-results.json').write_text(json.dumps({'checkedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'endpoint':BASE+'/mcp','note':'Direct deployed MCP checks, not a claim that model-prompt tests in ChatGPT/Claude passed. --resolve uses the hostname’s public Cloudflare address because the Mac cached the initial NXDOMAIN; TLS verification remains enabled.','cases':records},indent=2))
