/*
 * WS-052 — CYTUBE SOCKET.IO SERVER SELECTION TEST
 * PASSIVE / READ-ONLY / MOBILE
 *
 * Purpose:
 *   Verify the runtime server-selection logic using the exact socketConfig
 *   retrieved by CyTube, without creating a new socket or changing state.
 *
 * Established chain from WS-050 / WS-051:
 *   /socketconfig/<channel>.json
 *        -> initSocketIO(socketConfig)
 *        -> ioServerConnect(socketConfig)
 *        -> chosenServer
 *        -> io(chosenServer.url, {secure, withCredentials:true})
 *
 * This test reproduces only the selection algorithm from ioServerConnect().
 * It does NOT call io(), disconnect, emit, reconnect, or modify globals.
 */
(async()=>{
    const T="WS-052";
    const out={
        test:T,
        timestamp:new Date().toISOString(),
        channelName:window.CHANNEL?.name??null,
        configUrl:null,
        socketConfig:null,
        localStorageUseAltServer:null,
        selectedServer:null,
        expectedSocketOptions:null,
        currentSocket:{
            exists:!!window.socket,
            connected:!!window.socket?.connected,
            id:window.socket?.id??null,
            ioUrl:window.socket?.io?.uri??null,
            opts:window.socket?.io?.opts?{
                secure:window.socket.io.opts.secure??null,
                withCredentials:window.socket.io.opts.withCredentials??null
            }:null
        },
        error:null
    };

    try{
        const name=window.CHANNEL?.name;
        if(!name) throw new Error("CHANNEL.name unavailable");

        out.configUrl="/socketconfig/"+name+".json";
        const r=await fetch(out.configUrl,{credentials:"same-origin"});
        if(!r.ok) throw new Error(`HTTP ${r.status}`);
        out.socketConfig=await r.json();

        out.localStorageUseAltServer=localStorage.getItem("useAltServer");

        let servers;
        if(out.socketConfig.alt&&out.socketConfig.alt.length>0&&localStorage.useAltServer==="true"){
            servers=out.socketConfig.alt;
        }else{
            servers=out.socketConfig.servers;
        }

        let chosenServer=null;
        servers.forEach(function(server){
            if(chosenServer===null){
                chosenServer=server;
            }else if(server.secure&&!chosenServer.secure){
                chosenServer=server;
            }else if(!server.ipv6Only&&chosenServer.ipv6Only){
                chosenServer=server;
            }
        });

        out.selectedServer=chosenServer;
        if(chosenServer){
            out.expectedSocketOptions={
                secure:chosenServer.secure,
                withCredentials:true
            };
        }
    }catch(e){
        out.error=String(e);
    }

    out.completed=new Date().toISOString();
    const o=JSON.stringify(out,null,2);
    window.__WS052_OUTPUT__=o;
    let copied=false;
    try{
        if(typeof copy==="function"){
            copy(o); copied=true;
        }
    }catch(e){}
    if(!copied)try{
        const ta=document.createElement("textarea");
        ta.value=o;ta.setAttribute("readonly","");ta.style.position="fixed";ta.style.left="-9999px";
        document.body.appendChild(ta);ta.select();ta.setSelectionRange(0,ta.value.length);
        copied=document.execCommand("copy");ta.remove();
    }catch(e){}
    console.log(o);
    console.log(copied?"=== WS-052 COMPLETE OUTPUT COPIED ===":"=== WS-052 CLIPBOARD FAILED — OUTPUT RETAINED IN window.__WS052_OUTPUT__ ===");
})();
