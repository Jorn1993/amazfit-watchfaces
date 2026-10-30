AppSettingsPage({
 state:{email:'',password:''},
 build(props){
  const s=props.settingsStorage;
  this.state.email=s.getItem('polestar.email')||this.state.email||'';
  const panel={padding:'18px',marginBottom:'18px',borderRadius:'16px',background:'#ffffff'};
  const field={marginTop:'12px',marginBottom:'12px',padding:'12px',borderRadius:'10px',background:'#f1f3f6'};
  return View({style:{padding:'18px',background:'#f5f6f8'}},[
   View({style:{marginBottom:'24px'}},[
    Text({bold:true,style:{fontSize:'26px',marginBottom:'6px'}},'Polestar Link'),
    Text({paragraph:true},'Polestar 4 · Account setup')
   ]),
   View({style:panel},[
    Text({bold:true,style:{fontSize:'19px',marginBottom:'8px'}},'Polestar ID'),
    Text({paragraph:true},'Enter your Polestar account details. Sign-in is not active yet.'),
    View({style:field},[
     TextInput({label:'Email address',placeholder:'name@example.com',value:this.state.email,onChange:v=>{this.state.email=v;}})
    ]),
    View({style:field},[
     TextInput({label:'Password',placeholder:'Enter password',type:'password',value:this.state.password,onChange:v=>{this.state.password=v;}})
    ]),
    Button({label:'Save email',onClick:()=>{
      const email=(this.state.email||'').trim();
      if(!email){s.setItem('auth.status','Enter your email address');return;}
      s.setItem('polestar.email',email);
      this.state.password='';
      s.setItem('auth.status','Email saved. Password not stored or submitted. Sign-in not implemented.');
    }}),
    Text({paragraph:true,style:{marginTop:'12px'}},s.getItem('auth.status')||'Not connected')
   ]),
   View({style:panel},[
    Text({bold:true,style:{fontSize:'19px',marginBottom:'8px'}},'Connection diagnostics'),
    Button({label:'Test Polestar authorization',onClick:()=>s.setItem('probe.request',String(Date.now()))}),
    Text({paragraph:true,style:{marginTop:'12px'}},s.getItem('probe.result')||'Not tested')
   ]),
   View({style:panel},[
    Text({bold:true,style:{fontSize:'19px'}},'Vehicle'),
    Text({paragraph:true},'Lock and unlock are unavailable until account authentication and vehicle commands are implemented.')
   ])
  ]);
 }
});
