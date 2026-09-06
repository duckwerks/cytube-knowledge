/*
 * WS-054 — CYTUBE SOCKET.IO OUTBOUND EVENT MAP TEST
 * PASSIVE / READ-ONLY / MOBILE
 *
 * Purpose:
 *   Discover the actual client-side Socket.IO outbound event names and
 *   call sites. WS-043..053 established the inbound dispatch path and
 *   the live Engine.IO WebSocket connection. The next missing layer is
 *   the client -> server direction.
 *
 * Safety:
 *   This test only fetches already-loaded same-origin CyTube JavaScript
 *   resources and searches their source text. It does NOT call socket.emit,
 *   reconnect, modify listeners, or change application state.
 *
 * Especially useful targets include rank/permission/playlist operations,
 * but the test records every literal socket.emit("event", ...) call found
 * in same-origin external scripts so the protocol can be mapped accurately.
 */
(async()=>{
    const T="WS-054";
    const out={
        test:T,
        timestamp:new Date().toISOString(),
        channelName:window.CHANNEL?.name??null,
        runtime:{socketExists:!!window.socket,connected:!!window.socket?.connected},
        scriptCount:document.scripts.length,
        externalScripts:[],
        matches:[],
        fetchErrors:[]
    };

    try{
        out.externalScripts=[...new Set(
            [...document.scripts]
                .map(s=>s.src)
                .filter(Boolean)
                .filter(u=>{try{return new URL(u,location.href).origin===location.origin}catch(e){return false}})
        )];

        for(const url of out.externalScripts){
            try{
                const r=await fetch(url,{credentials:"same-origin"});
                if(!r.ok){
                    out.fetchErrors.push({url,error:`HTTP ${r.status}`});
                    continue;
                }
                const src=await r.text();
                const lines=src.split(/\r?\n/);

                for(let i=0;i<lines.length;i++){
                    const line=lines[i];
                    if(!/\bsocket\s*\.\s*emit\s*\(/.test(line)) continue;

                    const context=lines.slice(Math.max(0,i-3),Math.min(lines.length,i+4)).join("\n");
                    const literal=line.match(/\bsocket\s*\.\s*emit\s*\(\s*["']([^"']+)["']/);
                    out.matches.push({
                        url,
                        line:i+1,
                        event:literal?literal[1]:null,
                        context
                    });
                }
            }catch(e){
                out.fetchErrors.push({url,error:String(e)});
            }
        }
    }catch(e){
        out.fetchErrors.push({url:"(test)",error:String(e)});
    }

    out.eventNames=[...new Set(out.matches.map(m=>m.event).filter(Boolean))];
    out.completed=new Date().toISOString();

    const o=JSON.stringify(out,null,2);
    window.__WS054_OUTPUT__=o;
    let copied=false;
    try{if(typeof copy==="function"){copy(o);copied=true}}catch(e){}
    if(!copied)try{
        const ta=document.createElement("textarea");
        ta.value=o;ta.setAttribute("readonly","");ta.style.position="fixed";ta.style.left="-9999px";
        document.body.appendChild(ta);ta.select();ta.setSelectionRange(0,ta.value.length);
        copied=document.execCommand("copy");ta.remove();
    }catch(e){}
    console.log(o);
    console.log(copied?"=== WS-054 COMPLETE OUTPUT COPIED ===":"=== WS-054 CLIPBOARD FAILED — OUTPUT RETAINED IN window.__WS054_OUTPUT__ ===");
})();
