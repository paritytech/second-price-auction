import styles from "../style.css";

import BigNumber from 'bignumber.js';
import blockies from 'blockies';
import moment from 'moment';

import {Bond, TimeBond, TransformBond} from 'oo7';

import React from 'react';
import {render} from 'react-dom';

import RaisedButton from 'material-ui/RaisedButton';
import TextField from 'material-ui/TextField';
import {Toolbar, ToolbarGroup, ToolbarSeparator, ToolbarTitle} from 'material-ui/Toolbar';

////
// Parity Utilities

export function capitalizeFirstLetter(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

export function singleton(f) {
    var instance = null;
    return function() {
        if (instance === null)
            instance = f();
        return instance;
    }
}

export function createIdentityImg (address, scale = 8) {
  return blockies({
    	seed: (address || '').toLowerCase(),
    	size: 8,
    	scale
    }).toDataURL();
}

export const denominations = [ "wei", "Kwei", "Mwei", "Gwei", "szabo", "finney", "ether", "grand", "Mether", "Gether", "Tether", "Pether", "Eether", "Zether", "Yether", "Nether", "Dether", "Vether", "Uether" ];

export function denominationMultiplier(s) {
    let i = denominations.indexOf(s);
    if (i < 0)
        throw "Invalid denomination";
    return (new BigNumber(1000)).pow(i);
}

export function interpretQuantity(s) {
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

export function splitValue(a) {
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

export function formatBlockNumber(n) {
    return '#' + ('' + n).replace(/(\d)(?=(\d{3})+$)/g, "$1,");
}

////
// Bond
/*
export class Bond {
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

    map(f) {
        return new TransformBond(f, [this]);
    }
}

/// f is function which returns a promise. a is a set of dependencies
/// which must be passed to f as args. d are dependencies whose values are
/// unneeded. any entries of a which are reactive promises then is it their
/// underlying value which is passed.
///
/// we return a bond (an ongoing promise).
export class TransformBond extends Bond {
	constructor(f, a = [], d = [], context = parity.api) {
		super();
		this.f = f;
		this.a = a;
		this.context = context;
		d.forEach(i => i.subscribe((() => this.poll()).bind(this)));
		var nd = 0;
		a.forEach(i => {
			if (i instanceof Bond) {
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
		if (this.a.findIndex(i => (i instanceof Bond && !i.ready()) || (i instanceof Promise && typeof(i.v) === 'undefined')) != -1)
			return;	// still have undefined params.
		let r = this.f.apply(this.context, this.a.map(i => (i instanceof Bond || i instanceof Promise) ? i.v : i));
		if (r instanceof Promise)
			r.then(this.changed.bind(this));
		else
			this.changed(r);
	}
	drop () {
		// TODO clear up all our dependency `.subscribe`s.
	}
}

export class TimeBond extends Bond {
	constructor() {
		super();
		this.interval = window.setInterval(this.trigger.bind(this), 1000);
		this.trigger();
	}
	trigger() {
		this.fire.forEach(f => f(Date.now()));
	}
	drop () {
		window.clearInterval(this.interval);
	}
}
*/
////
// PARITY.JS EXTENSIONS

export function installBonds() {
    {
    	var bonds = {};
        bonds.time = new TimeBond;
    	bonds.blockNumber = new SubscriptionBond('eth_blockNumber');
    	bonds.accountsInfo = new TransformBond(parity.api.parity.accountsInfo, [], [bonds.time]); //new SubscriptionBond('parity_accountsInfo');
        bonds.netChain = new TransformBond(parity.api.parity.netChain, [], [bonds.time]);
        bonds.peerCount = new TransformBond(parity.api.net.peerCount, [], [bonds.time]);
    	window.parity.bonds = bonds;
    }

    Function.__proto__.bond = function(...args) { return new TransformBond(this, args); };
    Function.__proto__.timeBond = function(...args) { return new TransformBond(this, args, [parity.bonds.time]); };
    Function.__proto__.blockBond = function(...args) { return new TransformBond(this, args, [parity.bonds.blockNumber]); };
}

// TODO: Use more generic means to check on number, ideally push notification.
export class SubscriptionBond extends Bond {
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

export class Transaction extends Bond {
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
// GENERIC REACT/BOND COMPONENTS

export class ReactiveComponent extends React.Component {
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
			if (this.extraState[f] instanceof Bond)
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
				if (props[f] instanceof Bond)
					props[f].drop();

				if (nextProps[f] instanceof Bond)
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

export class Reactive extends ReactiveComponent {
    constructor() { super(['value', 'className']); }

	render() {
        let className = typeof(this.state.className) === 'function' ?
            this.state.className(this.state.value) :
            typeof(this.state.className) === 'string' ?
            this.state.className :
            '';
        let undefClassName = this.props.undefClassName === null ? '_undefined' : this.props.undefClassName;
        let undefContent = this.props.undefContent === null ? '?' : this.props.undefContent;
		if (this.state.value === null || typeof(this.state.value) == 'undefined')
			return (<span className={undefClassName}>{undefContent}</span>);
        let a = this.props.transform ? this.props.transform(this.state.value) : this.state.value;
		return <span className={className}>{a}</span>;
	}
}

////
// PARITY/REACT/BOND COMPONENTS

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
        let classes = this.props.classes === null ? '_blocknumber' : this.props.classes;
        let undefClasses = this.props.undefClasses === null ? '_blocknumber _undefined' : this.props.undefClasses;
        let undefContent = this.props.undefContent === null ? '?' : this.props.undefContent;
		if (this.state.value === null || typeof(this.state.value) == 'undefined')
			return (<span className={undefClasses}>{undefContent}</span>);
		var a = ('' + this.state.value).replace(/(\d)(?=(\d{3})+$)/g, "$1,");
		return <span className={classes}>#{a}</span>;
	}
};

export class AccountIcon extends ReactiveComponent {
	constructor() { super(['address', 'className']); }

	render() {
		if (typeof(this.state.address) == "string") {
			return (<img
                src={createIdentityImg(this.state.address)}
                className={typeof(this.state.className) === 'string' ? this.state.className : ''}
                id={this.props.id}
                data-address-img
            />);
		} else {
			return (<span className={this.props.undefClassName}>{this.props.undefContent}</span>);
		}
	}
};
AccountIcon.defaultProps = {
  className: '_accountIcon',
  undefClassName: '_accountIcon _undefined',
  undefContent: '',
  id: null
}

export class Account extends ReactiveComponent {
	constructor() { super(['address'], {accountsInfo: parity.bonds.accountsInfo}); }

	render() {
		if (typeof(this.state.address) == "string") {
			let i = this.state.accountsInfo != null ? this.state.accountsInfo[parity.api.util.toChecksumAddress(this.state.address)] : null;
			var a = i == null ? this.state.address.substr(0, 8) + "…" + this.state.address.substr(38) : i.name;
			return (<span className="_account">
				{this.props.icon ? (<img src={createIdentityImg(this.state.address)} className={'_identigram'} data-address-img style={{marginRight: '0.5ex'}}/>) : ''}
				{this.props.text ? a : ''}
			</span>);
		} else {
			return <span className="undefined _account">[null]</span>;
		}
	}
};
Account.defaultProps = {
  icon: true,
  text: true
}

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

export class TransactionProgress extends ReactiveComponent {
	constructor() {
		super(['request']);
	}

	render () {
		if (typeof(this.state.request) != 'object' || this.state.request == null)
			return (<div className='_progress _null'/>);
		var x;
		if (x = this.state.request.requested)
			return (<div className='_progress _authorising'>Authorising transaction...</div>);
		if (x = this.state.request.signed)
			return (<div className='_progress _submitting'>Confirming transaction...</div>);
		if (x = this.state.request.confirmed)
			return (<div className='_progress _confirmed'>Confirmed at <BlockNumber value={x.blockNumber}/></div>);
		if (x = this.state.request.failed)
			return (<div className='_progress _failed'>Failed: {x.text}</div>);
		return (<div>???</div>);
	}
}

export class BalanceInput extends React.Component {
    constructor() {
		super();
        this.state = { value: 1 };
	}
}

////
// APPLICATION

const ReceipterABI = [{"constant":true,"inputs":[],"name":"endBlock","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"total","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"","type":"address"}],"name":"record","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":false,"inputs":[],"name":"kill","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[],"name":"halt","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"treasury","outputs":[{"name":"","type":"address"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_recipient","type":"address"}],"name":"receiveFrom","outputs":[],"payable":true,"type":"function"},{"constant":true,"inputs":[],"name":"beginBlock","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"isHalted","outputs":[{"name":"","type":"bool"}],"payable":false,"type":"function"},{"constant":false,"inputs":[],"name":"unhalt","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"admin","outputs":[{"name":"","type":"address"}],"payable":false,"type":"function"},{"inputs":[{"name":"_admin","type":"address"},{"name":"_treasury","type":"address"},{"name":"_beginBlock","type":"uint256"},{"name":"_endBlock","type":"uint256"}],"payable":false,"type":"constructor"},{"payable":true,"type":"fallback"},{"anonymous":false,"inputs":[{"indexed":true,"name":"recipient","type":"address"},{"indexed":false,"name":"amount","type":"uint256"}],"name":"Received","type":"event"},{"anonymous":false,"inputs":[],"name":"Halted","type":"event"},{"anonymous":false,"inputs":[],"name":"Unhalted","type":"event"}];
let Receipter = parity.api.newContract(ReceipterABI, '0x7d8D1E1859cA759934Ed9784e9c142Df5d15EEba');

class ContributionPanel extends ReactiveComponent {
	constructor() {
		super(['request']);
        let d = '1 ether';
        this.state = { valueRaw: d, value: interpretQuantity(d) };
	}
	render () {
		return (<div id="contributionPanel">
			<TextField
                floatingLabelText="How much to contribute?"
				hintText="1 ether"
                value={this.state.valueRaw}
                errorText={this.state.value === null ? 'Invalid quantity' : null}
                onChange={(e, v) => { this.setState({valueRaw: v, value: interpretQuantity(v)}); }}
			/>
			<RaisedButton
				label="contribute"
				onClick={()=>{ this.props.onContribute(this.state.value); }}
				disabled={this.state.value === null || (this.state.request != null && !this.state.request.failed && !this.state.request.confirmed)}
			/>
			<TransactionProgress request={this.state.request}/>
		</div>);
	}
}

let contributionStatus = singleton(() => new TransformBond((h, b, e, c) =>
    c < b ? { before: { start: b, after: b - c } } :
    c >= e ? { after: { end: e, ago: c - e } } :
    h ? { halted: {} } :
    { active: { done: c - b, have: e - c } }
, [
    Receipter.instance.isHalted.call.bond(),
    Receipter.instance.beginBlock.call(),
    Receipter.instance.endBlock.call(),
    parity.bonds.blockNumber
]));

function niceStatus(s) {
    let blocksToTime = blocks => moment.unix(0).to(moment.unix(blocks * 15));
    return s.before ? `Starts ${blocksToTime(s.before.after)}` :
        s.after ? `Ended ${blocksToTime(-s.after.ago)}` :
        s.halted ? `Halted` :
        `Open for another ${blocksToTime(s.active.have).replace('in ', '')}`;
}

let contributionTotal = singleton(() => Receipter.instance.total.call.blockBond());

export class Manager extends ReactiveComponent {
	constructor() {
		super([], { status: contributionStatus() });
		this.state = { current: null };
	}
	handleContribute (value) {
        if (value !== null)
            this.setState({ current: new Transaction({from: web3.eth.accounts[2], to: Receipter.instance.address, value: value}) });
	}
	render () {
        if (this.state.status && this.state.status.active)
		    return <ContributionPanel request={this.state.current} onContribute={this.handleContribute.bind(this)}/>;
        else
            return <h2>Contribution period not active</h2>;
	}
}

export class App extends React.Component {
	constructor() {
		super();
	}
	render () {
		return (<div className={'site'}>
          <header>
            <nav className={'nav-header'}>
              <div className={'container'}>
                <span id="logo"><AccountIcon address={Receipter.instance.address} id='logoIcon'/>SKELETON CONTRIBUTION</span>
              </div>
            </nav>
          </header>
          <div className={'site-content'}>
            <section className={'contrib-hero'}>
              <div className={'container'}>
                <div className={'row'}>
                  <div id="status">
                    <div id="status-title">
                      <h1>Contribution</h1>
                      Contribute to our mission's success
                    </div>
                    <div className={'status-rest'}>
                      <div>
                        <div className={'title'}>Network<br />Summary</div>
                        <div className={'field'}>
                          <div>Status</div>
                          <Reactive value={parity.bonds.peerCount.map(c => c > 0 ? '● Online' : '○ Offline')} className={parity.bonds.peerCount.map(c => '_fieldValue ' + (c > 0 ? '_online' : '_offline'))}/>
                        </div>
                        <div className={'field'}>
                          <div>Network</div>
                          <Reactive value={parity.bonds.netChain.map(capitalizeFirstLetter)} className={parity.bonds.netChain.map(c => '_fieldValue _' + c)} />
                        </div>
                        <div className={'field'}>
                          <div>Number</div>
                          <Reactive value={parity.bonds.blockNumber.map(formatBlockNumber)} className='_fieldValue _basic' />
                        </div>
                      </div>
                      <div>
                        <div className={'title'}>Contribution<br />Summary</div>
                        <div className={'field'}>
                          <div>Status</div>
                          <Reactive value={contributionStatus().map(niceStatus)} className={contributionStatus().map(s => '_fieldValue ' + (s.active ? '_active' : s.before ? '_before' : '_after'))} />
                        </div>
                        <div className={'field'}>
                          <div>Received</div>
                          <Reactive value={contributionTotal().map(c => `${+c.div(1000000000000000) / 1000} ETH`)} className='_fieldValue _basic' />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
            <section className={'contrib-main'}>
              <div className={'container'}>
                <div className={'row'}>
                  <section id="terms">
                    <h1>Terms and Conditions</h1>
                    I hereby confirm I have read all applicable terms and conditions.
                  </section>
                  <section id="action">
                    <h1>Send Funds</h1>
                    <Manager />
                  </section>
                </div>
              </div>
            </section>
          </div>

          <footer className={'page-footer'}>
            <div className={'container'}>
              <div className={'row'}>
                <h1>The Skeleton Contribution Dapplication.</h1>
                Made with &lt;3 by the Skeleton Contribution Dapplication Authors, 2017.
              </div>
            </div>
          </footer>
		</div>);
	}
}
/*
<div style={{minHeight: '20em', padding: '2em'}}>
    <div>Current / Period: : <BlockNumber value={Receipter.instance.beginBlock.call.blockBond()}/> - <BlockNumber value={Receipter.instance.endBlock.call.blockBond()}/></div>
    <div>This is your coinbase: <RichAccount address={parity.api.eth.coinbase.timeBond()}/></div>
    <div>Your account is: <RichAccount address={'0x0048440ee17ee30817348949d2ec46647e8b6179'}/></div>
    <div>Receipter is at: <Account address={Receipter.instance.address}/></div>
</div>

*/
////
// DEBUGGING

window.blockies = blockies;
window.interpretQuantity = interpretQuantity;
window.Receipter = Receipter;
window.Bond = Bond;
window.TransformBond = TransformBond;
window.moment = moment;
