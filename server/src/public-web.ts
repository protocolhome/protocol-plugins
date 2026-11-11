import { isIP } from 'node:net'

export const MAX_BYTES = 512 * 1024
const USER_AGENT = 'ProtocolWebsiteReview/1.0 (+https://protocoltext.com)'

export function publicUrl(input: string): URL {
  let url: URL
  try { url = new URL(input) } catch { throw new Error('Provide a full public HTTPS website URL.') }
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.search || url.hash)
    throw new Error('Use a public HTTPS URL without credentials, query parameters, fragments or custom ports.')
  if (hostname.length > 253 || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(hostname) ||
      isIP(hostname) || hostname.split('.').every(part => /^\d+$/.test(part)) ||
      /\.(?:localhost|local|internal|lan|home|test|invalid|example|onion)$/.test(hostname))
    throw new Error('Only public website domain names are supported; private and literal IP destinations are blocked.')
  url.hostname = hostname
  return url
}

export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a,b,c] = address.split('.').map(Number)
    if (a === 0 || a === 10 || a === 127 || a >= 224 ||
        (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
        (a === 192 && b === 0) || (a === 192 && b === 88 && c === 99) ||
        (a === 198 && (b === 18 || b === 19)) || (a === 198 && b === 51 && c === 100) ||
        (a === 203 && b === 0 && c === 113)) return false
    return true
  }
  if (isIP(address) === 6) {
    const first = parseInt(address.split(':')[0],16)
    return first >= 0x2000 && first <= 0x3fff &&
      !/^2001:(?:0*:|0?db8:|0?2:|10:|20:)/i.test(address) && !/^2002:/i.test(address)
  }
  return false
}

export async function boundedText(response: Response, limit = MAX_BYTES): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) return ''
  const decoder = new TextDecoder()
  let size = 0, result = ''
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > limit) throw new Error('The page exceeds the 512 KiB review limit. Try a smaller public page.')
      result += decoder.decode(chunk.value,{stream:true})
    }
    return result + decoder.decode()
  } finally { await reader.cancel().catch(() => {}) }
}

async function verifyDns(hostname: string, signal: AbortSignal): Promise<void> {
  let addresses: string[] = []
  for (const type of ['A','AAAA']) {
    const response = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=${type}`, {
      headers: {Accept:'application/dns-json'}, signal,
      redirect: 'manual',
    })
    if (!response.ok) throw new Error('Public DNS lookup is unavailable. Try again later.')
    const data = JSON.parse(await boundedText(response, 16 * 1024)) as {Status?:number; Answer?:Array<{type:number;data:string}>}
    if (data.Status !== 0 && data.Status !== 3) throw new Error('Public DNS lookup failed.')
    addresses.push(...(data.Answer ?? []).filter(item => item.type === 1 || item.type === 28).map(item => item.data))
  }
  if (!addresses.length || addresses.some(address => !isPublicAddress(address)))
    throw new Error('The website must resolve entirely to public Internet addresses.')
}

export async function fetchPublic(input: string, signal: AbortSignal, beforeFetch?: (url:URL)=>Promise<void>): Promise<{url:string;status:number;text:string;contentType:string;headers:Headers}> {
  let url = publicUrl(input)
  for (let hop = 0; hop <= 3; hop++) {
    await verifyDns(url.hostname, signal)
    if (beforeFetch) await beforeFetch(url)
    const response = await fetch(url.href, {
      method: 'GET', redirect: 'manual', signal,
      headers: {'User-Agent':USER_AGENT,Accept:'text/html, text/plain, application/xml, text/xml;q=0.9'},
    })
    if ([301,302,303,307,308].includes(response.status)) {
      await response.body?.cancel()
      const location = response.headers.get('Location')
      if (!location || hop === 3) throw new Error('The website has too many or invalid redirects.')
      url = publicUrl(new URL(location,url).href)
      continue
    }
    const contentType = response.headers.get('Content-Type') ?? ''
    if (response.ok && !/(?:text\/|application\/(?:xml|xhtml\+xml))/i.test(contentType)) {
      await response.body?.cancel()
      throw new Error('Only public HTML, text, and XML pages can be reviewed.')
    }
    const text = response.ok ? await boundedText(response) : ''
    if (!response.ok) await response.body?.cancel()
    return {url:url.href,status:response.status,text,contentType,headers:response.headers}
  }
  throw new Error('Unable to load the website.')
}

type RobotGroup = {agents:string[];rules:Array<{allow:boolean;path:string}>;hasRules:boolean}
export function robotsAllowed(text: string, path: string): boolean {
  const normalize=(value:string)=>value.replace(/%([a-f\d]{2})/gi,(match,hex)=>{
    const character=String.fromCharCode(parseInt(hex,16))
    return /[a-z\d._~-]/i.test(character)?character:match.toUpperCase()
  })
  path=normalize(path)
  const groups: RobotGroup[] = []
  let current: RobotGroup | undefined
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split('#')[0].trim()
    const match = line.match(/^([^:]+):\s*(.*)$/)
    if (!match) continue
    const key = match[1].toLowerCase(), value = match[2].trim()
    if (key === 'user-agent') {
      if (!current || current.hasRules) {current = {agents:[],rules:[],hasRules:false};groups.push(current)}
      current.agents.push(value.toLowerCase())
    } else if ((key === 'allow' || key === 'disallow') && current) {
      current.hasRules=true
      if(value)current.rules.push({allow:key === 'allow',path:normalize(value)})
    }
  }
  const specific = groups.filter(group => group.agents.some(agent => agent !== '*' && 'protocolwebsitereview'.includes(agent)))
  const selected = specific.length ? specific : groups.filter(group => group.agents.includes('*'))
  const matching = selected.flatMap(group => group.rules).filter(rule => {
    const expression = rule.path.replace(/[.+?^{}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*')
    try { return new RegExp('^'+expression).test(path) } catch {return false}
  }).sort((a,b) => b.path.replace(/[\*$]/g,'').length - a.path.replace(/[\*$]/g,'').length || Number(b.allow)-Number(a.allow))
  return matching[0]?.allow ?? true
}
