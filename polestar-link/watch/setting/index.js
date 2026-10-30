// Zepp companion settings. No manual watch-app activation is required.
// Email is remembered; the password is kept in this screen's memory only.
// After successful sign-in, a renewable session avoids re-entering it.
AppSettingsPage({
  state:{email:'',password:''},
  build(props){
    const s=props.settingsStorage;
    const email=s.getItem('polestar.email')||this.state.email||'';
    this.state.email=email;
    const connected=!!s.getItem('polestar.access')&&!!s.getItem('vehicle.vin')&&!!s.getItem('polestar.c3');
    let status=s.getItem('polestar.login.status')||'Not connected';
    const pending=s.getItem('polestar.login.request');
    const requested=Number(s.getItem('polestar.login.request.at')||0);
    if(pending&&requested&&Date.now()-requested>30000){
      s.removeItem('polestar.login.request');
      s.removeItem('polestar.login.request.at');
      status='Could not reach the Zepp phone service. Please update Zepp and try again.';
      s.setItem('polestar.login.status',status);
    }
    const mainButton={borderRadius:'12px',fontSize:'16px',background:'#245d53',color:'#ffffff',padding:'12px',marginTop:'14px'};
    const content=[
      Text({bold:true,style:{fontSize:'24px',marginBottom:'8px'}},'Polestar Link'),
      Text({paragraph:true,style:{marginBottom:'20px',color:'#555555'}},
        connected?'Your Polestar is connected.':'Sign in with your Polestar ID.')
    ];
    if(connected){
      content.push(
        Text({bold:true,style:{fontSize:'19px',marginBottom:'8px'}},
          s.getItem('vehicle.name')||'Polestar 4'),
        Text({paragraph:true,style:{marginBottom:'12px'}},email),
        Text({paragraph:true,style:{color:'#246b57',marginBottom:'18px'}},'Connected. You can use the watch.'),
        Button({label:'Sign out',style:{borderRadius:'12px',padding:'10px'},
          onClick:()=>{
            this.state.password='';
            s.setItem('polestar.session.clear',String(Date.now()));
            s.setItem('polestar.login.status','Signed out');
          }})
      );
    }else{
      content.push(
        TextInput({
          label:'Email',
          placeholder:'Polestar ID email',
          settingsKey:'polestar.email',
          value:email,
          onChange:value=>{
            this.state.email=String(value||'');
            s.setItem('polestar.email',this.state.email);
          }
        }),
        TextInput({
          label:'Password',
          placeholder:'Your Polestar ID password',
          type:'password',
          value:this.state.password,
          onChange:value=>{this.state.password=String(value||'');}
        }),
        Button({label:'Sign in',style:mainButton,onClick:()=>{
          const currentEmail=String(s.getItem('polestar.email')||this.state.email||'').trim();
          const password=String(this.state.password||'');
          if(!currentEmail||!password){
            s.setItem('polestar.login.status','Enter your email and password.');
            return;
          }
          const now=Date.now();
          s.setItem('polestar.email',currentEmail);
          s.setItem('polestar.login.request.at',String(now));
          s.setItem('polestar.login.status','Signing in to Polestar…');
          // The side service consumes this short-lived request and removes it.
          // Do not clear the input while login is in progress.
          const request=JSON.stringify({email:currentEmail,password});
          s.setItem('polestar.login.request',request);
          // A missing phone service should not leave a pending credential forever.
          if(typeof setTimeout==='function'){
            setTimeout(()=>{
              if(s.getItem('polestar.login.request')!==request)return;
              s.removeItem('polestar.login.request');
              s.removeItem('polestar.login.request.at');
              s.setItem('polestar.login.status',
                'Zepp could not start its phone service. Please update Zepp and try again.');
            },30000);
          }
        }})
      );
      if(status.startsWith('AUTH:')||status.startsWith('ERROR:')||status.startsWith('READY:')){
        content.push(Text({paragraph:true,style:{marginTop:'16px'}},status.replace(/^(AUTH|ERROR|READY): /,'')));
      }else{
        content.push(Text({paragraph:true,style:{marginTop:'16px',color:'#555555'}},status));
      }
    }
    return View({style:{padding:'22px',background:'#ffffff'}},content);
  }
});
