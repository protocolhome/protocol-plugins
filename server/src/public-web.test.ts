import assert from 'node:assert/strict'
import { test } from 'node:test'
import { publicUrl, isPublicAddress, robotsAllowed, boundedText, fetchPublic } from './public-web.ts'

test('rejects private, credentialed, tokenized, malformed and non-HTTPS URLs',()=>{
  for(const url of ['http://protocoltext.com','https://127.0.0.1','https://2130706433','https://0x7f000001','https://[::1]','https://localhost','https://service.internal','https://metadata.google.internal','https://a.test','https://user:secret@protocoltext.com','https://protocoltext.com/?token=secret','https://protocoltext.com/#private','https://protocoltext.com:444','file:///etc/passwd'])assert.throws(()=>publicUrl(url),url)
  assert.equal(publicUrl('https://protocoltext.com/services').href,'https://protocoltext.com/services')
})
test('rejects non-global DNS answers including IPv4 mapped IPv6 and documentation space',()=>{
  for(const address of ['127.0.0.1','10.2.1.1','172.16.4.1','192.168.1.1','169.254.169.254','100.64.1.1','0.1.1.1','224.1.1.1','192.0.2.1','198.18.0.1','198.51.100.1','203.0.113.1','::1','::ffff:127.0.0.1','fc00::1','fe80::1','2001:db8::1','2002:0a00:0001::'])assert.equal(isPublicAddress(address),false,address)
  for(const address of ['1.1.1.1','8.8.8.8','2606:4700:4700::1111','2001:4860:4860::8888'])assert.equal(isPublicAddress(address),true,address)
})
test('robots honors specific agents, longest rules, allow ties, wildcard and end anchor',()=>{
  assert.equal(robotsAllowed('User-agent: *\nDisallow: /','/'),false)
  assert.equal(robotsAllowed('User-agent: *\nDisallow: /\nAllow: /services','/services/cleaning'),true)
  assert.equal(robotsAllowed('User-agent: *\nDisallow: /private*\nAllow: /private/public','/private/account'),false)
  assert.equal(robotsAllowed('User-agent: *\nDisallow: /\nUser-agent: ProtocolWebsiteReview\nAllow: /','/'),true)
  assert.equal(robotsAllowed('User-agent: *\nDisallow: /end$','/ending'),true)
  assert.equal(robotsAllowed('User-agent: *\nDisallow: /end$','/end'),false)
  assert.equal(robotsAllowed('User-agent: *\nDisallow: /private','/%70rivate'),false)
  assert.equal(robotsAllowed('User-agent: *\nDisallow:\n\nUser-agent: OtherBot\nDisallow: /','/'),true)
})
test('bounds response bytes rather than character count',async()=>{
  assert.equal(await boundedText(new Response('small'),5),'small')
  await assert.rejects(()=>boundedText(new Response('larger'),5))
  await assert.rejects(()=>boundedText(new Response('ééé'),5))
})
test('blocks private DNS before target fetch and never forwards credentials',async()=>{
  const original=globalThis.fetch
  const seen:string[]=[]
  globalThis.fetch=(async(input,options)=>{
    const url=String(input);seen.push(url)
    assert.equal(new Headers(options?.headers).has('Authorization'),false)
    if(url.includes('dns-query'))return Response.json({Status:0,Answer:[{type:1,data:'10.0.0.1'}]})
    throw new Error('Target must never be fetched')
  }) as typeof fetch
  try{await assert.rejects(()=>fetchPublic('https://public.example.com',AbortSignal.timeout(1000)));assert.equal(seen.length,2)}finally{globalThis.fetch=original}
})
test('revalidates redirect destinations and refuses a private redirect',async()=>{
  const original=globalThis.fetch
  let targetFetches=0
  globalThis.fetch=(async(input)=>{
    const url=String(input)
    if(url.includes('dns-query'))return Response.json({Status:0,Answer:[{type:1,data:'1.1.1.1'}]})
    targetFetches++
    return new Response(null,{status:302,headers:{Location:'https://127.0.0.1/secret'}})
  }) as typeof fetch
  try{await assert.rejects(()=>fetchPublic('https://protocoltext.com',AbortSignal.timeout(1000)));assert.equal(targetFetches,1)}finally{globalThis.fetch=original}
})
test('checks policy before every redirected page and never fetches a denied target',async()=>{
  const original=globalThis.fetch
  const targets:string[]=[]
  globalThis.fetch=(async(input)=>{
    const url=String(input)
    if(url.includes('dns-query'))return Response.json({Status:0,Answer:[{type:1,data:'1.1.1.1'}]})
    targets.push(url)
    return new Response(null,{status:302,headers:{Location:'/private'}})
  }) as typeof fetch
  try{
    await assert.rejects(()=>fetchPublic('https://protocoltext.com/start',AbortSignal.timeout(1000),async url=>{if(url.pathname==='/private')throw new Error('Denied')}))
    assert.deepEqual(targets,['https://protocoltext.com/start'])
  }finally{globalThis.fetch=original}
})
