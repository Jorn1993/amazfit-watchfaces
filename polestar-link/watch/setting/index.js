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
        const email=(this.state.email||'').trim();
        if(!email || !this.state.password){
          s.setItem('polestar.login.status','Enter your email and password');return;
        }
        s.setItem('polestar.email',email);
        s.setItem('polestar.login.status','Connecting to Polestar…');
        // Transient mailbox for Zepp Side Service. It deletes the value on receipt.
        s.setItem('polestar.login.request',JSON.stringify({email,password:this.state.password}));
        this.state.password='';
      }}),
      Text({paragraph:true,style:{marginTop:'18px'}},status),
      Text({paragraph:true,style:{marginTop:'8px'}},s.getItem('vehicle.name')||''),
      Button({label:'Disconnect',onClick:()=>{s.setItem('polestar.session.clear',String(Date.now()));s.setItem('polestar.login.status','Disconnected');}})
    ]);
  }
});
