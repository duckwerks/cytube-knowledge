/*
 * WS-053 — CYTUBE SOCKET.IO RUNTIME TRANSPORT / HANDSHAKE TEST
 * PASSIVE / READ-ONLY
 *
 * Purpose:
 *   Inspect the already-connected Cytube Socket.IO client to determine
 *   the actual runtime transport, Engine.IO/Socket.IO configuration,
 *   namespace/path, handshake data, and connection metadata.
 *
 * Safety:
 *   - Does NOT create a socket.
 *   - Does NOT reconnect.
 *   - Does NOT emit events.
 *   - Does NOT alter socket or channel state.
 *
 * Why this test exists:
 *   WS-051 established the server configuration endpoint.
 *   WS-052 established that the existing socket matches Cytube's
 *   server-selection algorithm and uses secure + withCredentials.
 *   WS-053 now records what the connected Socket.IO stack actually
 *   negotiated at runtime.
 */
(async()=>{
    const T="WS-053";
    const out={
        test:T,
        timestamp:new Date().toISOString(),
        runtime:{
            socketExists:!!window.socket,
            connected:!!window.socket?.connected,
            socketId:window.socket?.id??null
        },
        socket:{
            namespace:window.socket?.nsp??null,
            connected:window.socket?.connected??null,
            id:window.socket?.id??null,
            disconnected:window.socket?.disconnected??null,
            auth:window.socket?.auth??null,
            query:window.socket?.query??null,
            socketOptions:null,
            managerOptions:null,
            managerUri:null,
            managerPath:null,
            managerReadyState:null,
            engine:{
                exists:!!window.socket?.io?.engine,
                id:null,
                transport:null,
                transportName:null,
                transportQuery:null,
                protocol:null,
                readyState:null,
                upgrade:null,
                hostname:null,
                port:null,
                pathname:null,
                query:null
            }
        },
        error:null
    };

    try{
        const s=window.socket;
        if(!s) throw new Error("window.socket unavailable");

        if(s.io?.opts){
            const o=s.io.opts;
            out.socket.socketOptions={
                secure:o.secure??null,
                withCredentials:o.withCredentials??null,
                path:o.path??null,
                transports:Array.isArray(o.transports)?o.transports.slice():null,
                upgrade:o.upgrade??null,
                forceNew:o.forceNew??null,
                multiplex:o.multiplex??null,
                timeout:o.timeout??null,
                reconnection:o.reconnection??null,
                reconnectionAttempts:o.reconnectionAttempts??null,
                reconnectionDelay:o.reconnectionDelay??null,
                query:o.query??null,
                auth:o.auth??null
            };
        }

        if(s.io){
            const m=s.io;
            out.socket.managerUri=m.uri??null;
            out.socket.managerOptions=m.opts?{
                secure:m.opts.secure??null,
                withCredentials:m.opts.withCredentials??null,
                path:m.opts.path??null,
                transports:Array.isArray(m.opts.transports)?m.opts.transports.slice():null,
                upgrade:m.opts.upgrade??null,
                forceNew:m.opts.forceNew??null,
                multiplex:m.opts.multiplex??null,
                timeout:m.opts.timeout??null
            }:null;
            out.socket.managerPath=m._path??m.opts?.path??null;
            out.socket.managerReadyState=m.readyState??null;
        }

        if(s.auth!==undefined) out.socket.auth=s.auth;
        if(s.query!==undefined) out.socket.query=s.query;

        const e=s.io?.engine;
        if(e){
            out.socket.engine.id=e.id??null;
            out.socket.engine.transportName=e.transport?.name??null;
            out.socket.engine.transport=e.transport?{
                name:e.transport.name??null,
                query:e.transport.query??null,
                writable:e.transport.writable??null,
                readyState:e.transport.readyState??null
            }:null;
            out.socket.engine.transportQuery=e.transport?.query??null;
            out.socket.engine.protocol=e.protocol??null;
            out.socket.engine.readyState=e.readyState??null;
            out.socket.engine.upgrade=e.upgrade??null;
            out.socket.engine.hostname=e.hostname??null;
            out.socket.engine.port=e.port??null;
            out.socket.engine.pathname=e.pathname??null;
            out.socket.engine.query=e.query??null;
        }
    }catch(e){
        out.error=String(e);
    }

    out.completed=new Date().toISOString();
    const o=JSON.stringify(out,null,2);
    window.__WS053_OUTPUT__=o;
    let copied=false;
    try{
        if(typeof copy==="function"){
            copy(o);
            copied=true;
        }
    }catch(e){}
    if(!copied)try{
        const ta=document.createElement("textarea");
        ta.value=o;
        ta.setAttribute("readonly","");
        ta.style.position="fixed";
        ta.style.left="-9999px";
        document.body.appendChild(ta);
        ta.select();
        ta.setSelectionRange(0,ta.value.length);
        copied=document.execCommand("copy");
        ta.remove();
    }catch(e){}
    console.log(o);
    console.log(copied?"=== WS-053 COMPLETE OUTPUT COPIED ===":"=== WS-053 CLIPBOARD FAILED — OUTPUT RETAINED IN window.__WS053_OUTPUT__ ===");
})();
