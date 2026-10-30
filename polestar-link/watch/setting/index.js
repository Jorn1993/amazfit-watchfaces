AppSettingsPage({
 state:{email:'',password:''},
 build(props){
  const s=props.settingsStorage;
  this.state.email=s.getItem('polestar.email')||this.state.email||'';
  return View({style:{padding:'20px'}},[
   View({style:{marginBottom:'22px'}},[
    Text({bold:true,style:{fontSize:'24px'}},'Polestar Link'),
    Text({paragraph:true},'Version 0.9.1 • Account sign-in development')
   ]),
   View({style:{marginBottom:'22px'}},[
    Text({bold:true},'Polestar account'),
    TextInput({label:'Email',placeholder:'Your Polestar ID email',value:this.state.email,onChange:v=>{this.state.email=v;}}),
    TextInput({label:'Password',placeholder:'Polestar ID password',type:'password',value:this.state.password,onChange:v=>{this.state.password=v;}}),
    Button({label:'Prepare sign-in',onClick:()=>{
     const email=(this.state.email||'').trim();
     if(!email||!this.state.password){s.setItem('auth.status','Enter both email and password');return;}
     s.setItem('polestar.email',email);
     // Never persist the password while the authenticated OAuth flow is incomplete.
     this.state.password='';
     s.setItem('auth.status','Account entered; OAuth login not implemented. Password was not submitted or saved.');
    }}),
    Text({paragraph:true},'Status: '+(s.getItem('auth.status')||'Not connected'))
   ]),
   View({style:{marginBottom:'22px'}},[
    Text({bold:true},'Polestar OAuth endpoint'),
    Button({label:'Check authorization endpoint',onClick:()=>s.setItem('probe.request',String(Date.now()))}),
    Text({paragraph:true},'Result: '+(s.getItem('probe.result')||'Not tested'))
   ]),
   Text({bold:true},'Vehicle controls'),
   Text({paragraph:true},'Disabled until authenticated session and vehicle API are validated.')
  ]);
 }
});
