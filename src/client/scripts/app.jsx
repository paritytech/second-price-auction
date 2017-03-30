import moment from 'moment';
import vagueTime from 'vague-time';
import React from 'react';
import RaisedButton from 'material-ui/RaisedButton';
import TextField from 'material-ui/TextField';
import Checkbox from 'material-ui/Checkbox';
import {Bond, TransformBond} from 'oo7';
import {Transaction, Signature, capitalizeFirstLetter, singleton, interpretQuantity, formatBlockNumber} from 'oo7-parity';
import {Rdiv, Rspan, ReactiveComponent} from 'oo7-react';
import {AccountIcon, TransactionProgress, SignatureProgress} from 'parity-reactive-ui';
import styles from "../style.css";
import {DutchAuctionABI} from './abis.jsx';

function formatBalance(c) { return `${+c.div(1000000000000000000)} ETH`; }

//var DutchAuction = singleton(() => parity.bonds.makeContract('0x740C644B44d2B46EbDA31E6F87e3f4cA62120e0A', DutchAuctionABI));
var DutchAuction = singleton(() => parity.bonds.makeContract('0x856EDD7F20d39f6Ef560a7B118a007A9Bc5CAbfD', DutchAuctionABI));
//var DutchAuction = singleton(() => parity.bonds.makeContract('0xe643110fBa0b7a72BA454B0AE98c5Cb6345fe34A', DutchAuctionABI));

class ContributionPanel extends ReactiveComponent {
	constructor() {
		super(['request', 'signature'], { minPurchase: DutchAuction().currentPrice(), maxPurchase: DutchAuction().maxPurchase() });
        let d = '10 ether';
        this.state = { valueRaw: d, value: interpretQuantity(d) };
	}
	render () {
		return (<div id="contributionPanel">
			<TextField
                floatingLabelText="How much to spend?"
				hintText="1 ether"
                value={this.state.valueRaw}
                errorText={this.state.value === null ? 'Invalid quantity' : null}
                onChange={(e, v) => { this.setState({valueRaw: v, value: interpretQuantity(v)}); }}
				disabled={!this.state.signature}
			/>
			<p style={{textAlign: 'center', margin: '1em 2em'}}>By spending <Rspan>{formatBalance(this.state.value)}</Rspan> now, you will receive <b>at least <Rspan>{DutchAuction().currentPrice().map(p => Math.floor(+this.state.value / p))}</Rspan></b> DOT tokens, paying <b>at most <Rspan>{DutchAuction().currentPrice().map(formatBalance)}</Rspan></b> per DOT</p>
			<RaisedButton
				label="spend"
				onClick={()=>{ this.props.onContribute(this.state.value, this.state.signature); }}
				disabled={!this.state.signature || !this.state.value || +this.state.value > +this.state.maxPurchase || +this.state.value < +this.state.minPurchase || (this.state.request && !this.state.request.failed && !this.state.request.confirmed)}
			/>
			<TransactionProgress request={this.state.request}/>
		</div>);
	}
}

class TermsPanel extends ReactiveComponent {
	constructor() {
		super(['request']);
	}
	render() {
		return (
			<Checkbox
				label='I hereby confirm I have read all applicable terms and conditions. Please accept my contribution.'
				checked={this.state.request ? !!this.state.request.signed : false}
				disabled={this.state.request ? !!this.state.request.requested : false}
				onCheck={ (_, c) => { if (c) this.props.onRequest(); } }
				iconStyle={{width: '3em', height: '3em'}}
				labelStyle={{fontSize: '16pt', lineHeight: 'normal'}}
				className='bigCheckbox'
			/>
		);
	}
}

function splitSignature(vrs) {
	return [vrs.substr(0, 4), `0x${vrs.substr(4, 64)}`, `0x${vrs.substr(68, 64)}`];
}

let contributionStatus = singleton(() => new TransformBond((h, b, e, c) =>
    c < b ? { before: { start: b, after: b - c } } :
    c >= e ? { after: { end: e, ago: c - e } } :
    h ? { halted: {} } :
    { active: { done: c - b, have: e - c } }
, [
    DutchAuction().halted(),
    DutchAuction().beginTime(),
    DutchAuction().endTime(),
    parity.bonds.block.timestamp.map(t => t / 1000)
]));

class Manager extends ReactiveComponent {
	constructor() {
		super([], { status: contributionStatus() });
		this.state = { signing: null, contribution: null };
		// reset state if identity changed.
		this.resetSigWhenAccountChanged = new TransformBond(() => this.setState({ signing: null, contribution: this.state.contribution }), [], [parity.bonds.accounts[0]]);
	}
	handleSign () {
		this.setState({
			signing: new Signature(parity.bonds.accounts[0], DutchAuction().STATEMENT().map(s => s.substr(28))).subscriptable(),
			contribution: this.state.contribution
		});
	}
	handleContribute (value, signature) {
		this.setState({
			signing: this.state.signing,
			contribution: DutchAuction().buyin(...splitSignature(signature), { from: parity.bonds.accounts[0], value })
		});
	}
	render () {
        return (this.state.status && this.state.status.active)
          ? (
			<div>
			  <section id="terms">
				<h1>Terms and Conditions</h1>
				<p>TODO: Put some terms and conditions here</p>
				<TermsPanel
				  request={this.state.signing}
	  			  onRequest={this.handleSign.bind(this)}
				/>
			  </section>
			  <section id="action">
				<h1>Send Funds</h1>
				<ContributionPanel
				  signature={this.state.signing ? this.state.signing.signed : null}
	              request={this.state.contribution}
	              onContribute={this.handleContribute.bind(this)}
	            />
			  </section>
			</div>
		  )
		  : (<h2 style={{textAlign: 'center', margin: '10em'}}>Contribution period not active</h2>);
	}
}

class Subtitling extends ReactiveComponent {
	constructor () {
		super([], { isActive: DutchAuction().isActive(), allFinalised: DutchAuction().allFinalised(), totalReceived: DutchAuction().totalReceived() });
	}
	render () {
		let minFinal = Bond.all([DutchAuction().tokenCap(), DutchAuction().totalReceived()]).map(([a, b]) => formatBalance(b.div(a)));
		return this.state.isActive ?
			(<p>
				<Rspan>{DutchAuction().tokenCap().map(t => `${t}`)}</Rspan> DOTs to be sold! <br/>
				<Rspan>{DutchAuction().totalReceived().map(formatBalance)}</Rspan> raised so far!<br/>
				Auction will close <Rspan>{DutchAuction().endTime().map(t => vagueTime.get({ to: new Date(t * 1000) }))}</Rspan> <i>at the latest</i>!<br/>
				Final price will be at least <Rspan>{
					minFinal
				}</Rspan> per DOT!
			</p>) :
			+this.state.totalReceived > 0 ?
			(<p>
				Auction closed <Rspan>{DutchAuction().endTime().map(t => vagueTime.get({ to: new Date(t * 1000) }))}</Rspan>:<br/>
				{formatBalance(this.state.totalReceived)} raised in total!<br/>
			</p>) :
			(<p>
				Auction will begin <Rspan>{DutchAuction().beginTime().map(t => vagueTime.get({ to: new Date(t * 1000) }))}</Rspan>!
			</p>);
	}
}

class AuctionSummary extends ReactiveComponent {
	constructor () {
		super([], { isActive: DutchAuction().isActive(), allFinalised: DutchAuction().allFinalised(), totalReceived: DutchAuction().totalReceived() });
	}
	render () {
		return this.state.isActive ?
			(<div>
			  <div className={'title'}>Auction<br />Summary</div>
			  <div className={'field'}>
				<div>DOTs Left</div>
				<Rdiv
					className='_fieldValue _basic'
				>{DutchAuction().tokensAvailable().map(t => `${t}`)}</Rdiv>
			  </div>
			  <div className={'field'}>
				<div>Current Price</div>
				<Rdiv
					className='_fieldValue _basic'
				>{DutchAuction().currentPrice().map(c => `${+c.div(1000000000000000000)} ETH`)}</Rdiv>
			  </div>
			  <div className={'field'}>
				<div>Max Purchase</div>
				<Rdiv
					className='_fieldValue _basic'
				>{DutchAuction().maxPurchase().map(formatBalance)}</Rdiv>
			  </div>
			</div>) :
			+this.state.totalReceived > 0 ?
			(<div>
			  <div className={'title'}>Auction<br />Summary</div>
			  <div className={'field'}></div>
			  <div className={'field'}>
				<div>Closing Price</div>
				<Rdiv
					className='_fieldValue _basic'
				>{DutchAuction().tokenCap().map(r => `${this.state.totalReceived.div(1000000000000000000) / r} ETH`)}</Rdiv>
			  </div>
			  <div className={'field'}>
			  </div>
			</div>) :
			(<div>
			  <div className={'title'}>Auction<br />Summary</div>
			  <div className={'field'}></div>
			  <div className={'field'}>
				<div>Not yet started</div>
			  </div>
			  <div className={'field'}>
			  </div>
			</div>);
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
				  <span id="logo">
					<AccountIcon address={DutchAuction().address} id='logoIcon'/>
					POLKADOT DUTCH AUCTION
				  </span>
				</div>
			  </nav>
			</header>
			<div className={'site-content'}>
			  <section className={'contrib-hero'}>
				<div className={'container'}>
				  <div className={'row'}>
					<div id="status">
					  <div id="status-title">
						<h1>Get yer <span style={{fontSize: '21pt'}}>DOT</span>s!</h1>
						<Subtitling />
					  </div>
					  <div className={'status-rest'}>
						<div>
						  <div className={'title'}>Network<br />Summary</div>
						  <div className={'field'}>
							<div>Status</div>
							<Rdiv
							  className={parity.bonds.peerCount.map(c => '_fieldValue ' + (c > 0 ? '_online' : '_offline'))}
							>{parity.bonds.peerCount.map(c => c > 0 ? '● Online' : '○ Offline')}</Rdiv>
						  </div>
						  <div className={'field'}>
							<div>Network</div>
							<Rdiv
							  className={parity.bonds.netChain.map(c => '_fieldValue _' + c)}
							>{parity.bonds.netChain.map(capitalizeFirstLetter)}</Rdiv>
						  </div>
						  <div className={'field'}>
							<div>Number</div>
							<Rdiv
							  className='_fieldValue _basic'
							>{parity.bonds.blockNumber.map(formatBlockNumber)}</Rdiv>
						  </div>
						</div>
						<AuctionSummary />
					  </div>
					</div>
				  </div>
				</div>
			  </section>
			  <section className={'contrib-main'}>
				<div className={'container'}>
				  <div className={'row'}>
					<Manager />
				  </div>
				</div>
			  </section>
			</div>

			<footer className={'page-footer'}>
			  <div className={'container'}>
				<div className={'row'}>
				  <h1>The Polkadot Dutch Crowd Auction ÐApp.</h1>
				  Made with &lt;3 by Parity Technologies, 2017.
				</div>
			  </div>
			</footer>
		</div>);
	}
}
 //moment.unix(t).fromNow()
