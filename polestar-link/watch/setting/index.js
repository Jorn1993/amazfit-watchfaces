AppSettingsPage({
  build(props) {
    const storage = props.settingsStorage;
    const mode = storage.getItem('mode') || 'demo';
    return View({ style: { padding: '16px' } }, [
      Text({ bold: true, style: { fontSize: '22px' } }, 'Polestar Link'),
      Text({}, 'Version 0.2.1 — Balance 2'),
      Text({}, 'Mode: ' + (mode === 'demo' ? 'Demo only' : 'Not configured')),
      Button({
        label: 'Enable safe demo mode',
        onClick: () => storage.setItem('mode', 'demo')
      }),
      Text({}, 'No Polestar account connected. Lock and unlock are disabled.'),
      Text({}, 'Vehicle authentication will be added only after the Polestar 4 flow is verified.'),
      Text({}, 'No Android companion app is needed.')
    ]);
  }
});
