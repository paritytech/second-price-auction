import moment from 'moment';
import React from 'react';
import {Button, Checkbox} from 'semantic-ui-react';
import {Bond, TransformBond, ReactivePromise} from 'oo7';
import {capitalizeFirstLetter, removeSigningPrefix, singleton, formatBlockNumber, bonds} from 'oo7-parity';
import {Rdiv, Rspan, ReactiveComponent} from 'oo7-react';
import {AccountIcon, BalanceBond, TransactButton, SigningProgressLabel, InlineBalance} from 'parity-reactive-ui';
import {DutchAuctionABI} from './abis.jsx';

function formatBalance(c) { return `${+c.div(1000000000000000000)} ether`; }

//var DutchAuction = singleton(() => bonds.makeContract('0x740C644B44d2B46EbDA31E6F87e3f4cA62120e0A', DutchAuctionABI));
//var DutchAuction = singleton(() => bonds.makeContract('0x856EDD7F20d39f6Ef560a7B118a007A9Bc5CAbfD', DutchAuctionABI));
//var DutchAuction = singleton(() => bonds.makeContract('0xC695F252Cb68021E99E020ebd3e817a82ADEe17F', DutchAuctionABI));
//var DutchAuction = singleton(() => bonds.makeContract('0xe643110fBa0b7a72BA454B0AE98c5Cb6345fe34A', DutchAuctionABI));
var DutchAuction = singleton(() => bonds.makeContract('0x2555734521a313a93Cc8d9bEB3B86D7B11F50ADF', DutchAuctionABI));

const divisor = 1000;

class ContributionPanel extends ReactiveComponent {
	constructor() {
		super(['request', 'signature'], {
			minPurchase: DutchAuction().currentPrice(),
			maxPurchase: DutchAuction().maxPurchase()
		});
        let d = '10 ether';
        this.spend = new Bond;
		this.theDeal = DutchAuction().theDeal(this.spend);
	}
	render () {
		return (<div id='contributionPanel'>
			<BalanceBond
				hintText="How much to spend?"
                bond={this.spend}
				disabled={!this.state.signature}
			/>
			<p style={{textAlign: 'center', margin: '1em 2em'}}>
				By spending <InlineBalance value={this.spend}/>, you will receive <Rspan>{this.theDeal.map(([accepted, refund, price, bonus]) =>
					<b>at least {Math.floor(accepted / price) / divisor} WLS</b>
				)}</Rspan>
				<Rspan>{this.theDeal.map(([_, r]) => r > 0
					? <span>and get <InlineBalance value={r}/> refunded</span>
					: '')
				}</Rspan>.
			</p>
			<TransactButton
				content="Purchase WLSs"
				tx={()=>this.props.onContribute(this.spend, this.state.signature)}
				disabled={this.spend.map(s => !this.state.signature || !s || +s < +this.state.minPurchase || (this.state.request && !this.state.request.failed && !this.state.request.confirmed))}
			/>
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
				onChange={ (_, c) => { if (c.checked) this.props.onRequest(); } }
				className='bigCheckbox'
			/>
		);
	}
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
    bonds.head.timestamp.map(t => t / 1000)
]));

class Manager extends ReactiveComponent {
	constructor() {
		super([], { status: contributionStatus() });
		this.state = { signing: null, contribution: null };
	}
	handleSign () {
		let that = this;
		bonds.me.then(me => {
			let signReq = bonds.sign(DutchAuction().STATEMENT().map(removeSigningPrefix), me);
			let signing = bonds.me.map(newMe => me === newMe ? signReq : null);
			that.setState({signing});
		});
	}
	handleContribute (value, signature) {
		let t = DutchAuction().buyin(...signature, { value });
		this.setState({
			contribution: t
		});
		return t;
	}
	render () {
        return (this.state.status && this.state.status.active)
          ? (
			<div>
			  <section id='terms'>
				<h1>Terms and Conditions</h1>
				<p>TODO: Put some terms and conditions here</p>
				<TermsPanel
				  request={this.state.signing}
	  			  onRequest={this.handleSign.bind(this)}
				/>
			  </section>
			  <section id='action'>
				<h1>Send Funds</h1>
				<ContributionPanel
				  signature={this.state.signing ? this.state.signing.map(s => (s && s.signed || null)) : null}
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
		let minFinal = Bond.all([DutchAuction().tokenCap(), DutchAuction().totalReceived()]).map(([a, b]) => b.div(a));
		return this.state.isActive ?
			(<p>
				<Rspan>{DutchAuction().tokenCap().map(t => `${t / divisor}`)}</Rspan> WLSs to be sold! <br/>
				<InlineBalance value={DutchAuction().totalReceived()}/> raised so far!<br/>
				Auction will close <Rspan>{DutchAuction().endTime().map(t => moment.unix(t).fromNow())}</Rspan> <i>at the latest</i>!<br/>
				Final price will be at least <InlineBalance value={minFinal}/> per WLS!
			</p>) :
			+this.state.totalReceived > 0 ?
			(<p>
				Auction closed <Rspan>{DutchAuction().endTime().map(t => moment.unix(t).fromNow())}</Rspan>:<br/>
				{formatBalance(this.state.totalReceived)} raised in total!<br/>
			</p>) :
			(<p>
				Auction will begin <Rspan>{DutchAuction().beginTime().map(t => moment.unix(t).fromNow())}</Rspan>!
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
				<div>WLSs Left</div>
				<Rdiv
					className='_fieldValue _basic'
				>{DutchAuction().tokensAvailable().map(t => `${t / divisor}`)}</Rdiv>
			  </div>
			  <div className={'field'}>
				<div>Current Price</div>
				<div
					className='_fieldValue _basic'
				><InlineBalance value={DutchAuction().currentPrice().map(x => x.times(1000))} defaultDenom='finney'/></div>
			  </div>
			  <div className={'field'}>
				<div>Max Purchase</div>
				<div
					className='_fieldValue _basic'
				><InlineBalance value={DutchAuction().maxPurchase()} defaultDenom='ether'/></div>
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

export class App extends ReactiveComponent {
	constructor() {
		super([], { purchased: bonds.accounts.mapEach(a => DutchAuction().participants(a)).map(bs => bs.reduce((x, a) => [x[0].add(a[0]), x[1].add(a[1])])) });
		window.bonds = bonds;
		window.DutchAuction = DutchAuction;
		window.formatBalance = formatBalance;
	}
	render () {
		let purchased = this.state.purchased;
		return purchased == null ? <div/> : (<div className='site'>
			<header>
			  <nav className='nav-header'>
				<div className='container'>
				  <span id='logo'>
					<AccountIcon address={DutchAuction().address} id='logoIcon'/>
					WHITELABEL
				  </span>
				</div>
			  </nav>
			</header>
			<div className='site-content'>
			  <section className='contrib-hero'>
				<div className='container'>
				  <div className='row'>
					<div id='status'>
					  <div id='status-title'>
						<h1>Get yer <span style={{fontSize: '21pt'}}>WLS</span>s!</h1>
						<Subtitling />
					  </div>
					  <div className='status-rest'>
						<div>
						  <div className='title'>Network<br />Summary</div>
						  <div className='field'>
							<div>Status</div>
							<Rdiv
							  className={bonds.peerCount.map(c => '_fieldValue ' + (c > 0 ? '_online' : '_offline'))}
							>{bonds.peerCount.map(c => c > 0 ? '● Online' : '○ Offline')}</Rdiv>
						  </div>
						  <div className='field'>
							<div>Network</div>
							<Rdiv
							  className={bonds.chainName.map(c => '_fieldValue _' + c)}
							>{bonds.chainName.map(capitalizeFirstLetter)}</Rdiv>
						  </div>
						  <div className='field'>
							<div>Number</div>
							<Rdiv
							  className='_fieldValue _basic'
							>{bonds.height.map(formatBlockNumber)}</Rdiv>
						  </div>
						</div>
						<AuctionSummary />
					  </div>
					</div>
				  </div>
				</div>
			  </section>
			  {
				+purchased == 0 ? null : (<section className='state-main'>
					<div className='container'>
					  You spent <InlineBalance value={purchased[0].sub(purchased[1])} /> to buy at least <Rspan>{DutchAuction().currentPrice().map(_ => ''+Math.floor(purchased[0].div(_)) / divisor)}</Rspan> WLS
					</div>
				</section>)
			  }
			  <section className='contrib-main'>
				<div className='container'>
				  <div className='row'>
					<Manager />
				  </div>
				</div>
			  </section>
			</div>

			<footer className='page-footer'>
			  <div className='container'>
				<div className='row'>
				  <h1>The Second Price Auction ÐApp.</h1>
				  Made with &lt;3 by Parity Technologies, 2017.
				</div>
			  </div>
			</footer>
		</div>);
	}
}
