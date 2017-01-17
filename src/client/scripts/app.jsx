import styles from "../style.css";
import React from 'react';
import BigNumber from 'bignumber.js';
import {render} from 'react-dom';
import {AccountBalance} from './react-web3.jsx';

export class App extends React.Component {
	constructor() {
		super();
		this.state = {
			userAccount: web3.eth.defaultAccount
		};
		setInterval(this.checkUserAddresses.bind(this), 500);
	}

	checkUserAddresses() {
		var a = web3.eth.defaultAccount;
		if (a != this.state.userAccount) {
			this.setState({
				userAccount: a
			});
		}
	}

	render() {
		var userAccount = this.state.userAccount;
		return <div id="app">
			<div id="youhave">You have <AccountBalance address={userAccount}/> available</div>
		</div>;
	}
}
