AppSettingsPage({
  state: { email: '', password: '' },
  build(props) {
    const storage = props.settingsStorage;
    const status = storage.getItem('polestar.loginStatus') || 'Not connected';
    const displayEmail = storage.getItem('polestar.email') || '';
    return View({ style: { padding: '20px' } }, [
      View({ style: { marginBottom: '24px' } }, [
        Text({ bold: true, style: { fontSize: '24px' } }, 'Polestar Link'),
        Text({ paragraph: true }, 'Connect your Polestar 4 to the Balance 2.')
      ]),
      View({ style: { marginBottom: '20px' } }, [
        Text({ bold: true }, 'Polestar ID'),
        TextInput({
          label: 'Email',
          placeholder: 'name@example.com',
          value: this.state.email || displayEmail,
          onChange: value => { this.state.email = value; }
        }),
        Text({ paragraph: true }, 'Connection status: ' + status),
        Text({ paragraph: true }, 'Secure password entry is not available yet. Zepp Settings TextInput does not document a password-masking mode. Your password must not be entered into an ordinary visible text field.')
      ]),
      View({ style: { marginBottom: '20px' } }, [
        Button({
          label: 'Save Polestar ID',
          onClick: () => {
            const email = (this.state.email || displayEmail).trim();
            if (!(email.includes('@') && email.includes('.'))) {
              storage.setItem('polestar.loginStatus', 'Enter a valid email address');
              return;
            }
            storage.setItem('polestar.email', email);
            storage.setItem('polestar.loginStatus', 'Email saved • secure login unavailable');
          }
        }),
        Button({
          label: 'Clear account details',
          onClick: () => {
            this.state.email = '';
            this.state.password = '';
            storage.removeItem('polestar.email');
            storage.setItem('polestar.loginStatus', 'Not connected');
          }
        })
      ]),
      View({ style: { marginBottom: '16px' } }, [
        Text({ bold: true }, 'Vehicle'),
        Text({ paragraph: true }, 'No connected vehicle. Live vehicle data, lock and unlock remain disabled.')
      ]),
      Text({ paragraph: true }, 'v0.6.0 • Account setup. Do not enter your password or verification codes in this app.')
    ]);
  }
});
