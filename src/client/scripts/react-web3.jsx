import 'jquery';
import BigNumber from 'bignumber.js';
import React from 'react';
import {render} from 'react-dom';
import Web3 from 'web3';

var isManaged = typeof(window.web3) == "object";
var web3 = isManaged ? window.web3 : new Web3(new Web3.providers.HttpProvider("http://127.0.0.1:8080/rpc"));

export function paddedHex(i, l) {
	return ("0".repeat(l) + i.toString(16)).substr(-l);
}

export class HexDump extends React.Component {
	render () {
		var bytesPerLine = 16;
		var hex = this.props.data;
		var text = "";
		for (var i = 0; i < hex.length; i += bytesPerLine) {
			text += paddedHex(i, 4) + "  ";
			for (var j = i; j < i + bytesPerLine; ++j)
				if (j < hex.length)
					text += paddedHex(hex[j], 2) + " ";
				else
					text += "   ";
			text += "  ";
			for (var j = i; j < i + bytesPerLine; ++j)
				if (j < hex.length && hex[j] >= 32 && hex[j] < 128)
					text += String.fromCharCode(hex[j]);
				else
					text += " ";
			text += "\n";
		}
		return (<pre style={{display: this.props.visible ? 'block' : 'none'}}>{text}</pre>);
	}
}
HexDump.propTypes = { visible: React.PropTypes.bool, data: React.PropTypes.array };
HexDump.defaultProps = { visible: true };

var denominations = [ "wei", "Kwei", "Mwei", "Gwei", "szabo", "finney", "ether", "grand", "Mether", "Gether", "Tether", "Pether", "Eether", "Zether", "Yether", "Nether", "Dether", "Vether", "Uether" ];

function splitValue(a) {
	var i = 0;
	var a = new BigNumber('' + a);
	if (a.gte(new BigNumber("10000000000000000")) && a.lt(new BigNumber("100000000000000000000000")) || a.eq(0))
		i = 6;
	else
		for (var aa = a; aa.gte(1000) && i < denominations.length - 1; aa = aa.div(1000))
			i++;

	for (var j = 0; j < i; ++j)
		a = a.div(1000);

	return {base: a, denom: i};
}

export class Balance extends React.Component {
	render () {
		var v = new BigNumber(this.props.value);
		var isNeg = v.lt(0);
		var s = splitValue(v.mul(isNeg ? -1 : 1));
		var a = ('' + s.base.mul(1000).round().div(1000)).replace(/(\d)(?=(\d{3})+$)/g, "$1,");
		return (
			<span className={'_balance _' + denominations[s.denom]}>
				{isNeg ? "-" : this.props.signed ? "+" : ""}
				{a}
				<span className="_denom">
					{denominations[s.denom]}
				</span>
			</span>
		);
	}
} 
//Balance.propTypes = { value: React.PropTypes.object };

export class InputBalance extends React.Component {
	render () {
		var s = splitValue(this.props.value);
		return <span>
			<input classNames="balance" ref={(ref) => this.theBalance = ref} style={{width: '5ex'}} value={'' + s.base} onChange={this.handleChange.bind(this)} />
			<select classNames="denominations" ref={(ref) => this.theDenominations = ref} onChange={this.handleChange.bind(this)} value={s.denom}>
				{denominations.map(function(d, i) { return <option value={i} key={i}>{d}</option>; })}
			</select>
		</span>;
	}

	handleChange () {
		var v = this.theBalance.value;
		if (v == '')
			v = new BigNumber(0);
		else
			v = (new BigNumber(v)).mul((new BigNumber(10)).toPower((+this.theDenominations.value) * 3));

		this.props.onChanged(v);
	}
}

export const Account = props => {
	if (typeof(props.addr) == "string") {
		var a = props.addr.substr(0, 8) + "..." + props.addr.substr(36);
		return <span className="_account">{a}</span>;
	} else {
		return <span className="noaccount">[none]</span>;
	}
};

export class AccountBalance extends React.Component {
	constructor() {
		super();
		this.state = { balance: new BigNumber(0) };
	}

	updateState() {
		this.setState({
			balance: typeof this.props.address == 'object' ?
				this.props.address.map(addr => web3.eth.getBalance(addr)).reduce((a, b) => a.add(b), new BigNumber(0)) :
				web3.eth.getBalance(this.props.address)
		});
	}

	componentWillMount() {
		this.filter = web3.eth.filter("latest");
		this.filter.watch(this.updateState.bind(this));
	}

	componentWillUnmount() {
		this.filter.stopWatching();
	}

	componentWillReceiveProps(nextProps) {
		if (nextProps.address !== this.props.address) {
			this.componentWillUnmount();
			this.componentWillMount();
		}
	}

	render() { return <Balance value={this.state.balance} />; }
}

export class TokenContractBalance extends React.Component {
	constructor() {
		super();
		this.state = { balance: new BigNumber(0) };
	}

	updateState() {
		this.setState({
			balance: this.props.contract.balance(this.props.address)
		});
	}

	componentWillMount() {
		this.filter = this.props.contract.allEvents({fromBlock: 'latest', toBlock: 'pending'});
		this.filter.watch(this.updateState.bind(this));
		// TODO: this should get called anyway.
		this.updateState();
	}

	componentWillUnmount() {
		this.filter.stopWatching();
	}

	componentWillReceiveProps(nextProps) {
		if (nextProps.contract.address !== this.props.contract.address) {
			this.componentWillUnmount();
			this.componentWillMount();
		}
		else if (nextProps.address !== this.props.address)
			this.updateState();
	}

	render() { return <Balance value={this.state.balance} />; }
}
