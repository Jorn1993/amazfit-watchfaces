AppSettingsPage({
 state:{host:'',token:'',vin:'',path:''},
 build(props){
  const s=props.settingsStorage;
  this.state.host=s.getItem('direct.host')||this.state.host;
  this.state.vin=s.getItem('direct.vin')||this.state.vin;
  this.state.path=s.getItem('direct.path')||this.state.path;
  const field={padding:'12px',marginBottom:'14px',borderRadius:'12px',background:'#f1f3f6'};
  return View({style:{padding:'20px',background:'#ffffff'}},[
   Text({bold:true,style:{fontSize:'24px',marginBottom:'12px'}},'Polestar Link Lab'),
   Text({paragraph:true},'v1.1.0 · Direct C3 transport experiment. No gateway required. This does not log in or control the vehicle yet.'),
   View({style:field},[TextInput({label:'C3 API HTTPS host',placeholder:'https://api-host',value:this.state.host,onChange:v=>{this.state.host=v;}})]),
   View({style:field},[TextInput({label:'Vehicle VIN',placeholder:'17-character VIN',value:this.state.vin,onChange:v=>{this.state.vin=v;}})]),
   View({style:field},[TextInput({label:'gRPC method path',placeholder:'/package.Service/Method',value:this.state.path,onChange:v=>{this.state.path=v;}})]),
   View({style:field},[TextInput({label:'Access token',placeholder:'OAuth bearer token',value:this.state.token,onChange:v=>{this.state.token=v;}})]),
   Button({label:'Save and test direct gRPC',onClick:()=>{
    s.setItem('direct.host',(this.state.host||'').trim());
    s.setItem('direct.vin',(this.state.vin||'').trim());
    s.setItem('direct.path',(this.state.path||'').trim());
    if(this.state.token){s.setItem('direct.token',this.state.token);this.state.token='';}
    s.setItem('direct.probe',String(Date.now()));
   }}),
   Text({paragraph:true,style:{marginTop:'14px'}},s.getItem('direct.result')||'Not tested'),
   Button({label:'Clear access token',onClick:()=>{s.removeItem('direct.token');s.setItem('direct.result','Token cleared');}})
  ]);
 }
});
