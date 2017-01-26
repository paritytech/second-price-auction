import 'jquery';
import React from 'react';
import {render} from 'react-dom';
import {installBonds, App} from './app.jsx'
import MuiThemeProvider from 'material-ui/styles/MuiThemeProvider';
import injectTapEventPlugin from 'react-tap-event-plugin';

// Needed for onTouchTap
// http://stackoverflow.com/a/34015469/988941
injectTapEventPlugin();

installBonds();

render(<MuiThemeProvider><App/></MuiThemeProvider>, document.getElementById('app'));
