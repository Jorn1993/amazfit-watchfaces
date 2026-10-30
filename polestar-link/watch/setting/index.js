AppSettingsPage({
  build(props) {
    const s = props.settingsStorage;
    const mode = s.getItem('connection.state') || 'not_connected';
    const lastCheck = s.getItem('connection.lastCheck') || 'Not tested';
    return View({ style: { padding: '18px' } }, [
      Section({ title: 'POLESTAR LINK' }, [
        Text({ style: { fontSize: '22px', fontWeight: 'bold' } }, 'Your Polestar 4'),
        Text({}, 'Connection: ' + (mode === 'not_connected' ? 'Not connected' : mode)),
        Text({}, 'Watch: Amazfit Balance 2'),
        Text({}, 'Last phone service check: ' + lastCheck)
      ]),
      Section({ title: 'CONNECTION' }, [
        Text({}, 'The Zepp phone service is installed. Polestar sign-in is not enabled yet because its unofficial authentication needs a compatible secure gateway.'),
        Button({ label: 'Test Zepp phone service', onClick: () => s.setItem('connection.checkRequested', String(Date.now())) }),
        Button({ label: 'Clear connection state', onClick: () => {
          s.removeItem('connection.state');
          s.removeItem('connection.lastCheck');
        } })
      ]),
      Section({ title: 'VEHICLE CONTROLS' }, [
        Text({}, 'Lock / unlock: disabled until the Polestar account is securely connected and the car confirms the request.'),
        Text({}, 'Do not enter Polestar passwords, verification codes or access tokens into this demo.')
      ]),
      Section({ title: 'ABOUT' }, [
        Text({}, 'Polestar Link 0.3.0 — connection setup'),
        Text({}, 'Runs inside Zepp. No separate Android APK.')
      ])
    ]);
  }
});
