import moment from 'moment';
import countries from 'i18n-iso-countries';
import React from 'react';
import BigNumber from 'bignumber.js';
import {Button, Checkbox} from 'semantic-ui-react';
import {Bond, TransformBond, ReactivePromise} from 'oo7';
import {hexToAscii, capitalizeFirstLetter, removeSigningPrefix, singleton, formatBlockNumber, bonds} from 'oo7-parity';
import {Rdiv, Rspan, ReactiveComponent} from 'oo7-react';
import {AccountIcon, BalanceBond, TransactButton, SigningProgressLabel, InlineBalance} from 'parity-reactive-ui';
import {DutchAuctionABI, CCCertifierABI} from './abis.jsx';

const tokenDivisor = 1000;
const tokenTLA = 'WLS';

class TokenBalance extends ReactiveComponent {
	constructor () {
		super(['value']);
	}
	readyRender () {
		let n = Math.round(+this.state.value) / tokenDivisor;
		return (<span><b>{n}</b> <span style={{fontSize: '85%'}}>{tokenTLA}</span></span>);
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
			deriv[i] = filled[i] / line[i];
		}
		let maxderiv = Math.max.apply(Math, deriv);

		let max = 1; //maxfilled * 8;
		let xstep = width / Math.max(line.length, 12 * 24 * 2);
		let ystep = height / max;

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
				ctx.strokeStyle = `rgba(255, 255, 255, ${a})`;
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
var DutchAuction = singleton(() => bonds.makeContract('0xb1b2F7cCE9F50e3Dea180Ce776495Ab0AAFFaB01', DutchAuctionABI));
var CCCertifier = singleton(() => bonds.makeContract(DutchAuction().certifier(), CCCertifierABI));

class ContributionPanel extends ReactiveComponent {
	constructor() {
		super(['request', 'signature'], {
			minPurchase: DutchAuction().currentPrice(),
			maxPurchase: DutchAuction().maxPurchase()
		});
		this.state = {deposit: false};
        let d = '10 ether';
        this.spend = new Bond;
	}
	deposit () {
		return this.props.depositOnly || this.state.deposit;
	}
	render () {
		var theDeal = DutchAuction().theDeal(this.spend, this.deposit());
		return (<div id='contributionPanel'>
			<BalanceBond
				hintText="How much to spend?"
                bond={this.spend}
				disabled={!this.state.signature}
			/>
			<div style={{marginBottom: '1em'}}>
			<Button.Group size='large'>
			<Button disabled={!this.state.signature || this.props.depositOnly} active={!this.deposit()} onClick={() => this.setState({deposit: false})}>Spend</Button>
			<Button.Or />
			<Button disabled={!this.state.signature} active={this.deposit()} onClick={() => this.setState({deposit: true})}>Deposit</Button>
			</Button.Group>
			</div>
			<p style={{textAlign: 'center', margin: '1em 2em'}}>
				<Rspan>{theDeal.map(([_, r]) => r
					? <span>
						<InlineBalance value={this.spend}/> is greater than the maximum spend.
					</span>
					: <span>
						By {this.deposit() ? 'depositing' : 'spending'} <InlineBalance value={this.spend}/>, you will receive <Rspan>{theDeal.map(([accepted, refund, price]) =>
							<b>at least <TokenBalance value={accepted / price}/></b>
						)}</Rspan> when the network launches
						{this.deposit() ? ', and be entitled to a 100% refund at any time before' : ''}
					</span>
				)}</Rspan>
			</p>
			<TransactButton
				content={`Purchase ${tokenTLA}s`}
				tx={()=>this.props.onContribute(this.spend, this.state.signature, this.deposit())}
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

class Manager extends ReactiveComponent {
	constructor() {
		super([], {
			status: contributionStatus(),
			kyc: CCCertifier().getCountryCode(bonds.me)
		});
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
	handleContribute (value, signature, deposit) {
		let t = DutchAuction()[deposit ? 'deposit' : 'buyin'](...signature, { value });
		this.setState({
			contribution: t
		});
		return t;
	}
	render () {

        return (this.state.status && this.state.status.active)
          ? this.state.kyc === ''
		  ? (<h2 style={{textAlign: 'center', margin: '10em'}}>This account is not registered to any identity. Please ensure you have associated the account with a valid document through any of the identity providers.</h2>)
		  : this.state.kyc === 'jp'
		  ? (<h2 style={{textAlign: 'center', margin: '10em'}}>This account belongs to a Japanese citizen. Unfortunately, Japanese are not elegable to join this crowdsale due to requirements placed on token sales by the Japanese authorities.</h2>)
		  : (<div>
			  {
				  this.state.kyc === 'uk' || this.state.kyc == 'us'
				  ? (<h2 style={{textAlign: 'center', margin: '2em'}}>This account is KYCed to a US/UK citizen. Fully-refundable deposits are allowed, but outright spending is prohibited due to unclear regulations concerning the sale of illiquid tokens.</h2>)
				  : (<h2 style={{textAlign: 'center', margin: '2em'}}>This account is fully KYCed as an OFAC-clean citizen of {countries.getName(this.state.kyc, "en")}.</h2>)
			  }
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
				  depositOnly={this.state.kyc === 'uk' || this.state.kyc === 'us'}
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
		super([], { isActive: DutchAuction().isActive(), allFinalised: DutchAuction().allFinalised(), totalAccounted: DutchAuction().totalAccounted() });
	}
	render () {
		console.log('totalAccounted', +this.state.totalAccounted);
		return this.state.isActive ?
			(<div>
			  <div className={'field'}>
				<div>{tokenTLA}s Left</div>
				<Rdiv
					className='_fieldValue _basic'
				>{DutchAuction().tokensAvailable().map(t => `${t / tokenDivisor}`)}</Rdiv>
			  </div>
			  <div className={'field'}>
				<div>Current Price</div>
				<div
					className='_fieldValue _basic'
				><InlineBalance value={DutchAuction().currentPrice().map(x => x.times(tokenDivisor))} defaultDenom='finney'/></div>
			  </div>
			  <div className={'field'}>
				<div>Max Purchase</div>
				<div
					className='_fieldValue _basic'
				><InlineBalance value={DutchAuction().maxPurchase()} defaultDenom='ether'/></div>
			  </div>
			</div>) :
			+this.state.totalAccounted > 0 ?
			(<div>
			  <div className={'field'}></div>
			  <div className={'field'}>
				<div>Closing Price</div>
				<div className='_fieldValue _basic'>
					<InlineBalance value={DutchAuction().tokenCap().map(r => this.state.totalAccounted.mul(divisor).div(r))} />
				</div>
			  </div>
			  <div className={'field'}></div>
			</div>) :
			(<div>
			  <div className={'field'}></div>
			  <div className={'field'}>
				<div>Not yet started</div>
			  </div>
			  <div className={'field'}>
			  </div>
			</div>);
	}
}

/*
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
*/

export class App extends ReactiveComponent {
	constructor() {
		super([], {
			purchased: bonds.accounts.mapEach(a => DutchAuction().buyins(a)).map(bs => bs.reduce((x, a) => [x[0].add(a[0]), x[1].add(a[1])])),
			deposited: bonds.accounts.mapEach(a => DutchAuction().deposits(a)).map(bs => bs.reduce((x, a) => [x[0].add(a[0]), x[1].add(a[1])])),
			isActive: DutchAuction().isActive(),
			allFinalised: DutchAuction().allFinalised(),
			totalAccounted: DutchAuction().totalAccounted()
		});
		let earliestBlock = DutchAuction().Ticked({limit: 1}).map(x => x.blockNumber - 2*7*24*60*4);
		let ticks = DutchAuction().Ticked({limit: 50000, startBlock: earliestBlock});
		this.eras = Bond.mapAll([DutchAuction().ERA_PERIOD(), DutchAuction().tokenCap(), DutchAuction().USDWEI(), ticks], (eraPeriod, tokenCap, usdWei, ticks) => {
			console.log('mapped', +eraPeriod, +usdWei, ticks);
			let erasAccounted = [];
			let erasCap = [];
			if (ticks.length > 0) {
				let last = ticks[ticks.length - 1].era;
				for (let i = 0, j = 0; i < last; ++i) {
					if (ticks[j].era > i) {
						// will never be called when erasAccounted is empty, since a non-empty t's first element will always be era 0.
						erasAccounted.push(erasAccounted[erasAccounted.length - 1]);
					} else {
						erasAccounted.push(+ticks[j].accounted);
						j++;
					}

					let t = eraPeriod.mul(i);
					erasCap.push(+tokenCap.div(1000).mul(usdWei.mul(18432000).div(t.add(5760)).sub(usdWei.mul(5))));
				}
			}
			console.log('erasCap', erasCap);
			console.log('erasAccounted', erasAccounted);
			return {erasAccounted, erasCap};
		});
		window.ticks = ticks;
		window.eras = this.eras;
		window.bonds = bonds;
		window.DutchAuction = DutchAuction;
		window.DutchAuctionABI = DutchAuctionABI;
		window.CCCertifier = CCCertifier;
	}
	render () {
		let purchased = this.state.purchased;
		let deposited = this.state.deposited;
		return purchased == null ? <div/> : (<div className='site'>
			<header>
			  <nav className='nav-header'>
				<div className='container'>
				  <span id='logo'>
					<AccountIcon address={DutchAuction().address} id='logoIcon' style={{width: '3em', marginTop: '0.5em', boxShadow: '0px 2px 30px 0px #000'}}/>
					<span style={{marginLeft: '1em'}}>WHITELABEL</span>
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
						<h1>Get yer <span style={{fontSize: '21pt'}}>{tokenTLA}</span>s!</h1>
						<Subtitling />
					  </div>
					  <div className='status-rest' style={{textAlign:'center'}}>
				  	  	<Eras data={eras} width={400} height={96}/>
						<AuctionSummary />
					  </div>
					</div>
				  </div>
				</div>
			  </section>
			  {
				+purchased[1] == 0 && +deposited[1] == 0 ? null : (<section className='state-main'>
					<div className='container'>
					  You {+purchased[1] > 0 ? (<span>spent <InlineBalance
					  	value={purchased[1]}
					  /></span>) : null}
					  {+purchased[1] > 0 && +deposited[1] > 0 ? ' and ' : ''}
					  {+purchased[1] > 0 ? (<span> deposited <InlineBalance
					  	value={deposited[1]}
					  /></span>) : null} to buy {this.state.isActive ? (
						<span>at least <TokenBalance value={
						  DutchAuction().currentPrice().map(_ => purchased[0].add(deposited[0]).div(_))
					    }/></span>
					  ) : (
					    <span>exactly <TokenBalance value={
					      DutchAuction().tokenCap().map(r => purchased[0].add(deposited[0]).mul(r).div(this.state.totalAccounted))
						}/></span>
					  )}
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
