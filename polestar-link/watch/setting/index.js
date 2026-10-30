AppSettingsPage({
  build(props) {
    const s = props.settingsStorage;
    return View({style:{padding:'20px'}},[
      View({style:{marginBottom:'22px'}},[
        Text({bold:true,style:{fontSize:'24px'}},'Polestar Link'),
        Text({paragraph:true},'Version 0.8.0 • Direct protocol test')
      ]),
      View({style:{marginBottom:'22px'}},[
        Text({bold:true},'Zepp network compatibility'),
        Text({paragraph:true},'This checks HTTPS POST with gRPC-style headers and binary-framed request data. No Polestar account or car is contacted.'),
        Button({label:'Run protocol test',onClick:()=>s.setItem('probe.request',String(Date.now()))}),
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
