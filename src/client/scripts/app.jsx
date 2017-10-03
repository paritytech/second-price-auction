import moment from 'moment';
import countries from 'i18n-iso-countries';
import React from 'react';
import BigNumber from 'bignumber.js';
import {Button, Checkbox, Label, Flag, Message} from 'semantic-ui-react';
import {Bond, TransformBond, ReactivePromise} from 'oo7';
import {hexToAscii, capitalizeFirstLetter, removeSigningPrefix, singleton, formatBlockNumber, bonds} from 'oo7-parity';
import {Rdiv, Rspan, ReactiveComponent} from 'oo7-react';
import {AccountIcon, BalanceBond, TransactButton, SigningProgressLabel, InlineBalance} from 'parity-reactive-ui';
import {DutchAuctionABI, CertifierABI} from './abis.jsx';

const tokenDivisor = 1000;
const tokenTLA = 'DOT';

class TokenBalance extends ReactiveComponent {
	constructor () {
		super(['value']);
	}
	readyRender () {
		let n = Math.round(+this.state.value) / tokenDivisor;
		n = ('' + n).replace(/(\d)(?=(\d{3})+(\.|$))/g, "$1,")
		let m = n.match(/([^\.]*)(.*)$/);
		let whole = m[1];
		let decimals = m[2];
		return (<span><b>{whole}<span style={{fontSize: '85%', opacity: 0.66}}>{decimals}</span></b> <span style={{fontSize: '85%'}}>{tokenTLA}</span></span>);
	}
}

var drawSparkline = function(c, line, filled, cutoff) {
	if (window.HTMLCanvasElement && c) {
		let ctx = c.getContext('2d');
		let height = c.height - 5;
		let width = c.width;
		let total = Math.min(line.length, cutoff);
		let maxfilled = Math.max.apply(Math, filled);

		let deriv = [];
		for (var i = 0; i < line.length; ++i) {
			deriv[i] = filled[i];// / line[i];
		}
		let maxderiv = Math.max.apply(Math, deriv);

		let max = 1; //maxfilled * 8;
		let xstep = width / Math.max(line.length, 12 * 24 * 2);
		let ystep = (height - 6) / maxderiv;

		/*if (window.devicePixelRatio) {
			c.width = c.width * window.devicePixelRatio;
			c.height = c.height * window.devicePixelRatio;
			c.style.width = (c.width / window.devicePixelRatio) + 'px';
			c.style.height = (c.height / window.devicePixelRatio) + 'px';
			c.style.display = 'inline-block';
			ctx.resetTransform();
			ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
		}*/
		ctx.clearRect(0, 0, width, height);
/*
		{
			ctx.beginPath();
			ctx.strokeStyle = 'red';
			let x = 0;
			let y = height - line[0] * ystep;
			ctx.moveTo(x, y);
			for (let i = 1; i < total; i = i + 1) {
				x = x + xstep;
				y = height - line[i] * ystep + 2;
				ctx.lineTo(x, y);
			}
			ctx.stroke();
		}

		{
			ctx.beginPath();
			ctx.strokeStyle = 'blue';
			let x = 0;
			let y = height - filled[0] * ystep;
			ctx.moveTo(x, y);
			for (let i = 1; i < total; i = i + 1) {
				x = x + xstep;
				y = height + 2 - Math.max(1, filled[i] * ystep);
				ctx.moveTo(x, height + 2);
				ctx.lineTo(x, y);
			}
			ctx.stroke();
		}
*/
		{
			let x = 0;
			let y = height - 4 - deriv[0] * ystep;
			for (let i = 1; i < total; ++i) {
				ctx.beginPath();
				ctx.moveTo(x, y);
				x = x + xstep;
				y = height - 4 - deriv[i] * ystep;
//				ctx.moveTo(x, height + 2);
				let a = Math.max(0.25, (i - total + 100) / 100);
				ctx.strokeStyle = `rgba(0, 0, 0, ${a})`;
				ctx.lineWidth = 1 + Math.max(0, (i - total + 100) / 50);
				ctx.lineTo(x, y);
				ctx.stroke();
			}
		}


/*
		if (endpoint && style == 'line') {
			ctx.beginPath();
			ctx.fillStyle = 'rgba(255,0,0,0.5)';
			ctx.arc(x, y, 1.5, 0, Math.PI*2);
			ctx.fill();
		}*/
	}
};

class Eras extends ReactiveComponent {
	constructor () {
		super(['data']);
		this.state = { cutoff: 0 };
	}
	componentDidMount () {
		this.t = window.setInterval(() => {
			if (this.state.data) {
				if (this.state.cutoff >= this.state.data.erasCap.length) {
					window.clearInterval(this.t);
				} else {
					this.setState({ cutoff: this.state.cutoff + 5 });
				}
			}
		}, 5);
	}
	componentWillUnmount () {
		window.clearInterval(this.t);
	}

	updateCanvas (canvas) {
		if (canvas) {
			drawSparkline(canvas, this.state.data.erasCap, this.state.data.erasAccounted, this.state.cutoff);
		}
	}
	readyRender () {
		return (<canvas ref={this.updateCanvas.bind(this)} width={this.props.width} height={this.props.height}></canvas>);
	}
}

//var DutchAuction = singleton(() => bonds.makeContract('0x740C644B44d2B46EbDA31E6F87e3f4cA62120e0A', DutchAuctionABI));
//var DutchAuction = singleton(() => bonds.makeContract('0x856EDD7F20d39f6Ef560a7B118a007A9Bc5CAbfD', DutchAuctionABI));
//var DutchAuction = singleton(() => bonds.makeContract('0xC695F252Cb68021E99E020ebd3e817a82ADEe17F', DutchAuctionABI));
//var DutchAuction = singleton(() => bonds.makeContract('0xe643110fBa0b7a72BA454B0AE98c5Cb6345fe34A', DutchAuctionABI));
var DutchAuction = singleton(() => bonds.makeContract(bonds.registry.lookupAddress('polkadotauction', 'A'), DutchAuctionABI));
var Certifier = singleton(() => bonds.makeContract(DutchAuction().certifier(), CertifierABI));

class ContributionPanel extends ReactiveComponent {
	constructor() {
		super(['request', 'signature'], {
			minPurchase: DutchAuction().currentPrice(),
			maxPurchase: DutchAuction().maxPurchase()
		});
        this.spend = new Bond;
	}
	render () {
		var theDeal = DutchAuction().theDeal(this.spend);
		return (<div id='contributionPanel'>
			<BalanceBond
				hintText="How much to spend?"
                bond={this.spend}
				disabled={!this.state.signature}
			/>
			<p style={{textAlign: 'center', margin: '1em 2em'}}>
				<Rspan>{theDeal.map(([_, r]) => r
					? <span>
						<InlineBalance value={this.spend}/> is greater than the maximum spend.
					</span>
					: <span>
						By spending <InlineBalance value={this.spend}/>, you will receive <Rspan>{theDeal.map(([accepted, refund, price]) =>
							<b>at least <TokenBalance value={accepted / price}/></b>
						)}</Rspan> when the network launches
					</span>
				)}</Rspan>
			</p>
			<TransactButton
				content={`Purchase ${tokenTLA}s`}
				tx={()=>this.props.onContribute(this.spend, this.state.signature)}
				disabled={this.spend.map(s => !this.state.signature || !s || +s < +this.state.minPurchase || +s > +this.state.maxPurchase || (this.state.request && !this.state.request.failed && !this.state.request.confirmed))}
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

const states = {
	us: false,
	gb: false,
	jp: null
};

class Manager extends ReactiveComponent {
	constructor() {
		super();
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
		let t = DutchAuction()['buyin'](...signature, { value, gasPrice: DutchAuction().MAX_GAS_PRICE() });
		this.setState({
			contribution: t
		});
		return t;
	}
	render () {
        return (<div>
			<section id='terms'>
				<h1>Terms and Conditions</h1>
				<p><Rspan>{DutchAuction().STATEMENT().map(removeSigningPrefix)}</Rspan></p>
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
		);
	}
}

class Bouncer extends ReactiveComponent {
	constructor() {
		super([], {
			status: contributionStatus(),
			kyc: Certifier().certified(bonds.me)
		});
	}

	render () {
        return this.state.kyc
		  ? (<div style={{paddingTop: '3em'}}>
			{(this.state.status && this.state.status.active)
	          ? <Manager/>
			  : (<h2 style={{textAlign: 'center', margin: '10em'}}>
			  	Contribution period not active
			  </h2>)
		    }
		  </div>)
  		  : (<h2 style={{textAlign: 'center', margin: '10em'}}>This account is not registered to any identity. Please ensure you have associated the account with a valid document through any of the identity providers.</h2>);
	}
}

class Subtitling extends ReactiveComponent {
	constructor () {
		super([], { isActive: DutchAuction().isActive(), allFinalised: DutchAuction().allFinalised(), totalReceived: DutchAuction().totalReceived() });
	}
	render () {
		let minFinal = Bond.all([DutchAuction().tokenCap(), DutchAuction().totalReceived()]).map(([a, b]) => b.div(a).mul(tokenDivisor));
		return this.state.isActive ?
			(<p>
				<TokenBalance value={DutchAuction().tokenCap()}/> to be sold!<br/>
				<InlineBalance value={DutchAuction().totalReceived()}/> raised so far!<br/>
				Auction will close <Rspan>{DutchAuction().endTime().map(t => moment.unix(t).fromNow())}</Rspan> <i>at the latest</i>!<br/>
				Final price will be at least <InlineBalance value={minFinal}/> per {tokenTLA}!
			</p>) :
			+this.state.totalReceived > 0 ?
			(<p>
				Auction closed <Rspan>{DutchAuction().endTime().map(t => moment.unix(t).fromNow())}</Rspan>:<br/>
				<InlineBalance value={this.state.totalReceived} /> raised in total!<br/>
			</p>) :
			(<p>
				Auction will begin <Rspan>{DutchAuction().beginTime().map(t => moment.unix(t).fromNow())}</Rspan>!
			</p>);
	}
}

class AuctionSummary extends ReactiveComponent {
	constructor () {
		super([], {
			isActive: DutchAuction().isActive(),
			allFinalised: DutchAuction().allFinalised(),
			totalAccounted: DutchAuction().totalAccounted()
		});
	}
	render () {
		console.log('totalAccounted', +this.state.totalAccounted);
		return this.state.isActive ?
			(<div>
			  <div className='field'>
				<div className='_fieldTitle'>Remaining for sale</div>
				<div
					className='_fieldValue _basic'
				><TokenBalance value={DutchAuction().tokensAvailable()}/></div>
			  </div>
			  <div className='field'>
				<div className='_fieldTitle'>Current Price</div>
				<div
					className='_fieldValue _basic'
				><InlineBalance value={DutchAuction().currentPrice().map(x => x.times(tokenDivisor))} defaultDenom='finney'/></div>
			  </div>
			  <div className='field'>
				<div className='_fieldTitle'>Max Purchase</div>
				<div
					className='_fieldValue _basic'
				><InlineBalance value={DutchAuction().maxPurchase()} defaultDenom='ether'/></div>
			  </div>
			</div>) :
			+this.state.totalAccounted > 0 ?
			(<div>
			  <div className='field'></div>
			  <div className='field'>
				<div className='_fieldTitle'>Closing Price</div>
				<div className='_fieldValue _basic'>
					<TokenBalance value={tokenDivisor}/> = <InlineBalance value={DutchAuction().tokenCap().map(r => this.state.totalAccounted.mul(tokenDivisor).div(r))} />
				</div>
			  </div>
			  <div className='field'></div>
			</div>) :
			(<div>
			  <div className='field'></div>
			  <div className='field'>
				<div>Not yet started</div>
			  </div>
			  <div className='field'>
			  </div>
			</div>);
	}
}

class ActiveHero extends ReactiveComponent {
	constructor () {
		super();
		let earliestBlock = DutchAuction().Ticked({limit: 1}).map(x => x.blockNumber - 2*7*24*60*4);
		let ticks = DutchAuction().Ticked({limit: 50000, startBlock: earliestBlock});
		this.eras = Bond.mapAll([
			DutchAuction().ERA_PERIOD(),
			DutchAuction().tokenCap(),
			DutchAuction().USDWEI(),
			ticks,
			DutchAuction().totalAccounted(),
			DutchAuction().eraIndex(),
			Bond.mapAll([
				DutchAuction().ERA_PERIOD(),
				DutchAuction().beginTime(),
				bonds.time
			], (p, b, n) => Math.ceil((n / 1000 - b) / p))
		], (eraPeriod, tokenCap, usdWei, ticks, latestAccounted, latestEra, era) => {
			let erasAccounted = [];
			let erasCap = [];
			console.log('mapped', +eraPeriod, +usdWei, ticks, ticks.length > 0 ? +ticks[ticks.length - 1].era : null, era);
				let last = Math.max(era, latestEra);
				for (let i = 0, j = 0; i <= last; ++i) {
					if (i >= latestEra) {
						erasAccounted.push(+latestAccounted);
					}
					else if (j >= ticks.length || ticks[j].era > i) {
						erasAccounted.push(erasAccounted.length > 0 ? erasAccounted[erasAccounted.length - 1] : 0);
					} else {
						erasAccounted.push(+ticks[j].accounted);
						j++;
					}
				}
			console.log('erasAccounted', erasAccounted);
			erasAccounted.unshift(0);
			erasCap = erasAccounted.map((_, i) => erasCap.push(+tokenCap.div(1000).mul(usdWei.mul(18432000).div(eraPeriod.mul(i).add(5760)).sub(usdWei.mul(5)))));
			console.log('erasCap', erasCap);
			return {erasAccounted, erasCap};
		});
		window.ticks = ticks;
		window.eras = this.eras;
	}

	readyRender () {
		return (
			<div id='status'>
			  <div id='status-title'>
				<h1 style={{fontFamily: 'Lobster'}}>Get yer dots!</h1>
				<Subtitling />
			  </div>
			  <div id='status-rest' style={{textAlign:'center'}}>
		  	  	<Eras data={eras} width={400} height={96}/>
				<AuctionSummary />
			  </div>
			</div>);
		}
}

class CountdownHero extends ReactiveComponent {
	constructor () {
		super([], {
			eta: Bond.mapAll([DutchAuction().beginTime(), bonds.time], (b, n) => +b - n / 1000)
		});
	}
	readyRender () {
		let eta = this.state.eta;
		let days = Math.floor(eta / 24 / 3600);
		let hours = Math.floor(eta / 3600) % 24;
		let minutes = Math.floor(eta / 60) % 60;
		let seconds = Math.floor(eta) % 60;
		return (<div id='countdown-hero'>
			<div id='countdown-timer'>
				<div>
					<div className='countdown-timer-title'>Days</div>
					<div className='countdown-timer-element'>{days}</div>
				</div>
				<div className='countdown-spacer'>:</div>
				<div>
					<div className='countdown-timer-title'>Hours</div>
					<div className='countdown-timer-element'>{hours}</div>
				</div>
				<div className='countdown-spacer'>:</div>
				<div>
					<div className='countdown-timer-title'>Minutes</div>
					<div className='countdown-timer-element'>{minutes}</div>
				</div>
				<div className='countdown-spacer'>:</div>
				<div>
					<div className='countdown-timer-title'>Seconds</div>
					<div className='countdown-timer-element'>{seconds}</div>
				</div>
			</div>
			until auction begins
		</div>);
	}
}

export class App extends ReactiveComponent {
	constructor() {
		super([], {
			purchased: bonds.accounts.mapEach(a => DutchAuction().buyins(a)).map(bs => bs.reduce((x, a) => [x[0].add(a[0]), x[1].add(a[1])])),
			isActive: DutchAuction().isActive(),
			allFinalised: DutchAuction().allFinalised(),
			totalAccounted: DutchAuction().totalAccounted(),
			bonus: DutchAuction().bonus(100),
		});
		window.bonds = bonds;
		window.DutchAuction = DutchAuction;
		window.DutchAuctionABI = DutchAuctionABI;
		window.Certifier = Certifier;
		window.bonds = bonds;
	}
	render () {
		let purchased = this.state.purchased;
		return purchased == null ? <div/> : (<div className='site'>
			<header>
			  <nav className='nav-header'>
				<div className='container'>
				  <span id='logo'>
					<span id='logo-text'>Polkadot<span style={{color: '#d64ca8'}}>.</span></span>
				  </span>
				</div>
			  </nav>
			</header>
			<div className='site-content'>
			  <section className='contrib-hero'>
				<div className='container'>
				  <div className='row'>{
					this.state.isActive || this.state.allFinalised
					  ? <ActiveHero />
					  : <CountdownHero />
				  }</div>
				</div>
			  </section>
			  {
				+purchased[1] == 0 ? null : (<section className='state-main'>
					<div className='container'>
					  You spent <InlineBalance
					  	value={purchased[1]}
					  /> to buy {this.state.isActive ? (
						<span>at least <TokenBalance value={
						  DutchAuction().currentPrice().map(_ => purchased[0].div(_))
					    }/></span>
					  ) : (
					    <span>exactly <TokenBalance value={
					      DutchAuction().tokenCap().map(r => purchased[0].mul(r).div(this.state.totalAccounted))
						}/></span>
					  )}
					</div>
				</section>)
			  }
			  {
				+this.state.bonus === 0 ? null : (<section className='bonus-main'>
					<div className='container'>
						<b>Bonus!</b> Purchases processed in the next <Rspan>{
							Bond.mapAll([
								DutchAuction().BONUS_DURATION(),
								DutchAuction().beginTime(),
								bonds.head.timestamp
							], (d, b, n) => +b + +d - n / 1000)
						}</Rspan> seconds receive an additional <b>
							{+this.state.bonus}% {tokenTLA}
						</b> tokens.
					</div>
				</section>)
			  }
			  <section className='contrib-main'>
				<div className='container'>
				  <div className='row'>
					<Bouncer />
				  </div>
				</div>
			  </section>
			</div>

			<footer className='page-footer'>
			  <div className='container'>
				<AccountIcon address={DutchAuction().address} id='logoIcon' style={{float: 'right', width: '3em', boxShadow: '0px 2px 30px 0px rgba(0, 0, 0, 0.5)'}}/>
				<div className='row'>
				  <h1>The Polkadot Auction Ðapp.</h1>
				  Made with &lt;3 by Some Guy, adapted from a Ðapp by Parity Technologies, 2017.
				</div>
			  </div>
			</footer>
		</div>);
	}
}
