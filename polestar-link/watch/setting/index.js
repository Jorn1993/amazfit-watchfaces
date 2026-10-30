AppSettingsPage({
 state:{email:'',password:''},
 build(props){
  const s=props.settingsStorage;
  this.state.email=s.getItem('polestar.email')||this.state.email;
  const field={padding:'14px',marginBottom:'16px',borderRadius:'12px',background:'#f1f3f6'};
  return View({style:{padding:'22px',background:'#ffffff'}},[
   Text({bold:true,style:{fontSize:'26px',marginBottom:'12px'}},'Polestar Link'),
   Text({paragraph:true,style:{marginBottom:'18px'}},'Sign in with your Polestar ID'),
   View({style:field},[TextInput({label:'Email',placeholder:'Email address',value:this.state.email,onChange:v=>{this.state.email=v;}})]),
   View({style:field},[TextInput({label:'Password',placeholder:'Password',type:'password',value:this.state.password,onChange:v=>{this.state.password=v;}})]),
   Button({label:'Sign in',onClick:()=>{
    const email=(this.state.email||'').trim();
    if(!email||!this.state.password){s.setItem('polestar.login.status','Enter email and password');return;}
    s.setItem('polestar.email',email);
    s.setItem('polestar.login.status','Direct Polestar authentication is not yet available in this build.');
    this.state.password='';
   }}),
   Text({paragraph:true,style:{marginTop:'16px'}},s.getItem('polestar.login.status')||'Not connected')
  ]);
 }
});
