import styles from "../style.css";
import React from 'react';
import BigNumber from 'bignumber.js';
import {render} from 'react-dom';
//import {AccountBalance} from './react-web3.jsx';
import blockies from 'blockies';
import RaisedButton from 'material-ui/RaisedButton';
import TextField from 'material-ui/TextField';
import {Toolbar, ToolbarGroup, ToolbarSeparator, ToolbarTitle} from 'material-ui/Toolbar';

export function createIdentityImg (address, scale = 8) {
  return blockies({
    	seed: (address || '').toLowerCase(),
    	size: 8,
    	scale
    }).toDataURL();
}

class ReactiveComponent extends React.Component {
	constructor(reactiveProps = [], extraState = {}) {
		super();
		this.reactiveProps = reactiveProps;
		this.extraState = extraState;
	}
	componentWillMount() { this.initProps(); }
	componentWillReceiveProps(nextProps) { this.updateProps(nextProps); }

	initProps () {
		this.manageProps({}, this.props);
		let that = this;
		Object.keys(this.extraState).forEach(f => {
			if (this.extraState[f] instanceof BondFace)
				this.extraState[f].subscribe(a => {
					var s = that.state || {};
					s[f] = a;
//					console.log(`Setting state via subscription: ${f} => ${a}`);
					that.setState(s);
				});
			else if (this.extraState[f] instanceof Promise)
				this.extraState[f].then(a => {
					var s = that.state || {};
					s[f] = a;
//					console.log(`Setting state via subscription: ${f} => ${a}`);
					that.setState(s);
				});
			else {
				if (s === {})
					s = that.state || {};
				s[f] = this.extraState[f];
			}
		})
	}
	updateProps (nextProps) { this.manageProps(this.props, nextProps); }
	manageProps (props, nextProps) {
		var s = {};
		var that = this;
		this.reactiveProps.forEach(f => {
//			console.log(`managing field ${f}`);
			if (nextProps[f] !== props[f]) {
				if (props[f] instanceof BondFace)
					props[f].drop();

				if (nextProps[f] instanceof BondFace)
					nextProps[f].subscribe(a => {
						var s = that.state || {};
						s[f] = a;
//						console.log(`Setting state via subscription: ${f} => ${a}`);
						that.setState(s);
					});
				else if (nextProps[f] instanceof Promise)
					nextProps[f].then(a => {
						var s = that.state || {};
						s[f] = a;
//						console.log(`Setting state via subscription: ${f} => ${a}`);
						that.setState(s);
					});
				else {
					if (s === {})
						s = this.state || {};
					s[f] = nextProps[f];
				}
			}
		});
		if (s !== {})
			this.setState(s);
	}
}

const denominations = [ "wei", "Kwei", "Mwei", "Gwei", "szabo", "finney", "ether", "grand", "Mether", "Gether", "Tether", "Pether", "Eether", "Zether", "Yether", "Nether", "Dether", "Vether", "Uether" ];
function denominationMultiplier(s) {
    let i = denominations.indexOf(s);
    if (i < 0)
        throw "Invalid denomination";
    return (new BigNumber(1000)).pow(i);
}
function interpretQuantity(s) {
    try {
        let m = s.toLowerCase().match('([0-9,.]+) *([a-zA-Z]+)?');
        let d = denominationMultiplier(m[2] || 'ether');
        let n = +m[1].replace(',', '');
        while (n !== Math.round(n)) {
            n *= 10;
            d = d.div(10);
        }
        return new BigNumber(n).mul(d);
    }
    catch (e) {
        return null;
    }
}

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

export class BondFace {
	constructor() {
		this.fire = [];
	}
	changed(v) {
		if (JSON.stringify(this.v) != JSON.stringify(v)) {	// Horrible - would be nice to less flakey way of determining difference.
//			console.log(`changing from ${this.v} => ${v}`);
			this.trigger(v);
		}
	}
	trigger(v) {
//		console.log(`firing`);
		this.v = v;
		this.fire.forEach(f => f(v));
	}
	drop () {}
	subscribe (f) { this.fire.push(f); if (this.ready()) f(this.v);  }
	ready () { return typeof(this.v) != 'undefined'; }
}

/// f is function which returns a promise. a is a set of dependencies
/// which must be passed to f as args. d are dependencies whose values are
/// unneeded. any entries of a which are reactive promises then is it their
/// underlying value which is passed.
///
/// we return a bond (an ongoing promise).
export class Bond extends BondFace {
	constructor(f, a = [], d = [], context = parity.api) {
		super();
		this.v = null;
		this.f = f;
		this.a = a;
		this.context = context;
		d.forEach(i => i.subscribe((() => this.poll()).bind(this)));
		var nd = 0;
		a.forEach(i => {
			if (i instanceof BondFace) {
				i.subscribe(this.poll.bind(this));
				nd++;
			}
			if (i instanceof Promise) {
				let f = this.poll.bind(this);
				i.then(v => { i.v = v; f(); });
				nd++;
			}
		});
		if (nd == 0 && d.length == 0)
			this.poll();
	}
	poll () {
		if (this.a.findIndex(i => (i instanceof BondFace && !i.ready()) || (i instanceof Promise && typeof(i.v) === 'undefined')) != -1)
			return;	// still have undefined params.
		let r = this.f.apply(this.context, this.a.map(i => (i instanceof BondFace || i instanceof Promise) ? i.v : i));
		if (r instanceof Promise)
			r.then(this.changed.bind(this));
		else
			this.changed(r);
	}
	drop () {
		// TODO clear up all our dependency `.subscribe`s.
	}
}

export class SecondBond extends BondFace {
	constructor() {
		super();
		this.interval = window.setInterval(this.trigger.bind(this), 1000);
		this.trigger();
	}
	trigger() {
		this.fire.forEach(f => f());
	}
	drop () {
		window.clearInterval(this.interval);
	}
}

// TODO: Use more generic means to check on number, ideally push notification.
export class SubscriptionBond extends BondFace {
	constructor(rpc) {
		super();
		parity.api.subscribe(rpc, (e, n) => {
//			console.log(`Subscription ${rpc} firing ${+n}`)
			this.trigger(n);
		}).then(id => this.subscription = id);
	}
	drop () {
		parity.api.unsubscribe(this.subscription);
	}
}

let BlockNumberBond = () => new SubscriptionBond('eth_blockNumber');

export class Transaction extends BondFace {
	constructor(tx) {
		super();
		var p = parity.api.parity.postTransaction(tx)
			.then(signerRequestId => {
//		    	console.log('trackRequest', `posted to signer with requestId ${signerRequestId}`);
				this.trigger({requested: signerRequestId});
		    	return parity.api.pollMethod('parity_checkRequest', signerRequestId);
		    })
		    .then(transactionHash => {
//				console.log('trackRequest', `received transaction hash ${transactionHash}`);
				this.trigger({signed: transactionHash});
				return parity.api.pollMethod('eth_getTransactionReceipt', transactionHash, (receipt) => receipt && receipt.blockNumber && !receipt.blockNumber.eq(0));
			})
			.then(receipt => {
//				console.log('trackRequest', `received transaction receipt ${JSON.stringify(receipt)}`);
				this.trigger({confirmed: receipt});
			})
			.catch(error => {
//				console.log('trackRequest', `transaction failed ${JSON.stringify(error)}`);
				this.trigger({failed: error});
			});
	}
}

////
// PARITY.JS EXTENSIONS

{
	var bonds = {};
	bonds.blockNumber = new BlockNumberBond;
	bonds.time = new SecondBond;	// TODO: pass the time through as v.
	bonds.accountsInfo = new Bond(parity.api.parity.accountsInfo, [], [bonds.time]); //new SubscriptionBond('parity_accountsInfo');
	parity.bonds = bonds;
}

Function.__proto__.bond = function(...args) { return new Bond(this, args); };
Function.__proto__.blockBond = function(...args) { return new Bond(this, args, [parity.bonds.blockNumber]); };
Function.__proto__.secondBond = function(...args) { return new Bond(this, args, [parity.bonds.time]); };

////
// GENERIC COMPONENTS

export class Balance extends ReactiveComponent {
	constructor() { super(['value']); }

	render () {
		if (this.state.value === null || typeof(this.state.value) == 'undefined')
			return (<span className="_undefined _balance">?</span>);
		var v = new BigNumber(this.state.value);
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

export class BlockNumber extends ReactiveComponent {
	constructor() { super(['value']); }

	render() {
		if (this.state.value === null || typeof(this.state.value) == 'undefined')
			return (<span className="_undefined _blocknumber">?</span>);
		var a = ('' + this.state.value).replace(/(\d)(?=(\d{3})+$)/g, "$1,");
		return <span className="_blocknumber">#{a}</span>;
	}
};

export class Account extends ReactiveComponent {
	constructor() { super(['address'], {accountsInfo: parity.bonds.accountsInfo}); }

	render() {
		if (typeof(this.state.address) == "string") {
			let i = this.state.accountsInfo != null ? this.state.accountsInfo[parity.api.util.toChecksumAddress(this.state.address)] : null;
			var a = i == null ? this.state.address.substr(0, 8) + "…" + this.state.address.substr(38) : i.name;
			return (<span className="_account">
				<img src={createIdentityImg(this.state.address)} className={'_identigram'} data-address-img style={{marginRight: '0.5ex'}}/>
				{a}
			</span>);
		} else {
			return <span className="undefined _account">[null]</span>;
		}
	}
};

export class RichAccount extends ReactiveComponent {
	constructor() { super(['address']); }

	render() {
		if (typeof(this.state.address) == "string") {
			return <span><Account address={this.state.address}/> <Balance value={parity.api.eth.getBalance.blockBond(this.state.address)}/></span>;
		} else {
			return <span className="undefined _account">[null]</span>;
		}
	}
};

class Progress extends ReactiveComponent {
	constructor() {
		super(['request']);
	}

	render () {
		if (typeof(this.state.request) != 'object' || this.state.request == null)
			return (<span></span>);
		var x;
		if (x = this.state.request.requested)
			return (<span>Request Id: {x}</span>);
		if (x = this.state.request.signed)
			return (<span>Submitted to chain: {x}</span>);
		if (x = this.state.request.confirmed)
			return (<span>Confirmed at <BlockNumber value={x.blockNumber}/></span>);
		if (x = this.state.request.failed)
			return (<span>Failed: {x.text}</span>);
		return (<span>???</span>);
	}
}

////
// APPLICATION

const ReceipterABI = [{"constant":true,"inputs":[],"name":"endBlock","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"total","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"","type":"address"}],"name":"record","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":false,"inputs":[],"name":"kill","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[],"name":"halt","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"treasury","outputs":[{"name":"","type":"address"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_recipient","type":"address"}],"name":"receiveFrom","outputs":[],"payable":true,"type":"function"},{"constant":true,"inputs":[],"name":"beginBlock","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"isHalted","outputs":[{"name":"","type":"bool"}],"payable":false,"type":"function"},{"constant":false,"inputs":[],"name":"unhalt","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"admin","outputs":[{"name":"","type":"address"}],"payable":false,"type":"function"},{"inputs":[{"name":"_admin","type":"address"},{"name":"_treasury","type":"address"},{"name":"_beginBlock","type":"uint256"},{"name":"_endBlock","type":"uint256"}],"payable":false,"type":"constructor"},{"payable":true,"type":"fallback"},{"anonymous":false,"inputs":[{"indexed":true,"name":"recipient","type":"address"},{"indexed":false,"name":"amount","type":"uint256"}],"name":"Received","type":"event"},{"anonymous":false,"inputs":[],"name":"Halted","type":"event"},{"anonymous":false,"inputs":[],"name":"Unhalted","type":"event"}];
let Receipter = parity.api.newContract(ReceipterABI, '0x7d8D1E1859cA759934Ed9784e9c142Df5d15EEba');

class Status extends ReactiveComponent {
	constructor() {
		super(['value']);
	}

	render () {
		if (this.state.value)
			return (<span className="_isActive _active">ACTIVE</span>);
		else
			return (<span className="_isActive _inactive">INACTIVE</span>);
	}
}

export class BalanceInput extends React.Component {
    constructor() {
		super();
        this.state = { value: 1 };
	}
}

class ContributionPanel extends ReactiveComponent {
	constructor() {
		super(['request', 'status']);
        let d = '1 ether';
        this.state = { valueRaw: d, value: interpretQuantity(d) };
	}
	isActive () { return this.state.status != null && this.state.status.during != null; }
	render () {
		return (<div>
			<Status
				value={this.isActive()}
			/>
            <br />
			<TextField
                floatingLabelText="How much to contribute?"
				hintText="1 ether"
                value={this.state.valueRaw}
                errorText={this.state.value === null ? 'Invalid quantity' : null}
                onChange={(e, v) => { this.setState({valueRaw: v, value: interpretQuantity(v)}); }}
			/>
            <br />
			<RaisedButton
				label="contribute"
				onClick={()=>{ this.props.onContribute(this.state.value); }}
				disabled={!this.isActive() || this.state.value === null || (this.state.request != null && !this.state.request.failed && !this.state.request.confirmed)}
			/>
            <br />
			<Progress request={this.state.request}/>
		</div>);
	}
}

export class Manager extends React.Component {
	constructor() {
		super();
		this.state = { current: null };
		this.status = ((h, b, e, c) => {
			if (c < b)
				return { before: { blocks: b - c } };
			if (c < e)
				if (h)
					return { halted: {} };
				else
					return { during: { blocks: e - c } };
			else
				return { ended: {} };
		}).bond(
			Receipter.instance.isHalted.call.bond(),
			Receipter.instance.beginBlock.call(),
			Receipter.instance.endBlock.call(),
			parity.bonds.blockNumber
		);
	}
	handleContribute (value) {
        if (value !== null)
            this.setState({ current: new Transaction({from: web3.eth.accounts[2], to: Receipter.instance.address, value: value}) });
        else
            window.alert(`Invalid value to contribute: ${value}`);
	}
	render () {
		return (<div>
            <div>Receipter is at: <Account address={Receipter.instance.address}/></div>
			<div>Total contributions: <Balance value={Receipter.instance.total.call.blockBond()}/></div>
			<ContributionPanel status={this.status} request={this.state.current} onContribute={this.handleContribute.bind(this)}/>
		</div>);
	}
}

export class App extends React.Component {
	constructor() {
		super();
	}
	render () {
		return (<div>
			<Toolbar>
				<ToolbarGroup>
		        	<ToolbarTitle text="Contribution" />
		        </ToolbarGroup>
			</Toolbar>
			<div style={{minHeight: '20em', padding: '2em'}}>
				<div>Current / Period: <BlockNumber value={parity.bonds.blockNumber}/>: <BlockNumber value={Receipter.instance.beginBlock.call.blockBond()}/> - <BlockNumber value={Receipter.instance.endBlock.call.blockBond()}/></div>
				<div>This is your coinbase: <RichAccount address={parity.api.eth.coinbase.secondBond()}/></div>
				<div>Your account is: <RichAccount address={'0x0048440ee17ee30817348949d2ec46647e8b6179'}/></div>
			</div>
			<Manager />
		</div>);
	}
}
/*

*/
////
// DEBUGGING

window.blockies = blockies;
window.interpretQuantity = interpretQuantity;
window.Receipter = Receipter;
window.Bond = Bond;
