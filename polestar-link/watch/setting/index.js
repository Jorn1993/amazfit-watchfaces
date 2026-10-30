AppSettingsPage({
 build(props){
  const s=props.settingsStorage;
  const status=s.getItem('direct.status')||'Not tested';
  return View({style:{padding:'20px'}},[
   View({style:{marginBottom:'20px'}},[
     Text({bold:true,style:{fontSize:'23px',marginBottom:'8px'}},'Polestar Link'),
     Text({paragraph:true,style:{color:'#666666'}},'Direct connection test • Version 0.5.1')
   ]),
   View({style:{marginBottom:'20px'}},[
     Text({bold:true,style:{marginBottom:'8px'}},'Network'),
     Button({label:'Test Zepp connection',onClick:()=>s.setItem('direct.check',String(Date.now()))}),
     Text({paragraph:true,style:{marginTop:'12px'}},status)
   ]),
   View({style:{marginBottom:'20px'}},[
     Text({bold:true,style:{marginBottom:'8px'}},'Polestar account'),
     Text({paragraph:true},'Not connected. This version tests internet connectivity only, not vehicle authentication.')
   ]),
   View({},[
     Text({bold:true,style:{marginBottom:'8px'}},'Vehicle controls'),
     Text({paragraph:true},'Lock and unlock are disabled until we verify a compatible direct Polestar API. No password is requested.')
   ])
  ]);
 }
});
