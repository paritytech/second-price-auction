// testrpc --account="0x39d2655d02ad43240aab071883f94ec17241df16732d1424df965857dc15ea35,100000000000000000000000" --account="0xd64c6e055dda4700c178a7153cb4ce75c7b74fd97ec5fd4643bb40e42e5576ed,1000000000000000001000000" --account="0xb6d95e390d8ff2a8145337b10580690d0f21d6b350f60ec4179103d1f702865d,1000000000000000001000000" --account="0x57f02e130ccbc148f4431e6f5219186970010a74e941e1f6d79eb97bb20f35f0,1000000000000000001000000" --account="0x280703e0c54e0102e436e28f30bca9af7ff746c7c4e11062ae9bb5837bc48142,100000000000000000100000" --account="0x4446bfd934927adb55c749b15e2c49f2948eac401b01ae95503b9e7c61fb04bd,10000000000000000000000000000000"

var util = require("ethereumjs-util");

var Certifier = artifacts.require("MultiCertifier");
var Auction = artifacts.require("SecondPriceAuction");
var Token = artifacts.require("FrozenToken");

const CONTRIBUTOR = "0x8b0080b4e5ded26f2a19c86f773a4830c89751e6";
const PRIV = util.toBuffer('0x4446bfd934927adb55c749b15e2c49f2948eac401b01ae95503b9e7c61fb04bd', 'utf8');

const mineBlocks = blocks => {
	for (i = 0; i < blocks; i++) {
		web3.currentProvider.send({jsonrpc: "2.0", method: "evm_mine", params: [], id: 1});
	}
}

const increaseTime = addSeconds => {
	web3.currentProvider.send({jsonrpc: "2.0", method: "evm_increaseTime", params: [addSeconds], id: 0});
	web3.currentProvider.send({jsonrpc: "2.0", method: "evm_mine", params: [], id: 1});
}

contract('contributions', function(accounts) {
	it("Contribution gathering.", function() {
		const DELEGATE = accounts[1];
		var certifier;
		var auction;
		var token;
		var tokenCap;
		var endTime;
		var v0;
		var r0;
		var s0;
		return Certifier.deployed().then(function(instance) {
			certifier = instance;
			certifier.addDelegate(DELEGATE);
			certifier.certify(CONTRIBUTOR, { from: DELEGATE });
			return certifier.certified.call(CONTRIBUTOR);
		}).then(function(certified) {
			assert.isTrue(certified, "Is active.");
			return Auction.deployed();
		}).then(function(instance) {
			auction = instance;
			return auction.STATEMENT_HASH.call();
		}).then(function(h) {
			const { v, r, s } = util.ecsign(util.toBuffer(h.toString(), 'utf8'), PRIV);
			v0 = v;
			r0 = util.bufferToHex(r);
			s0 = util.bufferToHex(s);
			return auction.buyin(v0, r0, s0, { from: CONTRIBUTOR, value: 5000000000000000 });
		}).then(assert.fail).catch(function(error) {
			assert.include(error.message, 'invalid opcode', 'The sale has not started.');
			increaseTime(1000);
			auction.buyin(v0, r0, s0, { from: CONTRIBUTOR, value: 5000000000000000 });
			return auction.totalReceived.call()
		}).then(function(received) {
			assert.equal(received.toNumber(), 5000000000000000, "All received.");
			return auction.totalAccounted.call()
		}).then(function(accounted) {
			assert.equal(accounted.toNumber(), 5750000000000000, "Received with bonus.");
			return auction.BONUS_MIN_DURATION.call();
		}).then(function(bonus) {
			increaseTime(bonus.toNumber());
			return auction.currentBonus.call();
		}).then(function(bonus) {
			assert.equal(bonus.toNumber(), 15, "Still whole bonus.");
			mineBlocks(3);
			return auction.currentBonus.call();
		}).then(function(bonus) {
			assert.equal(bonus.toNumber(), 15, "Still whole bonus.");
			auction.buyin(v0, r0, s0, { from: CONTRIBUTOR, value: 5000000000000000 });
			return auction.totalAccounted.call()
		}).then(function(accounted) {
			assert.equal(accounted.toNumber(), 11450000000000000, "Received with smaller bonus.");
			return auction.currentBonus.call();
		}).then(function(bonus) {
			assert.equal(bonus.toNumber(), 14, "Smaller bonus.");
			auction.buyin(v0, r0, s0, { from: CONTRIBUTOR, value: 5000000000000000 });
			return auction.totalAccounted.call()
		}).then(function(accounted) {
			assert.equal(accounted.toNumber(), 17100000000000000, "Smaller bonus again.");
			return auction.BONUS_MAX_DURATION.call();
		}).then(function(bonus) {
			increaseTime(bonus.toNumber());
			auction.buyin(v0, r0, s0, { from: CONTRIBUTOR, value: 5000000000000000 });
			return auction.totalAccounted.call()
		}).then(function(accounted) {
			assert.equal(accounted.toNumber(), 22100000000000000, "No more bonus.");
			return auction.currentBonus.call();
		}).then(function(bonus) {
			assert.equal(bonus.toNumber(), 0, "Bonus is 0.");
			return auction.calculateEndTime.call();
		}).then(function(end) {
			increaseTime(end.toNumber());
			return auction.buyin(v0, r0, s0, { from: CONTRIBUTOR, value: 5000000000000000 });
		}).then(assert.fail).catch(function(error) {
			assert.include(error.message, 'invalid opcode', 'Sale is done.');
			return auction.isActive.call();
		}).then(function(isActive) {
			assert.equal(isActive, false, "The sale has ended.");
			return Token.deployed();
		}).then(function(instance) {
			token = instance;
			const OWNER = accounts[2];
			token.transfer(auction.address, 5000000000, { from: OWNER });
			token.makeLiquid(auction.address, { from: OWNER });
			auction.finalise(CONTRIBUTOR);
			return token.balanceOf.call(CONTRIBUTOR);
		}).then(function(balance) {
			assert.equal(balance.toNumber(), 5000000000, "All DOTs to one guy.");
		});
	});
});
