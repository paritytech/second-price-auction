import React from 'react';
import {render} from 'react-dom';
import injectTapEventPlugin from 'react-tap-event-plugin';
import MuiThemeProvider from 'material-ui/styles/MuiThemeProvider';
import {setupBonds, abiPolyfill} from 'oo7-parity';
import {App} from './app.jsx'

// Needed for onTouchTap
// http://stackoverflow.com/a/34015469/988941
injectTapEventPlugin();

// Polyfills for parity.js
parity.api.abi = abiPolyfill();

// We use and dirty up the global namespace here.
parity.bonds = setupBonds(parity.api);

// Polyfill until it gets into oo7-parity.js
parity.bonds.me = parity.bonds.defaultAccount;

render(<MuiThemeProvider><App/></MuiThemeProvider>, document.getElementById('app'));
