import http from 'node:http';
import {spawn} from 'node:child_process';
import {isIP} from 'node:net';
import {lookup} from 'node:dns/promises';

const PORT=Number(process.env.PORT||10000);
const API_KEY=process.env.FFPROBE_API_KEY||'';
const MAX_RUNTIME=Number(process.env.FFPROBE_TIMEOUT_MS||20000);
const MAX_BODY=16*1024;

function isPrivate(ip){
 if(isIP(ip)===4){const p=ip.split('.').map(Number);return p[0]===10||p[0]===127||p[0]===0||p[0]===169&&p[1]===254||p[0]===172&&p[1]>=16&&p[1]<=31||p[0]===192&&p[1]===168||p[0]>=224;}
 const x=ip.toLowerCase();return x==='::1'||x==='::'||x.startsWith('fc')||x.startsWith('fd')||x.startsWith('fe8')||x.startsWith('fe9')||x.startsWith('fea')||x.startsWith('feb')||x.startsWith('::ffff:127.')||x.startsWith('::ffff:10.')||x.startsWith('::ffff:192.168.');
}
async function validateUrl(raw){
 const u=new URL(raw);if(!['http:','https:'].includes(u.protocol))throw new Error('Only HTTP/HTTPS media URLs are supported.');
 if(u.username||u.password)throw new Error('URLs containing credentials are not allowed.');
 const host=u.hostname.replace(/^\\[|\\]$/g,'');
 if(host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local'))throw new Error('Private hosts are not allowed.');
 if(isIP(host)){if(isPrivate(host))throw new Error('Private network addresses are not allowed.');}
 else{const records=await lookup(host,{all:true,verbatim:true});if(!records.length||records.some(r=>isPrivate(r.address)))throw new Error('Host resolves to a private or restricted network address.');}
 return u.toString();
}
function send(res,status,obj){res.writeHead(status,{'content-type':'application/json','cache-control':'no-store','access-control-allow-origin':'*'});res.end(JSON.stringify(obj));}
const server=http.createServer(async(req,res)=>{
 if(req.method==='OPTIONS'){res.writeHead(204,{'access-control-allow-origin':'*','access-control-allow-methods':'POST,GET,OPTIONS','access-control-allow-headers':'authorization,content-type'});return res.end();}
 if(req.method==='GET'&&req.url==='/health')return send(res,200,{ok:true,service:'ffprobe',version:'1'});
 if(req.method!=='POST'||req.url!=='/probe')return send(res,404,{error:'Not found'});
 if(!API_KEY||req.headers.authorization!==`Bearer ${API_KEY}`)return send(res,401,{error:'Unauthorized'});
 try{
  let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>MAX_BODY){send(res,413,{error:'Request too large'});return;}}
  const body=JSON.parse(raw||'{}');if(typeof body.url!=='string')return send(res,400,{error:'url is required'});
  const url=await validateUrl(body.url);
  const child=spawn('ffprobe',['-v','error','-rw_timeout','10000000','-protocol_whitelist','http,https,tcp,tls,crypto','-show_format','-show_streams','-of','json',url],{stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';child.stdout.on('data',d=>{stdout+=d;if(stdout.length>2*1024*1024)child.kill('SIGKILL');});child.stderr.on('data',d=>{stderr+=d.toString().slice(0,8192);});
  const timer=setTimeout(()=>child.kill('SIGKILL'),MAX_RUNTIME);
  child.on('close',code=>{clearTimeout(timer);if(code!==0){send(res,422,{error:stderr.trim()||'FFprobe could not inspect this media URL.'});return;}try{const probe=JSON.parse(stdout);if(!probe.format||!Array.isArray(probe.streams))throw new Error('Invalid ffprobe output');send(res,200,{probe});}catch{send(res,502,{error:'Invalid FFprobe output'});}});
  child.on('error',e=>{clearTimeout(timer);send(res,500,{error:'Unable to run ffprobe: '+e.message});});
 }catch(e){send(res,400,{error:e.message||'Invalid request'});}
});
server.listen(PORT,'0.0.0.0',()=>console.log(`FFprobe service listening on ${PORT}`));
