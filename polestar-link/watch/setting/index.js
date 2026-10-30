AppSettingsPage({
  build(props) {
    const s = props.settingsStorage;
    return View({style:{padding:'20px'}},[
      View({style:{marginBottom:'22px'}},[
        Text({bold:true,style:{fontSize:'24px'}},'Polestar Link'),
        Text({paragraph:true},'Version 0.9.0 • Polestar ID connectivity')
      ]),
      View({style:{marginBottom:'22px'}},[
        Text({bold:true},'Polestar authentication service'),
        Text({paragraph:true},'This checks whether Zepp can reach Polestar ID login pages. No password, tokens or car commands are sent.'),
        Button({label:'Test Polestar ID connection',onClick:()=>s.setItem('probe.request',String(Date.now()))}),
        Text({paragraph:true},'Result: '+(s.getItem('probe.result')||'Not tested'))
      ]),
      View({style:{marginBottom:'22px'}},[
        Text({bold:true},'Polestar account'),
        Text({paragraph:true},'Not connected. The protocol must be validated before adding a working account sign-in.')
      ]),
      View({},[
        Text({bold:true},'Vehicle controls'),
        Text({paragraph:true},'Disabled: no authenticated vehicle session exists.')
      ])
    ]);
  }
});
