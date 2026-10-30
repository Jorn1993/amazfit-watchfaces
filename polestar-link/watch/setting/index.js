AppSettingsPage({
 state:{url:'',token:''},
 build(props){
  const s=props.settingsStorage;
  const status=s.getItem('gateway.status')||'Not connected';
  this.state.url=s.getItem('gateway.url')||this.state.url||'';
  return View({style:{padding:'20px'}},[
   View({style:{marginBottom:'20px'}},[
    Text({bold:true,style:{fontSize:'24px',marginBottom:'8px'}},'Polestar Link'),
    Text({paragraph:true},'v0.7.0 • Polestar 4')
   ]),
   View({style:{marginBottom:'24px'}},[
    Text({bold:true},'Private connection'),
    Text({paragraph:true},'Your private bridge translates Zepp HTTPS requests into Polestar vehicle calls. Account credentials stay on that bridge.'),
    TextInput({label:'HTTPS bridge address',placeholder:'https://your-private-host',value:this.state.url,
      onChange:value=>{this.state.url=value;}}),
    TextInput({label:'Bridge access token',placeholder:'Paste access token',
      value:this.state.token,onChange:value=>{this.state.token=value;}}),
    Button({label:'Save and connect',onClick:()=>{
      const url=(this.state.url||'').trim().replace(/\/$/,'');
      const token=this.state.token||s.getItem('gateway.token')||'';
      if(!url.startsWith('https://')||token.length<16){s.setItem('gateway.status','HTTPS address and token required');return;}
      s.setItem('gateway.url',url);s.setItem('gateway.token',token);
      this.state.token='';
      s.setItem('gateway.check',String(Date.now()));
    }}),
    Text({paragraph:true},'Status: '+status),
    Text({paragraph:true},'Vehicle: '+(s.getItem('gateway.vin')||'None'))
   ]),
   View({style:{marginBottom:'16px'}},[
    Button({label:'Disconnect',onClick:()=>{
      ['gateway.url','gateway.token','gateway.vin','gateway.status'].forEach(k=>s.removeItem(k));
      this.state.url='';this.state.token='';
    }})
   ]),
   Text({paragraph:true},'Experimental: unofficial Polestar API. Unlock requires watch confirmation and must be enabled on the private bridge.')
  ]);
 }
});
