import moment from 'moment';
import React from 'react';
import RaisedButton from 'material-ui/RaisedButton';
import TextField from 'material-ui/TextField';
import Checkbox from 'material-ui/Checkbox';
import {TransformBond} from 'oo7';
import {Transaction, Signature, capitalizeFirstLetter, singleton, interpretQuantity, formatBlockNumber} from 'oo7-parity';
import {Rdiv, ReactiveComponent} from 'oo7-react';
import {AccountIcon, TransactionProgress, SignatureProgress} from 'parity-reactive-ui';
import styles from "../style.css";

const ReceipterABI = [{"constant":false,"inputs":[{"name":"v","type":"uint8"},{"name":"r","type":"bytes32"},{"name":"s","type":"bytes32"}],"name":"receive","outputs":[],"payable":true,"type":"function"},{"constant":true,"inputs":[],"name":"endBlock","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"total","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":true,"inputs":[{"name":"","type":"address"}],"name":"record","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":false,"inputs":[],"name":"kill","outputs":[],"payable":false,"type":"function"},{"constant":false,"inputs":[],"name":"halt","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"treasury","outputs":[{"name":"","type":"address"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_recipient","type":"address"}],"name":"receiveFrom","outputs":[],"payable":true,"type":"function"},{"constant":true,"inputs":[],"name":"beginBlock","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"constant":false,"inputs":[{"name":"_source","type":"address"},{"name":"v","type":"uint8"},{"name":"r","type":"bytes32"},{"name":"s","type":"bytes32"}],"name":"receiveFrom","outputs":[],"payable":true,"type":"function"},{"constant":true,"inputs":[],"name":"isHalted","outputs":[{"name":"","type":"bool"}],"payable":false,"type":"function"},{"constant":false,"inputs":[],"name":"unhalt","outputs":[],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"admin","outputs":[{"name":"","type":"address"}],"payable":false,"type":"function"},{"constant":true,"inputs":[],"name":"dust","outputs":[{"name":"","type":"uint256"}],"payable":false,"type":"function"},{"inputs":[{"name":"_admin","type":"address"},{"name":"_treasury","type":"address"},{"name":"_beginBlock","type":"uint256"},{"name":"_endBlock","type":"uint256"},{"name":"_sigHash","type":"bytes32"}],"payable":false,"type":"constructor"},{"payable":true,"type":"fallback"},{"anonymous":false,"inputs":[{"indexed":true,"name":"recipient","type":"address"},{"indexed":false,"name":"amount","type":"uint256"}],"name":"Received","type":"event"},{"anonymous":false,"inputs":[],"name":"Halted","type":"event"},{"anonymous":false,"inputs":[],"name":"Unhalted","type":"event"}];
var Receipter = singleton(() => parity.bonds.makeContract('0xa1B844658F861A360a1232162eE8bAA70AAeB2b0', ReceipterABI));

const message = 'Take the money and spend it as you see fit';

class ContributionPanel extends ReactiveComponent {
	constructor() {
		super(['request', 'signature']);
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
				disabled={!this.state.signature}
			/>
			<RaisedButton
				label="contribute"
				onClick={()=>{ this.props.onContribute(this.state.value, this.state.signature); }}
				disabled={!this.state.signature || this.state.value === null || (this.state.request != null && !this.state.request.failed && !this.state.request.confirmed)}
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
    Receipter().isHalted(),
    Receipter().beginBlock(),
    Receipter().endBlock(),
    parity.bonds.blockNumber
]));

function niceStatus(s) {
    let blocksToTime = blocks => moment.unix(0).to(moment.unix(blocks * 15));
    return s.before ? `Starts ${blocksToTime(s.before.after)}` :
        s.after ? `Ended ${blocksToTime(-s.after.ago)}` :
        s.halted ? `Halted` :
        `Open for another ${blocksToTime(s.active.have).replace('in ', '')}`;
}

let contributionTotal = singleton(() => Receipter().total());

class TermsPanel extends ReactiveComponent {
	constructor() {
		super(['request']);
		this.state = { request: null };
	}
	render() {
		return (
			<Checkbox
				label='I hereby confirm I have read all applicable terms and conditions. Please accept my contribution.'
				checked={this.state.request && !!this.state.request.signed}
				disabled={this.state.request && !!this.state.request.requested}
				onCheck={ (_, c) => { if (c) this.props.onRequest(); } }
				iconStyle={{width: '3em', height: '3em'}}
				labelStyle={{fontSize: '16pt', lineHeight: 'normal'}}
				className='bigCheckbox'
			/>
		);
	}
}

function splitSignature(rsv) {
	return [`0x1${rsv.substr(130, 2) == '00' ? 'b' : 'c'}`, rsv.substr(0, 66), `0x${rsv.substr(66, 64)}`];
}

class Manager extends ReactiveComponent {
	constructor() {
		super([], { status: contributionStatus() });
		this.state = { signing: null, contribution: null };
	}
	handleSign () {
		this.setState({
			signing: new Signature(parity.bonds.accounts[2], message),
			contribution: this.state.contribution
		});
	}
	handleContribute (value, signature) {
        if (value !== null) {
			this.setState({
				signing: this.state.signing,
				contribution: Receipter().receive(...splitSignature(signature), { from: parity.bonds.accounts[2], value })
			});
		}
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
				  signature={this.state.signing && this.state.signing.map(x => x.signed || null)}
	              request={this.state.current}
	              onContribute={this.handleContribute.bind(this)}
	            />
			  </section>
			</div>
		  )
		  : (<h2>Contribution period not active</h2>);
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
                  <AccountIcon address={Receipter().address} id='logoIcon'/>
                  SKELETON CONTRIBUTION
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
                      <h1>Contribution</h1>
                      Contribute to our mission's success
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
                      <div>
                        <div className={'title'}>Contribution<br />Summary</div>
                        <div className={'field'}>
                          <div>Status</div>
                          <Rdiv
                            className={contributionStatus().map(s => '_fieldValue ' + (s.active ? '_active' : s.before ? '_before' : '_after'))}
                          >{contributionStatus().map(niceStatus)}</Rdiv>
                        </div>
                        <div className={'field'}>
                          <div>Received</div>
                          <Rdiv className='_fieldValue _basic'>{contributionTotal().map(c => `${+c.div(1000000000000000) / 1000} ETH`)}</Rdiv>
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
                  <Manager />
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
    <div>Current / Period: : <BlockNumber value={Receipter().instance.beginBlock.call.blockBond()}/> - <BlockNumber value={Receipter().instance.endBlock.call.blockBond()}/></div>
    <div>This is your coinbase: <RichAccount address={parity.api.eth.coinbase.timeBond()}/></div>
    <div>Your account is: <RichAccount address={'0x0048440ee17ee30817348949d2ec46647e8b6179'}/></div>
    <div>Receipter is at: <Account address={Receipter().instance.address}/></div>
</div>
*/

////
// DEBUGGING

window.TransformBond = TransformBond;
