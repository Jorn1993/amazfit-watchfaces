AppSettingsPage({
  build(props) {
    const storage=props.settingsStorage;
    const mode=storage.getItem('mode') || 'demo';
    return View({children:[
      Text({style:{fontSize:'22px',fontWeight:'bold'},text:'Polestar Link'}),
      Text({text:'Amazfit Balance 2 • Zepp integration'}),
      Text({text:'Connection mode'}),
      Text({text:mode==='demo'?'Demo / offline — no car commands':'Not configured'}),
      Button({label:'Use safe demo mode',onClick:()=>storage.setItem('mode','demo')}),
      Text({text:'Official Polestar sign-in is not available yet. Do not enter your password or access tokens into an unverified app.'}),
      Text({text:'Lock and unlock controls on the watch are currently demonstrations only. The app will never send a vehicle command without an authenticated integration.'}),
      Text({text:'Version 0.2.0 • Configuration stays inside Zepp; no Android APK.'})
    ]});
  }
});
