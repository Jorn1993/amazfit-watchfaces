AppSettingsPage({
 state:{url:'',token:''},
 build(props){
  const s=props.settingsStorage;
  this.state.url=s.getItem('gateway.url')||this.state.url||'';
  const panel={padding:'18px',marginBottom:'18px',borderRadius:'16px',background:'#ffffff'};
  const field={padding:'12px',marginTop:'12px',marginBottom:'12px',borderRadius:'10px',background:'#f1f3f6'};
  return View({style:{padding:'18px',background:'#f5f6f8'}},[
   View({style:{marginBottom:'20px'}},[
    Text({bold:true,style:{fontSize:'26px'}},'Polestar Link'),
    Text({paragraph:true},'Polestar 4 remote control')
   ]),
   View({style:panel},[
    Text({bold:true,style:{fontSize:'19px'}},'Private connector'),
    Text({paragraph:true},'Your Polestar account is configured on your private HTTPS connector. Zepp uses its access token to retrieve vehicle status and send commands.'),
    View({style:field},[TextInput({label:'HTTPS connector URL',placeholder:'https://your-host.example',value:this.state.url,onChange:v=>{this.state.url=v;}})]),
    View({style:field},[TextInput({label:'Connector access token',placeholder:'Access token',value:this.state.token,onChange:v=>{this.state.token=v;}})]),
    Button({label:'Save and connect',onClick:()=>{
     const url=(this.state.url||'').trim().replace(/\/$/,'');
     const token=this.state.token||s.getItem('gateway.token')||'';
     if(!/^https:\/\//.test(url)||token.length<16){s.setItem('gateway.status','Enter a valid HTTPS URL and access token');return;}
     s.setItem('gateway.url',url);s.setItem('gateway.token',token);
     this.state.token='';
     s.setItem('gateway.check',String(Date.now()));
    }}),
    Text({paragraph:true,style:{marginTop:'12px'}},'Status: '+(s.getItem('gateway.status')||'Not connected'))
   ]),
   View({style:panel},[
    Text({bold:true,style:{fontSize:'19px'}},'Vehicle'),
    Text({paragraph:true},s.getItem('vehicle.name')||'Connect to discover your Polestar.'),
    Button({label:'Refresh vehicle',onClick:()=>s.setItem('gateway.check',String(Date.now()))})
   ])
  ]);
 }
});
