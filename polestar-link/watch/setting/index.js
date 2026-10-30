// Zepp settings app. Credentials are entered here and never written to GitHub.
AppSettingsPage({
  state:{email:'',password:''},
  build(props){
    const s=props.settingsStorage;
    this.state.email=s.getItem('polestar.email')||this.state.email;
    const status=s.getItem('polestar.login.status')||'Not connected';
    const field={padding:'14px',marginBottom:'14px',borderRadius:'12px',background:'#f1f3f6'};
    return View({style:{padding:'22px',background:'#ffffff'}},[
      Text({bold:true,style:{fontSize:'26px',marginBottom:'12px'}},'Polestar Link'),
      Text({paragraph:true,style:{marginBottom:'18px'}},'Connect your Polestar ID in Zepp'),
      View({style:field},[TextInput({label:'Email',placeholder:'Email address',value:this.state.email,onChange:v=>{this.state.email=v;}})]),
      View({style:field},[TextInput({label:'Password',placeholder:'Password',type:'password',value:this.state.password,onChange:v=>{this.state.password=v;}})]),
      Button({label:'Sign in',onClick:()=>{
        // Snapshot fields before settingsStorage writes trigger reactive re-builds.
        const email=String(this.state.email||'').trim();
        const password=String(this.state.password||'');
        if(!email||!password){
          s.setItem('polestar.login.status','Enter your email and password');return;
        }
        this.state.password='';
        const sentAt=Date.now();
        s.setItem('polestar.email',email);
        s.setItem('polestar.login.request.at',String(sentAt));
        s.setItem('polestar.login.status','Waiting for Zepp service. Open Polestar Link on your watch once.');
        // This transient request is consumed/removed by the phone-side service.
        s.setItem('polestar.login.request',JSON.stringify({email,password}));
      }}),
      Text({paragraph:true,style:{marginTop:'18px'}},status),
      Text({paragraph:true,style:{marginTop:'8px',fontSize:'13px',color:'#666666'}},
        s.getItem('polestar.log')||'If no progress appears, open the app on your watch.'),
      Text({paragraph:true,style:{marginTop:'8px'}},s.getItem('vehicle.name')||''),
      Button({label:'Check connection',onClick:()=>{
        const pending=s.getItem('polestar.login.request');
        const sent=Number(s.getItem('polestar.login.request.at')||0);
        if(pending){
          s.setItem('polestar.login.status',
            Date.now()-sent>120000
            ? 'Sign-in timed out before the Zepp service started. Open the watch app, then sign in again.'
            : 'Waiting for the Zepp phone service. Open Polestar Link on your watch.');
        }else{
          const stage=s.getItem('polestar.log');
          s.setItem('polestar.login.status',stage||'No pending sign-in request. Enter password and try again.');
        }
      }}),
      Button({label:'Disconnect',onClick:()=>{s.setItem('polestar.session.clear',String(Date.now()));s.setItem('polestar.login.status','Disconnected');}})
    ]);
  }
});
