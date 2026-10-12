/* PeerJS wrapper for up to 4 players (host + 3 guests, star topology) */
export const Net = {
  role: 'solo',       // 'solo' | 'host' | 'guest'
  code: null,
  peer: null,
  myId: 0,            // 0 = host, 1..3 = guests
  hostConn: null,     // (guest) connection to host
  guests: [],         // (host) array of {id, conn}
  players: new Map(), // id -> {id, conn, ready}
  nextId: 1,

  onLobbyUpdate: null, // () => {} — host only, when players join/leave
  onInput: null,       // (playerId, input) => {}
  onState: null,       // (packet) => {} — guest receives state
  onStart: null,       // () => {} — guests get start signal
  onDisconnect: null,  // (msg) => {}

  genCode(){
    const A='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let s=''; for(let i=0;i<4;i++) s+=A[(Math.random()*A.length)|0];
    return s;
  },

  host(){
    this.role='host'; this.myId=0;
    this.code=this.genCode();
    this.peer=new Peer('rrnc-'+this.code,{debug:0});
    this.peer.on('open',()=> this.onLobbyUpdate && this.onLobbyUpdate());
    this.peer.on('error',err=> this.onDisconnect && this.onDisconnect('Host error: '+err.type));
    this.peer.on('connection',conn=>{
      if (this.guests.length>=3){ conn.close(); return; }
      const id=this.nextId++;
      const entry={id,conn};
      this.guests.push(entry);
      this.players.set(id,{id,conn});
      conn.on('open',()=>{
        conn.send({t:'welcome',id});
        this.onLobbyUpdate && this.onLobbyUpdate();
      });
      conn.on('data',data=>{
        if (data.t==='in' && this.onInput) this.onInput(id,data.k);
      });
      conn.on('close',()=> this.removeGuest(id));
      conn.on('error',()=> this.removeGuest(id));
    });
  },

  removeGuest(id){
    this.guests=this.guests.filter(g=>g.id!==id);
    this.players.delete(id);
    this.onLobbyUpdate && this.onLobbyUpdate();
  },

  join(code,onReady,onError){
    this.role='guest'; this.code=code.toUpperCase();
    this.peer=new Peer({debug:0});
    this.peer.on('open',()=>{
      this.hostConn=this.peer.connect('rrnc-'+this.code,{reliable:false});
      this.hostConn.on('open',()=> onReady && onReady());
      this.hostConn.on('data',data=>{
        if (data.t==='welcome'){ this.myId=data.id; }
        else if (data.t==='start'){ this.onStart && this.onStart(); }
        else if (data.t==='s'){ this.onState && this.onState(data); }
      });
      this.hostConn.on('close',()=> this.onDisconnect && this.onDisconnect('Host disconnected'));
      this.hostConn.on('error',()=> this.onDisconnect && this.onDisconnect('Connection error'));
    });
    this.peer.on('error',err=>{
      if (onError) onError(err.type);
    });
  },

  sendInput(input){
    if (this.role==='guest' && this.hostConn && this.hostConn.open){
      try{ this.hostConn.send({t:'in',k:input}); }catch(e){}
    }
  },

  sendState(packet){
    if (this.role!=='host') return;
    for (const g of this.guests){
      if (g.conn.open){ try{ g.conn.send(packet); }catch(e){} }
    }
  },

  startRace(){
    if (this.role==='host'){
      for (const g of this.guests){
        if (g.conn.open){ try{ g.conn.send({t:'start'}); }catch(e){} }
      }
      this.onStart && this.onStart();
    }
  },

  get playerCount(){ return this.role==='host' ? 1+this.guests.length : 1; },

  disconnect(){
    try{
      if (this.hostConn) this.hostConn.close();
      for (const g of this.guests) g.conn.close();
      if (this.peer) this.peer.destroy();
    }catch(e){}
    this.guests=[]; this.players.clear(); this.hostConn=null; this.peer=null;
    this.role='solo';
  }
};
